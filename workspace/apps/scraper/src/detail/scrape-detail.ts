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
  inputCaptcha:    'input.captcha-input',
  buttonAplicar:   'button:has-text("APLICAR")',
  buttonDetalle:   'button:has-text("Detalle")',
  tabInmuebles:    'li[role="tab"][data-index="1"]',
  tabCronograma:   'li[role="tab"][data-index="2"]',
  noResults:       'span.label-warning',
  panelRemate:     '[id$=":pgResumenRemate"]',
  tabPanelInmuebles:  '[id$=":tbInmuebles"]',
  tabPanelCronograma: '[id$=":tbCronograma"]',
} as const;

const TIMEOUTS = {
  navigation:      30_000,
  ajax:            15_000,
  betweenRequests:  3_000,
} as const;

async function clickTab(page: Page, tabIndex: number, panelSelector: string): Promise<void> {
  const tabSelector = `li[role="tab"][data-index="${tabIndex}"]`;
  await page.waitForSelector(tabSelector, { state: 'visible', timeout: TIMEOUTS.ajax });
  await page.click(tabSelector);
  await page.waitForLoadState('networkidle', { timeout: TIMEOUTS.ajax });

  await page.waitForFunction(
    (sel) => {
      const el = document.querySelector(sel);
      if (!el || el.classList.contains('ui-helper-hidden')) return false;
      return el.querySelectorAll('tbody tr td').length > 0;
    },
    panelSelector,
    { timeout: TIMEOUTS.ajax },
  );
}

async function dismissDialog(page: Page): Promise<void> {
  try {
    const isBlocked = await page.locator('#dlgEstado_modal').isVisible();
    if (!isBlocked) return;
    // Cerrar via PrimeFaces API directamente
    await page.evaluate(() => {
      try { (window as any).PF('dlgEstado')?.hide(); } catch {}
    });
    await page.waitForSelector('#dlgEstado_modal', { state: 'hidden', timeout: 3_000 }).catch(() => {});
  } catch {}
}

class RemateNotFoundError extends Error {
  constructor(remateNumero: string) {
    super(`Remate ${remateNumero} no encontrado en el buscador`);
    this.name = 'RemateNotFoundError';
  }
}

async function scrapeRemateDetail(page: Page, remateNumero: string) {
  await page.goto(URL_BUSCADOR, {
    waitUntil: 'networkidle',
    timeout: TIMEOUTS.navigation,
  });

  await page.waitForSelector(SELECTORS.inputRemate, { timeout: TIMEOUTS.ajax });

  await page.fill(SELECTORS.inputRemate, remateNumero);
  await page.fill(SELECTORS.inputCaptcha, 'x');
  await page.click(SELECTORS.buttonAplicar);
  await page.waitForLoadState('networkidle', { timeout: TIMEOUTS.ajax });

  if (await page.locator(SELECTORS.noResults).isVisible()) {
    throw new RemateNotFoundError(remateNumero);
  }

  await page.waitForSelector(SELECTORS.buttonDetalle, { timeout: TIMEOUTS.ajax });

  // Algunos remates muestran un dialogo de estado automáticamente que bloquea el click
  await dismissDialog(page);
  await page.click(SELECTORS.buttonDetalle);
  try {
    await page.waitForSelector(SELECTORS.panelRemate, { timeout: TIMEOUTS.ajax });
  } catch {
    const isStillOnSearch =
      (await page.locator(SELECTORS.noResults).isVisible()) ||
      (await page.locator(SELECTORS.buttonDetalle).isVisible());
    if (isStillOnSearch) throw new RemateNotFoundError(remateNumero);
    throw new Error(`Panel remate no encontrado para ${remateNumero}`);
  }
  await page.waitForLoadState('networkidle', { timeout: TIMEOUTS.navigation });

  const htmlRemate = await page.locator('[id$=":tbRemate"]').innerHTML();
  const tabRemate = parseTabRemate(htmlRemate);

  await clickTab(page, 1, SELECTORS.tabPanelInmuebles);
  const htmlInmuebles = await page.locator(SELECTORS.tabPanelInmuebles).innerHTML();
  const tabInmuebles = parseTabInmuebles(htmlInmuebles);

  await clickTab(page, 2, SELECTORS.tabPanelCronograma);
  const htmlCronograma = await page.locator(SELECTORS.tabPanelCronograma).innerHTML();
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
  let page = await client.initialize();

  try {
    const pending = repo.findPendingForDetail(options);
    console.log(`[scrape:detail] ${pending.length} remates pendientes`);

    for (const { id, remate_numero } of pending) {
      console.log(`[scrape:detail] → ${remate_numero}`);

      let success = false;
      let notFound = false;
      let lastError: string | null = null;

      for (let attempt = 1; attempt <= config.retryMax; attempt++) {
        try {
          const detail = await scrapeRemateDetail(page, remate_numero);
          repo.saveDetail(id, detail);
          success = true;
          processed++;
          break;
        } catch (err) {
          if (err instanceof RemateNotFoundError) {
            notFound = true;
            break;
          }
          lastError = err instanceof Error ? err.message : String(err);
          console.warn(`  intento ${attempt}/${config.retryMax} falló: ${lastError}`);
          if (attempt < config.retryMax) {
            await sleep(TIMEOUTS.betweenRequests * 2);
            try {
              await page.evaluate(() => true);
            } catch {
              console.warn('  Página caída, reiniciando...');
              page = await client.resetPage();
            }
          }
        }
      }

      if (notFound) {
        console.warn(`  ✗ ${remate_numero} no existe en el portal — archivando`);
        repo.markNotFound(id);
        failed++;
      } else if (!success) {
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
