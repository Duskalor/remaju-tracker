/**
 * Configuration module for Remaju Scraper
 * Loads environment variables with TypeScript type safety
 */

import dotenv from 'dotenv';
import { resolve } from 'path';
import { ScraperConfig } from './types/remate';

// Load environment variables from .env file
dotenv.config({ path: resolve(process.cwd(), '.env') });

/**
 * Validates and parses the log level from environment
 */
function getValidLogLevel(): 'error' | 'warn' | 'info' | 'debug' {
  const level = process.env.LOG_LEVEL?.toLowerCase();
  const validLevels = ['error', 'warn', 'info', 'debug'] as const;

  if (level && validLevels.includes(level as any)) {
    return level as 'error' | 'warn' | 'info' | 'debug';
  }

  return 'info'; // default
}

/**
 * Validates numeric environment variable
 */
function getNumericEnv(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value === undefined) return defaultValue;

  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Typed configuration object
 */
export const config: ScraperConfig = {
  remajuUrl:
    process.env.REMAJU_URL ||
    'https://remaju.pj.gob.pe/remaju/pages/publico/remateExterno.xhtml',
  headless: false, // default true
  timeout: getNumericEnv('TIMEOUT_MS', 30000),
  retryMax: getNumericEnv('RETRY_MAX', 3),
  dbPath: process.env.DB_PATH || './data/remates.db',
  logLevel: getValidLogLevel(),
  logFile: process.env.LOG_FILE || './logs/scraper.log',
};

/**
 * Validates that required configuration is present
 */
export function validateConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config.remajuUrl) {
    errors.push('REMAJU_URL is required');
  }

  if (config.timeout <= 0) {
    errors.push('TIMEOUT_MS must be a positive number');
  }

  if (config.retryMax < 0) {
    errors.push('RETRY_MAX must be a non-negative number');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Returns a sanitized config for logging (hides sensitive data if any)
 */
export function getSanitizedConfig(): Partial<ScraperConfig> {
  return {
    remajuUrl: config.remajuUrl,
    headless: config.headless,
    timeout: config.timeout,
    retryMax: config.retryMax,
    dbPath: config.dbPath,
    logLevel: config.logLevel,
    logFile: config.logFile,
  };
}
