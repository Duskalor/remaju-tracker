export { createSqliteClient, schema, type DbClient } from './client';
export {
  RemateRepository,
  type BatchResult,
  type FindAllOptions,
  type PaginatedResult,
} from './repository';
export {
  remates,
  remateInmuebles,
  remateCronograma,
  scrapingRuns,
  type Remate,
  type NewRemate,
  type RemateInmueble,
  type NewRemateInmueble,
  type RemateCronograma,
  type NewRemateCronograma,
  type ScrapingRun,
  type NewScrapingRun,
} from './schema';

// Re-export de los query builders de Drizzle — permite que los packages
// dependientes usen Drizzle sin necesitar drizzle-orm como dependencia directa.
export {
  eq,
  and,
  or,
  isNull,
  lt,
  lte,
  gt,
  gte,
  desc,
  asc,
  sql,
  not,
  inArray,
} from 'drizzle-orm';
