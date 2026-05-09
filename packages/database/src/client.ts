import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import Database, { type Database as SqliteDb } from 'better-sqlite3';
import { resolve, dirname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import * as schema from './schema';

/**
 * DbClient type includes the $client property from the drizzle() return type.
 * This is an intersection — BetterSQLite3Database for queries + $client for raw access.
 */
export type DbClient = BetterSQLite3Database<typeof schema> & { $client: SqliteDb };

/**
 * Default database file path relative to project root.
 * Override via DATABASE_URL env var.
 */
export const DEFAULT_DB_PATH = './data/remates.db';

/**
 * Create a SQLite Drizzle client.
 *
 * Usage:
 *   const db = createSqliteClient('./data/remates.db');
 *   const results = await db.select().from(schema.remates);
 */
export function createSqliteClient(dbPath: string = DEFAULT_DB_PATH): DbClient {
  const resolvedPath = resolve(process.cwd(), dbPath);
  const dir = dirname(resolvedPath);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const sqliteDb = new Database(resolvedPath);
  sqliteDb.pragma('journal_mode = WAL');
  sqliteDb.pragma('foreign_keys = ON');

  const db = drizzle(sqliteDb, { schema });

  // Auto-apply pending migrations on first connection
  migrate(db, { migrationsFolder: join(__dirname, '..', 'drizzle') });

  return db;
}

/**
 * Create a PostgreSQL Drizzle client.
 *
 * ⚠️  Ready for when you migrate to PG:
 *   1. npm install pg drizzle-orm/node-postgres
 *   2. Uncomment and use this function
 *   3. Keep the same schema queries — they DON'T change
 *
 * Usage:
 *   const db = createPgClient(process.env.DATABASE_URL!);
 *   const results = await db.select().from(schema.remates);
 */
// import { drizzle as drizzlePg, type PgDatabase } from 'drizzle-orm/node-postgres';
// import { Pool } from 'pg';
//
// export function createPgClient(databaseUrl: string): PgDatabase<typeof schema> {
//   const pool = new Pool({ connectionString: databaseUrl });
//   return drizzlePg(pool, { schema });
// }

export { schema };
