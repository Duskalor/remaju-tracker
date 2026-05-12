/**
 * apps/scraper/src/detail/scrape-detail.ts
 *
 * Detail scraper — Sprint 2.
 *
 * Estrategia: Browser context fresco por iteración (Opción A — máxima robustez).
 * Para cada remate pendiente:
 *   1. Abrir contexto nuevo de Playwright
 *   2. Ir al buscador
 *   3. Tipear remate_numero + captcha "x" (teatro confirmado)
 *   4. Click APLICAR → click Detalle
 *   5. Parsear pestañas Remate → Inmuebles → Cronograma
 *   6. UPSERT en DB
 *   7. Cerrar contexto
 *
 * Ejecutar:
 *   pnpm scrape:detail              # procesa todos los pendientes
 *   pnpm scrape:detail --limit 50   # procesa máximo 50
 *   pnpm scrape:detail --remate 23431  # solo uno específico
 *   pnpm scrape:detail --force      # incluye los exitosos para refresh
 *
 * IMPORTANTE: este archivo es el orquestador. Los parsers van en parsers/*.ts
 * y se importan abajo (esqueletos comentados).
 */

import { chromium, type Browser, type Page } from 'playwright';
import { eq, and, isNull, or, lt, sql } from 'drizzle-orm';
// import { db, remates, remateInmuebles, remateCronograma, scrapingRuns } from '@remaju/database';
// import { parseTabRemate } from './parsers/tab-remate';
// import { parseTabInmuebles } from './parsers/tab-inmuebles';
// import { parseTabCronograma } from './parsers/tab-cronograma';

// ============================================================================
// Constantes del portal
// ============================================================================

const URL_BUSCADOR = 'https://remaju.pj.gob.pe/remaju/pages/publico/remateExterno.xhtml';

// Selectores semánticos (NO usar IDs JSF con hash — son inestables)
// Los `name` con sufijos legibles los puso un dev a mano y son estables.
const SELECTORS = {
  inputRemate: 'input[name$=":filtroRemate"]',
  inputCaptcha: 'input[role="textbox"][aria-label="Captcha"]',
  // Fallback si aria-label cambia: 'input[name$=":txtCaptcha"]'
  buttonAplicar: 'button:has-text("APLICAR")',
  buttonDetalle: 'button:has-text("Detalle")',

  // Tabs del detalle
  tabInmuebles: 'a[href$=":tbInmuebles"]',
  tabCronograma: 'a[href$=":tbCronograma"]',

  // Detección de "no encontrado"
  noResults: 'text=/no se encontr|sin resultados/i',
} as const;

const TIMEOUTS = {
  navigation: 30_000,
  ajax: 15_000,
  betweenRequests: 3_000, // rate limit conservador, respeta el portal
} as const;

const MAX_RETRIES = 3;
const SCORE_VERSION = 'v1.0';

// ============================================================================
// Configuración del comando
// ============================================================================

interface ScrapeDetailOptions {
  limit?: number;
  remate?: string; // un número específico
  force?: boolean; // incluir los ya scrapeados
  refreshDays?: number; // cuántos días para considerar viejo (default 2)
}

// ============================================================================
// Query: qué remates procesar
// ============================================================================

/**
 * Selecciona qué expedientes procesar:
 *   - Los que nunca tuvieron detalle (detail_scraped_at IS NULL)
 *   - O los "vivos" cuyo detalle es viejo (>2 días)
 *   - Excluye los que fallaron permanentemente
 *   - Excluye los archivados
 *   - Ordena: nuevos primero, después por urgencia (fin_ofertas más cercano)
 */
async function selectPendingRemates(
  options: ScrapeDetailOptions,
): Promise<Array<{ id: number; remate_numero: string }>> {
  const refreshDays = options.refreshDays ?? 2;
  const refreshThreshold = new Date(Date.now() - refreshDays * 24 * 60 * 60 * 1000).toISOString();

  // Pseudocódigo Drizzle. La implementación real depende de tu setup.
  /*
  const query = db
    .select({ id: remates.id, remate_numero: remates.remate_numero })
    .from(remates)
    .where(
      and(
        // Filtros de exclusión
        isNull(remates.archived_at),
        eq(remates.detail_extraction_failed, false),
        
        // Filtro principal: pendientes O viejos-y-vivos
        or(
          isNull(remates.detail_scraped_at),
          options.force
            ? sql`1 = 1` // incluir todos si --force
            : and(
                lt(remates.detail_scraped_at, refreshThreshold),
                sql`${remates.fecha_fin_inscripcion} >= datetime('now')`,
              ),
        ),

        // Si vino --remate, filtrar a ese
        options.remate ? eq(remates.remate_numero, options.remate) : sql`1 = 1`,
      ),
    )
    .orderBy(
      sql`${remates.detail_scraped_at} IS NULL DESC`, // nulls (nuevos) primero
      sql`${remates.fecha_fin_ofertas} ASC NULLS LAST`,
    );

  if (options.limit) {
    query.limit(options.limit);
  }

  return query.all();
  */
  throw new Error('Implementar con drizzle real del package @remaju/database');
}

// ============================================================================
// Procesamiento de un remate
// ============================================================================

interface ScrapedDetail {
  // Tab Remate
  expediente: string;
  distrito_judicial: string;
  juzgado_completo: string;
  juez: string;
  especialista: string;
  materia: string;
  convocatoria: 'PRIMERA' | 'SEGUNDA' | 'TERCERA';
  tasacion: number;
  precio_base: number;
  incremento_oferta: number;
  arancel: number;
  oblaje: number;
  num_inscritos: number;
  descripcion_detalle: string;
  resolucion_numero: string;
  resolucion_fecha: string;
  resolucion_pdf_url: string | null;

  // Tab Inmuebles (puede ser N)
  inmuebles: Array<{
    partida_registral: string;
    tipo_inmueble: string;
    direccion_completa: string;
    departamento: string;
    provincia: string;
    distrito: string;
    carga_gravamen_raw: string;
    porcentaje_rematar: number;
    num_imagenes: number;
  }>;

  // Tab Cronograma
  cronograma: Array<{
    fase_numero: number;
    fase_nombre: string;
    fecha_inicio: string;
    fecha_fin: string;
  }>;
}

/**
 * Procesa un remate específico. Browser context fresco — cada llamada
 * es independiente y no comparte estado con otras.
 */
async function scrapeRemateDetail(
  browser: Browser,
  remateNumero: string,
): Promise<ScrapedDetail> {
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'es-PE',
  });

  const page = await context.newPage();

  try {
    // 1. Ir al buscador
    await page.goto(URL_BUSCADOR, {
      waitUntil: 'networkidle',
      timeout: TIMEOUTS.navigation,
    });

    // 2. Esperar a que el form esté listo
    await page.waitForSelector(SELECTORS.inputRemate, { timeout: TIMEOUTS.ajax });

    // 3. Llenar campos
    await page.fill(SELECTORS.inputRemate, remateNumero);
    await page.fill(SELECTORS.inputCaptcha, 'x'); // captcha es teatro

    // 4. Submit
    await page.click(SELECTORS.buttonAplicar);

    // 5. Esperar resultado: o aparece botón Detalle, o aparece "no encontrado"
    const detalleAppeared = await Promise.race([
      page
        .waitForSelector(SELECTORS.buttonDetalle, { timeout: TIMEOUTS.ajax })
        .then(() => true)
        .catch(() => false),
      page
        .waitForSelector(SELECTORS.noResults, { timeout: TIMEOUTS.ajax })
        .then(() => false)
        .catch(() => null),
    ]);

    if (detalleAppeared !== true) {
      throw new Error(`Remate ${remateNumero} no encontrado en buscador`);
    }

    // 6. Click en Detalle
    await page.click(SELECTORS.buttonDetalle);

    // 7. Esperar a que cargue el detalle
    await page.waitForSelector('[id$=":pgResumenRemate"]', { timeout: TIMEOUTS.ajax });

    // 8. Parsear las 3 pestañas
    // Tab Remate: ya está activa por default
    const htmlRemate = await page.locator('[id$=":tbRemate"]').innerHTML();
    // const tabRemate = parseTabRemate(htmlRemate);

    // Tab Inmuebles: click + esperar AJAX
    await page.click(SELECTORS.tabInmuebles);
    await page.waitForSelector('[id$=":pgResumenInmueble"]', { timeout: TIMEOUTS.ajax });
    const htmlInmuebles = await page.locator('[id$=":tbInmuebles"]').innerHTML();
    // const tabInmuebles = parseTabInmuebles(htmlInmuebles);

    // Tab Cronograma
    await page.click(SELECTORS.tabCronograma);
    await page.waitForSelector('[id$=":dtCronograma_data"]', { timeout: TIMEOUTS.ajax });
    const htmlCronograma = await page.locator('[id$=":tbCronograma"]').innerHTML();
    // const tabCronograma = parseTabCronograma(htmlCronograma);

    // TODO: combinar resultados de los parsers
    const result: ScrapedDetail = {} as ScrapedDetail; // placeholder
    return result;
  } finally {
    await context.close();
  }
}

// ============================================================================
// Persistencia
// ============================================================================

/**
 * UPSERT del detalle en DB. Transaccional para que si falla a la mitad,
 * no queden datos parciales.
 */
async function persistDetail(
  remateId: number,
  detail: ScrapedDetail,
): Promise<void> {
  /*
  await db.transaction(async (tx) => {
    // 1. Update tabla remates con campos del tab Remate + cronograma derivado
    const cronoOfertas = detail.cronograma.find((c) => 
      c.fase_nombre.toLowerCase().includes('presentación de ofertas')
    );
    const cronoInscripcion = detail.cronograma.find((c) =>
      c.fase_nombre.toLowerCase().includes('publicación e inscripcion')
    );

    const estadoTemporal = computeEstadoTemporal(cronoInscripcion, cronoOfertas);

    await tx.update(remates).set({
      tasacion: detail.tasacion,
      precio_base: detail.precio_base,
      descuento_tasacion: (detail.tasacion - detail.precio_base) / detail.tasacion,
      convocatoria: detail.convocatoria,
      incremento_oferta: detail.incremento_oferta,
      arancel: detail.arancel,
      oblaje: detail.oblaje,
      num_inscritos: detail.num_inscritos,
      materia: detail.materia,
      juzgado_completo: detail.juzgado_completo,
      juez: detail.juez,
      especialista: detail.especialista,
      resolucion_numero: detail.resolucion_numero,
      resolucion_fecha: detail.resolucion_fecha,
      resolucion_pdf_url: detail.resolucion_pdf_url,
      descripcion_detalle: detail.descripcion_detalle,
      
      // Calculados desde cronograma
      fecha_inicio_inscripcion: cronoInscripcion?.fecha_inicio,
      fecha_fin_inscripcion: cronoInscripcion?.fecha_fin,
      fecha_inicio_ofertas: cronoOfertas?.fecha_inicio,
      fecha_fin_ofertas: cronoOfertas?.fecha_fin,
      estado_temporal: estadoTemporal,
      
      // Tracking
      detail_scraped_at: new Date().toISOString(),
      detail_attempts: sql`${remates.detail_attempts} + 1`,
      detail_extraction_failed: false,
      detail_last_error: null,
    }).where(eq(remates.id, remateId));

    // 2. Limpiar inmuebles antiguos y reinsertar (estrategia simple)
    await tx.delete(remateInmuebles).where(eq(remateInmuebles.remate_id, remateId));
    for (const inmueble of detail.inmuebles) {
      const cargaParsed = parseCargas(inmueble.carga_gravamen_raw);
      await tx.insert(remateInmuebles).values({
        remate_id: remateId,
        partida_registral: inmueble.partida_registral,
        tipo_inmueble: inmueble.tipo_inmueble,
        direccion_completa: inmueble.direccion_completa,
        departamento: inmueble.departamento,
        provincia: inmueble.provincia,
        distrito: inmueble.distrito,
        carga_gravamen_raw: inmueble.carga_gravamen_raw,
        num_cargas: cargaParsed.num,
        tiene_hipoteca: cargaParsed.hipoteca,
        tiene_embargo: cargaParsed.embargo,
        embargo_terceros: cargaParsed.embargo_terceros,
        porcentaje_rematar: inmueble.porcentaje_rematar,
        num_imagenes: inmueble.num_imagenes,
        scraped_at: new Date().toISOString(),
      });
    }

    // 3. Reinsertar cronograma
    await tx.delete(remateCronograma).where(eq(remateCronograma.remate_id, remateId));
    for (const fase of detail.cronograma) {
      await tx.insert(remateCronograma).values({
        remate_id: remateId,
        ...fase,
        scraped_at: new Date().toISOString(),
      });
    }
  });
  */
}

/**
 * Detecta hipoteca, embargo y embargo de terceros desde el texto crudo.
 * Heurística simple — el texto es bastante estandarizado.
 *
 * Embargo de terceros: hay un asiento de embargo con nombre de acreedor
 * distinto al banco que originó la hipoteca o al ejecutante del proceso
 * actual. Heurística v1: si hay embargo Y hay >1 institución mencionada.
 */
function parseCargas(raw: string): {
  num: number;
  hipoteca: boolean;
  embargo: boolean;
  embargo_terceros: boolean;
} {
  if (!raw || raw.trim().length === 0) {
    return { num: 0, hipoteca: false, embargo: false, embargo_terceros: false };
  }

  const normalized = raw.toUpperCase();

  // Contar asientos
  const asientoMatches = normalized.match(/ASIENTO\s+[A-Z]?\d+/g);
  const num = asientoMatches?.length ?? 0;

  const hipoteca = /HIPOTECA/.test(normalized);
  const embargo = /EMBARGO/.test(normalized);

  // Heurística para embargo de terceros: si hay embargo Y se menciona una
  // institución financiera distinta a la que tiene la hipoteca principal.
  // Buscamos múltiples bancos/cajas/financieras mencionadas.
  const institucionesMencionadas = new Set<string>();
  const bankPatterns = [
    /BANCO\s+[A-Z]+/g,
    /CAJA\s+[A-Z]+/g,
    /FINANCIERA\s+[A-Z]+/g,
    /COOPERATIVA\s+[A-Z]+/g,
  ];
  for (const pattern of bankPatterns) {
    const matches = normalized.match(pattern);
    if (matches) {
      matches.forEach((m) => institucionesMencionadas.add(m.trim()));
    }
  }

  const embargo_terceros = embargo && institucionesMencionadas.size > 1;

  return { num, hipoteca, embargo, embargo_terceros };
}

/**
 * Calcula estado_temporal a partir de las fechas del cronograma.
 */
function computeEstadoTemporal(
  inscripcion: { fecha_inicio: string; fecha_fin: string } | undefined,
  ofertas: { fecha_inicio: string; fecha_fin: string } | undefined,
): 'inscripcion_abierta' | 'inscripcion_cerrada' | 'ofertando' | 'cerrado' | null {
  const now = new Date();

  if (ofertas) {
    const finOfertas = new Date(ofertas.fecha_fin);
    if (now > finOfertas) return 'cerrado';

    const inicioOfertas = new Date(ofertas.fecha_inicio);
    if (now >= inicioOfertas && now <= finOfertas) return 'ofertando';
  }

  if (inscripcion) {
    const finInscripcion = new Date(inscripcion.fecha_fin);
    if (now > finInscripcion) return 'inscripcion_cerrada';

    const inicioInscripcion = new Date(inscripcion.fecha_inicio);
    if (now >= inicioInscripcion) return 'inscripcion_abierta';
  }

  return null;
}

// ============================================================================
// Loop principal
// ============================================================================

async function main(options: ScrapeDetailOptions = {}): Promise<void> {
  console.log('[scrape:detail] Iniciando con opciones:', options);

  // Registrar corrida
  const runId = await registerRunStart('detail');

  let processed = 0;
  let failed = 0;

  const browser = await chromium.launch({ headless: true });

  try {
    const pending = await selectPendingRemates(options);
    console.log(`[scrape:detail] ${pending.length} remates pendientes de procesar`);

    for (const { id, remate_numero } of pending) {
      console.log(`[scrape:detail] Procesando remate ${remate_numero}...`);

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
          console.warn(
            `[scrape:detail] Intento ${attempt}/${MAX_RETRIES} falló para ${remate_numero}: ${lastError}`,
          );
          if (attempt < MAX_RETRIES) {
            await sleep(TIMEOUTS.betweenRequests * 2);
          }
        }
      }

      if (!success) {
        await markFailed(id, lastError ?? 'Unknown error');
        failed++;
      }

      // Rate limit — sé respetuoso con el portal
      await sleep(TIMEOUTS.betweenRequests);
    }
  } finally {
    await browser.close();
    await registerRunEnd(runId, processed, failed);
  }

  console.log(`[scrape:detail] Terminado. Procesados: ${processed}, Fallaron: ${failed}`);
}

// ============================================================================
// Helpers
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function registerRunStart(type: 'listing' | 'detail' | 'rescore'): Promise<number> {
  // db.insert(scrapingRuns).values({ type, started_at: new Date().toISOString(), status: 'running' })
  return 0; // placeholder
}

async function registerRunEnd(
  runId: number,
  processed: number,
  failed: number,
): Promise<void> {
  // db.update(scrapingRuns).set({ finished_at, status: failed > 0 ? 'partial' : 'success', records_processed: processed, records_failed: failed }).where(...)
}

async function markFailed(remateId: number, error: string): Promise<void> {
  // db.update(remates).set({
  //   detail_extraction_failed: sql`CASE WHEN detail_attempts >= 4 THEN 1 ELSE detail_extraction_failed END`,
  //   detail_attempts: sql`detail_attempts + 1`,
  //   detail_last_error: error,
  // }).where(eq(remates.id, remateId));
}

// ============================================================================
// CLI entry point
// ============================================================================

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const options: ScrapeDetailOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--limit') options.limit = parseInt(args[++i], 10);
    else if (arg === '--remate') options.remate = args[++i];
    else if (arg === '--force') options.force = true;
    else if (arg === '--refresh-days') options.refreshDays = parseInt(args[++i], 10);
  }

  main(options).catch((err) => {
    console.error('[scrape:detail] FATAL:', err);
    process.exit(1);
  });
}

export { main as scrapeDetail, parseCargas, computeEstadoTemporal };
