/**
 * apps/scraper/src/detail/scrape-detail.ts
 *
 * Detail scraper — visita el portal uno a uno por cada remate pendiente
 * y extrae los datos completos (económicos, inmuebles, cronograma).
 *
 * FLUJO:
 *   1. Consultar DB: remates sin detail_scraped_at (o con detalle viejo)
 *   2. Por cada remate:
 *      a. Abrir contexto Playwright fresco
 *      b. Buscar por remate_numero + captcha "x"
 *      c. Click Detalle → parsear 3 pestañas con cheerio
 *      d. UPSERT en DB (transaccional)
 *      e. Cerrar contexto
 *   3. Log del resultado total
 *
 * Ejecutar:
 *   pnpm scrape:detail                       # todos los pendientes
 *   pnpm scrape:detail --limit 50            # máximo 50
 *   pnpm scrape:detail --remate 23431        # solo uno
 *   pnpm scrape:detail --force               # incluye los ya scrapeados
 *   pnpm scrape:detail --refresh-days 2      # considera "viejo" si >2 días
 *
 * CONEXIÓN DB: todo lo que es DB está comentado como pseudocódigo Drizzle.
 * Descomentá y ajustá a tu setup igual que hiciste con scrape-listing.ts.
 */

import { chromium, type Browser } from 'playwright';
import { parseTabRemate } from './parsers/tab-remate';
import { parseTabInmuebles } from './parsers/tab-inmuebles';
import { parseTabCronograma } from './parsers/tab-cronograma';
// import { db } from '../db';
// import { remates, remateInmuebles, remateCronograma, scrapingRuns } from '@remaju/database';
// import { eq, and, isNull, or, lt, sql } from 'drizzle-orm';

// ============================================================================
// Constantes
// ============================================================================

const URL_BUSCADOR =
  'https://remaju.pj.gob.pe/remaju/pages/publico/remateExterno.xhtml';

// Selectores semánticos — estables en PrimeFaces (no usar IDs hasheados)
const SELECTORS = {
  inputRemate:    'input[name$=":filtroRemate"]',
  inputCaptcha:   'input[role="textbox"][aria-label="Captcha"]',
  buttonAplicar:  'button:has-text("APLICAR")',
  buttonDetalle:  'button:has-text("Detalle")',
  tabInmuebles:   'a[href$=":tbInmuebles"]',
  tabCronograma:  'a[href$=":tbCronograma"]',
  noResults:      'text=/no se encontr|sin resultados/i',
  panelRemate:    '[id$=":pgResumenRemate"]',
  panelInmueble:  '[id$=":pgResumenInmueble"]',
  tablaCronograma:'[id$=":dtCronograma_data"]',
} as const;

const TIMEOUTS = {
  navigation:      30_000,
  ajax:            15_000,
  betweenRequests:  3_000,
} as const;

const MAX_RETRIES = 3;

// ============================================================================
// Opciones CLI
// ============================================================================

interface ScrapeDetailOptions {
  limit?: number;
  remate?: string;
  force?: boolean;
  refreshDays?: number;
}

// ============================================================================
// Selección de remates pendientes
// ============================================================================

async function selectPendingRemates(
  options: ScrapeDetailOptions,
): Promise<Array<{ id: number; remate_numero: string }>> {
  const refreshDays = options.refreshDays ?? 2;
  const refreshThreshold = new Date(
    Date.now() - refreshDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  /*
  const query = db
    .select({ id: remates.id, remate_numero: remates.remate_numero })
    .from(remates)
    .where(
      and(
        isNull(remates.archived_at),
        eq(remates.detail_extraction_failed, false),
        or(
          isNull(remates.detail_scraped_at),
          options.force
            ? sql`1 = 1`
            : and(
                lt(remates.detail_scraped_at, refreshThreshold),
                sql`${remates.fecha_fin_inscripcion} >= datetime('now')`,
              ),
        ),
        options.remate ? eq(remates.remate_numero, options.remate) : sql`1 = 1`,
      ),
    )
    .orderBy(
      sql`${remates.detail_scraped_at} IS NULL DESC`,
      sql`${remates.fecha_fin_ofertas} ASC NULLS LAST`,
    );

  if (options.limit) query.limit(options.limit);
  return query.all();
  */

  throw new Error('Conectar con @remaju/database — ver SPRINT-1.5-ADAPTACION.md Paso 4');
}

// ============================================================================
// Scraping de un remate
// ============================================================================

async function scrapeRemateDetail(browser: Browser, remateNumero: string) {
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'es-PE',
  });

  const page = await context.newPage();

  try {
    // 1. Navegar al buscador
    await page.goto(URL_BUSCADOR, {
      waitUntil: 'networkidle',
      timeout: TIMEOUTS.navigation,
    });

    await page.waitForSelector(SELECTORS.inputRemate, { timeout: TIMEOUTS.ajax });

    // 2. Buscar el remate
    await page.fill(SELECTORS.inputRemate, remateNumero);
    await page.fill(SELECTORS.inputCaptcha, 'x'); // captcha es teatro
    await page.click(SELECTORS.buttonAplicar);

    // 3. Esperar resultado
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

    // 4. Abrir detalle
    await page.click(SELECTORS.buttonDetalle);
    await page.waitForSelector(SELECTORS.panelRemate, { timeout: TIMEOUTS.ajax });

    // 5. Parsear tab Remate (ya está activa por defecto)
    const htmlRemate = await page.locator('[id$=":tbRemate"]').innerHTML();
    const tabRemate = parseTabRemate(htmlRemate);

    // 6. Parsear tab Inmuebles
    await page.click(SELECTORS.tabInmuebles);
    await page.waitForSelector(SELECTORS.panelInmueble, { timeout: TIMEOUTS.ajax });
    const htmlInmuebles = await page.locator('[id$=":tbInmuebles"]').innerHTML();
    const tabInmuebles = parseTabInmuebles(htmlInmuebles);

    // 7. Parsear tab Cronograma
    await page.click(SELECTORS.tabCronograma);
    await page.waitForSelector(SELECTORS.tablaCronograma, { timeout: TIMEOUTS.ajax });
    const htmlCronograma = await page.locator('[id$=":tbCronograma"]').innerHTML();
    const tabCronograma = parseTabCronograma(htmlCronograma);

    // Log de warnings para debuggear selectores
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

// ============================================================================
// Persistencia
// ============================================================================

async function persistDetail(
  remateId: number,
  detail: Awaited<ReturnType<typeof scrapeRemateDetail>>,
): Promise<void> {
  const { tabRemate, tabInmuebles, tabCronograma } = detail;

  /*
  await db.transaction(async (tx) => {
    // Update tabla remates
    await tx.update(remates).set({
      // Campos del tab Remate
      expediente:          tabRemate.expediente,
      distrito_judicial:   tabRemate.distrito_judicial,
      juzgado_completo:    tabRemate.juzgado_completo,
      juez:                tabRemate.juez,
      especialista:        tabRemate.especialista,
      materia:             tabRemate.materia,
      convocatoria:        tabRemate.convocatoria,
      tasacion:            tabRemate.tasacion,
      precio_base:         tabRemate.precio_base,
      descuento_tasacion:
        tabRemate.tasacion && tabRemate.precio_base
          ? (tabRemate.tasacion - tabRemate.precio_base) / tabRemate.tasacion
          : null,
      incremento_oferta:   tabRemate.incremento_oferta,
      arancel:             tabRemate.arancel,
      oblaje:              tabRemate.oblaje,
      num_inscritos:       tabRemate.num_inscritos,
      descripcion_detalle: tabRemate.descripcion_detalle,
      resolucion_numero:   tabRemate.resolucion_numero,
      resolucion_fecha:    tabRemate.resolucion_fecha,
      resolucion_pdf_url:  tabRemate.resolucion_pdf_url,

      // Fechas críticas del cronograma
      fecha_inicio_inscripcion: tabCronograma.fecha_inicio_inscripcion,
      fecha_fin_inscripcion:    tabCronograma.fecha_fin_inscripcion,
      fecha_inicio_ofertas:     tabCronograma.fecha_inicio_ofertas,
      fecha_fin_ofertas:        tabCronograma.fecha_fin_ofertas,

      // Tracking
      detail_scraped_at:        new Date().toISOString(),
      detail_attempts:          sql`${remates.detail_attempts} + 1`,
      detail_extraction_failed: false,
      detail_last_error:        null,
    }).where(eq(remates.id, remateId));

    // Inmuebles: delete + reinsert
    await tx.delete(remateInmuebles).where(eq(remateInmuebles.remate_id, remateId));
    for (const inmueble of tabInmuebles.inmuebles) {
      await tx.insert(remateInmuebles).values({
        remate_id: remateId,
        ...inmueble,
        scraped_at: new Date().toISOString(),
      });
    }

    // Cronograma: delete + reinsert
    await tx.delete(remateCronograma).where(eq(remateCronograma.remate_id, remateId));
    for (const fase of tabCronograma.fases) {
      await tx.insert(remateCronograma).values({
        remate_id: remateId,
        ...fase,
        scraped_at: new Date().toISOString(),
      });
    }
  });
  */
}

// ============================================================================
// Loop principal
// ============================================================================

async function main(options: ScrapeDetailOptions = {}): Promise<void> {
  console.log('[scrape:detail] Iniciando con opciones:', options);

  let processed = 0;
  let failed = 0;

  const browser = await chromium.launch({ headless: true });

  try {
    const pending = await selectPendingRemates(options);
    console.log(`[scrape:detail] ${pending.length} remates pendientes`);

    for (const { id, remate_numero } of pending) {
      console.log(`[scrape:detail] → ${remate_numero}`);

      let success = false;
      let lastError: string | null = null;

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          const detail = await scrapeRemateDetail(browser, remate_numero);
          await persistDetail(id, detail);
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
        // await markFailed(db, remates, id, lastError ?? 'Unknown');
        failed++;
      }

      await sleep(TIMEOUTS.betweenRequests);
    }
  } finally {
    await browser.close();
    console.log(`[scrape:detail] Terminado. OK: ${processed}, Fallaron: ${failed}`);
  }
}

// ============================================================================
// Helpers
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// CLI
// ============================================================================

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const options: ScrapeDetailOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--limit')        options.limit       = parseInt(args[++i], 10);
    else if (arg === '--remate')  options.remate      = args[++i];
    else if (arg === '--force')   options.force       = true;
    else if (arg === '--refresh-days') options.refreshDays = parseInt(args[++i], 10);
  }

  main(options).catch((err) => {
    console.error('[scrape:detail] FATAL:', err);
    process.exit(1);
  });
}

export { main as scrapeDetail };
