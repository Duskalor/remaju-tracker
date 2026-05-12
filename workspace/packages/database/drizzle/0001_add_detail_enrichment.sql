-- Migration 0001: detail enrichment + scoring + tracking + new tables

-- Nuevas columnas en remates (datos económicos del detalle)
ALTER TABLE remates ADD COLUMN tasacion REAL;
--> statement-breakpoint
ALTER TABLE remates ADD COLUMN precio_base REAL;
--> statement-breakpoint
ALTER TABLE remates ADD COLUMN descuento_tasacion REAL;
--> statement-breakpoint
ALTER TABLE remates ADD COLUMN convocatoria TEXT;
--> statement-breakpoint
ALTER TABLE remates ADD COLUMN incremento_oferta REAL;
--> statement-breakpoint
ALTER TABLE remates ADD COLUMN arancel REAL;
--> statement-breakpoint
ALTER TABLE remates ADD COLUMN oblaje REAL;
--> statement-breakpoint
ALTER TABLE remates ADD COLUMN num_inscritos INTEGER DEFAULT 0;
--> statement-breakpoint

-- Datos legales del detalle
ALTER TABLE remates ADD COLUMN materia TEXT;
--> statement-breakpoint
ALTER TABLE remates ADD COLUMN juzgado_completo TEXT;
--> statement-breakpoint
ALTER TABLE remates ADD COLUMN juez TEXT;
--> statement-breakpoint
ALTER TABLE remates ADD COLUMN especialista TEXT;
--> statement-breakpoint
ALTER TABLE remates ADD COLUMN resolucion_numero TEXT;
--> statement-breakpoint
ALTER TABLE remates ADD COLUMN resolucion_fecha TEXT;
--> statement-breakpoint
ALTER TABLE remates ADD COLUMN resolucion_pdf_url TEXT;
--> statement-breakpoint
ALTER TABLE remates ADD COLUMN descripcion_detalle TEXT;
--> statement-breakpoint

-- Datos temporales calculados desde cronograma
ALTER TABLE remates ADD COLUMN fecha_inicio_inscripcion TEXT;
--> statement-breakpoint
ALTER TABLE remates ADD COLUMN fecha_fin_inscripcion TEXT;
--> statement-breakpoint
ALTER TABLE remates ADD COLUMN fecha_inicio_ofertas TEXT;
--> statement-breakpoint
ALTER TABLE remates ADD COLUMN fecha_fin_ofertas TEXT;
--> statement-breakpoint
ALTER TABLE remates ADD COLUMN estado_temporal TEXT;
--> statement-breakpoint

-- Tracking del listado
ALTER TABLE remates ADD COLUMN last_seen_at TEXT;
--> statement-breakpoint
ALTER TABLE remates ADD COLUMN archived_at TEXT;
--> statement-breakpoint

-- Tracking del detalle
ALTER TABLE remates ADD COLUMN detail_scraped_at TEXT;
--> statement-breakpoint
ALTER TABLE remates ADD COLUMN detail_attempts INTEGER DEFAULT 0;
--> statement-breakpoint
ALTER TABLE remates ADD COLUMN detail_last_error TEXT;
--> statement-breakpoint
ALTER TABLE remates ADD COLUMN detail_extraction_failed INTEGER DEFAULT 0;
--> statement-breakpoint

-- Scoring
ALTER TABLE remates ADD COLUMN score REAL;
--> statement-breakpoint
ALTER TABLE remates ADD COLUMN score_breakdown TEXT;
--> statement-breakpoint
ALTER TABLE remates ADD COLUMN score_computed_at TEXT;
--> statement-breakpoint
ALTER TABLE remates ADD COLUMN score_version TEXT;
--> statement-breakpoint

-- Backfill: last_seen_at = scraped_at para los remates ya existentes
UPDATE remates SET last_seen_at = scraped_at WHERE last_seen_at IS NULL;
--> statement-breakpoint

-- Tabla remate_inmuebles (1:N)
CREATE TABLE IF NOT EXISTS `remate_inmuebles` (
  `id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `remate_id` INTEGER NOT NULL,
  `partida_registral` TEXT,
  `tipo_inmueble` TEXT,
  `direccion_completa` TEXT,
  `departamento` TEXT,
  `provincia` TEXT,
  `distrito` TEXT,
  `carga_gravamen_raw` TEXT,
  `num_cargas` INTEGER DEFAULT 0,
  `tiene_hipoteca` INTEGER DEFAULT 0,
  `tiene_embargo` INTEGER DEFAULT 0,
  `embargo_terceros` INTEGER DEFAULT 0,
  `porcentaje_rematar` REAL,
  `num_imagenes` INTEGER DEFAULT 0,
  `scraped_at` TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (`remate_id`) REFERENCES `remates`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint

-- Tabla remate_cronograma (1:N, 5 fases típicamente)
CREATE TABLE IF NOT EXISTS `remate_cronograma` (
  `id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `remate_id` INTEGER NOT NULL,
  `fase_numero` INTEGER NOT NULL,
  `fase_nombre` TEXT NOT NULL,
  `fecha_inicio` TEXT NOT NULL,
  `fecha_fin` TEXT NOT NULL,
  `scraped_at` TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (`remate_id`) REFERENCES `remates`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint

-- Tabla scraping_runs (auditoría de corridas)
CREATE TABLE IF NOT EXISTS `scraping_runs` (
  `id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `type` TEXT NOT NULL,
  `started_at` TEXT NOT NULL,
  `finished_at` TEXT,
  `status` TEXT NOT NULL,
  `records_processed` INTEGER DEFAULT 0,
  `records_failed` INTEGER DEFAULT 0,
  `error_message` TEXT
);
--> statement-breakpoint

-- Índice único en remate_numero (necesario para UPSERT del listing scraper)
CREATE UNIQUE INDEX IF NOT EXISTS `idx_remate_numero_unique` ON `remates`(`remate_numero`);
--> statement-breakpoint

-- Índices de performance para las queries más frecuentes
CREATE INDEX IF NOT EXISTS `idx_remates_score` ON `remates`(`score`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_remates_pending_detail` ON `remates`(`detail_scraped_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_remates_estado_temporal` ON `remates`(`estado_temporal`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_remates_archived` ON `remates`(`archived_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_inmuebles_remate` ON `remate_inmuebles`(`remate_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_inmuebles_distrito` ON `remate_inmuebles`(`distrito`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_inmuebles_tipo` ON `remate_inmuebles`(`tipo_inmueble`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_cronograma_remate` ON `remate_cronograma`(`remate_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_cronograma_fecha_fin` ON `remate_cronograma`(`fecha_fin`);
