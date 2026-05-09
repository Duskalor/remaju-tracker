# @remaju/database

Database layer for Remaju Intelligence System — **Drizzle ORM** con SQLite para desarrollo y preparado para PostgreSQL en producción.

## Estructura

```
src/
├── schema/
│   ├── remates.ts       ← Schema Drizzle (tabla remates)
│   └── index.ts         ← Re-export + instrucciones migración a PG
├── client.ts            ← Factory: createSqliteClient()
├── repository.ts        ← RemateRepository (upsertBatch, findByExpediente, countAll)
└── index.ts             ← Public API del package
```

## Scripts

| Comando | Descripción |
|---------|-------------|
| `pnpm build` | Compilar TypeScript |
| `pnpm dev` | Compilar en modo watch |
| `pnpm clean` | Limpiar dist/ |

### Drizzle

```bash
# Push del schema a la DB (ideal para dev / prototipo)
pnpm db:push

# Generar archivos de migración SQL versionados
pnpm db:generate

# Abrir Drizzle Studio (UI web para explorar datos)
pnpm db:studio
```

### Backup automático

`db:push` y `db:generate` hacen un backup automático antes de ejecutarse.

Los backups se guardan en `data/backups/remates-{timestamp}.db`.

Si necesitás restaurar:

```bash
# Copiar manualmente un backup a data/remates.db
cp data/backups/remates-2026-05-09T16-30-00.db data/remates.db
```

> Todos los comandos se ejecutan desde la raíz del monorepo con `pnpm --filter @remaju/database <comando>`.

## Uso desde otras apps

### Scraper (insertar datos)

```ts
import { createSqliteClient, RemateRepository } from '@remaju/database';

const db = createSqliteClient('./data/remates.db');
const repo = new RemateRepository(db);

repo.upsertBatch([
  {
    expediente: '123/2024',
    sourceUrl: 'https://...',
    distrito: 'LIMA',
    areaM2: 150,
  },
]);

const total = repo.countAll();
console.log({ total });

repo.close();
```

### API futura (consultar datos)

```ts
import { createSqliteClient, schema } from '@remaju/database';

const db = createSqliteClient();

const results = await db
  .select()
  .from(schema.remates)
  .where(eq(schema.remates.distrito, 'LIMA'));

const stats = await db
  .select({
    count: count(),
    avgArea: avg(schema.remates.areaM2),
  })
  .from(schema.remates);
```

## Migrar a PostgreSQL

Cuando quieras pasar a PostgreSQL seguí estos pasos:

1. Instalar dependencias:

   ```bash
   pnpm --filter @remaju/database add pg
   pnpm --filter @remaju/database add -D @types/pg
   ```

2. Descomentar `createPgClient()` en `src/client.ts`.

3. Cambiar schema de SQLite a pg-core:

   ```ts
   // src/schema/pg/remates.ts
   import { pgTable, serial, text, numeric, timestamp } from 'drizzle-orm/pg-core';
   export const remates = pgTable('remates', { ... });
   ```

4. Actualizar `src/schema/index.ts` para que apunte al schema PG.

5. Cambiar `drizzle.config.ts`:

   ```ts
   dialect: 'postgresql',
   dbCredentials: {
     url: process.env.DATABASE_URL!,
   },
   ```

6. Setear `DATABASE_URL` en el entorno.

7. Una vez hecho esto, **el código de queries no cambia** — Drizzle abstrae la diferencia.

## Schema actual

### Tabla `remates`

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | INTEGER PK | Auto-increment |
| `expediente` | TEXT | Nº de expediente (unique) |
| `remate_numero` | TEXT | Nº de remate |
| `tipo_remate` | TEXT | Tipo de remate |
| `fecha_remate` | TEXT | Fecha del remate |
| `bienes` | TEXT | Descripción de bienes |
| `estado` | TEXT | Estado del remate |
| `juzgado` | TEXT | Juzgado interviniente |
| `direccion` | TEXT | Dirección del bien |
| `observaciones` | TEXT | Observaciones |
| `raw_html` | TEXT | HTML crudo del card |
| `scraped_at` | TEXT | Timestamp de scraping |
| `source_url` | TEXT | URL de origen |
| `distrito` | TEXT | Distrito parseado |
| `provincia` | TEXT | Provincia parseada |
| `departamento` | TEXT | Departamento parseado |
| `partida` | TEXT | Partida registral |
| `area_m2` | REAL | Área en m² |
| `descripcion_raw` | TEXT | Texto raw de bienes |
| `direccion_raw` | TEXT | Texto raw de dirección |
| `precio_por_m2` | REAL | Precio por m² calculado |
| `tipo_inmueble` | TEXT | Tipo de inmueble |

### Índices

- `idx_expediente` — **unique** sobre expediente
- `idx_scraped_at`, `idx_juzgado`, `idx_estado`, `idx_distrito`, `idx_area_m2`
