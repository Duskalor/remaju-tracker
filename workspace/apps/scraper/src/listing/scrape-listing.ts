import { eq, createSqliteClient, RemateRepository, remates, scrapingRuns } from '@remaju/database';
import { BrowserClient } from '../browser/client';
import { RemajuNavigator } from '../browser/navigator';
import { parseRematesTable } from '../parsing/card-parser';
import { rematesToDatabaseRows } from '../parsing/transforms';
import { archiveStaleRemates } from './persist/archive-stale';
import { config } from '../config';

const URL_LISTADO = 'https://remaju.pj.gob.pe/remaju/pages/publico/remateExterno.xhtml';

interface ListingResult {
  total_cards_seen: number;
  cards_parsed_ok: number;
  cards_parse_failed: number;
  upsert_ok: number;
  upsert_failed: number;
  archived: number;
  duration_seconds: number;
}

export async function scrapeListing(): Promise<ListingResult> {
  const startTime = Date.now();
  console.log('[scrape:listing] Iniciando');

  const db = createSqliteClient(config.dbPath);
  const repository = new RemateRepository(db);

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
    upsert_ok: 0,
    upsert_failed: 0,
    archived: 0,
    duration_seconds: 0,
  };

  let runStatus = 'failed';

  try {
    await client.initialize();
    const navigator = new RemajuNavigator(client);

    await navigator.navigateToRemaju(URL_LISTADO);

    let currentPage = 1;
    let hasMore = true;

    while (hasMore) {
      console.log(`[scrape:listing] Procesando página ${currentPage}`);

      const html = await navigator.getPageHtml();
      const parsed = parseRematesTable(html, URL_LISTADO);

      result.total_cards_seen += parsed.totalRows ?? 0;
      result.cards_parsed_ok += parsed.parsedRows ?? 0;
      result.cards_parse_failed += parsed.errors?.length ?? 0;

      if (parsed.data?.length) {
        const rows = rematesToDatabaseRows(parsed.data);
        const upsertResult = repository.upsertBatch(rows);
        result.upsert_ok += upsertResult.success;
        result.upsert_failed += upsertResult.failed;
        console.log(
          `[scrape:listing] Página ${currentPage}: ${parsed.parsedRows} cards → upsert ok:${upsertResult.success} fail:${upsertResult.failed}`,
        );
      } else {
        console.warn(`[scrape:listing] Página ${currentPage}: sin cards —`, parsed.errors?.[0]?.message);
      }

      const pagination = await navigator.getPaginationInfo();
      hasMore = pagination.hasNext;

      if (hasMore) {
        const ok = await navigator.navigateToPage(currentPage + 1);
        if (!ok) {
          console.warn('[scrape:listing] No se pudo navegar a la página siguiente, deteniendo');
          break;
        }
        currentPage++;
      } else {
        console.log(`[scrape:listing] No hay más páginas, total procesadas: ${currentPage}`);
      }
    }

    if (result.upsert_failed === 0) {
      runStatus = 'success';
      db.update(scrapingRuns)
        .set({
          status: 'success',
          finished_at: new Date().toISOString(),
          records_processed: result.total_cards_seen,
        })
        .where(eq(scrapingRuns.id, runId))
        .run();

      const archiveResult = archiveStaleRemates(db, remates, scrapingRuns);
      result.archived = archiveResult.archived_count;
      console.log(
        `[scrape:listing] Archive → archived:${archiveResult.archived_count} threshold:${archiveResult.threshold_iso}`,
      );
    } else {
      console.warn('[scrape:listing] Hubo errores en UPSERT, NO se archiva');
    }
  } catch (err) {
    console.error('[scrape:listing] FATAL:', err);
    throw err;
  } finally {
    await client.close();
    repository.close();
    result.duration_seconds = (Date.now() - startTime) / 1000;

    if (runId && runStatus !== 'success') {
      db.update(scrapingRuns)
        .set({
          status: runStatus,
          finished_at: new Date().toISOString(),
          records_failed: result.upsert_failed,
        })
        .where(eq(scrapingRuns.id, runId))
        .run();
    }

    console.log('[scrape:listing] Resultado:', result);
  }

  return result;
}
