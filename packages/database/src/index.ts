/**
 * @remaju/database — Database layer for Remaju Intelligence System.
 *
 * Exports:
 *  - createSqliteClient()   → Drizzle client for SQLite
 *  - RemateRepository       → CRUD operations for remates
 *  - schema / remates       → Drizzle schema + types
 *
 * Usage (scraper):
 *   import { createSqliteClient, RemateRepository } from '@remaju/database';
 *   const db = createSqliteClient('./data/remates.db');
 *   const repo = new RemateRepository(db);
 *   repo.upsertBatch([...]);
 *
 * Usage (future API):
 *   import { createSqliteClient, schema } from '@remaju/database';
 *   const db = createSqliteClient();
 *   const results = await db.select().from(schema.remates);
 */

export { createSqliteClient, schema, type DbClient } from './client';
export { RemateRepository, type BatchResult } from './repository';
export { remates, type Remate, type NewRemate } from './schema';
