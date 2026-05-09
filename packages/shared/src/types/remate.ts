/**
 * Core TypeScript interfaces for the Remaju Scraper project
 * These types define the data structures used across all modules
 */

/** Components of a parsed address */
export interface DireccionComponentes {
    tipoVia?: string;
    nombreVia?: string;
    urbanizacion?: string;
    manzana?: string;
    lote?: string;
    numero?: string;
    sn?: boolean;
}

/** Represents a single "remate" (auction) from REMAJU */
export interface Remate {
    expediente?: string;        // Número de expediente (ej: "123/2024")
    remate_numero?: string;     // Número de remate (ej: "23313" de "Remate N° 23313")
    tipo_remate?: string;       // Tipo de remate
    fecha_remate?: string;      // Fecha del remate
    bienes?: string;            // Descripción de los bienes
    estado?: string;            // Estado actual del remate
    juzgado?: string;          // Juzgado interviniente
    direccion?: string;         // Dirección
    observaciones?: string;     // Observaciones
    ubicacion?: string;        // Ubicación del bien
    precioBase?: number;        // Precio base de la subasta
    moneda?: 'ARS' | 'USD' | 'PEN';   // Moneda (Pesos argentinos, Dólares, o Soles peruanos)
    fase?: string;             // Fase actual (ej: "Oferta firme")
    fechaPresentacion?: string; // Fecha de presentación
    descripcion?: string;       // Descripción de los bienes
    scrapedAt?: string;        // Timestamp de extracción
    sourceUrl?: string;        // URL de origen
    raw_html?: string;         // HTML crudo del card

    // Nuevos campos de parsing enriquecido
    distrito?: string;
    provincia?: string;
    departamento?: string;
    partidaRegistral?: string;
    areaM2?: number;
    descripcionRaw?: string;    // Texto raw original de bienes para reprocesamiento
    direccionRaw?: string;      // Texto raw de dirección
    direccionComponentes?: DireccionComponentes;
    precioPorM2?: number;
    tipoInmueble?: string;
    esBarato?: boolean;
}

/** Configuration for the scraper */
export interface ScraperConfig {
    remajuUrl: string;
    headless: boolean;
    timeout: number;
    retryMax: number;
    dbPath: string;
    userDataDir: string;
    logLevel: 'error' | 'warn' | 'info' | 'debug';
    logFile: string;
}

/** Row structure for SQLite database */
export interface DatabaseRow {
    id?: number;
    expediente: string;
    remate_numero?: string;     // Número de remate (ej: "23313")
    tipo_remate?: string;
    fecha_remate?: string;
    bienes?: string;
    estado?: string;
    juzgado?: string;
    direccion?: string;
    observaciones?: string;
    raw_html?: string;
    scraped_at: string;
    source_url: string;

    // Nuevos campos de parsing enriquecido
    distrito?: string;
    provincia?: string;
    departamento?: string;
    partida?: string;
    area_m2?: number;
    descripcion_raw?: string;
    direccion_raw?: string;
    precio_por_m2?: number;
    tipo_inmueble?: string;
}

/** Result of parsing operation */
export interface ParseResult {
    success: boolean;
    data?: Remate[];
    errors?: ParseError[];
    totalRows?: number;
    parsedRows?: number;
}

/** Error during parsing */
export interface ParseError {
    rowIndex: number;
    field?: keyof Remate;
    message: string;
    rawHtml?: string;
}

/** Configuration for Playwright browser */
export interface PlaywrightConfig {
    headless: boolean;
    timeout: number;
    retries: number;
}

/** JSF ViewState and form data for navigation */
export interface JsfFormData {
    viewState: string;
    formId: string;
    postbackUrl: string;
}

/** Pagination information */
export interface PaginationInfo {
    currentPage: number;
    totalPages: number;
    totalRows: number;
    hasNext: boolean;
}

/** Scraper statistics */
export interface ScraperStats {
    startTime: string;
    endTime?: string;
    pagesScraped: number;
    recordsExtracted: number;
    recordsStored: number;
    errorsEncountered: number;
    durationMs?: number;
}
