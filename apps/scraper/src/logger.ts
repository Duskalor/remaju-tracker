/**
 * Structured logging module for Remaju Scraper
 * Uses Winston for flexible logging to console and files
 */

import winston from 'winston';
import { resolve } from 'path';
import { ScraperConfig } from '@remaju/shared';
import { config } from './config';

// Custom format for log output
const customFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.printf(({ level, message, timestamp, ...metadata }) => {
        let metaStr = '';
        if (Object.keys(metadata).length > 0) {
            metaStr = JSON.stringify(metadata);
        }
        return `${timestamp} [${level.toUpperCase()}]: ${message} ${metaStr}`;
    })
);

/**
 * Creates and configures the logger instance
 */
function createLogger(config: ScraperConfig): winston.Logger {
    const transports: winston.transport[] = [
        // Console transport - always enabled
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                customFormat
            )
        })
    ];
    
    // File transport - if log file is specified
    if (config.logFile) {
        transports.push(
            new winston.transports.File({
                filename: resolve(process.cwd(), config.logFile),
                format: customFormat,
                maxsize: 5242880, // 5MB
                maxFiles: 5,
                tailable: true
            })
        );
    }
    
    return winston.createLogger({
        level: config.logLevel,
        levels: winston.config.npm.levels,
        format: customFormat,
        transports,
        exitOnError: false
    });
}

// Lazy-loaded logger instance
let loggerInstance: winston.Logger | null = null;

/**
 * Gets or creates the logger instance
 */
export function getLogger(): winston.Logger {
    if (!loggerInstance) {
        loggerInstance = createLogger(config);
    }
    return loggerInstance;
}

/**
 * Reconfigures the logger with new config (useful for testing)
 */
export function reconfigureLogger(config: ScraperConfig): winston.Logger {
    loggerInstance = createLogger(config);
    return loggerInstance;
}

/**
 * Logs scraping statistics in a structured way
 */
export function logScraperStats(stats: {
    pagesScraped: number;
    recordsExtracted: number;
    recordsStored: number;
    errorsEncountered: number;
    durationMs: number;
}): void {
    const logger = getLogger();
    logger.info('Scraper execution completed', {
        pagesScraped: stats.pagesScraped,
        recordsExtracted: stats.recordsExtracted,
        recordsStored: stats.recordsStored,
        errorsEncountered: stats.errorsEncountered,
        durationSeconds: Math.round(stats.durationMs / 1000),
        recordsPerSecond: stats.durationMs > 0 
            ? Math.round(stats.recordsExtracted / (stats.durationMs / 1000)) 
            : 0
    });
}

/**
 * Logs parsing errors with context
 */
export function logParseError(error: {
    rowIndex: number;
    field?: string;
    message: string;
    rawHtml?: string;
}): void {
    const logger = getLogger();
    logger.warn('Parse error encountered', {
        rowIndex: error.rowIndex,
        field: error.field,
        message: error.message,
        hasRawHtml: !!error.rawHtml
    });
}

// Export a default logger instance for convenience
export const logger = getLogger();
