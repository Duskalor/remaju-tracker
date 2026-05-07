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
