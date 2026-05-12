import { sqliteTable, integer, real, text, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const remates = sqliteTable(
  'remates',
  {
    // --- Columnas originales ---
    id: integer('id').primaryKey({ autoIncrement: true }),
    expediente: text('expediente').notNull(),
    remate_numero: text('remate_numero'),
    tipo_remate: text('tipo_remate'),
    fecha_remate: text('fecha_remate'),
    bienes: text('bienes'),
    estado: text('estado'),
    juzgado: text('juzgado'),
    direccion: text('direccion'),
    observaciones: text('observaciones'),
    raw_html: text('raw_html'),
    scraped_at: text('scraped_at').notNull().default(sql`(datetime('now'))`),
    source_url: text('source_url').notNull(),
    distrito: text('distrito'),
    provincia: text('provincia'),
    departamento: text('departamento'),
    partida: text('partida'),
    area_m2: real('area_m2'),
    descripcion_raw: text('descripcion_raw'),
    direccion_raw: text('direccion_raw'),
    precio_por_m2: real('precio_por_m2'),
    tipo_inmueble: text('tipo_inmueble'),

    // --- Datos económicos del detalle ---
    tasacion: real('tasacion'),
    precio_base: real('precio_base'),
    descuento_tasacion: real('descuento_tasacion'),
    convocatoria: text('convocatoria'),
    incremento_oferta: real('incremento_oferta'),
    arancel: real('arancel'),
    oblaje: real('oblaje'),
    num_inscritos: integer('num_inscritos').default(0),

    // --- Datos legales del detalle ---
    materia: text('materia'),
    juzgado_completo: text('juzgado_completo'),
    juez: text('juez'),
    especialista: text('especialista'),
    resolucion_numero: text('resolucion_numero'),
    resolucion_fecha: text('resolucion_fecha'),
    resolucion_pdf_url: text('resolucion_pdf_url'),
    descripcion_detalle: text('descripcion_detalle'),

    // --- Datos temporales calculados desde cronograma ---
    fecha_inicio_inscripcion: text('fecha_inicio_inscripcion'),
    fecha_fin_inscripcion: text('fecha_fin_inscripcion'),
    fecha_inicio_ofertas: text('fecha_inicio_ofertas'),
    fecha_fin_ofertas: text('fecha_fin_ofertas'),
    estado_temporal: text('estado_temporal'),

    // --- Tracking del listado ---
    last_seen_at: text('last_seen_at'),
    archived_at: text('archived_at'),

    // --- Tracking del detalle ---
    detail_scraped_at: text('detail_scraped_at'),
    detail_attempts: integer('detail_attempts').default(0),
    detail_last_error: text('detail_last_error'),
    detail_extraction_failed: integer('detail_extraction_failed', { mode: 'boolean' }).default(false),

    // --- Scoring ---
    score: real('score'),
    score_breakdown: text('score_breakdown'),
    score_computed_at: text('score_computed_at'),
    score_version: text('score_version'),
  },
  (table) => ({
    expedienteIdx: uniqueIndex('idx_expediente').on(table.expediente),
    remateNumeroIdx: uniqueIndex('idx_remate_numero_unique').on(table.remate_numero),
    scrapedAtIdx: index('idx_scraped_at').on(table.scraped_at),
    juzgadoIdx: index('idx_juzgado').on(table.juzgado),
    estadoIdx: index('idx_estado').on(table.estado),
    distritoIdx: index('idx_distrito').on(table.distrito),
    areaM2Idx: index('idx_area_m2').on(table.area_m2),
    scoreIdx: index('idx_remates_score').on(table.score),
    pendingDetailIdx: index('idx_remates_pending_detail').on(table.detail_scraped_at),
    estadoTemporalIdx: index('idx_remates_estado_temporal').on(table.estado_temporal),
    archivedIdx: index('idx_remates_archived').on(table.archived_at),
  }),
);

export const remateInmuebles = sqliteTable(
  'remate_inmuebles',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    remate_id: integer('remate_id').notNull().references(() => remates.id, { onDelete: 'cascade' }),
    partida_registral: text('partida_registral'),
    tipo_inmueble: text('tipo_inmueble'),
    direccion_completa: text('direccion_completa'),
    departamento: text('departamento'),
    provincia: text('provincia'),
    distrito: text('distrito'),
    carga_gravamen_raw: text('carga_gravamen_raw'),
    num_cargas: integer('num_cargas').default(0),
    tiene_hipoteca: integer('tiene_hipoteca', { mode: 'boolean' }).default(false),
    tiene_embargo: integer('tiene_embargo', { mode: 'boolean' }).default(false),
    embargo_terceros: integer('embargo_terceros', { mode: 'boolean' }).default(false),
    porcentaje_rematar: real('porcentaje_rematar'),
    num_imagenes: integer('num_imagenes').default(0),
    scraped_at: text('scraped_at').notNull().default(sql`(datetime('now'))`),
  },
  (table) => ({
    remateIdx: index('idx_inmuebles_remate').on(table.remate_id),
    distritoIdx: index('idx_inmuebles_distrito').on(table.distrito),
    tipoIdx: index('idx_inmuebles_tipo').on(table.tipo_inmueble),
  }),
);

export const remateCronograma = sqliteTable(
  'remate_cronograma',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    remate_id: integer('remate_id').notNull().references(() => remates.id, { onDelete: 'cascade' }),
    fase_numero: integer('fase_numero').notNull(),
    fase_nombre: text('fase_nombre').notNull(),
    fecha_inicio: text('fecha_inicio').notNull(),
    fecha_fin: text('fecha_fin').notNull(),
    scraped_at: text('scraped_at').notNull().default(sql`(datetime('now'))`),
  },
  (table) => ({
    remateIdx: index('idx_cronograma_remate').on(table.remate_id),
    fechaFinIdx: index('idx_cronograma_fecha_fin').on(table.fecha_fin),
  }),
);

export const scrapingRuns = sqliteTable('scraping_runs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  type: text('type').notNull(),
  started_at: text('started_at').notNull(),
  finished_at: text('finished_at'),
  status: text('status').notNull(),
  records_processed: integer('records_processed').default(0),
  records_failed: integer('records_failed').default(0),
  error_message: text('error_message'),
});

export type Remate = typeof remates.$inferSelect;
export type NewRemate = typeof remates.$inferInsert;

export type RemateInmueble = typeof remateInmuebles.$inferSelect;
export type NewRemateInmueble = typeof remateInmuebles.$inferInsert;

export type RemateCronograma = typeof remateCronograma.$inferSelect;
export type NewRemateCronograma = typeof remateCronograma.$inferInsert;

export type ScrapingRun = typeof scrapingRuns.$inferSelect;
export type NewScrapingRun = typeof scrapingRuns.$inferInsert;
