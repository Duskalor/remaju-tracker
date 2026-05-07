/**
 * Database module for Remaju Scraper
 * Handles SQLite operations using sql.js (pure JavaScript, no native bindings)
 */

import initSqlJs, { Database as SqlJsDatabase, Statement } from 'sql.js';
import { resolve, dirname } from 'path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { DatabaseRow, Remate } from './types/remate';
import { logger } from './logger';

/**
 * SQL schema for the remates table
 * IMPORTANT: expediente is now UNIQUE by itself (not composite)
 * "Remate N° X" (e.g., "23313") is the unique identifier per convocatoria
 */
const SCHEMA_SQL = `
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

/**
 * Prepared statements for better performance
 */
interface PreparedStatements {
    insertOrReplace: Statement | null;
    selectByExpediente: Statement | null;
    selectAll: Statement | null;
    selectByDateRange: Statement | null;
    deleteById: Statement | null;
    countAll: Statement | null;
}

let sqlJsInitialized: boolean = false;
let SQL: any = null;

/**
 * Initializes sql.js (lazy loading)
 */
async function initSqlJsLibrary(): Promise<void> {
    if (sqlJsInitialized) return;
    
    try {
        SQL = await initSqlJs();
        sqlJsInitialized = true;
        logger.info('sql.js library initialized');
    } catch (error: any) {
        logger.error('Failed to initialize sql.js', { error: error.message });
        throw error;
    }
}

/**
 * Database wrapper class with typed methods
 */
export class RemateDatabase {
    private db: SqlJsDatabase;
    private statements: PreparedStatements;
    private dbPath: string;
    private isInTransaction: boolean = false;
    
    constructor(dbPath: string, sqlJsDb: SqlJsDatabase) {
        this.dbPath = resolve(process.cwd(), dbPath);
        this.db = sqlJsDb;
        this.statements = {
            insertOrReplace: null,
            selectByExpediente: null,
            selectAll: null,
            selectByDateRange: null,
            deleteById: null,
            countAll: null
        };
        
        // Initialize schema
        this.initializeSchema();
        
        logger.info(`Database opened: ${this.dbPath}`);
    }
    
    /**
     * Initializes the database schema
     */
    private initializeSchema(): void {
        try {
            // Check if we need to migrate from old schema (composite UNIQUE) to new schema (single UNIQUE on expediente)
            const tableInfo = this.db.exec("PRAGMA table_info(remates)") as any[];
            
            if (tableInfo && tableInfo.length > 0) {
                // Table exists, check if we need to migrate
                const hasOldUnique = this.checkForOldUniqueConstraint();
                
                if (hasOldUnique) {
                    logger.info('Migrating database schema from composite UNIQUE to single UNIQUE on expediente');
                    this.migrateToNewSchema();
                } else {
                    // Just run the schema SQL (CREATE TABLE IF NOT EXISTS won't hurt)
                    this.db.run(SCHEMA_SQL);
                }
            } else {
                // Table doesn't exist, create it
                this.db.run(SCHEMA_SQL);
            }
            
            // Add remate_numero column if it doesn't exist (for existing databases)
            try {
                this.db.run(`ALTER TABLE remates ADD COLUMN remate_numero TEXT`);
                logger.info('Added remate_numero column to existing table');
            } catch (alterError: any) {
                // Column probably already exists - that's fine
                logger.debug('remate_numero column already exists or cannot be added', { error: alterError.message });
            }
            
            // Add index if it doesn't exist
            try {
                this.db.run(`CREATE INDEX IF NOT EXISTS idx_remate_numero ON remates(remate_numero)`);
            } catch (indexError: any) {
                logger.debug('remate_numero index already exists', { error: indexError.message });
            }
            
            logger.info('Database schema initialized');
        } catch (error) {
            logger.error('Failed to initialize database schema', { error });
            throw error;
        }
    }

    /**
     * Checks if the old composite UNIQUE constraint exists
     */
    private checkForOldUniqueConstraint(): boolean {
        try {
            const result = this.db.exec("PRAGMA index_list(remates)") as any[];
            if (!result || result.length === 0) return false;
            
            const indexes = result[0]?.values || [];
            for (const idx of indexes) {
                const indexName = idx[1]; // name is at index 1
                if (indexName && indexName.includes('sqlite_autoindex')) {
                    // This might be an auto-generated index for UNIQUE constraint
                    // Check if it's the old composite one
                    const idxInfo = this.db.exec(`PRAGMA index_info(${indexName})`) as any[];
                    if (idxInfo && idxInfo[0]?.values?.length === 3) {
                        // Old schema had 3 columns in UNIQUE
                        return true;
                    }
                }
            }
            return false;
        } catch (error: any) {
            logger.debug('Could not check for old constraint', { error: error.message });
            return false;
        }
    }

    /**
     * Migrates from old schema to new schema
     * In SQLite, we need to recreate the table to change UNIQUE constraints
     */
    private migrateToNewSchema(): void {
        try {
            logger.info('Starting schema migration...');
            
            // 1. Create new table with correct schema
            this.db.run(`
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
            
            // 2. Copy data from old table to new table
            // Use INSERT OR REPLACE to handle any duplicates during migration

            // Dynamically build the INSERT/SELECT queries based on what columns exist in the old table
            const oldTableInfo = this.db.exec("PRAGMA table_info(remates)") as any[];
            const oldColumns = oldTableInfo[0]?.values?.map((row: any) => row[1]) || [];

            logger.info('Old table columns for migration', { columns: oldColumns });

            // Define the columns we want in the new table (including id to preserve it)
            const newColumns = ['id', 'expediente', 'remate_numero', 'tipo_remate', 'fecha_remate',
                                'bienes', 'estado', 'juzgado', 'direccion', 'observaciones',
                                'raw_html', 'scraped_at', 'source_url'];

            // Build the SELECT part - for columns that exist in old table, use the column name
            // For columns that don't exist (like remate_numero), use NULL
            const selectParts = newColumns.map(col => {
                if (oldColumns.includes(col)) {
                    return col;
                } else {
                    return 'NULL';
                }
            });

            const insertSQL = `
                INSERT OR REPLACE INTO remates_new
                (${newColumns.join(', ')})
                SELECT ${selectParts.join(', ')}
                FROM remates
            `;

            try {
                this.db.run(insertSQL);
                logger.info('Data migrated successfully (dynamic column mapping)');
            } catch (error: any) {
                logger.error('Failed to migrate data', { error: error.message, sql: insertSQL });
                throw error;
            }
            
            // 3. Drop old table
            this.db.run(`DROP TABLE remates`);
            
            // 4. Rename new table
            this.db.run(`ALTER TABLE remates_new RENAME TO remates`);
            
            // 5. Recreate indexes
            this.db.run(`CREATE INDEX IF NOT EXISTS idx_scraped_at ON remates(scraped_at DESC)`);
            this.db.run(`CREATE INDEX IF NOT EXISTS idx_juzgado ON remates(juzgado)`);
            this.db.run(`CREATE INDEX IF NOT EXISTS idx_estado ON remates(estado)`);
            this.db.run(`CREATE INDEX IF NOT EXISTS idx_remate_numero ON remates(remate_numero)`);
            
            // 6. IMPORTANT: Reset prepared statements so they're re-prepared with new schema
            this.statements.insertOrReplace = null;
            this.statements.selectByExpediente = null;
            this.statements.selectAll = null;
            this.statements.selectByDateRange = null;
            this.statements.deleteById = null;
            this.statements.countAll = null;
            
            logger.info('Schema migration completed successfully');
        } catch (error: any) {
            logger.error('Failed to migrate schema', { error: error.message });
            throw error;
        }
    }
    
    /**
     * Prepares SQL statements for better performance
     */
    private prepareStatements(): void {
        if (this.statements.insertOrReplace) return;
        
        try {
            this.statements.insertOrReplace = this.db.prepare(`
                INSERT OR REPLACE INTO remates 
                (expediente, remate_numero, tipo_remate, fecha_remate, bienes, estado, 
                 juzgado, direccion, observaciones, raw_html, scraped_at, source_url)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            
            this.statements.selectByExpediente = this.db.prepare(`
                SELECT * FROM remates 
                WHERE expediente = ? AND fecha_remate = ? AND juzgado = ?
                LIMIT 1
            `);
            
            this.statements.selectAll = this.db.prepare(`
                SELECT * FROM remates 
                ORDER BY scraped_at DESC
            `);
            
            this.statements.selectByDateRange = this.db.prepare(`
                SELECT * FROM remates 
                WHERE scraped_at BETWEEN ? AND ?
                ORDER BY scraped_at DESC
            `);
            
            this.statements.deleteById = this.db.prepare(`DELETE FROM remates WHERE id = ?`);
            
            this.statements.countAll = this.db.prepare(`SELECT COUNT(*) as count FROM remates`);
        } catch (error: any) {
            logger.error('Failed to prepare statements', { error: error.message });
            throw error;
        }
    }
    
    /**
     * Upserts a remate record (insert or replace based on UNIQUE constraint)
     */
    upsertRemate(remate: DatabaseRow): { changes: number; lastInsertRowid: number } {
        this.prepareStatements();
        
        try {
            this.statements.insertOrReplace!.run([
                remate.expediente,
                remate.remate_numero || null,
                remate.tipo_remate || null,
                remate.fecha_remate || null,
                remate.bienes || null,
                remate.estado || null,
                remate.juzgado || null,
                remate.direccion || null,
                remate.observaciones || null,
                remate.raw_html || null,
                remate.scraped_at,
                remate.source_url
            ]);
            
            // Get the number of changes (for sql.js we approximate)
            const result = { changes: 1, lastInsertRowid: this.db.exec("SELECT last_insert_rowid()")[0]?.values[0]?.[0] as number || 0 };
            
            logger.debug('Remate upserted', {
                expediente: remate.expediente,
                changes: result.changes
            });
            
            return result;
        } catch (error: any) {
            logger.error('Failed to upsert remate', {
                expediente: remate.expediente,
                error: error.message
            });
            throw error;
        }
    }
    
    /**
     * Batch upsert multiple remates in a transaction
     */
    upsertBatch(remates: DatabaseRow[]): { success: number; failed: number } {
        this.prepareStatements();
        
        const result = { success:0, failed: 0 };
        
        try {
            // Begin transaction
            this.db.run('BEGIN TRANSACTION');
            this.isInTransaction = true;
            
            // Debug: Log the first remate to see what's being passed
            if (remates.length > 0) {
                logger.debug('First remate in batch', {
                    expediente: remates[0].expediente,
                    remate_numero: remates[0].remate_numero,
                    fecha_remate: remates[0].fecha_remate,
                    juzgado: remates[0].juzgado,
                    fullObject: JSON.stringify(remates[0])
                });
            }
            
            for (const remate of remates) {
                try {
                    // Debug: Log before each upsert
                    logger.debug('About to upsert remate', {
                        expediente: remate.expediente,
                        remate_numero: remate.remate_numero
                    });
                    
                    this.statements.insertOrReplace!.run([
                        remate.expediente,
                        remate.remate_numero || null,
                        remate.tipo_remate || null,
                        remate.fecha_remate || null,
                        remate.bienes || null,
                        remate.estado || null,
                        remate.juzgado || null,
                        remate.direccion || null,
                        remate.observaciones || null,
                        remate.raw_html || null,
                        remate.scraped_at,
                        remate.source_url
                    ]);
                    result.success++;
                    
                    logger.debug('Successfully upserted remate', {
                        expediente: remate.expediente
                    });
                } catch (error: any) {
                    result.failed++;
                    logger.warn('Failed to upsert remate in batch', {
                        expediente: remate.expediente,
                        error: error.message,
                        stack: error.stack,
                        sql: 'INSERT OR REPLACE INTO remates (expediente, remate_numero, tipo_remate, fecha_remate, bienes, estado, juzgado, direccion, observaciones, raw_html, scraped_at, source_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                        params: [
                            remate.expediente,
                            remate.remate_numero || null,
                            remate.tipo_remate || null,
                            remate.fecha_remate || null,
                            remate.bienes || null,
                            remate.estado || null,
                            remate.juzgado || null,
                            remate.direccion || null,
                            remate.observaciones || null,
                            remate.raw_html || null,
                            remate.scraped_at,
                            remate.source_url
                        ]
                    });
                }
                }
            
            // Commit transaction
            this.db.run('COMMIT');
            this.isInTransaction = false;
            
            logger.info('Batch upsert completed', result);
            
            // Save to file after batch operation
            this.saveToFile();
        } catch (error: any) {
            if (this.isInTransaction) {
                this.db.run('ROLLBACK');
                this.isInTransaction = false;
            }
            logger.error('Batch transaction failed', { error: error.message });
        }
        
        return result;
    }
    
    /**
     * Finds a remate by expediente (now UNIQUE by itself)
     */
    findByExpediente(expediente: string): DatabaseRow | undefined {
        this.prepareStatements();
        
        try {
            // Update the prepared statement to search by expediente only
            const stmt = this.db.prepare(`SELECT * FROM remates WHERE expediente = ? LIMIT 1`);
            const result = stmt.get([expediente]) as any;
            stmt.free();
            
            if (!result) return undefined;
            
            return this.mapRowToDatabaseRow(result);
        } catch (error: any) {
            logger.error('Failed to find remate by expediente', { expediente, error: error.message });
            throw error;
        }
    }

    /**
     * Finds a remate by its unique constraint fields (legacy - now just uses expediente)
     * @deprecated Use findByExpediente instead
     */
    findByUniqueFields(expediente: string, fechaRemate: string, juzgado: string): DatabaseRow | undefined {
        logger.warn('findByUniqueFields is deprecated, expediente is now UNIQUE by itself');
        return this.findByExpediente(expediente);
    }
    
    /**
     * Gets all remates
     */
    getAllRemates(): DatabaseRow[] {
        this.prepareStatements();
        
        try {
            const results = this.statements.selectAll!.get() as any[];
            return results.map(row => this.mapRowToDatabaseRow(row));
        } catch (error: any) {
            logger.error('Failed to get all remates', { error: error.message });
            throw error;
        }
    }
    
    /**
     * Gets remates within a date range
     */
    getByDateRange(startDate: string, endDate: string): DatabaseRow[] {
        this.prepareStatements();
        
        try {
            const results = this.statements.selectByDateRange!.get([startDate, endDate]) as any[];
            return results.map(row => this.mapRowToDatabaseRow(row));
        } catch (error: any) {
            logger.error('Failed to get remates by date range', { startDate, endDate, error: error.message });
            throw error;
        }
    }
    
    /**
     * Counts total remates
     */
    countAll(): number {
        this.prepareStatements();
        
        try {
            const result = this.statements.countAll!.get() as any;
            return result?.count || 0;
        } catch (error: any) {
            logger.error('Failed to count remates', { error: error.message });
            throw error;
        }
    }
    
    /**
     * Maps a raw sql.js row to DatabaseRow interface
     */
    private mapRowToDatabaseRow(row: any): DatabaseRow {
        return {
            id: row.id,
            expediente: row.expediente,
            remate_numero: row.remate_numero || undefined,
            tipo_remate: row.tipo_remate,
            fecha_remate: row.fecha_remate,
            bienes: row.bienes,
            estado: row.estado,
            juzgado: row.juzgado,
            direccion: row.direccion,
            observaciones: row.observaciones,
            raw_html: row.raw_html,
            scraped_at: row.scraped_at,
            source_url: row.source_url
        };
    }
    
    /**
     * Saves the current database state to file
     */
    private saveToFile(): void {
        try {
            const data = this.db.export();
            writeFileSync(this.dbPath, Buffer.from(data));
            logger.debug('Database saved to file', { path: this.dbPath });
        } catch (error: any) {
            logger.error('Failed to save database to file', { error: error.message });
        }
    }
    
    /**
     * Closes the database connection and saves to file
     */
    close(): void {
        this.saveToFile();
        this.db.close();
        logger.info('Database connection closed and saved');
    }
    
    /**
     * Gets the underlying database instance (for advanced operations)
     */
    getDatabase(): SqlJsDatabase {
        return this.db;
    }
}

// Lazy-loaded singleton instance
let dbInstance: RemateDatabase | null = null;
let sqlJsDbInstance: SqlJsDatabase | null = null;

/**
 * Gets or creates the database instance
 */
export async function getDatabase(dbPath?: string): Promise<RemateDatabase> {
    if (dbInstance && dbInstance) {
        return dbInstance;
    }
    
    if (!dbPath) {
        throw new Error('Database not initialized. Call getDatabase with dbPath first.');
    }
    
    // Initialize sql.js library
    await initSqlJsLibrary();
    
    // Ensure the directory exists
    const resolvedPath = resolve(process.cwd(), dbPath);
    const dir = dirname(resolvedPath);
    
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
        logger.info(`Created database directory: ${dir}`);
    }
    
    // Open or create database
    try {
        if (existsSync(resolvedPath)) {
            // Read existing database
            const buffer = readFileSync(resolvedPath);
            sqlJsDbInstance = new SQL.Database(new Uint8Array(buffer));
            logger.info('Opened existing database', { path: resolvedPath });
        } else {
            // Create new database
            sqlJsDbInstance = new SQL.Database();
            logger.info('Created new database', { path: resolvedPath });
        }
    } catch (error: any) {
        logger.error('Failed to open database', { error: error.message });
        throw error;
    }
    
    if (!sqlJsDbInstance) {
        throw new Error('Failed to initialize database instance');
    }
    
    dbInstance = new RemateDatabase(dbPath, sqlJsDbInstance);
    return dbInstance;
}

/**
 * Closes the database connection
 */
export function closeDatabase(): void {
    if (dbInstance) {
        dbInstance.close();
        dbInstance = null;
        sqlJsDbInstance = null;
    }
}

/**
 * Saves the current database state to file (useful after operations)
 */
export function saveDatabase(): void {
    if (dbInstance) {
        dbInstance.close(); // This will save to file
        // Re-open the database
        // Note: In a real implementation, you might want to handle this differently
    }
}
