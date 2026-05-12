import { and, eq, sql, type SQL } from 'drizzle-orm';
import type { DbClient } from './client';
import { remates, type Remate, type NewRemate } from './schema';

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

export class RemateRepository {
  constructor(private db: DbClient) {}

  upsertBatch(rows: NewRemate[]): BatchResult {
    const result: BatchResult = { success: 0, failed: 0 };

    for (const row of rows) {
      try {
        this.db
          .insert(remates)
          .values(row)
          .onConflictDoUpdate({
            target: remates.expediente,
            set: {
              remate_numero: row.remate_numero,
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
      } catch (error) {
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
    const row = this.db
      .select()
      .from(remates)
      .where(eq(remates.expediente, expediente))
      .get();

    return row ?? undefined;
  }

  countAll(): number {
    const row = this.db
      .select({ count: sql<number>`count(*)` })
      .from(remates)
      .get();

    return row?.count ?? 0;
  }

  close(): void {
    this.db.$client.close();
  }
}
