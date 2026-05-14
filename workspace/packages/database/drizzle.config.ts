import { defineConfig } from 'drizzle-kit';
import { resolve } from 'path';

// Default DB path — workspace/apps/scraper/data/remates.db
const defaultDbPath = resolve(process.cwd(), '..', '..', 'apps', 'scraper', 'data', 'remates.db');

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.DATABASE_URL || defaultDbPath,
  },
});
