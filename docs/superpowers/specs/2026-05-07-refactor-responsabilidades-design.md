# Design: Refactor por Responsabilidades — Remaju Scraper

## Objetivo

Reorganizar el codebase en carpetas por dominio para que cada archivo tenga una sola responsabilidad y sea legible en menos de un minuto. Eliminar código muerto, bugs conocidos y duplicación de lógica.

## Estructura final

```
src/
├── browser/
│   ├── client.ts       — Playwright: init, stealth, close
│   ├── navigator.ts    — Navegación REMAJU: ir a página, esperar tabla, HTML
│   └── behavior.ts     — Simulación humana: mouse, scroll, delays
│
├── parsing/
│   ├── card-parser.ts  — Parseo de cards HTML del datagrid PrimeFaces
│   ├── pagination.ts   — Extracción de info de paginador (único lugar)
│   └── transforms.ts   — Conversión Remate → DatabaseRow
│
├── storage/
│   ├── schema.ts       — SQL schema + lógica de migración
│   ├── repository.ts   — CRUD: upsertBatch, findByExpediente, countAll
│   └── connection.ts   — Singleton: getDatabase, closeDatabase
│
├── types/
│   └── remate.ts       — Interfaces TypeScript (sin cambios)
│
├── config.ts           — Variables de entorno (sin cambios)
├── logger.ts           — Winston logger (sin cambios)
├── scraper.ts          — Orchestrator: coordina browser + parsing + storage
└── main.ts             — Entry point: args, SIGINT, process.exit
```

## Módulos y contratos

### `browser/client.ts`
Responsabilidad: crear y cerrar el browser Playwright. No sabe nada del sitio.

```ts
export class BrowserClient {
  async initialize(): Promise<Page>
  async close(): Promise<void>
  getPage(): Page
}
```

### `browser/navigator.ts`
Responsabilidad: navegar el sitio REMAJU. Depende de `BrowserClient` y `parsing/pagination.ts`.

```ts
export class RemajuNavigator {
  constructor(client: BrowserClient)
  async navigateToRemaju(): Promise<void>
  async navigateToPage(n: number): Promise<boolean>
  async waitForTable(): Promise<void>
  async getPageHtml(): Promise<string>
  async getPaginationInfo(): Promise<PaginationInfo>
  async takeDebugScreenshot(name: string): Promise<string | null>
}
```

### `browser/behavior.ts`
Responsabilidad: funciones de simulación humana. Sin estado.

```ts
export async function simulateMouseMovement(page: Page, selector?: string): Promise<void>
export async function simulateScroll(page: Page): Promise<void>
export function getRandomDelay(min?: number, max?: number): number
```
Fix: mover el `import { logger }` al inicio del archivo (actualmente está en línea 62).

### `parsing/card-parser.ts`
Responsabilidad: parsear el HTML de un card REMAJU en un objeto `Remate`.

```ts
export function parseRematesTable(html: string, sourceUrl: string): ParseResult
// Funciones internas (no exportadas): parseCard, getTextAfterIcon, cleanText, parseDate
```

Eliminado: `extractFieldByLabel` y `findTextByPattern` — nunca se llaman (código muerto).

### `parsing/pagination.ts`
Responsabilidad: extraer info de paginación desde HTML. **Único lugar** donde existe esta lógica.

```ts
export function extractPaginationInfo(html: string): PaginationInfo
```

Antes existía duplicada en `parsers.ts` Y en `playwright-driver.ts` (via `page.evaluate`). Ahora `navigator.ts` la llama pasando el HTML de la página.

### `parsing/transforms.ts`
Responsabilidad: convertir tipos de dominio a tipos de persistencia.

```ts
export function remateToDatabaseRow(remate: Remate): DatabaseRow
export function rematesToDatabaseRows(remates: Remate[]): DatabaseRow[]
```

### `storage/schema.ts`
Responsabilidad: definir el schema SQL y manejar migraciones.

```ts
export const SCHEMA_SQL: string
export function initializeSchema(db: SqlJsDatabase): void
// Internos: checkForOldUniqueConstraint, migrateToNewSchema
```

### `storage/repository.ts`
Responsabilidad: CRUD sobre la tabla `remates`. No sabe de conexión ni schema.

```ts
export class RemateRepository {
  constructor(db: SqlJsDatabase)
  upsertBatch(rows: DatabaseRow[]): BatchResult
  findByExpediente(exp: string): DatabaseRow | undefined
  countAll(): number
  close(): void
}
```

Eliminado: `findByUniqueFields` (deprecated), `getAllRemates`/`getByDateRange` (bug: usaban `.get()` que retorna un solo resultado en sql.js — se eliminan hasta tener la implementación correcta).

### `storage/connection.ts`
Responsabilidad: singleton de la conexión a la base de datos.

```ts
export async function getDatabase(dbPath?: string): Promise<RemateRepository>
export function closeDatabase(): void
```

Eliminado: `saveDatabase()` — estaba rota (cerraba sin reabrir).

### `scraper.ts`
Responsabilidad: orquestar el flujo completo. No sabe de HTML, SQL ni Playwright internals.

```ts
export class RemajuScraper {
  async run(): Promise<ScraperStats>
  // Privados: initializeBrowser, initializeDatabase, scrapeAllPages, storeRemates, cleanup
}
```

Eliminado: `runSinglePageTest`, `runPaginationTest`, `closeBrowser`, `testMode` flag.

### `main.ts`
Responsabilidad: punto de entrada. Parsea args, maneja SIGINT una sola vez, llama `scraper.run()`.

```ts
async function main(): Promise<void>
```

El handler de SIGINT estaba copiado 3 veces — queda una sola vez aquí.

## Qué se elimina

| Elemento | Archivo actual | Motivo |
|---|---|---|
| `extractFieldByLabel()` | parsers.ts | Nunca se llama |
| `findTextByPattern()` | parsers.ts | Nunca se llama |
| `validateRemate()` | parsers.ts | Nadie la importa |
| `findByUniqueFields()` | db.ts | Deprecated |
| `saveDatabase()` | db.ts | Rota — cierra sin reabrir |
| `getAllRemates()` | db.ts | Bug sql.js, no retorna todos |
| `getByDateRange()` | db.ts | Bug sql.js, no retorna todos |
| `extractJsfFormData()` | playwright-driver.ts | Se llama pero nunca se usa el resultado |
| `runSinglePageTest()` | scraper.ts | Modo test — se crea aparte cuando se necesite |
| `runPaginationTest()` | scraper.ts | Modo test — idem |
| `testMode` flag | scraper.ts | Eliminado con los métodos de test |
| SIGINT handlers x3 | scraper.ts | Consolidado en main.ts |
| Import sin usar `extractPaginationInfo` | scraper.ts | Nunca se usó |

## Qué se arregla

| Bug | Archivo | Fix |
|---|---|---|
| `logger` importado al final | behavior.ts | Mover import a línea 1 |
| Paginación duplicada | parsers.ts + playwright-driver.ts | Una sola función en `parsing/pagination.ts` |
| SIGINT repetido 3 veces | scraper.ts | Una sola vez en `main.ts` |
| `getDatabase()` con doble check `dbInstance && dbInstance` | db.ts | Simplificar a `if (dbInstance)` |

## Flujo de datos (sin cambios funcionales)

```
main.ts
  → RemajuScraper.run()
      → BrowserClient.initialize()
      → getDatabase()
      → RemajuNavigator.navigateToRemaju()
      → loop:
          → navigator.getPageHtml()
          → parseRematesTable(html)     ← parsing/card-parser.ts
          → rematesToDatabaseRows()     ← parsing/transforms.ts
          → repository.upsertBatch()   ← storage/repository.ts
          → navigator.getPaginationInfo()
              → extractPaginationInfo(html)  ← parsing/pagination.ts
      → cleanup()
```

## Criterios de éxito

- Ningún archivo supera 200 líneas
- Cada archivo tiene una sola razón para cambiar
- El scraper funciona igual que antes (misma salida, misma DB)
- Cero funciones muertas o duplicadas
