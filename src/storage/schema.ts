import { Database as SqlJsDatabase } from 'sql.js';
import { logger } from '../logger';

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS remates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    expediente TEXT NOT NULL UNIQUE ON CONFLICT REPLACE,
    remate_numero TEXT,
    tipo_remate TEXT,
    fecha_remate TEXT,
    bienes TEXT,
    estado TEXT,
    juzgado TEXT,
    direccion TEXT,
    observaciones TEXT,
    raw_html TEXT,
    scraped_at TEXT NOT NULL DEFAULT (datetime('now')),
    source_url TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_scraped_at ON remates(scraped_at DESC);
CREATE INDEX IF NOT EXISTS idx_juzgado ON remates(juzgado);
CREATE INDEX IF NOT EXISTS idx_estado ON remates(estado);
CREATE INDEX IF NOT EXISTS idx_remate_numero ON remates(remate_numero);
`;

export function initializeSchema(db: SqlJsDatabase): void {
  const tableInfo = db.exec('PRAGMA table_info(remates)') as any[];

  if (tableInfo?.length > 0) {
    if (hasOldCompositeConstraint(db)) {
      migrateToNewSchema(db);
    } else {
      db.run(SCHEMA_SQL);
    }
  } else {
    db.run(SCHEMA_SQL);
  }

  try { db.run('ALTER TABLE remates ADD COLUMN remate_numero TEXT'); } catch { /* already exists */ }
  try { db.run('CREATE INDEX IF NOT EXISTS idx_remate_numero ON remates(remate_numero)'); } catch { /* already exists */ }

  logger.info('Schema initialized');
}

function hasOldCompositeConstraint(db: SqlJsDatabase): boolean {
  try {
    const result = db.exec('PRAGMA index_list(remates)') as any[];
    if (!result?.length) return false;
    for (const idx of result[0]?.values || []) {
      const name = idx[1];
      if (name?.includes('sqlite_autoindex')) {
        const info = db.exec(`PRAGMA index_info(${name})`) as any[];
        if (info?.[0]?.values?.length === 3) return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

function migrateToNewSchema(db: SqlJsDatabase): void {
  logger.info('Migrating schema...');

  db.run(`
    CREATE TABLE remates_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expediente TEXT NOT NULL UNIQUE ON CONFLICT REPLACE,
      remate_numero TEXT,
      tipo_remate TEXT,
      fecha_remate TEXT,
      bienes TEXT,
      estado TEXT,
      juzgado TEXT,
      direccion TEXT,
      observaciones TEXT,
      raw_html TEXT,
      scraped_at TEXT NOT NULL DEFAULT (datetime('now')),
      source_url TEXT NOT NULL
    )
  `);

  const oldInfo = db.exec('PRAGMA table_info(remates)') as any[];
  const oldCols: string[] = oldInfo[0]?.values?.map((r: any) => r[1]) || [];
  const newCols = ['id','expediente','remate_numero','tipo_remate','fecha_remate','bienes',
                   'estado','juzgado','direccion','observaciones','raw_html','scraped_at','source_url'];
  const selectParts = newCols.map(c => oldCols.includes(c) ? c : 'NULL');

  db.run(`INSERT OR REPLACE INTO remates_new (${newCols.join(',')}) SELECT ${selectParts.join(',')} FROM remates`);
  db.run('DROP TABLE remates');
  db.run('ALTER TABLE remates_new RENAME TO remates');
  db.run('CREATE INDEX IF NOT EXISTS idx_scraped_at ON remates(scraped_at DESC)');
  db.run('CREATE INDEX IF NOT EXISTS idx_juzgado ON remates(juzgado)');
  db.run('CREATE INDEX IF NOT EXISTS idx_estado ON remates(estado)');
  db.run('CREATE INDEX IF NOT EXISTS idx_remate_numero ON remates(remate_numero)');

  logger.info('Schema migration complete');
}
