import { and, desc, eq, isNull, lt } from '@remaju/database';

export interface ArchiveOptions {
  staleDays?: number;
  dryRun?: boolean;
}

export interface ArchiveResult {
  archived_count: number;
  dry_run: boolean;
  threshold_iso: string;
  archived_remates?: { id: number; remate_numero: string | null }[];
}

export function shouldArchive(
  db: any,
  scrapingRuns: any,
): { should: boolean; reason: string } {
  const today = new Date().toISOString().slice(0, 10);

  const lastSuccess = db
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
}

export function archiveStaleRemates(
  db: any,
  remates: any,
  scrapingRuns: any,
  options: ArchiveOptions = {},
): ArchiveResult {
  const staleDays = options.staleDays ?? 7;
  const dryRun = options.dryRun ?? false;

  const threshold = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000);
  const thresholdIso = threshold.toISOString();

  const check = shouldArchive(db, scrapingRuns);
  if (!check.should) {
    console.warn(`[archive] NO archivando — ${check.reason}`);
    return { archived_count: 0, dry_run: dryRun, threshold_iso: thresholdIso };
  }

  const candidates = db
    .select({ id: remates.id, remate_numero: remates.remate_numero })
    .from(remates)
    .where(
      and(
        isNull(remates.archived_at),
        lt(remates.last_seen_at, thresholdIso),
        eq(remates.detail_extraction_failed, false),
      ),
    )
    .all();

  if (dryRun) {
    return {
      archived_count: candidates.length,
      dry_run: true,
      threshold_iso: thresholdIso,
      archived_remates: candidates,
    };
  }

  db
    .update(remates)
    .set({ archived_at: new Date().toISOString() })
    .where(
      and(
        isNull(remates.archived_at),
        lt(remates.last_seen_at, thresholdIso),
        eq(remates.detail_extraction_failed, false),
      ),
    )
    .run();

  return {
    archived_count: candidates.length,
    dry_run: false,
    threshold_iso: thresholdIso,
  };
}

export function unarchiveRemate(
  db: any,
  remates: any,
  remateNumero: string,
): { updated: boolean } {
  const result = db
    .update(remates)
    .set({ archived_at: null })
    .where(eq(remates.remate_numero, remateNumero))
    .run();

  return { updated: result.changes > 0 };
}
