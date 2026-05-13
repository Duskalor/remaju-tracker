import type { Page } from 'playwright';
import { resolve } from 'path';
import { createSqliteClient, RemateRepository, type PendingDetailOptions } from '@remaju/database';
import { parseTabRemate } from './parsers/tab-remate';
import { parseTabInmuebles } from './parsers/tab-inmuebles';
import { parseTabCronograma } from './parsers/tab-cronograma';
import { BrowserClient } from '../browser/client';
import { config } from '../config';

const URL_BUSCADOR =
  'https://remaju.pj.gob.pe/remaju/pages/publico/remateExterno.xhtml';

const SELECTORS = {
  inputRemate:     'input[name$=":filtroRemate"]',
  inputCaptcha:    'input[role="textbox"][aria-label="Captcha"]',
  buttonAplicar:   'button:has-text("APLICAR")',
  buttonDetalle:   'button:has-text("Detalle")',
  tabInmuebles:    'a[href$=":tbInmuebles"]',
  tabCronograma:   'a[href$=":tbCronograma"]',
  noResults:       'text=/no se encontr|sin resultados/i',
  panelRemate:     '[id$=":pgResumenRemate"]',
  panelInmueble:   '[id$=":pgResumenInmueble"]',
  tablaCronograma: '[id$=":dtCronograma_data"]',
} as const;

const TIMEOUTS = {
  navigation:      30_000,
  ajax:            15_000,
  betweenRequests:  3_000,
} as const;

async function scrapeRemateDetail(page: Page, remateNumero: string) {
  await page.goto(URL_BUSCADOR, {
    waitUntil: 'networkidle',
    timeout: TIMEOUTS.navigation,
  });

  await page.waitForSelector(SELECTORS.inputRemate, { timeout: TIMEOUTS.ajax });

  await page.fill(SELECTORS.inputRemate, remateNumero);
  await page.fill(SELECTORS.inputCaptcha, 'x');
  await page.click(SELECTORS.buttonAplicar);

  const found = await Promise.race([
    page
      .waitForSelector(SELECTORS.buttonDetalle, { timeout: TIMEOUTS.ajax })
      .then(() => true)
      .catch(() => false),
    page
      .waitForSelector(SELECTORS.noResults, { timeout: TIMEOUTS.ajax })
      .then(() => false)
      .catch(() => null),
  ]);

  if (found !== true) {
    throw new Error(`Remate ${remateNumero} no encontrado en el buscador`);
  }

  await page.click(SELECTORS.buttonDetalle);
  await page.waitForSelector(SELECTORS.panelRemate, { timeout: TIMEOUTS.ajax });

  const htmlRemate = await page.locator('[id$=":tbRemate"]').innerHTML();
  const tabRemate = parseTabRemate(htmlRemate);

  await page.click(SELECTORS.tabInmuebles);
  await page.waitForSelector(SELECTORS.panelInmueble, { timeout: TIMEOUTS.ajax });
  const htmlInmuebles = await page.locator('[id$=":tbInmuebles"]').innerHTML();
  const tabInmuebles = parseTabInmuebles(htmlInmuebles);

  await page.click(SELECTORS.tabCronograma);
  await page.waitForSelector(SELECTORS.tablaCronograma, { timeout: TIMEOUTS.ajax });
  const htmlCronograma = await page.locator('[id$=":tbCronograma"]').innerHTML();
  const tabCronograma = parseTabCronograma(htmlCronograma);

  const allWarnings = [
    ...tabRemate.parse_warnings.map((w) => `[remate] ${w}`),
    ...tabInmuebles.parse_warnings.map((w) => `[inmuebles] ${w}`),
    ...tabCronograma.parse_warnings.map((w) => `[cronograma] ${w}`),
  ];
  if (allWarnings.length > 0) {
    console.warn(`[scrape:detail] Warnings remate ${remateNumero}:`, allWarnings);
  }

  return { tabRemate, tabInmuebles, tabCronograma };
}

async function main(options: PendingDetailOptions = {}): Promise<void> {
  console.log('[scrape:detail] Iniciando con opciones:', options);

  const dbPath = process.env.DATABASE_URL ?? resolve(__dirname, '../../data/remates.db');
  const repo = new RemateRepository(createSqliteClient(dbPath));

  let processed = 0;
  let failed = 0;

  const runId = repo.startScrapingRun('detail');
  const client = new BrowserClient();
  const page = await client.initialize();

  try {
    const pending = repo.findPendingForDetail(options);
    console.log(`[scrape:detail] ${pending.length} remates pendientes`);

    for (const { id, remate_numero } of pending) {
      console.log(`[scrape:detail] → ${remate_numero}`);

      let success = false;
      let lastError: string | null = null;

      for (let attempt = 1; attempt <= config.retryMax; attempt++) {
        try {
          const detail = await scrapeRemateDetail(page, remate_numero);
          repo.saveDetail(id, detail);
          success = true;
          processed++;
          break;
        } catch (err) {
          lastError = err instanceof Error ? err.message : String(err);
          console.warn(`  intento ${attempt}/${config.retryMax} falló: ${lastError}`);
          if (attempt < config.retryMax) await sleep(TIMEOUTS.betweenRequests * 2);
        }
      }

      if (!success) {
        console.error(`  ✗ ${remate_numero} falló definitivamente`);
        repo.markDetailFailed(id, lastError ?? 'Unknown');
        failed++;
      }

      await sleep(TIMEOUTS.betweenRequests);
    }
  } finally {
    await client.close();
    repo.finishScrapingRun(runId, { processed, failed });
    repo.close();
    console.log(`[scrape:detail] Terminado. OK: ${processed}, Fallaron: ${failed}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { main as scrapeDetail };
