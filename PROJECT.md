# remaju-scrapper

Scraper de **REMAJU** (Registro de Bienes en Remate Judicial) del sitio `remaju.pj.gob.pe`. Extrae subastas judiciales de Peru, las almacena en SQLite y las expone vía una API tRPC + Hono. Monorepo gestionado con **Turborepo** y **pnpm workspaces**.

## Stack

| Capa | Tecnología |
|------|-----------|
| Scraping | Playwright (anti-WAF, JSF/ViewState navigation) |
| Parsing | Regex engine propio (`@remaju/regex-engine`) |
| Base de datos | SQLite + Drizzle ORM |
| API | Hono + tRPC |
| Dashboard | Next.js 14 + Tailwind + shadcn/ui |
| Build | Turborepo + pnpm |

## Estructura del monorepo

```
workspace/
├── apps/
│   ├── scraper/     — Playwright scraper principal
│   ├── api/         — Servidor Hono + tRPC
│   └── dashboard/   — Frontend Next.js
└── packages/
    ├── database/    — Schema Drizzle + repositorio SQLite
    ├── shared/      — Tipos TypeScript compartidos
    └── regex-engine/— Extractores y normalizadores de texto
```

## Base de datos — tabla `remates`

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | INTEGER PK | Auto-increment |
| `expediente` | TEXT NOT NULL | Número de expediente judicial (unique) |
| `remate_numero` | TEXT | Número de remate (ej: "23313") |
| `tipo_remate` | TEXT | Tipo de remate |
| `fecha_remate` | TEXT | Fecha del remate |
| `bienes` | TEXT | Descripción de los bienes |
| `estado` | TEXT | Estado actual del remate |
| `juzgado` | TEXT | Juzgado interviniente |
| `direccion` | TEXT | Dirección del bien |
| `observaciones` | TEXT | Observaciones adicionales |
| `raw_html` | TEXT | HTML crudo del card scrapeado |
| `scraped_at` | TEXT NOT NULL | Timestamp de extracción (default: `datetime('now')`) |
| `source_url` | TEXT NOT NULL | URL de origen |
| `distrito` | TEXT | Distrito (parsing enriquecido) |
| `provincia` | TEXT | Provincia |
| `departamento` | TEXT | Departamento |
| `partida` | TEXT | Partida registral |
| `area_m2` | REAL | Superficie en m² |
| `descripcion_raw` | TEXT | Texto crudo de bienes (para reprocesamiento) |
| `direccion_raw` | TEXT | Texto crudo de dirección |
| `precio_por_m2` | REAL | Precio por m² calculado |
| `tipo_inmueble` | TEXT | Tipo de inmueble detectado |

**Índices:** `expediente` (unique), `scraped_at`, `juzgado`, `estado`, `distrito`, `area_m2`.

## API tRPC — endpoints

| Procedimiento | Input | Descripción |
|---|---|---|
| `remates.list` | `page`, `limit`, `estado?`, `distrito?`, `tipoRemate?` | Listado paginado con filtros |
| `remates.getByExpediente` | `expediente: string` | Busca un remate por número de expediente |
| `remates.stats` | — | Retorna total de registros en DB |

## Comandos

```bash
pnpm dev          # Levanta todos los apps en paralelo
pnpm build        # Build completo del monorepo
pnpm type-check   # Type-check en todos los packages
```
