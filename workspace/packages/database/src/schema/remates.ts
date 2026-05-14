import {
  sqliteTable,
  integer,
  real,
  text,
  index,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const remates = sqliteTable(
  'remates',
  {
    // --- Columnas originales ---
    id: integer().primaryKey({ autoIncrement: true }),
    expediente: text().notNull(),
    remate_numero: text(),
    tipo_remate: text(),
    fecha_remate: text(),
    bienes: text(),
    estado: text(),
    juzgado: text(),
    direccion: text(),
    observaciones: text(),
    raw_html: text(),
    scraped_at: text()
      .notNull()
      .default(sql`(datetime('now'))`),
    source_url: text().notNull(),
    distrito: text(),
    provincia: text(),
    departamento: text(),
    partida: text(),
    area_m2: real(),
    descripcion_raw: text(),
    direccion_raw: text(),
    precio_por_m2: real(),
    tipo_inmueble: text(),

    // --- Datos económicos del detalle ---
    tasacion: real(),
    precio_base: real(),
    descuento_tasacion: real(),
    convocatoria: text(),
    incremento_oferta: real(),
    arancel: real(),
    oblaje: real(),
    num_inscritos: integer().default(0),

    // --- Datos legales del detalle ---
    materia: text(),
    juzgado_completo: text(),
    juez: text(),
    especialista: text(),
    resolucion_numero: text(),
    resolucion_fecha: text(),
    resolucion_pdf_url: text(),
    descripcion_detalle: text(),

    // --- Datos temporales calculados desde cronograma ---
    fecha_inicio_inscripcion: text(),
    fecha_fin_inscripcion: text(),
    fecha_inicio_ofertas: text(),
    fecha_fin_ofertas: text(),
    estado_temporal: text(),

    // --- Tracking del listado ---
    last_seen_at: text(),
    archived_at: text(),

    // --- Tracking del detalle ---
    detail_scraped_at: text(),
    detail_attempts: integer().default(0),
    detail_last_error: text(),
    detail_extraction_failed: integer({ mode: 'boolean' }).default(false),

    // --- Scoring ---
    score: real(),
    score_breakdown: text(),
    score_computed_at: text(),
    score_version: text(),
  },
  (table) => [
    index('idx_expediente').on(table.expediente),
    uniqueIndex('idx_remate_numero_unique').on(table.remate_numero),
    index('idx_scraped_at').on(table.scraped_at),
    index('idx_juzgado').on(table.juzgado),
    index('idx_estado').on(table.estado),
    index('idx_distrito').on(table.distrito),
    index('idx_area_m2').on(table.area_m2),
    index('idx_remates_score').on(table.score),
    index('idx_remates_pending_detail').on(table.detail_scraped_at),
    index('idx_remates_estado_temporal').on(table.estado_temporal),
    index('idx_remates_archived').on(table.archived_at),
  ],
);

export const remateInmuebles = sqliteTable(
  'remate_inmuebles',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    remate_id: integer()
      .notNull()
      .references(() => remates.id, { onDelete: 'cascade' }),
    partida_registral: text(),
    tipo_inmueble: text(),
    direccion_completa: text(),
    departamento: text(),
    provincia: text(),
    distrito: text(),
    carga_gravamen_raw: text(),
    num_cargas: integer().default(0),
    tiene_hipoteca: integer({ mode: 'boolean' }).default(false),
    tiene_embargo: integer({ mode: 'boolean' }).default(false),
    embargo_terceros: integer({ mode: 'boolean' }).default(false),
    porcentaje_rematar: real(),
    num_imagenes: integer().default(0),
    scraped_at: text()
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index('idx_inmuebles_remate').on(table.remate_id),
    index('idx_inmuebles_distrito').on(table.distrito),
    index('idx_inmuebles_tipo').on(table.tipo_inmueble),
  ],
);

export const remateCronograma = sqliteTable(
  'remate_cronograma',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    remate_id: integer()
      .notNull()
      .references(() => remates.id, { onDelete: 'cascade' }),
    fase_numero: integer().notNull(),
    fase_nombre: text().notNull(),
    fecha_inicio: text().notNull(),
    fecha_fin: text().notNull(),
    scraped_at: text()
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index('idx_cronograma_remate').on(table.remate_id),
    index('idx_cronograma_fecha_fin').on(table.fecha_fin),
  ],
);

export const scrapingRuns = sqliteTable('scraping_runs', {
  id: integer().primaryKey({ autoIncrement: true }),
  type: text().notNull(),
  started_at: text().notNull(),
  finished_at: text(),
  status: text().notNull(),
  records_processed: integer().default(0),
  records_failed: integer().default(0),
  error_message: text(),
});

export type Remate = typeof remates.$inferSelect;
export type NewRemate = typeof remates.$inferInsert;

export type RemateInmueble = typeof remateInmuebles.$inferSelect;
export type NewRemateInmueble = typeof remateInmuebles.$inferInsert;

export type RemateCronograma = typeof remateCronograma.$inferSelect;
export type NewRemateCronograma = typeof remateCronograma.$inferInsert;

export type ScrapingRun = typeof scrapingRuns.$inferSelect;
export type NewScrapingRun = typeof scrapingRuns.$inferInsert;
