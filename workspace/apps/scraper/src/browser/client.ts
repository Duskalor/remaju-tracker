import { chromium, BrowserContext, Page } from 'playwright';
import { resolve } from 'path';
import { mkdirSync, existsSync } from 'fs';
import { logger } from '../logger';
import { config } from '../config';

export class BrowserClient {
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  async initialize(): Promise<Page> {
    const userDataDir = resolve(process.cwd(), config.userDataDir);
    if (!existsSync(userDataDir)) mkdirSync(userDataDir, { recursive: true });

    this.context = await chromium.launchPersistentContext(userDataDir, {
      channel: 'chrome',
      headless: config.headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      locale: 'es-PE',
      timezoneId: 'America/Lima',
    });

    this.page = this.context.pages()[0] ?? (await this.context.newPage());
    this.page.setDefaultTimeout(config.timeout);

    await this.applyStealth();
    logger.info('Browser initialized', { userDataDir, channel: 'chrome' });
    return this.page;
  }

  private async applyStealth(): Promise<void> {
    if (!this.page) return;
    await this.page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'plugins', {
        get: () => [
          {
            name: 'Chrome PDF Plugin',
            description: 'Portable Document Format',
            filename: 'internal-pdf-viewer',
            length: 1,
          },
          {
            name: 'Chrome PDF Viewer',
            description: '',
            filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai',
            length: 1,
          },
        ],
      });
      Object.defineProperty(navigator, 'languages', {
        get: () => ['es-PE', 'es', 'en-US', 'en'],
      });
    });
  }

  getPage(): Page {
    if (!this.page)
      throw new Error('Browser not initialized. Call initialize() first.');
    return this.page;
  }

  async close(): Promise<void> {
    try {
      if (this.context) {
        await this.context.close();
        this.context = null;
        this.page = null;
      }
      logger.info('Browser closed');
    } catch (error: any) {
      logger.warn('Error closing browser', { error: error.message });
    }
  }
}
