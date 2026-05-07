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
