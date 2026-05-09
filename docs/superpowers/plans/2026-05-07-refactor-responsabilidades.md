# Refactor por Responsabilidades — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganizar el codebase en carpetas `browser/`, `parsing/`, `storage/` — cada archivo con una sola responsabilidad, eliminar código muerto y bugs conocidos. Sin cambios funcionales.

**Architecture:** Tres carpetas de dominio bajo `src/`. El `scraper.ts` queda como orchestrator limpio. `main.ts` es el nuevo entry point. Toda la lógica de paginación vive en `parsing/pagination.ts` solamente.

**Tech Stack:** TypeScript, Playwright, Cheerio, sql.js, Winston

---

## Mapa de archivos

| Acción | Archivo |
|---|---|
| Crear | `src/browser/behavior.ts` |
| Crear | `src/browser/client.ts` |
| Crear | `src/browser/navigator.ts` |
| Crear | `src/parsing/pagination.ts` |
| Crear | `src/parsing/transforms.ts` |
| Crear | `src/parsing/card-parser.ts` |
| Crear | `src/storage/schema.ts` |
| Crear | `src/storage/repository.ts` |
| Crear | `src/storage/connection.ts` |
| Reescribir | `src/scraper.ts` |
| Crear | `src/main.ts` |
| Modificar | `package.json` |
| Eliminar | `src/playwright-driver.ts` |
| Eliminar | `src/parsers.ts` |
| Eliminar | `src/db.ts` |
| Eliminar | `src/behavior.ts` |
| Eliminar | `src/test-e2e.ts` |
| Eliminar | `src/inspect-card.ts` |

---

## Task 1: Crear estructura de carpetas

**Files:**
- Create dirs: `src/browser/`, `src/parsing/`, `src/storage/`

- [ ] **Crear las carpetas**

```bash
mkdir src/browser src/parsing src/storage
```

- [ ] **Verificar que existe la carpeta `logs/` para screenshots**

```bash
mkdir -p logs
```

- [ ] **Commit**

```bash
git add -A
git commit -m "chore: scaffold browser, parsing, storage directories"
```

---

## Task 2: `src/browser/behavior.ts`

**Files:**
- Create: `src/browser/behavior.ts`
- (Reemplaza `src/behavior.ts` — fix: import `logger` al inicio)

- [ ] **Crear el archivo**

```typescript
import { Page } from 'playwright';
import { logger } from '../logger';

export async function simulateMouseMovement(page: Page, selector?: string): Promise<void> {
  if (selector) {
    const element = await page.$(selector);
    if (element) {
      const box = await element.boundingBox();
      if (box) {
        await page.mouse.move(
          box.x + box.width / 2 + (Math.random() - 0.5) * 10,
          box.y + box.height / 2 + (Math.random() - 0.5) * 10,
          { steps: 5 + Math.floor(Math.random() * 10) }
        );
        return;
      }
    }
  }
  await page.mouse.move(
    Math.random() * 800 + 100,
    Math.random() * 600 + 100,
    { steps: 5 + Math.floor(Math.random() * 10) }
  );
}

export async function simulateScroll(page: Page): Promise<void> {
  const scrollAmount = Math.floor(Math.random() * 500) + 100;
  await page.evaluate((amount) => {
    window.scrollBy({ top: amount, behavior: 'smooth' });
  }, scrollAmount);
  await page.waitForTimeout(300 + Math.random() * 500);
  logger.info(`[BEHAVIOR] Scroll: ${scrollAmount}px`);
}

export function getRandomDelay(min: number = 2000, max: number = 7000): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
```

- [ ] **Verificar tipo**

```bash
pnpm type-check
```

Expected: 0 errores (el archivo nuevo no se importa aún en nada).

- [ ] **Commit**

```bash
git add src/browser/behavior.ts
git commit -m "feat: add browser/behavior.ts with fixed logger import order"
```

---

## Task 3: `src/browser/client.ts`

**Files:**
- Create: `src/browser/client.ts`

- [ ] **Crear el archivo**

```typescript
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { logger } from '../logger';
import { config } from '../config';

export class BrowserClient {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  async initialize(): Promise<Page> {
    this.browser = await chromium.launch({
      headless: config.headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    this.context = await this.browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
    });

    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(config.timeout);

    await this.applyStealth();
    logger.info('Browser initialized');
    return this.page;
  }

  private async applyStealth(): Promise<void> {
    if (!this.page) return;
    await this.page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'plugins', {
        get: () => [
          { name: 'Chrome PDF Plugin', description: 'Portable Document Format', filename: 'internal-pdf-viewer', length: 1 },
          { name: 'Chrome PDF Viewer', description: '', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', length: 1 },
        ],
      });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    });
  }

  getPage(): Page {
    if (!this.page) throw new Error('Browser not initialized. Call initialize() first.');
    return this.page;
  }

  async close(): Promise<void> {
    try {
      if (this.page) { await this.page.close(); this.page = null; }
      if (this.context) { await this.context.close(); this.context = null; }
      if (this.browser) { await this.browser.close(); this.browser = null; }
      logger.info('Browser closed');
    } catch (error: any) {
      logger.warn('Error closing browser', { error: error.message });
    }
  }
}
```

- [ ] **Verificar tipo**

```bash
pnpm type-check
```

Expected: 0 errores.

- [ ] **Commit**

```bash
git add src/browser/client.ts
git commit -m "feat: add browser/client.ts - Playwright init and close"
```

---

## Task 4: `src/parsing/pagination.ts`

**Files:**
- Create: `src/parsing/pagination.ts`
- (Única fuente de verdad para lógica de paginación — reemplaza duplicado en parsers.ts y playwright-driver.ts)

- [ ] **Crear el archivo**

```typescript
import * as cheerio from 'cheerio';
import { PaginationInfo } from '../types/remate';
import { logger } from '../logger';

const ROWS_PER_PAGE = 12;

export function extractPaginationInfo(html: string): PaginationInfo {
  const $ = cheerio.load(html);
  const paginator = $('.ui-paginator');

  if (paginator.length === 0) {
    return {
      currentPage: 1,
      totalPages: 1,
      totalRows: $('.ui-datagrid-column .card, .card').length,
      hasNext: false,
    };
  }

  let currentPage = 1;
  const activePage = paginator.find('.ui-paginator-page.ui-state-active, .ui-state-active[role="link"]');
  if (activePage.length > 0) {
    const match = (activePage.attr('aria-label') || activePage.text()).match(/(\d+)/);
    if (match) currentPage = parseInt(match[1], 10);
  }

  let totalPages = 1;
  let totalRows = 0;
  const paginatorText = paginator.text();

  const totalMatch = paginatorText.match(/Total:\s*(\d+)\s*registro/i);
  if (totalMatch) {
    totalRows = parseInt(totalMatch[1], 10);
    totalPages = Math.ceil(totalRows / ROWS_PER_PAGE);
  } else {
    const paginaMatch = paginatorText.match(/Página\s+(\d+)\s+de\s+(\d+)/i);
    if (paginaMatch) {
      totalPages = parseInt(paginaMatch[2], 10) || 1;
    } else {
      const pagesMatch = paginatorText.match(/Page\s+\d+\s+of\s+(\d+)/i);
      if (pagesMatch) {
        totalPages = parseInt(pagesMatch[1], 10);
      } else {
        const pageButtons = paginator.find('.ui-paginator-page, a[role="link"][aria-label*="Page"]');
        totalPages = pageButtons.length || 1;
        const lastBtn = paginator.find('.ui-paginator-last');
        if (lastBtn.length > 0 && totalPages === 1) {
          const lastPageData = lastBtn.attr('data-page');
          if (lastPageData) totalPages = parseInt(lastPageData, 10) + 1;
        }
      }
    }
  }

  if (totalRows === 0) {
    const statusBar = paginator.find('.ui-paginator-current');
    if (statusBar.length > 0) {
      const match = statusBar.text().match(/(\d+)$/);
      if (match) totalRows = parseInt(match[1], 10);
    }
  }

  const nextButton = paginator.find('.ui-paginator-next:not(.ui-state-disabled)');
  const hasNext = nextButton.length > 0 && currentPage < totalPages;

  return { currentPage, totalPages, totalRows, hasNext };
}
```

- [ ] **Verificar tipo**

```bash
pnpm type-check
```

Expected: 0 errores.

- [ ] **Commit**

```bash
git add src/parsing/pagination.ts
git commit -m "feat: add parsing/pagination.ts - single source of truth for paginator"
```

---

## Task 5: `src/parsing/transforms.ts`

**Files:**
- Create: `src/parsing/transforms.ts`

- [ ] **Crear el archivo**

```typescript
import { Remate, DatabaseRow } from '../types/remate';

export function remateToDatabaseRow(remate: Remate): DatabaseRow {
  return {
    expediente: remate.expediente || 'unknown',
    remate_numero: remate.remate_numero,
    tipo_remate: remate.tipo_remate,
    fecha_remate: remate.fecha_remate || '',
    bienes: remate.bienes || '',
    estado: remate.estado,
    juzgado: remate.juzgado,
    direccion: remate.ubicacion,
    observaciones: remate.observaciones || '',
    raw_html: undefined,
    scraped_at: remate.scrapedAt || new Date().toISOString(),
    source_url: remate.sourceUrl || '',
  };
}

export function rematesToDatabaseRows(remates: Remate[]): DatabaseRow[] {
  return remates.map(remateToDatabaseRow);
}
```

- [ ] **Verificar tipo**

```bash
pnpm type-check
```

Expected: 0 errores.

- [ ] **Commit**

```bash
git add src/parsing/transforms.ts
git commit -m "feat: add parsing/transforms.ts - Remate to DatabaseRow conversion"
```

---

## Task 6: `src/parsing/card-parser.ts`

**Files:**
- Create: `src/parsing/card-parser.ts`
- (Versión limpia de parsers.ts: sin extractFieldByLabel, findTextByPattern, validateRemate, extractPaginationInfo)

- [ ] **Crear el archivo**

```typescript
import * as cheerio from 'cheerio';
import { Remate, ParseResult, ParseError } from '../types/remate';
import { logger } from '../logger';

export function parseRematesTable(html: string, sourceUrl: string): ParseResult {
  const errors: ParseError[] = [];
  const remates: Remate[] = [];

  try {
    const $ = cheerio.load(html);
    const allCards = $('.ui-datagrid-column .card, .ui-datagrid .card, .card');

    if (allCards.length === 0) {
      return {
        success: false,
        data: [],
        errors: [{ rowIndex: -1, message: 'No cards found in HTML' }],
        totalRows: 0,
        parsedRows: 0,
      };
    }

    const cards = allCards.filter((_, element) => {
      const $card = $(element);
      const classAttr = $card.attr('class') || '';
      const text = $card.text().toLowerCase();
      return !classAttr.includes('rojo') && !text.includes('filtro') && text.includes('remate n°');
    });

    const totalRows = cards.length;

    if (totalRows === 0) {
      return {
        success: false,
        data: [],
        errors: [{ rowIndex: -1, message: 'No valid remate cards after filtering' }],
        totalRows: 0,
        parsedRows: 0,
      };
    }

    cards.each((index, element) => {
      try {
        const remate = parseCard($(element), $);
        if (remate?.expediente) {
          remate.sourceUrl = sourceUrl;
          remate.scrapedAt = new Date().toISOString();
          remates.push(remate);
        } else {
          errors.push({
            rowIndex: index,
            message: 'Card missing required field: expediente',
            rawHtml: $.html($(element)),
          });
        }
      } catch (error: any) {
        errors.push({ rowIndex: index, message: `Failed to parse card: ${error.message}` });
        logger.warn('Failed to parse card', { cardIndex: index, error: error.message });
      }
    });

    return {
      success: errors.length === 0,
      data: remates,
      errors: errors.length > 0 ? errors : undefined,
      totalRows,
      parsedRows: remates.length,
    };
  } catch (error: any) {
    logger.error('Failed to parse HTML', { error: error.message });
    return {
      success: false,
      data: [],
      errors: [{ rowIndex: -1, message: `HTML parsing failed: ${error.message}` }],
      totalRows: 0,
      parsedRows: 0,
    };
  }
}

function getTextAfterIcon($card: any, $: cheerio.CheerioAPI, iconClass: string): string {
  const icon = $card.find(`i.${iconClass}`).first();
  if (icon.length === 0) return '';

  const parent = icon.parent();
  const html = parent.html() || '';
  const iconHtml = $.html(icon);
  const iconIndex = html.indexOf(iconHtml);
  if (iconIndex === -1) return '';

  const afterIcon = html.substring(iconIndex + iconHtml.length);
  const nextIconMatch = afterIcon.match(/<i[^>]*>/);
  const textHtml = nextIconMatch ? afterIcon.substring(0, nextIconMatch.index) : afterIcon;
  return $('<div>').html(textHtml).text().trim();
}

function parseCard($card: any, $: cheerio.CheerioAPI): Remate {
  const remate: Remate = {};

  try {
    const titleElem = $card.find('span.text-bold.label-danger.h6');
    const titleText = titleElem.text().trim();
    const remateMatch = titleText.match(/Remate N°\s*(\d+)/);
    const remateNum = remateMatch ? remateMatch[1] : '';

    if (remateNum) {
      remate.remate_numero = remateNum;
      remate.expediente = remateNum;
    }

    remate.descripcion = titleText;

    const tipoRemate = getTextAfterIcon($card, $, 'fa-gavel');
    if (tipoRemate) remate.tipo_remate = tipoRemate;

    const ubicacion = getTextAfterIcon($card, $, 'fa-map-marker');
    if (ubicacion) remate.ubicacion = ubicacion;

    const fechaText = getTextAfterIcon($card, $, 'fa-calendar-check-o');
    if (fechaText) remate.fechaPresentacion = fechaText;

    const horaText = getTextAfterIcon($card, $, 'fa-clock-o');
    if (remate.fechaPresentacion && horaText) {
      const parsedDate = parseDate(remate.fechaPresentacion);
      if (parsedDate) remate.fechaPresentacion = `${parsedDate}T${horaText}`;
    }

    const statusElem = $card.find('span.text-bold.titulo').first();
    if (statusElem.length > 0) remate.estado = statusElem.text().trim();

    const tituloElems = $card.find('span.text-bold.titulo');
    if (tituloElems.length > 1) {
      const faseText = tituloElems.last().text().trim();
      if (faseText !== remate.estado) remate.fase = faseText;
    }

    const descElem = $card.find('div.texto-info-scroll label');
    if (descElem.length > 0) remate.bienes = descElem.text().trim();

    const priceDiv = $card.find('div.border-top-buttons');
    if (priceDiv.length > 0) {
      const priceText = priceDiv.find('span.h4').text().trim().replace(/\s+/g, ' ');
      const priceMatch = priceText.match(/([\d,\.]+)/);
      if (priceMatch) {
        const price = parseFloat(priceMatch[1].replace(/,/g, ''));
        if (!isNaN(price)) {
          remate.precioBase = price;
          remate.moneda = 'PEN';
        }
      }
    }

    return remate;
  } catch (error: any) {
    logger.warn('Error parsing card', { error: error.message });
    return remate;
  }
}

function parseDate(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const match = dateStr.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (match) {
      const [, day, month, year] = match;
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) return date.toISOString().split('T')[0];
    return dateStr;
  } catch {
    return dateStr;
  }
}
```

- [ ] **Verificar tipo**

```bash
pnpm type-check
```

Expected: 0 errores.

- [ ] **Commit**

```bash
git add src/parsing/card-parser.ts
git commit -m "feat: add parsing/card-parser.ts - clean HTML card parsing, dead code removed"
```

---

## Task 7: `src/browser/navigator.ts`

**Files:**
- Create: `src/browser/navigator.ts`
- Depende de: `browser/client.ts`, `browser/behavior.ts`, `parsing/pagination.ts`

- [ ] **Crear el archivo**

```typescript
import { Page } from 'playwright';
import { PaginationInfo } from '../types/remate';
import { logger } from '../logger';
import { config } from '../config';
import { extractPaginationInfo } from '../parsing/pagination';
import { simulateMouseMovement, simulateScroll, getRandomDelay } from './behavior';
import { BrowserClient } from './client';

export class RemajuNavigator {
  private page: Page;

  constructor(client: BrowserClient) {
    this.page = client.getPage();
  }

  async navigateToRemaju(url?: string): Promise<void> {
    const targetUrl = url || config.remajuUrl;

    const response = await this.page.goto(targetUrl, {
      waitUntil: 'domcontentloaded',
      timeout: config.timeout,
    });

    if (!response?.ok()) {
      throw new Error(`Failed to load page: ${response?.status()}`);
    }

    await this.page.waitForLoadState('domcontentloaded');

    const aplicarButton = this.page.getByRole('button', { name: 'APLICAR' });
    if (await aplicarButton.isVisible().catch(() => false)) {
      await aplicarButton.click();
      await this.page
        .waitForResponse(
          (resp) => resp.url().includes('javax.faces') || resp.request().method() === 'POST'
        )
        .catch(() => {});
      await this.page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      await this.page.waitForTimeout(2000);
    } else {
      logger.warn('APLICAR button not found - page might already have results');
    }

    await this.waitForTable();

    const rowsSelector = this.page.getByLabel('Rows Per Page');
    if (await rowsSelector.isVisible().catch(() => false)) {
      await rowsSelector.selectOption('12');
      await this.page
        .waitForResponse(
          (resp) => resp.url().includes('javax.faces') || resp.request().method() === 'POST'
        )
        .catch(() => {});
      await this.page.waitForTimeout(2000);
    }

    await simulateScroll(this.page);
    logger.info('Navigated to REMAJU');
  }

  async waitForTable(): Promise<void> {
    const selectors = [
      '.ui-datagrid',
      '#formBuscarRemateExterno\\:listaRemate',
      '.ui-datagrid-column .card',
      '.ui-datagrid .ui-datagrid-column',
    ];

    let found = false;
    for (const selector of selectors) {
      try {
        await this.page.waitForSelector(selector, { timeout: config.timeout });
        found = true;
        break;
      } catch {
        // try next
      }
    }

    if (!found) {
      await this.takeDebugScreenshot('datagrid-not-found');
      throw new Error('Remates datagrid not found on page');
    }

    await this.page
      .waitForSelector('.ui-datagrid-column .card', { timeout: 10000 })
      .catch(() => logger.warn('No cards found inside datagrid'));
  }

  async navigateToPage(targetPage: number): Promise<boolean> {
    const paginatorReady = await this.page
      .waitForSelector('.ui-paginator', { timeout: 5000 })
      .then(() => true)
      .catch(() => false);

    if (!paginatorReady) return false;

    const pageLink = this.page.getByRole('link', { name: `Page ${targetPage}` });

    if (await pageLink.count() === 0) {
      const pageButton = this.page
        .locator('.ui-paginator-page')
        .filter({ hasText: `${targetPage}` });
      if (await pageButton.count() === 0) return false;

      await simulateMouseMovement(this.page, `.ui-paginator-page:has-text("${targetPage}")`);
      await pageButton.first().click();
    } else {
      await simulateMouseMovement(this.page, `role=link[name="Page ${targetPage}"]`);
      await this.page.waitForTimeout(getRandomDelay(2000, 5000));
      await pageLink.click();
    }

    await this.page
      .waitForResponse(
        (resp) =>
          resp.url().includes('javax.faces') ||
          resp.url().includes('primefaces') ||
          resp.request().method() === 'POST',
        { timeout: 10000 }
      )
      .catch(() => {});

    await this.page.waitForLoadState('networkidle', { timeout: 10000 });
    await this.page
      .waitForSelector('.ui-datagrid-column .card', { timeout: 10000 })
      .catch(() => {});
    await this.page.waitForTimeout(getRandomDelay(2000, 7000));

    logger.info(`Navigated to page ${targetPage}`);
    return true;
  }

  async getPageHtml(): Promise<string> {
    return this.page.content();
  }

  async getPaginationInfo(): Promise<PaginationInfo> {
    const html = await this.getPageHtml();
    return extractPaginationInfo(html);
  }

  async takeDebugScreenshot(name: string): Promise<string | null> {
    try {
      const path = `./logs/${name}-${Date.now()}.png`;
      await this.page.screenshot({ path, fullPage: true });
      logger.info(`Screenshot saved: ${path}`);
      return path;
    } catch {
      return null;
    }
  }
}
```

- [ ] **Verificar tipo**

```bash
pnpm type-check
```

Expected: 0 errores.

- [ ] **Commit**

```bash
git add src/browser/navigator.ts
git commit -m "feat: add browser/navigator.ts - REMAJU navigation using pagination.ts"
```

---

## Task 8: `src/storage/schema.ts`

**Files:**
- Create: `src/storage/schema.ts`

- [ ] **Crear el archivo**

```typescript
import { Database as SqlJsDatabase } from 'sql.js';
import { logger } from '../logger';

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS remates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    expediente TEXT NOT NULL UNIQUE ON CONFLICT REPLACE,
    remate_numero TEXT,
    tipo_remate TEXT,
    fecha_remate TEXT,
    bienes TEXT,
    estado TEXT,
    juzgado TEXT,
    direccion TEXT,
    observaciones TEXT,
    raw_html TEXT,
    scraped_at TEXT NOT NULL DEFAULT (datetime('now')),
    source_url TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_scraped_at ON remates(scraped_at DESC);
CREATE INDEX IF NOT EXISTS idx_juzgado ON remates(juzgado);
CREATE INDEX IF NOT EXISTS idx_estado ON remates(estado);
CREATE INDEX IF NOT EXISTS idx_remate_numero ON remates(remate_numero);
`;

export function initializeSchema(db: SqlJsDatabase): void {
  const tableInfo = db.exec('PRAGMA table_info(remates)') as any[];

  if (tableInfo?.length > 0) {
    if (hasOldCompositeConstraint(db)) {
      migrateToNewSchema(db);
    } else {
      db.run(SCHEMA_SQL);
    }
  } else {
    db.run(SCHEMA_SQL);
  }

  try { db.run('ALTER TABLE remates ADD COLUMN remate_numero TEXT'); } catch { /* already exists */ }
  try { db.run('CREATE INDEX IF NOT EXISTS idx_remate_numero ON remates(remate_numero)'); } catch { /* already exists */ }

  logger.info('Schema initialized');
}

function hasOldCompositeConstraint(db: SqlJsDatabase): boolean {
  try {
    const result = db.exec('PRAGMA index_list(remates)') as any[];
    if (!result?.length) return false;
    for (const idx of result[0]?.values || []) {
      const name = idx[1];
      if (name?.includes('sqlite_autoindex')) {
        const info = db.exec(`PRAGMA index_info(${name})`) as any[];
        if (info?.[0]?.values?.length === 3) return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

function migrateToNewSchema(db: SqlJsDatabase): void {
  logger.info('Migrating schema...');

  db.run(`
    CREATE TABLE remates_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expediente TEXT NOT NULL UNIQUE ON CONFLICT REPLACE,
      remate_numero TEXT,
      tipo_remate TEXT,
      fecha_remate TEXT,
      bienes TEXT,
      estado TEXT,
      juzgado TEXT,
      direccion TEXT,
      observaciones TEXT,
      raw_html TEXT,
      scraped_at TEXT NOT NULL DEFAULT (datetime('now')),
      source_url TEXT NOT NULL
    )
  `);

  const oldInfo = db.exec('PRAGMA table_info(remates)') as any[];
  const oldCols: string[] = oldInfo[0]?.values?.map((r: any) => r[1]) || [];
  const newCols = ['id','expediente','remate_numero','tipo_remate','fecha_remate','bienes',
                   'estado','juzgado','direccion','observaciones','raw_html','scraped_at','source_url'];
  const selectParts = newCols.map(c => oldCols.includes(c) ? c : 'NULL');

  db.run(`INSERT OR REPLACE INTO remates_new (${newCols.join(',')}) SELECT ${selectParts.join(',')} FROM remates`);
  db.run('DROP TABLE remates');
  db.run('ALTER TABLE remates_new RENAME TO remates');
  db.run('CREATE INDEX IF NOT EXISTS idx_scraped_at ON remates(scraped_at DESC)');
  db.run('CREATE INDEX IF NOT EXISTS idx_juzgado ON remates(juzgado)');
  db.run('CREATE INDEX IF NOT EXISTS idx_estado ON remates(estado)');
  db.run('CREATE INDEX IF NOT EXISTS idx_remate_numero ON remates(remate_numero)');

  logger.info('Schema migration complete');
}
```

- [ ] **Verificar tipo**

```bash
pnpm type-check
```

Expected: 0 errores.

- [ ] **Commit**

```bash
git add src/storage/schema.ts
git commit -m "feat: add storage/schema.ts - SQL schema and migration logic"
```

---

## Task 9: `src/storage/repository.ts`

**Files:**
- Create: `src/storage/repository.ts`
- (Fix: usa `getAsObject()` en lugar de `get()` para queries correctas en sql.js)

- [ ] **Crear el archivo**

```typescript
import { Database as SqlJsDatabase, Statement } from 'sql.js';
import { DatabaseRow } from '../types/remate';
import { logger } from '../logger';
import { writeFileSync } from 'fs';
import { resolve } from 'path';

export interface BatchResult {
  success: number;
  failed: number;
}

interface PreparedStatements {
  insertOrReplace: Statement | null;
  selectByExpediente: Statement | null;
  countAll: Statement | null;
}

export class RemateRepository {
  private db: SqlJsDatabase;
  private dbPath: string;
  private statements: PreparedStatements = {
    insertOrReplace: null,
    selectByExpediente: null,
    countAll: null,
  };

  constructor(db: SqlJsDatabase, dbPath: string) {
    this.db = db;
    this.dbPath = resolve(process.cwd(), dbPath);
  }

  private prepareStatements(): void {
    if (this.statements.insertOrReplace) return;

    this.statements.insertOrReplace = this.db.prepare(`
      INSERT OR REPLACE INTO remates
      (expediente, remate_numero, tipo_remate, fecha_remate, bienes, estado,
       juzgado, direccion, observaciones, raw_html, scraped_at, source_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.statements.selectByExpediente = this.db.prepare(
      'SELECT * FROM remates WHERE expediente = ? LIMIT 1'
    );

    this.statements.countAll = this.db.prepare('SELECT COUNT(*) as count FROM remates');
  }

  upsertBatch(rows: DatabaseRow[]): BatchResult {
    this.prepareStatements();
    const result: BatchResult = { success: 0, failed: 0 };
    let inTransaction = false;

    try {
      this.db.run('BEGIN TRANSACTION');
      inTransaction = true;

      for (const row of rows) {
        try {
          this.statements.insertOrReplace!.run([
            row.expediente,
            row.remate_numero || null,
            row.tipo_remate || null,
            row.fecha_remate || null,
            row.bienes || null,
            row.estado || null,
            row.juzgado || null,
            row.direccion || null,
            row.observaciones || null,
            row.raw_html || null,
            row.scraped_at,
            row.source_url,
          ]);
          result.success++;
        } catch (error: any) {
          result.failed++;
          logger.warn('Failed to upsert row', { expediente: row.expediente, error: error.message });
        }
      }

      this.db.run('COMMIT');
      inTransaction = false;
      this.saveToFile();
      logger.info('Batch upsert complete', result);
    } catch (error: any) {
      if (inTransaction) this.db.run('ROLLBACK');
      logger.error('Batch transaction failed', { error: error.message });
    }

    return result;
  }

  findByExpediente(expediente: string): DatabaseRow | undefined {
    this.prepareStatements();
    const result = this.statements.selectByExpediente!.getAsObject([expediente]) as any;
    if (!result?.expediente) return undefined;
    return result as DatabaseRow;
  }

  countAll(): number {
    this.prepareStatements();
    const result = this.statements.countAll!.getAsObject() as any;
    return result?.count || 0;
  }

  private saveToFile(): void {
    try {
      const data = this.db.export();
      writeFileSync(this.dbPath, Buffer.from(data));
    } catch (error: any) {
      logger.error('Failed to save DB to file', { error: error.message });
    }
  }

  close(): void {
    this.saveToFile();
    this.db.close();
    logger.info('Database closed');
  }
}
```

- [ ] **Verificar tipo**

```bash
pnpm type-check
```

Expected: 0 errores.

- [ ] **Commit**

```bash
git add src/storage/repository.ts
git commit -m "feat: add storage/repository.ts - clean CRUD, fixed getAsObject bug"
```

---

## Task 10: `src/storage/connection.ts`

**Files:**
- Create: `src/storage/connection.ts`

- [ ] **Crear el archivo**

```typescript
import initSqlJsLib from 'sql.js';
import { resolve, dirname } from 'path';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { logger } from '../logger';
import { RemateRepository } from './repository';
import { initializeSchema } from './schema';

let repository: RemateRepository | null = null;
let SQL: any = null;

async function loadSqlJs(): Promise<void> {
  if (SQL) return;
  SQL = await initSqlJsLib();
  logger.info('sql.js initialized');
}

export async function getDatabase(dbPath?: string): Promise<RemateRepository> {
  if (repository) return repository;
  if (!dbPath) throw new Error('dbPath required on first call');

  await loadSqlJs();

  const resolvedPath = resolve(process.cwd(), dbPath);
  const dir = dirname(resolvedPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const db = existsSync(resolvedPath)
    ? new SQL.Database(new Uint8Array(readFileSync(resolvedPath)))
    : new SQL.Database();

  initializeSchema(db);
  repository = new RemateRepository(db, dbPath);
  logger.info('Database ready', { path: resolvedPath });
  return repository;
}

export function closeDatabase(): void {
  if (repository) {
    repository.close();
    repository = null;
    SQL = null;
  }
}
```

- [ ] **Verificar tipo**

```bash
pnpm type-check
```

Expected: 0 errores.

- [ ] **Commit**

```bash
git add src/storage/connection.ts
git commit -m "feat: add storage/connection.ts - database singleton"
```

---

## Task 11: Reescribir `src/scraper.ts`

**Files:**
- Modify: `src/scraper.ts` (reemplazar contenido completo)

- [ ] **Reemplazar el contenido completo del archivo**

```typescript
import { BrowserClient } from './browser/client';
import { RemajuNavigator } from './browser/navigator';
import { parseRematesTable } from './parsing/card-parser';
import { rematesToDatabaseRows } from './parsing/transforms';
import { getDatabase, closeDatabase } from './storage/connection';
import { RemateRepository } from './storage/repository';
import { config, validateConfig } from './config';
import { logger, logScraperStats } from './logger';
import { ScraperStats } from './types/remate';

export class RemajuScraper {
  private client: BrowserClient;
  private navigator: RemajuNavigator | null = null;
  private repository: RemateRepository | null = null;
  private stats: ScraperStats;
  private failedPages: number[] = [];

  constructor() {
    this.client = new BrowserClient();
    this.stats = {
      startTime: new Date().toISOString(),
      pagesScraped: 0,
      recordsExtracted: 0,
      recordsStored: 0,
      errorsEncountered: 0,
    };
  }

  async run(): Promise<ScraperStats> {
    const { valid, errors } = validateConfig();
    if (!valid) throw new Error(`Invalid config: ${errors.join(', ')}`);

    logger.info('Starting Remaju Scraper', { url: config.remajuUrl });

    try {
      await this.client.initialize();
      this.navigator = new RemajuNavigator(this.client);
      this.repository = await getDatabase(config.dbPath);

      await this.navigator.navigateToRemaju();
      await this.scrapeAllPages();
      this.finalizeStats();

      logScraperStats({
        pagesScraped: this.stats.pagesScraped,
        recordsExtracted: this.stats.recordsExtracted,
        recordsStored: this.stats.recordsStored,
        errorsEncountered: this.stats.errorsEncountered,
        durationMs: this.stats.durationMs || 0,
      });

      return this.stats;
    } finally {
      await this.cleanup();
    }
  }

  private async scrapeAllPages(): Promise<void> {
    let currentPage = 1;
    let hasMore = true;

    while (hasMore) {
      try {
        const html = await this.navigator!.getPageHtml();
        const parsed = parseRematesTable(html, config.remajuUrl);

        if (!parsed.success) {
          logger.warn(`Page ${currentPage} had parse errors`, { count: parsed.errors?.length });
          this.stats.errorsEncountered += parsed.errors?.length || 0;
        }

        if (parsed.data?.length) {
          const rows = rematesToDatabaseRows(parsed.data);
          const result = this.repository!.upsertBatch(rows);
          this.stats.recordsStored += result.success;
          this.stats.errorsEncountered += result.failed;
        }

        this.stats.pagesScraped++;
        this.stats.recordsExtracted += parsed.parsedRows || 0;

        const pagination = await this.navigator!.getPaginationInfo();
        hasMore = pagination.hasNext;

        if (hasMore) {
          const ok = await this.navigator!.navigateToPage(currentPage + 1);
          if (!ok) { logger.warn('Could not navigate to next page, stopping'); break; }
          currentPage++;
        }
      } catch (error: any) {
        logger.error(`Error on page ${currentPage}`, { error: error.message });
        this.stats.errorsEncountered++;
        this.failedPages.push(currentPage);

        const pagination = await this.navigator!.getPaginationInfo().catch(() => ({ hasNext: false, currentPage: 1, totalPages: 1, totalRows: 0 }));
        hasMore = pagination.hasNext;
        if (hasMore) {
          currentPage++;
          await this.navigator!.navigateToPage(currentPage).catch(() => { hasMore = false; });
        } else {
          break;
        }
      }
    }

    logger.info(`Scraping done. Pages: ${this.stats.pagesScraped}`);
    if (this.failedPages.length > 0) logger.warn(`Failed pages: ${this.failedPages.join(', ')}`);
  }

  private finalizeStats(): void {
    this.stats.endTime = new Date().toISOString();
    this.stats.durationMs =
      new Date(this.stats.endTime).getTime() - new Date(this.stats.startTime).getTime();
  }

  private async cleanup(): Promise<void> {
    try { await this.client.close(); } catch {}
    try { closeDatabase(); } catch {}
  }
}
```

- [ ] **Verificar tipo**

```bash
pnpm type-check
```

Expected: 0 errores. Si hay errores de imports faltantes, es porque los archivos viejos (playwright-driver.ts, parsers.ts, db.ts) aún existen y crean conflictos — se borran en Task 14.

- [ ] **Commit**

```bash
git add src/scraper.ts
git commit -m "refactor: rewrite scraper.ts as lean orchestrator"
```

---

## Task 12: Crear `src/main.ts`

**Files:**
- Create: `src/main.ts`

- [ ] **Crear el archivo**

```typescript
import { RemajuScraper } from './scraper';
import { logger } from './logger';

async function main(): Promise<void> {
  const scraper = new RemajuScraper();

  process.on('SIGINT', async () => {
    logger.info('Shutting down...');
    process.exit(0);
  });

  try {
    const stats = await scraper.run();
    logger.info('Scraper completed', stats);
    process.exit(0);
  } catch (error: any) {
    logger.error('Scraper failed', { error: error.message });
    process.exit(1);
  }
}

main();
```

- [ ] **Verificar tipo**

```bash
pnpm type-check
```

Expected: 0 errores.

- [ ] **Commit**

```bash
git add src/main.ts
git commit -m "feat: add main.ts - entry point with single SIGINT handler"
```

---

## Task 13: Actualizar `package.json`

**Files:**
- Modify: `package.json`

- [ ] **Actualizar los scripts para apuntar a `main.ts`**

Cambiar `"main"`, `"start"` y `"dev"` para apuntar a `main.ts`:

```json
{
  "main": "dist/main.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/main.js",
    "dev": "ts-node src/main.ts",
    "clean": "rimraf dist",
    "type-check": "tsc --noEmit",
    "lint": "eslint src/**/*.ts"
  }
}
```

- [ ] **Verificar tipo**

```bash
pnpm type-check
```

Expected: 0 errores.

- [ ] **Commit**

```bash
git add package.json
git commit -m "chore: update package.json entry point to main.ts"
```

---

## Task 14: Eliminar archivos viejos

**Files:**
- Delete: `src/playwright-driver.ts`
- Delete: `src/parsers.ts`
- Delete: `src/db.ts`
- Delete: `src/behavior.ts` (reemplazado por `src/browser/behavior.ts`)
- Delete: `src/test-e2e.ts` (script de exploración)
- Delete: `src/inspect-card.ts` (script de exploración)

- [ ] **Eliminar los archivos**

```bash
rm src/playwright-driver.ts src/parsers.ts src/db.ts src/behavior.ts src/test-e2e.ts src/inspect-card.ts
```

- [ ] **Verificar tipo — este es el chequeo final real**

```bash
pnpm type-check
```

Expected: 0 errores. Si hay errores de imports, significa que algún archivo nuevo todavía referencia un módulo viejo — revisar y corregir el import.

- [ ] **Commit**

```bash
git add -A
git commit -m "chore: remove old files replaced by browser/, parsing/, storage/ structure"
```

---

## Task 15: Verificación final

- [ ] **Listar estructura final para confirmar**

```bash
# En PowerShell:
Get-ChildItem src -Recurse -Filter "*.ts" | Select-Object FullName
```

Expected output:
```
src\browser\behavior.ts
src\browser\client.ts
src\browser\navigator.ts
src\parsing\card-parser.ts
src\parsing\pagination.ts
src\parsing\transforms.ts
src\storage\connection.ts
src\storage\repository.ts
src\storage\schema.ts
src\types\remate.ts
src\config.ts
src\logger.ts
src\main.ts
src\scraper.ts
```

- [ ] **Type-check final limpio**

```bash
pnpm type-check
```

Expected: 0 errores, 0 warnings.

- [ ] **Commit final**

```bash
git add -A
git commit -m "refactor: complete restructure by responsibility - browser, parsing, storage"
```
