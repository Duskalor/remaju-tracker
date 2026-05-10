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

/**
 * Repository for remates table — wraps Drizzle queries.
 *
 * Provides the same API surface as the original scraper storage
 * so the migration is minimal, but powered by Drizzle ORM underneath.
 */
export class RemateRepository {
  constructor(private db: DbClient) {}

  /**
   * Batch upsert: insert or update rows by expediente.
   * Uses Drizzle's onConflictDoUpdate for SQLite.
   */
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
              remateNumero: row.remateNumero,
              tipoRemate: row.tipoRemate,
              fechaRemate: row.fechaRemate,
              bienes: row.bienes,
              estado: row.estado,
              juzgado: row.juzgado,
              direccion: row.direccion,
              observaciones: row.observaciones,
              rawHtml: row.rawHtml,
              sourceUrl: row.sourceUrl,
              distrito: row.distrito,
              provincia: row.provincia,
              departamento: row.departamento,
              partida: row.partida,
              areaM2: row.areaM2,
              descripcionRaw: row.descripcionRaw,
              direccionRaw: row.direccionRaw,
              precioPorM2: row.precioPorM2,
              tipoInmueble: row.tipoInmueble,
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
    if (tipoRemate) conditions.push(eq(remates.tipoRemate, tipoRemate));

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

  /**
   * Count all remates in the database.
   */
  countAll(): number {
    const row = this.db
      .select({ count: sql<number>`count(*)` })
      .from(remates)
      .get();

    return row?.count ?? 0;
  }

  /**
   * Close the underlying SQLite connection.
   */
  close(): void {
    this.db.$client.close();
  }
}
