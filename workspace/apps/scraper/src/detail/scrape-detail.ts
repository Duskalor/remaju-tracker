import { chromium, type Browser } from 'playwright';
import { and, eq, isNull, lt, or, sql } from '@remaju/database';
import { parseTabRemate } from './parsers/tab-remate';
import { parseTabInmuebles } from './parsers/tab-inmuebles';
import { parseTabCronograma } from './parsers/tab-cronograma';
import { db } from '../db';
import { remates, remateInmuebles, remateCronograma, scrapingRuns } from '@remaju/database';

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
  navigation:       30_000,
  ajax:             15_000,
  betweenRequests:   3_000,
} as const;

const MAX_RETRIES = 3;

interface ScrapeDetailOptions {
  limit?: number;
  remate?: string;
  force?: boolean;
  refreshDays?: number;
}

function selectPendingRemates(
  options: ScrapeDetailOptions,
): Array<{ id: number; remate_numero: string }> {
  const refreshDays = options.refreshDays ?? 2;
  const refreshThreshold = new Date(
    Date.now() - refreshDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  const conditions = [
    isNull(remates.archived_at),
    eq(remates.detail_extraction_failed, false),
    options.force
      ? sql`1 = 1`
      : or(
          isNull(remates.detail_scraped_at),
          lt(remates.detail_scraped_at, refreshThreshold),
        ),
  ];

  if (options.remate) {
    conditions.push(eq(remates.remate_numero, options.remate));
  }

  let query = db
    .select({ id: remates.id, remate_numero: remates.remate_numero })
    .from(remates)
    .where(and(...conditions))
    .orderBy(
      sql`${remates.detail_scraped_at} IS NULL DESC`,
      sql`${remates.fecha_fin_ofertas} ASC NULLS LAST`,
    );

  const rows = options.limit
    ? (query as any).limit(options.limit).all()
    : (query as any).all();

  return rows.filter((r: any) => r.remate_numero !== null) as Array<{
    id: number;
    remate_numero: string;
  }>;
}

async function scrapeRemateDetail(browser: Browser, remateNumero: string) {
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'es-PE',
  });

  const page = await context.newPage();

  try {
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
  } finally {
    await context.close();
  }
}

function persistDetail(
  remateId: number,
  detail: Awaited<ReturnType<typeof scrapeRemateDetail>>,
): void {
  const { tabRemate, tabInmuebles, tabCronograma } = detail;

  db.transaction((tx) => {
    tx.update(remates)
      .set({
        expediente:              tabRemate.expediente ?? undefined,
        juzgado_completo:        tabRemate.juzgado_completo ?? undefined,
        juez:                    tabRemate.juez ?? undefined,
        especialista:            tabRemate.especialista ?? undefined,
        materia:                 tabRemate.materia ?? undefined,
        convocatoria:            tabRemate.convocatoria ?? undefined,
        tasacion:                tabRemate.tasacion ?? undefined,
        precio_base:             tabRemate.precio_base ?? undefined,
        descuento_tasacion:
          tabRemate.tasacion && tabRemate.precio_base
            ? (tabRemate.tasacion - tabRemate.precio_base) / tabRemate.tasacion
            : undefined,
        incremento_oferta:       tabRemate.incremento_oferta ?? undefined,
        arancel:                 tabRemate.arancel ?? undefined,
        oblaje:                  tabRemate.oblaje ?? undefined,
        num_inscritos:           tabRemate.num_inscritos ?? undefined,
        descripcion_detalle:     tabRemate.descripcion_detalle ?? undefined,
        resolucion_numero:       tabRemate.resolucion_numero ?? undefined,
        resolucion_fecha:        tabRemate.resolucion_fecha ?? undefined,
        resolucion_pdf_url:      tabRemate.resolucion_pdf_url ?? undefined,
        fecha_inicio_inscripcion: tabCronograma.fecha_inicio_inscripcion ?? undefined,
        fecha_fin_inscripcion:   tabCronograma.fecha_fin_inscripcion ?? undefined,
        fecha_inicio_ofertas:    tabCronograma.fecha_inicio_ofertas ?? undefined,
        fecha_fin_ofertas:       tabCronograma.fecha_fin_ofertas ?? undefined,
        detail_scraped_at:       new Date().toISOString(),
        detail_attempts:         sql`${remates.detail_attempts} + 1`,
        detail_extraction_failed: false,
        detail_last_error:       null,
      })
      .where(eq(remates.id, remateId))
      .run();

    tx.delete(remateInmuebles).where(eq(remateInmuebles.remate_id, remateId)).run();
    for (const inmueble of tabInmuebles.inmuebles) {
      tx.insert(remateInmuebles).values({
        remate_id: remateId,
        ...inmueble,
        scraped_at: new Date().toISOString(),
      }).run();
    }

    tx.delete(remateCronograma).where(eq(remateCronograma.remate_id, remateId)).run();
    for (const fase of tabCronograma.fases) {
      tx.insert(remateCronograma).values({
        remate_id: remateId,
        fase_numero: fase.fase_numero,
        fase_nombre: fase.fase_nombre,
        fecha_inicio: fase.fecha_inicio ?? '',
        fecha_fin: fase.fecha_fin ?? '',
        scraped_at: new Date().toISOString(),
      }).run();
    }
  });
}

function markFailed(remateId: number, error: string): void {
  db.update(remates)
    .set({
      detail_attempts: sql`${remates.detail_attempts} + 1`,
      detail_last_error: error,
      detail_extraction_failed: true,
    })
    .where(eq(remates.id, remateId))
    .run();
}

async function main(options: ScrapeDetailOptions = {}): Promise<void> {
  console.log('[scrape:detail] Iniciando con opciones:', options);

  let processed = 0;
  let failed = 0;

  const runId = db.insert(scrapingRuns).values({
    type: 'detail',
    started_at: new Date().toISOString(),
    status: 'running',
  }).returning({ id: scrapingRuns.id }).get()?.id ?? 0;

  const browser = await chromium.launch({ headless: true });

  try {
    const pending = selectPendingRemates(options);
    console.log(`[scrape:detail] ${pending.length} remates pendientes`);

    for (const { id, remate_numero } of pending) {
      console.log(`[scrape:detail] → ${remate_numero}`);

      let success = false;
      let lastError: string | null = null;

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          const detail = await scrapeRemateDetail(browser, remate_numero);
          persistDetail(id, detail);
          success = true;
          processed++;
          break;
        } catch (err) {
          lastError = err instanceof Error ? err.message : String(err);
          console.warn(`  intento ${attempt}/${MAX_RETRIES} falló: ${lastError}`);
          if (attempt < MAX_RETRIES) await sleep(TIMEOUTS.betweenRequests * 2);
        }
      }

      if (!success) {
        console.error(`  ✗ ${remate_numero} falló definitivamente`);
        markFailed(id, lastError ?? 'Unknown');
        failed++;
      }

      await sleep(TIMEOUTS.betweenRequests);
    }
  } finally {
    await browser.close();

    if (runId) {
      db.update(scrapingRuns)
        .set({
          status: failed === 0 ? 'success' : 'failed',
          finished_at: new Date().toISOString(),
          records_processed: processed,
          records_failed: failed,
        })
        .where(eq(scrapingRuns.id, runId))
        .run();
    }

    console.log(`[scrape:detail] Terminado. OK: ${processed}, Fallaron: ${failed}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const options: ScrapeDetailOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--limit')             options.limit       = parseInt(args[++i], 10);
    else if (arg === '--remate')       options.remate      = args[++i];
    else if (arg === '--force')        options.force       = true;
    else if (arg === '--refresh-days') options.refreshDays = parseInt(args[++i], 10);
  }

  main(options).catch((err) => {
    console.error('[scrape:detail] FATAL:', err);
    process.exit(1);
  });
}

export { main as scrapeDetail };
