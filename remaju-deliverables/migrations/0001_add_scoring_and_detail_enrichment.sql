-- ============================================================================
-- Migration: 0001_add_scoring_and_detail_enrichment.sql
-- ----------------------------------------------------------------------------
-- Agrega:
--   1. Columnas nuevas a `remates` para datos del detalle + scoring + tracking
--   2. Tabla `remate_inmuebles` (1:N)
--   3. Tabla `remate_cronograma` (1:N)
--   4. Tabla `scraping_runs` (auditoría)
--   5. Índices nuevos
--
-- Idempotente: usa `IF NOT EXISTS` donde es posible. Para ALTER TABLE en SQLite
-- los ADD COLUMN no fallan en re-runs si el script se separa por bloque.
--
-- IMPORTANTE: hacer backup de remaju.db antes de correr esto.
-- ============================================================================

PRAGMA foreign_keys = ON;

BEGIN TRANSACTION;

-- ----------------------------------------------------------------------------
-- 1. Columnas nuevas en `remates`
-- ----------------------------------------------------------------------------

-- Datos económicos del detalle
ALTER TABLE remates ADD COLUMN tasacion REAL;
ALTER TABLE remates ADD COLUMN precio_base REAL;
ALTER TABLE remates ADD COLUMN descuento_tasacion REAL;
ALTER TABLE remates ADD COLUMN convocatoria TEXT;
ALTER TABLE remates ADD COLUMN incremento_oferta REAL;
ALTER TABLE remates ADD COLUMN arancel REAL;
ALTER TABLE remates ADD COLUMN oblaje REAL;
ALTER TABLE remates ADD COLUMN num_inscritos INTEGER DEFAULT 0;

-- Datos legales del detalle
ALTER TABLE remates ADD COLUMN materia TEXT;
ALTER TABLE remates ADD COLUMN juzgado_completo TEXT;
ALTER TABLE remates ADD COLUMN juez TEXT;
ALTER TABLE remates ADD COLUMN especialista TEXT;
ALTER TABLE remates ADD COLUMN resolucion_numero TEXT;
ALTER TABLE remates ADD COLUMN resolucion_fecha TEXT;
ALTER TABLE remates ADD COLUMN resolucion_pdf_url TEXT;
ALTER TABLE remates ADD COLUMN descripcion_detalle TEXT;

-- Datos temporales (calculados desde cronograma)
ALTER TABLE remates ADD COLUMN fecha_inicio_inscripcion TEXT;
ALTER TABLE remates ADD COLUMN fecha_fin_inscripcion TEXT;
ALTER TABLE remates ADD COLUMN fecha_inicio_ofertas TEXT;
ALTER TABLE remates ADD COLUMN fecha_fin_ofertas TEXT;
ALTER TABLE remates ADD COLUMN estado_temporal TEXT;

-- Tracking del listado
ALTER TABLE remates ADD COLUMN last_seen_at TEXT;
ALTER TABLE remates ADD COLUMN archived_at TEXT;

-- Tracking del detalle
ALTER TABLE remates ADD COLUMN detail_scraped_at TEXT;
ALTER TABLE remates ADD COLUMN detail_attempts INTEGER DEFAULT 0;
ALTER TABLE remates ADD COLUMN detail_last_error TEXT;
ALTER TABLE remates ADD COLUMN detail_extraction_failed INTEGER DEFAULT 0;

-- Scoring
ALTER TABLE remates ADD COLUMN score REAL;
ALTER TABLE remates ADD COLUMN score_breakdown TEXT;
ALTER TABLE remates ADD COLUMN score_computed_at TEXT;
ALTER TABLE remates ADD COLUMN score_version TEXT;

-- ----------------------------------------------------------------------------
-- 2. Backfill: marcar todos los remates existentes como "vistos" hoy
--    Esto evita que el primer rescore los archive todos.
-- ----------------------------------------------------------------------------

UPDATE remates 
SET last_seen_at = scraped_at 
WHERE last_seen_at IS NULL;

-- ----------------------------------------------------------------------------
-- 3. Tabla nueva: remate_inmuebles
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS remate_inmuebles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  remate_id INTEGER NOT NULL,
  
  partida_registral TEXT,
  tipo_inmueble TEXT,
  direccion_completa TEXT,
  departamento TEXT,
  provincia TEXT,
  distrito TEXT,
  
  carga_gravamen_raw TEXT,
  num_cargas INTEGER DEFAULT 0,
  tiene_hipoteca INTEGER DEFAULT 0,
  tiene_embargo INTEGER DEFAULT 0,
  embargo_terceros INTEGER DEFAULT 0,
  
  porcentaje_rematar REAL,
  num_imagenes INTEGER DEFAULT 0,
  
  scraped_at TEXT NOT NULL DEFAULT (datetime('now')),
  
  FOREIGN KEY (remate_id) REFERENCES remates(id) ON DELETE CASCADE
);

-- ----------------------------------------------------------------------------
-- 4. Tabla nueva: remate_cronograma
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS remate_cronograma (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  remate_id INTEGER NOT NULL,
  
  fase_numero INTEGER NOT NULL,
  fase_nombre TEXT NOT NULL,
  fecha_inicio TEXT NOT NULL,
  fecha_fin TEXT NOT NULL,
  
  scraped_at TEXT NOT NULL DEFAULT (datetime('now')),
  
  FOREIGN KEY (remate_id) REFERENCES remates(id) ON DELETE CASCADE
);

-- ----------------------------------------------------------------------------
-- 5. Tabla nueva: scraping_runs
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS scraping_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  records_processed INTEGER DEFAULT 0,
  records_failed INTEGER DEFAULT 0,
  error_message TEXT
);

-- ----------------------------------------------------------------------------
-- 6. Índices nuevos
-- ----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_remates_score ON remates(score);
CREATE INDEX IF NOT EXISTS idx_remates_pending_detail ON remates(detail_scraped_at);
CREATE INDEX IF NOT EXISTS idx_remates_estado_temporal ON remates(estado_temporal);
CREATE INDEX IF NOT EXISTS idx_remates_archived ON remates(archived_at);

CREATE INDEX IF NOT EXISTS idx_inmuebles_remate ON remate_inmuebles(remate_id);
CREATE INDEX IF NOT EXISTS idx_inmuebles_distrito ON remate_inmuebles(distrito);
CREATE INDEX IF NOT EXISTS idx_inmuebles_tipo ON remate_inmuebles(tipo_inmueble);

CREATE INDEX IF NOT EXISTS idx_cronograma_remate ON remate_cronograma(remate_id);
CREATE INDEX IF NOT EXISTS idx_cronograma_fecha_fin ON remate_cronograma(fecha_fin);

COMMIT;

-- ----------------------------------------------------------------------------
-- Verificación post-migration (correr manualmente):
--
-- SELECT COUNT(*) AS pendientes_detalle FROM remates WHERE detail_scraped_at IS NULL;
-- SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'remate%';
-- SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%';
-- ----------------------------------------------------------------------------
