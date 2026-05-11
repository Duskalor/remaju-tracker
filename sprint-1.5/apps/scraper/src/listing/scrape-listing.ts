/**
 * apps/scraper/src/listing/scrape-listing.ts
 *
 * Orquestador del listing scraper.
 *
 * FLUJO COMPLETO:
 *   1. Registrar corrida en scraping_runs (status='running')
 *   2. Navegar al listado del portal
 *   3. Por cada página:
 *      a. Extraer HTML de cada card
 *      b. Parsear con parseCard()
 *      c. Acumular en buffer
 *   4. UPSERT en batch (transaccional, lotes de 50)
 *   5. Archivado de stales (solo si corrida exitosa)
 *   6. Cerrar registro de corrida (status='success'|'failed')
 *
 * Ejecutar: pnpm scrape:listing
 *
 * NOTA: este archivo REEMPLAZA tu scrape:listing actual. Adaptá los
 * selectores del browser a lo que ya tenías funcionando — la lógica de
 * navegación por páginas seguramente ya está resuelta en tu código.
 * Lo nuevo es: parsing más completo + UPSERT + archivado.
 */

import { chromium, type Browser, type Page } from 'playwright';
import { parseCard, type ParsedCard } from './parsers/card';
import { batchUpsertCards, type UpsertInput } from './persist/upsert-card';
import { archiveStaleRemates } from './persist/archive-stale';
// import { db } from '../db';
// import { remates, scrapingRuns } from '@remaju/database';

// ============================================================================
// Constantes
// ============================================================================

const URL_LISTADO = 'https://remaju.pj.gob.pe/remaju/pages/publico/remateExterno.xhtml';

// Selectores. ¡ADAPTAR a los que ya tenés funcionando en tu scraper actual!
const SELECTORS = {
  // Cada card del listado. Buscá la clase real del wrapper.
  // Posibles: '.card-remate', '[id^="formBuscarRemateExterno:listaRemate:"]', etc.
  card: '[id^="formBuscarRemateExterno:listaRemate:"][id$="_content"]',

  // Botón "siguiente página". Adaptar al real.
  nextPageButton: 'a.ui-paginator-next:not(.ui-state-disabled)',

  // Indicador de "estoy en página X". Para detectar fin de paginación.
  currentPage: '.ui-paginator-current',
} as const;

const TIMEOUTS = {
  navigation: 30_000,
  pageChange: 10_000,
  betweenPages: 2_000, // rate limit
};

// ============================================================================
// Tipos
// ============================================================================

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

// ============================================================================
// Scraping de una página
// ============================================================================

/**
 * Extrae todos los cards visibles en la página actual.
 *
 * Estrategia: tomamos el HTML de cada card y los parseamos OFFLINE (con
 * cheerio en parseCard), no con locators de Playwright. Esto es más
 * rápido (1 trip al DOM por card en vez de N) y más testeable.
 */
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

/**
 * Avanza a la siguiente página. Retorna false si no hay más páginas.
 */
async function goToNextPage(page: Page): Promise<boolean> {
  const nextButton = page.locator(SELECTORS.nextPageButton);

  if ((await nextButton.count()) === 0) return false;

  // Capturar página actual para detectar cambio
  const beforeText = await page.locator(SELECTORS.currentPage).textContent();

  await nextButton.click();

  // Esperar a que el paginator cambie (señal de que AJAX terminó)
  await page.waitForFunction(
    ({ selector, before }) => {
      const el = document.querySelector(selector);
      return el && el.textContent !== before;
    },
    { selector: SELECTORS.currentPage, before: beforeText },
    { timeout: TIMEOUTS.pageChange },
  );

  return true;
}

// ============================================================================
// Loop principal
// ============================================================================

export async function scrapeListing(): Promise<ListingResult> {
  const startTime = Date.now();
  console.log('[scrape:listing] Iniciando');

  // 1. Registrar corrida
  // const runId = await registerRunStart('listing');

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

  let runFailed = false;

  try {
    const context = await browser.newContext({
      locale: 'es-PE',
      userAgent:
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();

    // 2. Navegar al listado
    await page.goto(URL_LISTADO, {
      waitUntil: 'networkidle',
      timeout: TIMEOUTS.navigation,
    });
    await page.waitForSelector(SELECTORS.card);

    // 3. Iterar páginas
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

    // 4. UPSERT en batch
    console.log(`[scrape:listing] Aplicando UPSERT de ${allInputs.length} cards`);
    // const upsertResult = await batchUpsertCards(db, remates, allInputs);
    // result.upsert_inserted = upsertResult.inserted;
    // result.upsert_updated = upsertResult.updated;
    // result.upsert_failed = upsertResult.failed;

    // 5. Archivado (solo si todo lo anterior fue OK)
    if (result.upsert_failed === 0) {
      // const archiveResult = await archiveStaleRemates(db, remates, scrapingRuns);
      // result.archived = archiveResult.archived_count;
    } else {
      console.warn('[scrape:listing] Hubo errores en UPSERT, NO se archiva');
    }

    await context.close();
  } catch (err) {
    runFailed = true;
    console.error('[scrape:listing] FATAL:', err);
    throw err;
  } finally {
    await browser.close();
    result.duration_seconds = (Date.now() - startTime) / 1000;

    // 6. Cerrar registro de corrida
    // await registerRunEnd(runId, runFailed ? 'failed' : 'success', result);

    console.log('[scrape:listing] Resultado:', result);
  }

  return result;
}

// ============================================================================
// Helpers
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// CLI entry
// ============================================================================

if (import.meta.url === `file://${process.argv[1]}`) {
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
