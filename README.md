# remaju-tracker

> Full-stack data pipeline that scrapes **REMAJU** (Peru's judicial auction registry), stores structured data in SQLite, and exposes it through a type-safe API and a Next.js dashboard.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Playwright](https://img.shields.io/badge/Playwright-rebrowser-2EAD33?logo=playwright&logoColor=white)](https://playwright.dev/)
[![Hono](https://img.shields.io/badge/Hono-API-E36002?logo=hono&logoColor=white)](https://hono.dev/)
[![tRPC](https://img.shields.io/badge/tRPC-v11-2596BE?logo=trpc&logoColor=white)](https://trpc.io/)
[![Next.js](https://img.shields.io/badge/Next.js-14-000000?logo=next.js&logoColor=white)](https://nextjs.org/)
[![Drizzle](https://img.shields.io/badge/Drizzle-ORM-C5F74F?logo=drizzle&logoColor=black)](https://orm.drizzle.team/)
[![Turborepo](https://img.shields.io/badge/Turborepo-monorepo-EF4444?logo=turborepo&logoColor=white)](https://turbo.build/)
[![pnpm](https://img.shields.io/badge/pnpm-workspaces-F69220?logo=pnpm&logoColor=white)](https://pnpm.io/)

---

## What it does

REMAJU is the Peruvian judiciary's public auction portal — a legacy JavaServer Faces application with server-side pagination and ViewState-based navigation. This project:

1. **Scrapes** all auction listings using Playwright with anti-WAF configuration (`rebrowser-playwright`)
2. **Parses** raw HTML cards into structured records — extracting district, surface area, property type, and registry ID via a custom regex engine
3. **Stores** records in SQLite via Drizzle ORM with upsert-on-expediente logic
4. **Serves** the data through a Hono + tRPC API with filtering and pagination
5. **Displays** it in a Next.js 14 dashboard with shadcn/ui components

---

## Architecture

```
remaju-tracker/
└── workspace/
    ├── apps/
    │   ├── scraper/      Playwright scraper — navigates JSF pagination, parses cards
    │   ├── api/          Hono server exposing tRPC procedures (port 3001)
    │   └── dashboard/    Next.js 14 app router — lists and details view
    └── packages/
        ├── database/     Drizzle schema + SQLite client + RemateRepository
        ├── shared/       TypeScript interfaces shared across apps
        └── regex-engine/ Extractors and normalizers for unstructured auction text
```

The monorepo is orchestrated with **Turborepo** — builds respect the dependency graph (`shared → database → scraper/api → dashboard`) and development runs all services in parallel.

---

## Technical highlights

- **Anti-WAF scraping** — uses `rebrowser-playwright` (a stealth fork of Playwright) with a persistent browser profile to avoid bot detection on `remaju.pj.gob.pe`
- **JSF navigation** — handles `javax.faces.ViewState` form re-submission for pagination across hundreds of pages
- **Enrichment pipeline** — a custom regex engine extracts structured data (m², property type, district, registry ID) from free-text auction descriptions
- **Type-safe end-to-end** — tRPC contracts are shared between the Hono API and the Next.js client, no REST drift
- **Upsert strategy** — scraper re-runs are idempotent; records are upserted by `expediente` (unique auction ID)
- **Monorepo with TS project references** — each package has its own `tsconfig.json` with `composite: true`; Turborepo caches build outputs per package

---

## Stack

| Layer | Technology |
|---|---|
| Scraping | Playwright via `rebrowser-playwright` |
| HTML parsing | Cheerio + custom regex engine |
| Database | SQLite + Drizzle ORM |
| API server | Hono + tRPC v11 |
| Frontend | Next.js 14 (App Router) + Tailwind CSS + shadcn/ui |
| Monorepo | Turborepo + pnpm workspaces |
| Language | TypeScript 5.3 (strict mode) |

---

## Getting started

### Prerequisites

- Node.js ≥ 18
- pnpm ≥ 10

### Install

```bash
git clone https://github.com/duskalor/remaju-tracker.git
cd remaju-tracker
pnpm install
```

### Build all packages

```bash
pnpm build
```

### Run the scraper

```bash
cd workspace/apps/scraper
cp .env.example .env   # set DB_PATH, HEADLESS, etc.
pnpm start
```

### Run the API

```bash
cd workspace/apps/api
pnpm dev
# → http://localhost:3001
```

### Run the dashboard

```bash
cd workspace/apps/dashboard
pnpm dev
# → http://localhost:3000
```

Or run everything at once from the root:

```bash
pnpm dev
```

---

## API — tRPC procedures

| Procedure | Input | Description |
|---|---|---|
| `remates.list` | `page`, `limit`, `estado?`, `distrito?`, `tipoRemate?` | Paginated list with optional filters |
| `remates.getByExpediente` | `expediente: string` | Fetch single auction by case number |
| `remates.stats` | — | Total record count |

---

## Database schema — `remates` table

| Column | Type | Description |
|---|---|---|
| `id` | INTEGER PK | Auto-increment |
| `expediente` | TEXT UNIQUE | Judicial case number — used as upsert key |
| `remate_numero` | TEXT | Auction number |
| `tipo_remate` | TEXT | Auction type |
| `fecha_remate` | TEXT | Auction date |
| `bienes` | TEXT | Raw asset description |
| `estado` | TEXT | Current status |
| `juzgado` | TEXT | Presiding court |
| `direccion` | TEXT | Asset address |
| `observaciones` | TEXT | Additional notes |
| `scraped_at` | TEXT | Extraction timestamp |
| `source_url` | TEXT | Origin URL |
| `distrito` | TEXT | District (enriched) |
| `provincia` | TEXT | Province (enriched) |
| `departamento` | TEXT | Department (enriched) |
| `partida` | TEXT | Property registry ID (enriched) |
| `area_m2` | REAL | Surface area in m² (enriched) |
| `tipo_inmueble` | TEXT | Property type — casa, terreno, oficina… (enriched) |
| `precio_por_m2` | REAL | Price per m² calculated |
| `descripcion_raw` | TEXT | Raw text kept for re-processing |
| `direccion_raw` | TEXT | Raw address text |

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `REMAJU_URL` | REMAJU public URL | Target URL to scrape |
| `DB_PATH` | `./data/remates.db` | SQLite file path |
| `HEADLESS` | `true` | Run browser headless |
| `TIMEOUT_MS` | `30000` | Per-operation timeout |
| `RETRY_MAX` | `3` | Max retries on failure |
| `PORT` | `3001` | API server port |
| `LOG_LEVEL` | `info` | error \| warn \| info \| debug |

---

## License

MIT
