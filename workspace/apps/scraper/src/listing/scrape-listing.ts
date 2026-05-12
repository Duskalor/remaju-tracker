import { eq } from '@remaju/database';
import { chromium, type Page } from 'playwright';
import { parseCard } from './parsers/card';
import { batchUpsertCards, type UpsertInput } from './persist/upsert-card';
import { archiveStaleRemates } from './persist/archive-stale';
import { db } from '../db';
import { remates, scrapingRuns } from '@remaju/database';

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
  const cards = page.locator(SELECTORS.card);
  const count = await cards.count();

  console.log(`[scrape:listing] ${count} cards en página actual`);

  const inputs: UpsertInput[] = [];
  const sourceUrl = page.url();
  const now = new Date().toISOString();

  for (let i = 0; i < count; i++) {
    const cardHtml = await cards.nth(i).innerHTML();
    const parsed = parseCard(cardHtml);

    if (!parsed.remate_numero) {
      console.warn(`[scrape:listing] card #${i} sin remate_numero, skipping`);
      continue;
    }

    inputs.push({
      remate_numero: parsed.remate_numero,
      card: parsed,
      source_url: sourceUrl,
      raw_html: cardHtml,
      scraped_at: now,
    });
  }

  return inputs;
}

async function goToNextPage(page: Page): Promise<boolean> {
  const nextButton = page.locator(SELECTORS.nextPageButton);

  if ((await nextButton.count()) === 0) return false;

  const beforeText = await page.locator(SELECTORS.currentPage).textContent();

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

  const runRow = db
    .insert(scrapingRuns)
    .values({ type: 'listing', started_at: new Date().toISOString(), status: 'running' })
    .returning({ id: scrapingRuns.id })
    .get();
  const runId = runRow?.id ?? 0;

  const browser = await chromium.launch({ headless: true });
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
    const context = await browser.newContext({
      locale: 'es-PE',
      userAgent:
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();

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

    console.log(`[scrape:listing] Aplicando UPSERT de ${allInputs.length} cards`);
    const upsertResult = batchUpsertCards(db, remates, allInputs);
    result.upsert_inserted = upsertResult.inserted;
    result.upsert_updated = upsertResult.updated;
    result.upsert_failed = upsertResult.failed;

    if (result.upsert_failed === 0) {
      runStatus = 'success';
      db.update(scrapingRuns)
        .set({ status: 'success', finished_at: new Date().toISOString(), records_processed: result.total_cards_seen })
        .where(eq(scrapingRuns.id, runId))
        .run();

      const archiveResult = archiveStaleRemates(db, remates, scrapingRuns);
      result.archived = archiveResult.archived_count;
    } else {
      console.warn('[scrape:listing] Hubo errores en UPSERT, NO se archiva');
    }

    await context.close();
  } catch (err) {
    console.error('[scrape:listing] FATAL:', err);
    throw err;
  } finally {
    await browser.close();
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

if (require.main === module) {
  scrapeListing()
    .then((result) => {
      console.log('OK', result);
      process.exit(0);
    })
    .catch((err) => {
      console.error('FATAL', err);
      process.exit(1);
    });
}
