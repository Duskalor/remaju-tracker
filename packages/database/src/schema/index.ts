/**
 * Schema registry — all database tables.
 *
 * ⚠️  To switch from SQLite to PostgreSQL:
 *   1. Create src/schema/pg/remates.ts using pg-core
 *   2. Change the import below to point to the pg version
 *   3. Update drizzle.config.ts dialect to 'postgresql'
 *   4. Install pg + @types/pg, remove better-sqlite3
 *   5. Done — queries stay the same
 */
export { remates, type Remate, type NewRemate } from './remates';
