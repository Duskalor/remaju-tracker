import { Database as SqlJsDatabase, Statement } from 'sql.js';
import { DatabaseRow } from '../types/remate';
import { logger } from '../logger';
import { writeFileSync } from 'fs';
import { resolve } from 'path';

export interface BatchResult {
  success: number;
  failed: number;
}

interface PreparedStatements {
  insertOrReplace: Statement | null;
  selectByExpediente: Statement | null;
  countAll: Statement | null;
}

export class RemateRepository {
  private db: SqlJsDatabase;
  private dbPath: string;
  private statements: PreparedStatements = {
    insertOrReplace: null,
    selectByExpediente: null,
    countAll: null,
  };

  constructor(db: SqlJsDatabase, dbPath: string) {
    this.db = db;
    this.dbPath = resolve(process.cwd(), dbPath);
  }

  private prepareStatements(): void {
    if (this.statements.insertOrReplace) return;

    this.statements.insertOrReplace = this.db.prepare(`
      INSERT OR REPLACE INTO remates
      (expediente, remate_numero, tipo_remate, fecha_remate, bienes, estado,
       juzgado, direccion, observaciones, raw_html, scraped_at, source_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.statements.selectByExpediente = this.db.prepare(
      'SELECT * FROM remates WHERE expediente = ? LIMIT 1'
    );

    this.statements.countAll = this.db.prepare('SELECT COUNT(*) as count FROM remates');
  }

  upsertBatch(rows: DatabaseRow[]): BatchResult {
    this.prepareStatements();
    const result: BatchResult = { success: 0, failed: 0 };
    let inTransaction = false;

    try {
      this.db.run('BEGIN TRANSACTION');
      inTransaction = true;

      for (const row of rows) {
        try {
          this.statements.insertOrReplace!.run([
            row.expediente,
            row.remate_numero || null,
            row.tipo_remate || null,
            row.fecha_remate || null,
            row.bienes || null,
            row.estado || null,
            row.juzgado || null,
            row.direccion || null,
            row.observaciones || null,
            row.raw_html || null,
            row.scraped_at,
            row.source_url,
          ]);
          result.success++;
        } catch (error: any) {
          result.failed++;
          logger.warn('Failed to upsert row', { expediente: row.expediente, error: error.message });
        }
      }

      this.db.run('COMMIT');
      inTransaction = false;
      this.saveToFile();
      logger.info('Batch upsert complete', result);
    } catch (error: any) {
      if (inTransaction) this.db.run('ROLLBACK');
      logger.error('Batch transaction failed', { error: error.message });
    }

    return result;
  }

  findByExpediente(expediente: string): DatabaseRow | undefined {
    this.prepareStatements();
    const result = this.statements.selectByExpediente!.getAsObject([expediente]) as any;
    if (!result?.expediente) return undefined;
    return result as DatabaseRow;
  }

  countAll(): number {
    this.prepareStatements();
    const result = this.statements.countAll!.getAsObject() as any;
    return result?.count || 0;
  }

  private saveToFile(): void {
    try {
      const data = this.db.export();
      writeFileSync(this.dbPath, Buffer.from(data));
    } catch (error: any) {
      logger.error('Failed to save DB to file', { error: error.message });
    }
  }

  close(): void {
    this.saveToFile();
    this.db.close();
    logger.info('Database closed');
  }
}
