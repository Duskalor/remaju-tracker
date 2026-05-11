import { BrowserClient } from './browser/client';
import { RemajuNavigator } from './browser/navigator';
import { parseRematesTable } from './parsing/card-parser';
import { rematesToDatabaseRows } from './parsing/transforms';
import { createSqliteClient, RemateRepository } from '@remaju/database';
import { config, validateConfig } from './config';
import { logger, logScraperStats } from './logger';
import { ScraperStats } from '@remaju/shared';

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
      const db = createSqliteClient(config.dbPath);
      this.repository = new RemateRepository(db);

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
          logger.warn(`Page ${currentPage} had parse errors`, {
            count: parsed.errors?.length,
          });
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
          if (!ok) {
            logger.warn('Could not navigate to next page, stopping');
            break;
          }
          currentPage++;
        }
      } catch (error: any) {
        logger.error(`Error on page ${currentPage}`, { error: error.message });
        this.stats.errorsEncountered++;
        this.failedPages.push(currentPage);

        const pagination = await this.navigator!.getPaginationInfo().catch(
          () => ({
            hasNext: false,
            currentPage: 1,
            totalPages: 1,
            totalRows: 0,
          }),
        );
        hasMore = pagination.hasNext;
        if (hasMore) {
          currentPage++;
          await this.navigator!.navigateToPage(currentPage).catch(() => {
            hasMore = false;
          });
        } else {
          break;
        }
      }
    }

    logger.info(`Scraping done. Pages: ${this.stats.pagesScraped}`);
    if (this.failedPages.length > 0)
      logger.warn(`Failed pages: ${this.failedPages.join(', ')}`);
  }

  private finalizeStats(): void {
    this.stats.endTime = new Date().toISOString();
    this.stats.durationMs =
      new Date(this.stats.endTime).getTime() -
      new Date(this.stats.startTime).getTime();
  }

  private async cleanup(): Promise<void> {
    try {
      await this.client.close();
    } catch {}
    this.repository?.close();
  }
}
