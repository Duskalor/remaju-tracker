import { createSqliteClient } from '@remaju/database';
import { resolve } from 'path';

export const db = createSqliteClient(
  process.env.DATABASE_URL ?? resolve(__dirname, '../data/remates.db'),
);
