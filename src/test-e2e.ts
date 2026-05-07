/**
 * E2E Test for Remaju Scraper
 * Runs the scraper against REMAJU and verifies JSON output
 * 
 * Usage:
 *   npm run build
 *   node dist/test-e2e.js
 *   or
 *   npx ts-node src/test-e2e.ts
 */

import { RemajuScraper } from './scraper';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { config } from './config';
import { logger } from './logger';

/**
 * E2E test results interface
 */
interface E2ETestResult {
    success: boolean;
    timestamp: string;
    durationMs: number;
    pagesScraped: number;
    recordsExtracted: number;
    recordsStored: number;
    errorsEncountered: number;
    outputFile?: string;
    error?: string;
}

/**
 * Main E2E test function
 */
async function runE2ETest(): Promise<E2ETestResult> {
    const startTime = Date.now();
    const result: E2ETestResult = {
        success: false,
        timestamp: new Date().toISOString(),
        durationMs: 0,
        pagesScraped: 0,
        recordsExtracted: 0,
        recordsStored: 0,
        errorsEncountered: 0
    };
    
    logger.info('Starting E2E test for Remaju Scraper');
    console.log('='.repeat(60));
    console.log('E2E Test: Remaju Scraper');
    console.log('='.repeat(60));
    
    try {
        // Validate configuration
        console.log('\n[1/4] Validating configuration...');
        const { validateConfig } = await import('./config');
        const configValidation = validateConfig();
        
        if (!configValidation.valid) {
            throw new Error(`Configuration invalid: ${configValidation.errors.join(', ')}`);
        }
        console.log('✓ Configuration valid');
        console.log(`  - REMAJU URL: ${config.remajuUrl}`);
        console.log(`  - Headless: ${config.headless}`);
        console.log(`  - Timeout: ${config.timeout}ms`);
        console.log(`  - Database: ${config.dbPath}`);
        
        // Initialize and run scraper
        console.log('\n[2/4] Running scraper (this may take several minutes)...');
        const scraper = new RemajuScraper();
        
        const stats = await scraper.run();
        
        result.pagesScraped = stats.pagesScraped;
        result.recordsExtracted = stats.recordsExtracted;
        result.recordsStored = stats.recordsStored;
        result.errorsEncountered = stats.errorsEncountered;
        result.durationMs = stats.durationMs || (Date.now() - startTime);
        
        console.log(`✓ Scraper completed`);
        console.log(`  - Pages scraped: ${result.pagesScraped}`);
        console.log(`  - Records extracted: ${result.recordsExtracted}`);
        console.log(`  - Records stored: ${result.recordsStored}`);
        console.log(`  - Errors: ${result.errorsEncountered}`);
        console.log(`  - Duration: ${(result.durationMs / 1000).toFixed(2)}s`);
        
        // Verify output (JSON/Database)
        console.log('\n[3/4] Verifying output...');
        const { getDatabase, closeDatabase } = await import('./db');
        const db = await getDatabase(config.dbPath);
        
        const totalRecords = db.countAll();
        console.log(`✓ Database contains ${totalRecords} total records`);
        
        if (totalRecords === 0 && result.recordsStored === 0) {
            console.log('⚠ Warning: No records were stored');
        }
        
        // Export sample to JSON
        console.log('\n[4/4] Exporting sample data to JSON...');
        const allRecords = db.getAllRemates();
        const sampleSize = Math.min(10, allRecords.length);
        const sample = allRecords.slice(0, sampleSize);
        
        // Ensure output directory exists
        const outputDir = resolve(process.cwd(), 'output');
        if (!existsSync(outputDir)) {
            mkdirSync(outputDir, { recursive: true });
        }
        
        const outputFile = resolve(outputDir, `e2e-test-output-${Date.now()}.json`);
        const outputData = {
            testTimestamp: result.timestamp,
            durationMs: result.durationMs,
            totalRecordsInDb: totalRecords,
            sampleSize: sample.length,
            sampleRecords: sample
        };
        
        writeFileSync(outputFile, JSON.stringify(outputData, null, 2));
        result.outputFile = outputFile;
        console.log(`✓ Sample data exported to: ${outputFile}`);
        
        closeDatabase();
        
        // Mark success
        result.success = result.recordsStored > 0 || totalRecords > 0;
        
        console.log('\n' + '='.repeat(60));
        console.log(`E2E Test ${result.success ? 'PASSED' : 'FAILED'}`);
        console.log('='.repeat(60));
        
        return result;
        
    } catch (error: any) {
        result.durationMs = Date.now() - startTime;
        result.error = error.message;
        result.success = false;
        
        console.error('\n✗ E2E Test FAILED');
        console.error(`Error: ${error.message}`);
        if (error.stack) {
            console.error('\nStack trace:');
            console.error(error.stack);
        }
        
        return result;
    }
}

/**
 * Entry point
 */
async function main(): Promise<void> {
    const result = await runE2ETest();
    
    // Exit with appropriate code
    if (result.success) {
        process.exit(0);
    } else {
        process.exit(1);
    }
}

// Run if this is the main module
if (require.main === module) {
    main();
}

export { runE2ETest };
