import { sqliteTable, text, integer, real, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

/**
 * Remates table schema — SQLite dialect.
 *
 * When migrating to PostgreSQL:
 * 1. Copy this file to schema/pg/remates.ts
 * 2. Replace sqliteTable → pgTable, integer → serial (for id), real → numeric/doublePrecision
 * 3. Adjust uniqueIndex/index syntax if needed
 * 4. Update the re-export in schema/index.ts
 */
export const remates = sqliteTable(
  'remates',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),

    // Core fields
    expediente: text('expediente').notNull(),
    remateNumero: text('remate_numero'),
    tipoRemate: text('tipo_remate'),
    fechaRemate: text('fecha_remate'),
    bienes: text('bienes'),
    estado: text('estado'),
    juzgado: text('juzgado'),
    direccion: text('direccion'),
    observaciones: text('observaciones'),
    rawHtml: text('raw_html'),
    scrapedAt: text('scraped_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    sourceUrl: text('source_url').notNull(),

    // Enriched parsing fields
    distrito: text('distrito'),
    provincia: text('provincia'),
    departamento: text('departamento'),
    partida: text('partida'),
    areaM2: real('area_m2'),
    descripcionRaw: text('descripcion_raw'),
    direccionRaw: text('direccion_raw'),
    precioPorM2: real('precio_por_m2'),
    tipoInmueble: text('tipo_inmueble'),
  },
  (table) => ({
    // Unique constraints
    expedienteIdx: uniqueIndex('idx_expediente').on(table.expediente),

    // Performance indexes
    scrapedAtIdx: index('idx_scraped_at').on(table.scrapedAt),
    juzgadoIdx: index('idx_juzgado').on(table.juzgado),
    estadoIdx: index('idx_estado').on(table.estado),
    distritoIdx: index('idx_distrito').on(table.distrito),
    areaM2Idx: index('idx_area_m2').on(table.areaM2),
  }),
);

export type Remate = typeof remates.$inferSelect;
export type NewRemate = typeof remates.$inferInsert;
