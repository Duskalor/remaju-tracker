import { and, eq, isNull, lt, or, sql, type SQL } from 'drizzle-orm';
import type { DbClient } from './client';
import {
  remates,
  remateInmuebles,
  remateCronograma,
  scrapingRuns,
  type Remate,
  type NewRemate,
} from './schema';

// ---------------------------------------------------------------------------
// Listing options / results
// ---------------------------------------------------------------------------

export interface FindAllOptions {
  page?: number;
  limit?: number;
  estado?: string;
  distrito?: string;
  tipoRemate?: string;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface BatchResult {
  success: number;
  failed: number;
}

// ---------------------------------------------------------------------------
// Detail scraping options / payload
// ---------------------------------------------------------------------------

export interface PendingDetailOptions {
  limit?: number;
  remate?: string;
  force?: boolean;
  refreshDays?: number;
}

export interface DetailTabRemate {
  expediente?: string | null;
  juzgado_completo?: string | null;
  juez?: string | null;
  especialista?: string | null;
  materia?: string | null;
  convocatoria?: string | null;
  tasacion?: number | null;
  precio_base?: number | null;
  incremento_oferta?: number | null;
  arancel?: number | null;
  oblaje?: number | null;
  num_inscritos?: number | null;
  descripcion_detalle?: string | null;
  resolucion_numero?: string | null;
  resolucion_fecha?: string | null;
  resolucion_pdf_url?: string | null;
}

export interface DetailInmueble {
  partida_registral?: string | null;
  tipo_inmueble?: string | null;
  direccion_completa?: string | null;
  departamento?: string | null;
  provincia?: string | null;
  distrito?: string | null;
  carga_gravamen_raw?: string | null;
  num_cargas?: number;
  tiene_hipoteca?: boolean;
  tiene_embargo?: boolean;
  embargo_terceros?: boolean;
  porcentaje_rematar?: number | null;
  num_imagenes?: number | null;
}

export interface DetailFase {
  fase_numero: number;
  fase_nombre: string;
  fecha_inicio: string | null;
  fecha_fin: string | null;
}

export interface DetailCronograma {
  fases: DetailFase[];
  fecha_inicio_inscripcion?: string | null;
  fecha_fin_inscripcion?: string | null;
  fecha_inicio_ofertas?: string | null;
  fecha_fin_ofertas?: string | null;
}

export interface DetailPayload {
  tabRemate: DetailTabRemate;
  tabInmuebles: { inmuebles: DetailInmueble[] };
  tabCronograma: DetailCronograma;
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export class RemateRepository {
  constructor(private db: DbClient) {}

  // --- Listing ---

  upsertBatch(rows: NewRemate[]): BatchResult {
    const result: BatchResult = { success: 0, failed: 0 };

    for (const row of rows) {
      try {
        this.db
          .insert(remates)
          .values(row)
          .onConflictDoUpdate({
            target: remates.remate_numero,
            set: {
              tipo_remate: row.tipo_remate,
              fecha_remate: row.fecha_remate,
              bienes: row.bienes,
              estado: row.estado,
              juzgado: row.juzgado,
              direccion: row.direccion,
              observaciones: row.observaciones,
              raw_html: row.raw_html,
              source_url: row.source_url,
              distrito: row.distrito,
              provincia: row.provincia,
              departamento: row.departamento,
              partida: row.partida,
              area_m2: row.area_m2,
              descripcion_raw: row.descripcion_raw,
              direccion_raw: row.direccion_raw,
              precio_por_m2: row.precio_por_m2,
              tipo_inmueble: row.tipo_inmueble,
            },
          })
          .run();

        result.success++;
      } catch {
        result.failed++;
      }
    }

    return result;
  }

  findAll({
    page = 1,
    limit = 20,
    estado,
    distrito,
    tipoRemate,
  }: FindAllOptions = {}): PaginatedResult<Remate> {
    const offset = (page - 1) * limit;
    const conditions: SQL[] = [];

    if (estado) conditions.push(eq(remates.estado, estado));
    if (distrito) conditions.push(eq(remates.distrito, distrito));
    if (tipoRemate) conditions.push(eq(remates.tipo_remate, tipoRemate));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const data = this.db.select().from(remates).where(where).limit(limit).offset(offset).all();

    const countRow = this.db
      .select({ count: sql<number>`count(*)` })
      .from(remates)
      .where(where)
      .get();

    return { data, total: countRow?.count ?? 0, page, limit };
  }

  findByExpediente(expediente: string): Remate | undefined {
    return this.db.select().from(remates).where(eq(remates.expediente, expediente)).get() ?? undefined;
  }

  countAll(): number {
    return this.db.select({ count: sql<number>`count(*)` }).from(remates).get()?.count ?? 0;
  }

  // --- Detail scraping ---

  findPendingForDetail(options: PendingDetailOptions = {}): Array<{ id: number; remate_numero: string }> {
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

    const query = this.db
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

  saveDetail(remateId: number, payload: DetailPayload): void {
    const { tabRemate, tabInmuebles, tabCronograma } = payload;

    this.db.transaction((tx) => {
      tx.update(remates)
        .set({
          expediente:               tabRemate.expediente ?? undefined,
          juzgado_completo:         tabRemate.juzgado_completo ?? undefined,
          juez:                     tabRemate.juez ?? undefined,
          especialista:             tabRemate.especialista ?? undefined,
          materia:                  tabRemate.materia ?? undefined,
          convocatoria:             tabRemate.convocatoria ?? undefined,
          tasacion:                 tabRemate.tasacion ?? undefined,
          precio_base:              tabRemate.precio_base ?? undefined,
          descuento_tasacion:
            tabRemate.tasacion && tabRemate.precio_base
              ? (tabRemate.tasacion - tabRemate.precio_base) / tabRemate.tasacion
              : undefined,
          incremento_oferta:        tabRemate.incremento_oferta ?? undefined,
          arancel:                  tabRemate.arancel ?? undefined,
          oblaje:                   tabRemate.oblaje ?? undefined,
          num_inscritos:            tabRemate.num_inscritos ?? undefined,
          descripcion_detalle:      tabRemate.descripcion_detalle ?? undefined,
          resolucion_numero:        tabRemate.resolucion_numero ?? undefined,
          resolucion_fecha:         tabRemate.resolucion_fecha ?? undefined,
          resolucion_pdf_url:       tabRemate.resolucion_pdf_url ?? undefined,
          fecha_inicio_inscripcion: tabCronograma.fecha_inicio_inscripcion ?? undefined,
          fecha_fin_inscripcion:    tabCronograma.fecha_fin_inscripcion ?? undefined,
          fecha_inicio_ofertas:     tabCronograma.fecha_inicio_ofertas ?? undefined,
          fecha_fin_ofertas:        tabCronograma.fecha_fin_ofertas ?? undefined,
          detail_scraped_at:        new Date().toISOString(),
          detail_attempts:          sql`${remates.detail_attempts} + 1`,
          detail_extraction_failed: false,
          detail_last_error:        null,
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
          remate_id:   remateId,
          fase_numero: fase.fase_numero,
          fase_nombre: fase.fase_nombre,
          fecha_inicio: fase.fecha_inicio ?? '',
          fecha_fin:   fase.fecha_fin ?? '',
          scraped_at:  new Date().toISOString(),
        }).run();
      }
    });
  }

  markDetailFailed(remateId: number, error: string): void {
    this.db.update(remates)
      .set({
        detail_attempts:          sql`${remates.detail_attempts} + 1`,
        detail_last_error:        error,
        detail_extraction_failed: true,
      })
      .where(eq(remates.id, remateId))
      .run();
  }

  markNotFound(remateId: number): void {
    this.db.update(remates)
      .set({
        detail_attempts:   sql`${remates.detail_attempts} + 1`,
        detail_last_error: 'not_found_in_buscador',
        archived_at:       new Date().toISOString(),
      })
      .where(eq(remates.id, remateId))
      .run();
  }

  // --- Scraping runs ---

  startScrapingRun(type: string): number {
    return this.db.insert(scrapingRuns)
      .values({ type, started_at: new Date().toISOString(), status: 'running' })
      .returning({ id: scrapingRuns.id })
      .get()?.id ?? 0;
  }

  finishScrapingRun(id: number, stats: { processed: number; failed: number }): void {
    this.db.update(scrapingRuns)
      .set({
        status:             stats.failed === 0 ? 'success' : 'failed',
        finished_at:        new Date().toISOString(),
        records_processed:  stats.processed,
        records_failed:     stats.failed,
      })
      .where(eq(scrapingRuns.id, id))
      .run();
  }

  close(): void {
    this.db.$client.close();
  }
}
