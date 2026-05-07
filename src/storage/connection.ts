import initSqlJs from 'sql.js';
import { resolve, dirname } from 'path';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { logger } from '../logger';
import { RemateRepository } from './repository';
import { initializeSchema } from './schema';

let repository: RemateRepository | null = null;
let SQL: any = null;

async function loadSqlJs(): Promise<void> {
  if (SQL) return;
  SQL = await initSqlJs();
  logger.info('sql.js initialized');
}

export async function getDatabase(dbPath?: string): Promise<RemateRepository> {
  if (repository) return repository;
  if (!dbPath) throw new Error('dbPath required on first call');

  await loadSqlJs();

  const resolvedPath = resolve(process.cwd(), dbPath);
  const dir = dirname(resolvedPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const db = existsSync(resolvedPath)
    ? new SQL.Database(new Uint8Array(readFileSync(resolvedPath)))
    : new SQL.Database();

  initializeSchema(db);
  repository = new RemateRepository(db, dbPath);
  logger.info('Database ready', { path: resolvedPath });
  return repository;
}

export function closeDatabase(): void {
  if (repository) {
    repository.close();
    repository = null;
    SQL = null;
  }
}
