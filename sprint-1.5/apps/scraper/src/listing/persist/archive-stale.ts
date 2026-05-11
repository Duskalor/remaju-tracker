/**
 * apps/scraper/src/listing/persist/archive-stale.ts
 *
 * Archivado de remates que dejaron de aparecer en el listado.
 *
 * ESTRATEGIA: soft delete. Marcamos `archived_at = NOW` en los remates cuyo
 * `last_seen_at` es más viejo que un umbral (default: 7 días). NO borramos
 * el registro — preservamos el histórico para que tu papá pueda consultar
 * "qué se remató el mes pasado".
 *
 * SEGURIDAD: este job solo corre SI la última corrida del listing fue
 * EXITOSA y reciente. Si el listing falló a la mitad, no archivamos nada
 * para evitar archivar por error (todos los de páginas no recorridas
 * quedarían como "no vistos").
 */

import { sql } from 'drizzle-orm';

export interface ArchiveOptions {
  /**
   * Días desde el último avistamiento para considerar que el remate desapareció.
   * Default: 7 días. Por qué 7: cubre fines de semana largos + algún día de
   * fallo del scraper. Menos días = riesgo de falsos archivados.
   */
  staleDays?: number;

  /**
   * Si false, solo retorna cuántos archivaría sin tocar la DB. Útil para
   * verificar antes de aplicar.
   */
  dryRun?: boolean;
}

export interface ArchiveResult {
  archived_count: number;
  dry_run: boolean;
  threshold_iso: string;
  archived_remates?: { id: number; remate_numero: string | null }[]; // si dryRun
}

/**
 * Verifica que la última corrida exitosa del listing fue HOY.
 * Si no lo fue, NO debemos archivar (señal de fallo previo).
 */
export async function shouldArchive(
  db: any,
  scrapingRuns: any,
): Promise<{ should: boolean; reason: string }> {
  /*
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  const lastSuccess = await db
    .select()
    .from(scrapingRuns)
    .where(
      and(
        eq(scrapingRuns.type, 'listing'),
        eq(scrapingRuns.status, 'success'),
      ),
    )
    .orderBy(desc(scrapingRuns.finished_at))
    .limit(1)
    .get();

  if (!lastSuccess) {
    return { should: false, reason: 'no hay corridas exitosas previas' };
  }

  const lastSuccessDate = lastSuccess.finished_at?.slice(0, 10);
  if (lastSuccessDate !== today) {
    return {
      should: false,
      reason: `última corrida exitosa fue ${lastSuccessDate}, no hoy (${today})`,
    };
  }

  return { should: true, reason: 'última corrida exitosa fue hoy' };
  */
  return { should: true, reason: 'placeholder, conectar con DB real' };
}

/**
 * Marca como archivados los remates no vistos en los últimos N días.
 *
 * EJECUTAR DESPUÉS DE QUE scrape:listing TERMINÓ EXITOSAMENTE.
 * Nunca durante o antes — perderías remates legítimos.
 */
export async function archiveStaleRemates(
  db: any,
  remates: any,
  scrapingRuns: any,
  options: ArchiveOptions = {},
): Promise<ArchiveResult> {
  const staleDays = options.staleDays ?? 7;
  const dryRun = options.dryRun ?? false;

  // 1. Calcular threshold
  const threshold = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000);
  const thresholdIso = threshold.toISOString();

  // 2. Verificar pre-condición: última corrida exitosa fue hoy
  const check = await shouldArchive(db, scrapingRuns);
  if (!check.should) {
    console.warn(`[archive] NO archivando — ${check.reason}`);
    return {
      archived_count: 0,
      dry_run: dryRun,
      threshold_iso: thresholdIso,
    };
  }

  // 3. Encontrar los candidatos a archivar
  /*
  const candidates = await db
    .select({ id: remates.id, remate_numero: remates.remate_numero })
    .from(remates)
    .where(
      and(
        isNull(remates.archived_at),                  // no archivados aún
        lt(remates.last_seen_at, thresholdIso),       // no vistos en N días
        // NO archivamos remates con detail_extraction_failed
        // porque podrían simplemente haber tenido problemas técnicos
        eq(remates.detail_extraction_failed, false),
      ),
    );

  if (dryRun) {
    return {
      archived_count: candidates.length,
      dry_run: true,
      threshold_iso: thresholdIso,
      archived_remates: candidates,
    };
  }

  // 4. Aplicar el archivado
  const result = await db
    .update(remates)
    .set({ archived_at: new Date().toISOString() })
    .where(
      and(
        isNull(remates.archived_at),
        lt(remates.last_seen_at, thresholdIso),
        eq(remates.detail_extraction_failed, false),
      ),
    );
  */

  return {
    archived_count: 0, // reemplazar con count real
    dry_run: dryRun,
    threshold_iso: thresholdIso,
  };
}

/**
 * Reverso del archivado: desarchiva un remate específico.
 *
 * Útil cuando un remate "vuelve" al portal (a veces el PJ reactiva listados).
 * El scrape:listing normal NO desarchiva automáticamente para evitar
 * resucitar por error remates que ya no son válidos. Si necesitás
 * desarchivar, hacelo explícito.
 */
export async function unarchiveRemate(
  db: any,
  remates: any,
  remateNumero: string,
): Promise<{ updated: boolean }> {
  /*
  const result = await db
    .update(remates)
    .set({ archived_at: null })
    .where(eq(remates.remate_numero, remateNumero));
  return { updated: result.changes > 0 };
  */
  return { updated: false };
}
