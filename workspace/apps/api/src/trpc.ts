import { initTRPC } from '@trpc/server';
import { createSqliteClient, RemateRepository } from '@remaju/database';

export function createContext() {
  const dbPath = process.env.DATABASE_PATH || './data/remates.db';
  const db = createSqliteClient(dbPath);
  const repo = new RemateRepository(db);
  return { repo };
}

export type Context = ReturnType<typeof createContext>;

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
