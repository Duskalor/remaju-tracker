/**
 * Main orchestrator for Remaju Scraper
 * Coordinates the full scraping flow: init → navigate → extract → store → cleanup
 */

import { PlaywrightDriver } from './playwright-driver';
import { parseRematesTable, rematesToDatabaseRows, extractPaginationInfo } from './parsers';
import { getDatabase, closeDatabase, RemateDatabase } from './db';
import { config, validateConfig } from './config';
import { logger, logScraperStats } from './logger';
import { ScraperStats, Remate } from './types/remate';

/**
 * Main Scraper class that orchestrates the entire scraping process
 */
export class RemajuScraper {
    private driver: PlaywrightDriver;
    private db: RemateDatabase | null = null;
    private stats: ScraperStats;
    private isRunning: boolean = false;
    private testMode: boolean = false; // Flag to track if we're in test mode
    private failedPages: number[] = []; // Track which pages failed
    
    constructor() {
        this.driver = new PlaywrightDriver();
        this.stats = {
            startTime: new Date().toISOString(),
            pagesScraped: 0,
            recordsExtracted: 0,
            recordsStored: 0,
            errorsEncountered: 0
        };
    }
    
    /**
     * Runs the complete scraping process
     */
    async run(): Promise<ScraperStats> {
        if (this.isRunning) {
            throw new Error('Scraper is already running');
        }
        
        this.isRunning = true;
        logger.info('Starting Remaju Scraper', {
            url: config.remajuUrl,
            headless: config.headless,
            timeout: config.timeout
        });
        
        try {
            // Validate configuration
            const configValidation = validateConfig();
            if (!configValidation.valid) {
                throw new Error(`Invalid configuration: ${configValidation.errors.join(', ')}`);
            }
            
            // Initialize browser
            await this.initializeBrowser();
            
            // Initialize database (async now with sql.js)
            await this.initializeDatabase();
            
            // Navigate to REMAJU
            await this.driver.navigateToRemaju();
            
            // Scrape all pages
            await this.scrapeAllPages();
            
            // Finalize stats
            this.finalizeStats();
            
            // Log final statistics
            logScraperStats({
                pagesScraped: this.stats.pagesScraped,
                recordsExtracted: this.stats.recordsExtracted,
                recordsStored: this.stats.recordsStored,
                errorsEncountered: this.stats.errorsEncountered,
                durationMs: this.stats.durationMs || 0
            });
            
            return this.stats;
            
        } catch (error: any) {
            logger.error('Scraper failed', { error: error.message, stack: error.stack });
            this.stats.errorsEncountered++;
            throw error;
        } finally {
            await this.cleanup();
            this.isRunning = false;
        }
    }

    /**
     * Runs pagination detection test, keeping browser open for inspection
     * Tests if "Total: X registros." can be detected BEFORE full scrape
     */
    async runPaginationTest(): Promise<void> {
        if (this.isRunning) {
            throw new Error('Scraper is already running');
        }

        this.isRunning = true;
        this.testMode = true; // Set test mode flag
        logger.info('[TEST] Starting PAGINATION DETECTION TEST', {
            url: config.remajuUrl,
            headless: false, // Force visible browser
            timeout: config.timeout
        });

        try {
            // Validate configuration
            const configValidation = validateConfig();
            if (!configValidation.valid) {
                throw new Error(`Invalid configuration: ${configValidation.errors.join(', ')}`);
            }

            // Initialize browser (with headless forced to false for test)
            await this.initializeBrowser();

            // Run pagination detection test
            logger.info('[TEST] Running pagination detection...');
            await this.driver.testPaginationDetection();

            logger.info('[TEST] Pagination detection test completed. Browser will remain open.');
            console.log('[TEST] Browser is open and visible. Press Ctrl+C to close.');
            console.log('[TEST] Check the screenshot at: logs/pagination-test.png');

            // Keep process alive so browser stays open
            // User can press Ctrl+C to exit
            process.on('SIGINT', async () => {
                console.log('\n[TEST] Closing browser...');
                await this.closeBrowser();
                process.exit(0);
            });

            // Prevent process from exiting
            await new Promise(() => {
                // This promise never resolves - keeps process running
                // User must press Ctrl+C
            });

        } catch (error: any) {
            logger.error('[TEST] Pagination detection test failed', { error: error.message, stack: error.stack });
            throw error;
        }
        // NOTE: No finally block with cleanup - browser stays open!
    }

    /**
     * Runs a single-page test, keeping browser open and logging results
     * Used for debugging and development
     */
    async runSinglePageTest(): Promise<{ data: any[], stats: ScraperStats }> {
        if (this.isRunning) {
            throw new Error('Scraper is already running');
        }

        this.isRunning = true;
        this.testMode = true; // Set test mode flag
        logger.info('Starting SINGLE PAGE TEST MODE', {
            url: config.remajuUrl,
            headless: false, // Force visible browser
            timeout: config.timeout
        });

        try {
            // Validate configuration
            const configValidation = validateConfig();
            if (!configValidation.valid) {
                throw new Error(`Invalid configuration: ${configValidation.errors.join(', ')}`);
            }

            // Initialize browser (with headless forced to false for test)
            await this.initializeBrowser();

            // Navigate to REMAJU (this includes clicking APLICAR)
            await this.driver.navigateToRemaju();

            // Scrape ONLY the first page
            logger.info('[TEST] Scraping first page only...');
            const html = await this.driver.getPageHtml();
            const parseResult = parseRematesTable(html, config.remajuUrl);

            if (!parseResult.success) {
                logger.warn('[TEST] Page parsing had errors', {
                    errors: parseResult.errors?.length || 0
                });
            }

            const data = parseResult.data || [];
            
            // Log results to console
            console.log('\n[TEST] ===== SINGLE PAGE TEST RESULTS =====');
            console.log(`[TEST] Total items extracted: ${data.length}`);
            console.log('[TEST] First page results:', JSON.stringify(data, null, 2));
            console.log('[TEST] ====================================\n');

            // Update stats
            this.stats.pagesScraped = 1;
            this.stats.recordsExtracted = data.length;
            this.finalizeStats();

            logger.info('[TEST] Single page test completed. Browser will remain open.');
            console.log('[TEST] Browser is open and visible. Press Ctrl+C to close.');

            // Return data without closing browser
            return { data, stats: this.stats };

        } catch (error: any) {
            logger.error('[TEST] Single page test failed', { error: error.message, stack: error.stack });
            throw error;
        }
        // NOTE: No finally block with cleanup - browser stays open!
    }
    
    /**
     * Initializes the Playwright browser
     */
    private async initializeBrowser(): Promise<void> {
        try {
            await this.driver.initialize();
            logger.info('Browser initialized successfully');
        } catch (error: any) {
            logger.error('Failed to initialize browser', { error: error.message });
            throw error;
        }
    }
    
    /**
     * Initializes the SQLite database (async with sql.js)
     */
    private async initializeDatabase(): Promise<void> {
        try {
            this.db = await getDatabase(config.dbPath);
            logger.info('Database initialized', { path: config.dbPath });
        } catch (error: any) {
            logger.error('Failed to initialize database', { error: error.message });
            throw error;
        }
    }
    
    /**
     * Scrapes all pages from REMAJU
     */
    private async scrapeAllPages(): Promise<void> {
        let currentPage = 1;
        let hasMorePages = true;
        
        while (hasMorePages) {
            try {
                logger.info(`Scraping page ${currentPage}`);
                
                // Get current page HTML
                const html = await this.driver.getPageHtml();
                
                // Parse the HTML
                const parseResult = parseRematesTable(html, config.remajuUrl);
                
                if (!parseResult.success) {
                    logger.warn(`Page ${currentPage} parsing had errors`, {
                        errors: parseResult.errors?.length || 0
                    });
                    this.stats.errorsEncountered += parseResult.errors?.length || 0;
                }
                
                // Store extracted data
                if (parseResult.data && parseResult.data.length > 0) {
                    await this.storeRemates(parseResult.data);
                }
                
                this.stats.pagesScraped++;
                this.stats.recordsExtracted += parseResult.parsedRows || 0;
                
                // Check if there are more pages
                hasMorePages = await this.hasNextPage();
                
                if (hasMorePages) {
                    const navigated = await this.driver.navigateToPage(currentPage + 1);
                    if (!navigated) {
                        logger.warn('Failed to navigate to next page, stopping');
                        break;
                    }
                    currentPage++;
                }
                
            } catch (error: any) {
                logger.error(`Error scraping page ${currentPage}`, { error: error.message });
                this.stats.errorsEncountered++;
                this.failedPages.push(currentPage);
                
                // Try to continue with next page after error
                hasMorePages = await this.hasNextPage();
                if (hasMorePages) {
                    currentPage++;
                    try {
                        await this.driver.navigateToPage(currentPage);
                    } catch (navError: any) {
                        logger.error('Failed to recover after error', { error: navError.message });
                        break;
                    }
                } else {
                    break;
                }
            }
        }
        
        logger.info(`Finished scraping. Total pages: ${this.stats.pagesScraped}`);
        
        // Print summary log at the end of full scrape
        console.log('\n========== SCRAPING SUMMARY ==========');
        console.log(`✅ Total rows scraped: ${this.stats.recordsExtracted}`);
        console.log(`📊 Total pages processed: ${this.stats.pagesScraped}`);
        
        if (this.failedPages.length > 0) {
            console.log(`❌ Failed pages: ${this.failedPages.join(', ')}`);
        } else {
            console.log(`✅ No failed pages - all good!`);
        }
        
        console.log('========== END SUMMARY ==========\n');
    }
    
    /**
     * Checks if there are more pages to scrape
     */
    private async hasNextPage(): Promise<boolean> {
        try {
            const paginationInfo = await this.driver.getPaginationInfo();
            return paginationInfo.hasNext;
        } catch (error: any) {
            logger.warn('Could not determine if more pages exist', { error: error.message });
            return false;
        }
    }
    
    /**
     * Stores remates data to the database
     */
    private async storeRemates(remates: Remate[]): Promise<void> {
        if (!this.db) {
            throw new Error('Database not initialized');
        }
        
        try {
            const dbRows = rematesToDatabaseRows(remates);
            const result = this.db.upsertBatch(dbRows);
            
            this.stats.recordsStored += result.success;
            
            if (result.failed > 0) {
                logger.warn(`Failed to store ${result.failed} remates`);
                this.stats.errorsEncountered += result.failed;
            }
            
            logger.info(`Stored ${result.success} remates from current page`);
            
        } catch (error: any) {
            logger.error('Failed to store remates', { error: error.message });
            this.stats.errorsEncountered++;
        }
    }
    
    /**
     * Finalizes the statistics
     */
    private finalizeStats(): void {
        this.stats.endTime = new Date().toISOString();
        const startTime = new Date(this.stats.startTime).getTime();
        const endTime = new Date(this.stats.endTime).getTime();
        this.stats.durationMs = endTime - startTime;
    }
    
    /**
     * Cleans up resources (browser, database)
     * In test mode, browser is NOT closed automatically
     */
    private async cleanup(): Promise<void> {
        // In test mode, don't close the browser - let user close it manually
        if (this.testMode) {
            logger.info('[TEST] Skipping cleanup - browser will remain open');
            return;
        }

        logger.info('Cleaning up resources');
        
        try {
            await this.driver.close();
        } catch (error: any) {
            logger.warn('Error closing browser', { error: error.message });
        }
        
        try {
            closeDatabase();
        } catch (error: any) {
            logger.warn('Error closing database', { error: error.message });
        }
    }

    /**
     * Manually close browser and database (for test mode)
     * Call this when done testing
     */
    async closeBrowser(): Promise<void> {
        logger.info('Manually closing browser and database');
        try {
            await this.driver.close();
        } catch (error: any) {
            logger.warn('Error closing browser', { error: error.message });
        }
        
        try {
            closeDatabase();
        } catch (error: any) {
            logger.warn('Error closing database', { error: error.message });
        }
        
        this.isRunning = false;
    }
}

/**
 * Main entry point for the scraper
 * Usage:
 *   npm run dev                    - normal mode (scrape all pages)
 *   npm run dev -- test            - single page test mode (browser stays open, console.log results)
 *   npm run dev -- --test-pagination  - pagination detection test (tests "Total: X registros.")
 */
async function main(): Promise<void> {
    const args = process.argv.slice(2);
    const isTestMode = args.includes('test') || args.includes('--test');
    const isPaginationTest = args.includes('--test-pagination');
    
    const scraper = new RemajuScraper();
    
    try {
        if (isPaginationTest) {
            // Run pagination detection test mode
            await scraper.runPaginationTest();
            console.log('\n[TEST] Pagination test completed. Browser remains open for inspection.');
            console.log('[TEST] Call scraper.closeBrowser() or press Ctrl+C to exit.');
            
            // Keep process alive so browser stays open
            // User can press Ctrl+C to exit
            process.on('SIGINT', async () => {
                console.log('\n[TEST] Closing browser...');
                await scraper.closeBrowser();
                process.exit(0);
            });
            
            // Prevent process from exiting
            await new Promise(() => {
                // This promise never resolves - keeps process running
                // User must press Ctrl+C
            });
        } else if (isTestMode) {
            // Run single page test mode
            const { data, stats } = await scraper.runSinglePageTest();
            console.log('\n[TEST] Test completed. Browser remains open for inspection.');
            console.log('[TEST] Call scraper.closeBrowser() or press Ctrl+C to exit.');
            
            // Keep process alive so browser stays open
            // User can press Ctrl+C to exit
            process.on('SIGINT', async () => {
                console.log('\n[TEST] Closing browser...');
                await scraper.closeBrowser();
                process.exit(0);
            });
            
            // Prevent process from exiting
            await new Promise(() => {
                // This promise never resolves - keeps process running
                // User must press Ctrl+C
            });
        } else {
            // Normal run mode
            const stats = await scraper.run();
            logger.info('Scraper completed successfully', stats);
            process.exit(0);
        }
    } catch (error: any) {
        logger.error('Scraper failed', { error: error.message });
        await scraper.closeBrowser();
        process.exit(1);
    }
}

// Run if this is the main module
if (require.main === module) {
    main();
}
