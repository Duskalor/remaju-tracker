import { eq, sql, createSqliteClient, remates, scrapingRuns } from '@remaju/database';
import type { Page } from 'playwright';
import { parseCard } from './parsers/card';
import { batchUpsertCards, type UpsertInput } from './persist/upsert-card';
import { archiveStaleRemates } from './persist/archive-stale';
import { BrowserClient } from '../browser/client';

const URL_LISTADO = 'https://remaju.pj.gob.pe/remaju/pages/publico/remateExterno.xhtml';

const SELECTORS = {
  card: '[id^="formBuscarRemateExterno:listaRemate:"][id$="_content"]',
  nextPageButton: 'a.ui-paginator-next:not(.ui-state-disabled)',
  currentPage: '.ui-paginator-current',
} as const;

const TIMEOUTS = {
  navigation: 30_000,
  pageChange: 10_000,
  betweenPages: 2_000,
};

interface ListingResult {
  total_cards_seen: number;
  cards_parsed_ok: number;
  cards_parse_failed: number;
  upsert_inserted: number;
  upsert_updated: number;
  upsert_failed: number;
  archived: number;
  duration_seconds: number;
}

async function scrapeCurrentPage(page: Page): Promise<UpsertInput[]> {
  const allCards = page.locator(SELECTORS.card).filter({ hasText: /Remate\s+N°/i });
  const count = await allCards.count();

  const inputs: UpsertInput[] = [];
  const sourceUrl = page.url();
  const now = new Date().toISOString();
  const seenNumeros = new Set<string>();

  for (let i = 0; i < count; i++) {
    const cardHtml = await allCards.nth(i).innerHTML();
    const parsed = parseCard(cardHtml);

    if (!parsed.remate_numero) continue;
    if (seenNumeros.has(parsed.remate_numero)) continue;

    seenNumeros.add(parsed.remate_numero);
    inputs.push({
      remate_numero: parsed.remate_numero,
      card: parsed,
      source_url: sourceUrl,
      raw_html: cardHtml,
      scraped_at: now,
    });
  }

  console.log(`[scrape:listing] ${inputs.length} cards únicos en página actual (${count} elementos totales)`);
  return inputs;
}

async function goToNextPage(page: Page): Promise<boolean> {
  const nextButton = page.locator(SELECTORS.nextPageButton);

  if ((await nextButton.count()) === 0) return false;

  const currentPageEl = page.locator(SELECTORS.currentPage);
  if ((await currentPageEl.count()) === 0) return false;

  const beforeText = await currentPageEl.textContent({ timeout: 5_000 }).catch(() => null);
  if (beforeText === null) return false;

  await nextButton.click();

  await page.waitForFunction(
    ({ selector, before }: { selector: string; before: string | null }) => {
      const el = document.querySelector(selector);
      return el && el.textContent !== before;
    },
    { selector: SELECTORS.currentPage, before: beforeText },
    { timeout: TIMEOUTS.pageChange },
  );

  return true;
}

export async function scrapeListing(): Promise<ListingResult> {
  const startTime = Date.now();
  console.log('[scrape:listing] Iniciando');

  const db = createSqliteClient();

  const runRow = db
    .insert(scrapingRuns)
    .values({ type: 'listing', started_at: new Date().toISOString(), status: 'running' })
    .returning({ id: scrapingRuns.id })
    .get();
  const runId = runRow?.id ?? 0;

  const client = new BrowserClient();
  const result: ListingResult = {
    total_cards_seen: 0,
    cards_parsed_ok: 0,
    cards_parse_failed: 0,
    upsert_inserted: 0,
    upsert_updated: 0,
    upsert_failed: 0,
    archived: 0,
    duration_seconds: 0,
  };

  let runStatus = 'failed';

  try {
    const page = await client.initialize();

    await page.goto(URL_LISTADO, {
      waitUntil: 'networkidle',
      timeout: TIMEOUTS.navigation,
    });
    await page.waitForSelector(SELECTORS.card);

    let pageNum = 1;
    const allInputs: UpsertInput[] = [];

    while (true) {
      console.log(`[scrape:listing] Procesando página ${pageNum}`);

      const inputs = await scrapeCurrentPage(page);
      result.total_cards_seen += inputs.length;
      result.cards_parsed_ok += inputs.filter((i) => i.card.parse_warnings.length === 0).length;
      result.cards_parse_failed += inputs.filter((i) => i.card.parse_warnings.length > 0).length;

      allInputs.push(...inputs);

      const hasNext = await goToNextPage(page);
      if (!hasNext) {
        console.log(`[scrape:listing] No hay más páginas, total: ${pageNum}`);
        break;
      }

      pageNum++;
      await sleep(TIMEOUTS.betweenPages);
    }

    const uniqueNumeros = new Set(allInputs.map((i) => i.remate_numero));
    console.log(`[scrape:listing] Aplicando UPSERT de ${allInputs.length} cards (${uniqueNumeros.size} remate_numero únicos)`);
    if (uniqueNumeros.size < allInputs.length) {
      const dupes = allInputs.map((i) => i.remate_numero).filter((n, idx, arr) => arr.indexOf(n) !== idx);
      console.warn(`[scrape:listing] ⚠ Duplicados detectados:`, [...new Set(dupes)]);
    }

    const countBefore = (db.select({ c: sql<number>`count(*)` }).from(remates).get() as any)?.c ?? 0;
    console.log(`[scrape:listing] Filas en BD antes del UPSERT: ${countBefore}`);

    const upsertResult = batchUpsertCards(db, remates, allInputs);
    result.upsert_inserted = upsertResult.inserted;
    result.upsert_updated = upsertResult.updated;
    result.upsert_failed = upsertResult.failed;
    console.log(`[scrape:listing] UPSERT result → inserted:${upsertResult.inserted} updated:${upsertResult.updated} failed:${upsertResult.failed}`);

    const countAfterUpsert = (db.select({ c: sql<number>`count(*)` }).from(remates).get() as any)?.c ?? 0;
    console.log(`[scrape:listing] Filas en BD después del UPSERT: ${countAfterUpsert}`);

    if (result.upsert_failed === 0) {
      runStatus = 'success';
      db.update(scrapingRuns)
        .set({ status: 'success', finished_at: new Date().toISOString(), records_processed: result.total_cards_seen })
        .where(eq(scrapingRuns.id, runId))
        .run();

      const archiveResult = archiveStaleRemates(db, remates, scrapingRuns);
      result.archived = archiveResult.archived_count;
      console.log(`[scrape:listing] Archive result → archived:${archiveResult.archived_count} dry_run:${archiveResult.dry_run} threshold:${archiveResult.threshold_iso}`);

      const countAfterArchive = (db.select({ c: sql<number>`count(*)` }).from(remates).get() as any)?.c ?? 0;
      console.log(`[scrape:listing] Filas en BD después del archivo: ${countAfterArchive}`);
    } else {
      console.warn('[scrape:listing] Hubo errores en UPSERT, NO se archiva');
    }

  } catch (err) {
    console.error('[scrape:listing] FATAL:', err);
    throw err;
  } finally {
    await client.close();
    result.duration_seconds = (Date.now() - startTime) / 1000;

    if (runId && runStatus !== 'success') {
      db.update(scrapingRuns)
        .set({ status: runStatus, finished_at: new Date().toISOString(), records_failed: result.upsert_failed })
        .where(eq(scrapingRuns.id, runId))
        .run();
    }

    console.log('[scrape:listing] Resultado:', result);
  }

  return result;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

