/**
 * Parsing module for Remaju Scraper
 * Handles HTML parsing from JSF/PrimeFaces datagrid using Cheerio
 * FIXED: Now parses .ui-datagrid-column .card elements instead of tables
 */

import * as cheerio from 'cheerio';
import { Remate, ParseResult, ParseError, DatabaseRow } from './types/remate';
import { logger } from './logger';

/**
 * Parses the main remates from REMAJU's JSF page using PrimeFaces datagrid cards
 * @param html - The HTML content of the page
 * @param sourceUrl - The URL where the data was scraped from
 * @returns ParseResult with success flag, data, and any errors
 */
export function parseRematesTable(html: string, sourceUrl: string): ParseResult {
    const errors: ParseError[] = [];
    const remates: Remate[] = [];
    
    try {
        const $ = cheerio.load(html);
        
        // Find cards in the PrimeFaces datagrid
        // REMAJU uses ui-datagrid with cards inside ui-datagrid-column
        const allCards = $('.ui-datagrid-column .card, .ui-datagrid .card, .card');
        
        if (allCards.length === 0) {
            logger.warn('No remates cards found in HTML');
            return {
                success: false,
                data: [],
                errors: [{ rowIndex: -1, message: 'No cards found in HTML - looking for .ui-datagrid-column .card' }],
                totalRows: 0,
                parsedRows: 0
            };
        }
        
        // Filter out non-remate cards (filter panels have "card rojo" class and contain "filtro")
        const cards = allCards.filter((index: number, element: any) => {
            const $card = $(element);
            const classAttr = $card.attr('class') || '';
            const text = $card.text().toLowerCase();
            
            // Skip filter panels: they have "card rojo" class or contain "filtro"
            if (classAttr.includes('rojo') || text.includes('filtro')) {
                logger.debug('Filtering out non-remate card (filter panel)', {
                    class: classAttr,
                    preview: text.substring(0, 100)
                });
                return false;
            }
            
            // Must contain "Remate N°" to be a valid remate card
            if (!text.includes('remate n°')) {
                logger.debug('Filtering out card without "Remate N°"', {
                    preview: text.substring(0, 100)
                });
                return false;
            }
            
            return true;
        });
        
        const totalRows = cards.length;
        logger.info(`Found ${totalRows} remate cards (filtered from ${allCards.length} total cards)`);
        
        if (totalRows === 0) {
            logger.warn('No valid remate cards found after filtering');
            return {
                success: false,
                data: [],
                errors: [{ rowIndex: -1, message: 'No valid remate cards found after filtering out filter panels' }],
                totalRows: 0,
                parsedRows: 0
            };
        }
        
        cards.each((index: number, element: any) => {
            try {
                const remate = parseCard($(element), $);
                
                if (remate && remate.expediente) {
                    remate.sourceUrl = sourceUrl;
                    remate.scrapedAt = new Date().toISOString();
                    remates.push(remate);
                } else {
                    errors.push({
                        rowIndex: index,
                        message: 'Card missing required field: expediente',
                        rawHtml: $.html($(element))
                    });
                }
            } catch (error: any) {
                errors.push({
                    rowIndex: index,
                    message: `Failed to parse card: ${error.message}`,
                    rawHtml: $.html($(element))
                });
                logger.warn('Failed to parse card', { cardIndex: index, error: error.message });
            }
        });
        
        return {
            success: errors.length === 0,
            data: remates,
            errors: errors.length > 0 ? errors : undefined,
            totalRows,
            parsedRows: remates.length
        };
        
    } catch (error: any) {
        logger.error('Failed to parse HTML', { error: error.message });
        return {
            success: false,
            data: [],
            errors: [{ rowIndex: -1, message: `HTML parsing failed: ${error.message}` }],
            totalRows: 0,
            parsedRows: 0
        };
    }
}

/**
 * Extracts a field value by looking for a label and getting the following text
 * Uses Cheerio DOM traversal to find labels and extract adjacent values
 * FIXED: Now correctly targets specific elements instead of searching full card text
 * @param $card - The card element
 * @param $ - Cheerio API
 * @param label - The label to search for (e.g., "Expediente:", "Precio:")
 * @returns The value after the label, or empty string if not found
 */
function extractFieldByLabel($card: any, $: cheerio.CheerioAPI, label: string): string {
    // Normalize the label for comparison (remove trailing colon if present)
    const normalizedLabel = label.replace(/:$/, '');
    const labelWithColon = normalizedLabel + ':';
    const labelLower = normalizedLabel.toLowerCase();
    const labelWithColonLower = labelWithColon.toLowerCase();
    
    // Strategy 1: Find the <strong>, <b>, or <span> tag that contains the label
    // and extract the value that comes AFTER it (not the whole card text)
    const labelSelectors = [
        `strong:contains("${labelWithColon}")`,
        `b:contains("${labelWithColon}")`,
        `span:contains("${labelWithColon}")`,
        `div:contains("${labelWithColon}")`,
    ];
    
    for (const selector of labelSelectors) {
        const labelElem = $card.find(selector).first();
        if (labelElem.length > 0) {
            // Get the parent element that contains both the label and likely the value
            const parent = labelElem.parent();
            
            // Get the full text of the parent
            const parentText = parent.text();
            const parentTextLower = parentText.toLowerCase();
            
            // Find where the label is in this text (case-insensitive)
            const labelIndex = parentTextLower.indexOf(labelWithColonLower);
            
            if (labelIndex !== -1) {
                // Extract text after the label
                let textAfterLabel = parentText.substring(labelIndex + labelWithColon.length);
                
                // Stop at the next label (pattern: "Word:" or "Word :")
                // This handles cases where multiple fields are in the same parent
                const nextLabelMatch = textAfterLabel.match(/\s+[A-Z][a-zéúíóáüñ]+\s*:/);
                if (nextLabelMatch && nextLabelMatch.index !== undefined) {
                    textAfterLabel = textAfterLabel.substring(0, nextLabelMatch.index);
                }
                
                // Also stop at newline
                const newlineIndex = textAfterLabel.indexOf('\n');
                if (newlineIndex !== -1) {
                    textAfterLabel = textAfterLabel.substring(0, newlineIndex);
                }
                
                const extracted = cleanText(textAfterLabel);
                if (extracted && extracted.length > 0) {
                    return extracted;
                }
            }
        }
    }
    
    // Strategy 2: More aggressive search - find the label in any element and extract value after it
    let foundValue = '';
    $card.find('*').each((i: number, elem: any) => {
        const $elem = $(elem);
        const elemText = cleanText($elem.text());
        const elemTextLower = elemText.toLowerCase();
        
        // Check if this element contains the label (case-insensitive)
        if (elemTextLower.includes(labelLower)) {
            // Find where the label starts in this element's text
            const labelIndex = elemTextLower.indexOf(labelWithColonLower);
            
            if (labelIndex !== -1) {
                // Get text after the label
                let textAfterLabel = elemText.substring(labelIndex + labelWithColon.length);
                
                // Stop at next colon (likely another label)
                const nextColonIndex = textAfterLabel.indexOf(':');
                if (nextColonIndex !== -1) {
                    // Check if this looks like a label (Word:)
                    const beforeColon = textAfterLabel.substring(0, nextColonIndex).trim();
                    if (beforeColon.length > 0 && beforeColon.length < 50) {
                        textAfterLabel = textAfterLabel.substring(0, nextColonIndex);
                    }
                }
                
                const extracted = cleanText(textAfterLabel);
                
                // Validate it's not another label and has reasonable length
                if (extracted && !extracted.includes(':') && extracted.length > 0 && extracted.length < 100) {
                    foundValue = extracted;
                    return false; // break the loop
                }
            }
        }
    });
    
    if (foundValue) {
        return foundValue;
    }
    
    // Strategy 3: Fallback - use regex on full text but be very careful
    const cardText = cleanText($card.text());
    const labelIndex = cardText.toLowerCase().indexOf(labelWithColonLower);
    
    if (labelIndex !== -1) {
        const textAfterLabel = cardText.substring(labelIndex + labelWithColon.length);
        // Extract until we hit something that looks like another label
        const match = textAfterLabel.match(/^[:\s]*([^:]+?)(?:\s+[A-Z][a-zéúíóáüñ]+:|$)/);
        if (match && match[1]) {
            return cleanText(match[1]);
        }
    }
    
    return '';
}

/**
 * Finds text in the card that matches a specific pattern
 * More careful than just regex on full text - validates the context
 * @param $card - The card element  
 * @param pattern - The regex pattern to search for
 * @param mustFollowLabel - Optional label that should precede the pattern
 * @returns The first match, or empty string
 */
function findTextByPattern($card: any, pattern: RegExp, mustFollowLabel?: string): string {
    const cardText = cleanText($card.text());
    
    // If mustFollowLabel is provided, only match if pattern follows the label
    if (mustFollowLabel) {
        const labelIndex = cardText.toLowerCase().indexOf(mustFollowLabel.toLowerCase());
        if (labelIndex === -1) return '';
        
        const textAfterLabel = cardText.substring(labelIndex + mustFollowLabel.length);
        const match = textAfterLabel.match(pattern);
        if (match && match[0]) {
            return match[0].trim();
        }
    } else {
        const match = cardText.match(pattern);
        if (match && match[0]) {
            return match[0].trim();
        }
    }
    
    return '';
}

/**
 * Validates if a string looks like a valid expediente number
 * Pattern should be like: 123/2024, 12345/2026, or similar
 * @param value - The string to validate
 * @returns true if it matches the expected pattern
 */
function isValidExpediente(value: string): boolean {
    if (!value) return false;
    
    // Should match: digits/digits (with 4-digit year)
    const expedientePattern = /^\d+\/\d{4}$/;
    if (expedientePattern.test(value)) return true;
    
    // Also accept: letters + digits/digits (some courts use alphanumeric)
    const alphanumericPattern = /^[A-Za-z]?\d+\/\d{4}$/;
    return alphanumericPattern.test(value);
}

/**
 * Extracts text content that appears after a specific FontAwesome icon in the card
 * Uses the icon + parent text pattern based on actual REMAJU card structure
 * @param $card - The card element
 * @param $ - Cheerio API
 * @param iconClass - The icon class suffix (e.g., 'fa-map-marker' for 'i.fa-map-marker')
 * @returns The text content after the icon, or empty string if not found
 */
function getTextAfterIcon($card: any, $: cheerio.CheerioAPI, iconClass: string): string {
    const icon = $card.find(`i.${iconClass}`).first();
    if (icon.length === 0) return '';

    const parent = icon.parent();
    const html = parent.html() || '';

    // Find the icon's HTML
    const iconHtml = $.html(icon);
    const iconIndex = html.indexOf(iconHtml);
    if (iconIndex === -1) return '';

    // Get HTML after the icon
    const afterIcon = html.substring(iconIndex + iconHtml.length);

    // Find the next icon (if any) to stop at
    const nextIconMatch = afterIcon.match(/<i[^>]*>/);
    const textHtml = nextIconMatch ? afterIcon.substring(0, nextIconMatch.index) : afterIcon;

    // Extract text from the HTML segment
    return $('<div>').html(textHtml).text().trim();
}

/**
 * Parses a single card from the PrimeFaces datagrid into a Remate object
 * Uses the ACTUAL REMAJU card structure (icon + text pattern)
 * Does NOT look for "Expediente:" label - it doesn't exist in card view!
 */
function parseCard($card: any, $: cheerio.CheerioAPI): Remate {
    const remate: Remate = {};

    try {
        // Extract title with Remate N° - this is our primary identifier
        const titleElem = $card.find('span.text-bold.label-danger.h6');
        const titleText = titleElem.text().trim();
        const remateMatch = titleText.match(/Remate N°\s*(\d+)/);
        const remateNum = remateMatch ? remateMatch[1] : '';
        
        // Store Remate N° in remate_numero field (expediente is NOT in card view)
        // Expediente format is like "123/2024" - will be filled when viewing details
        if (remateNum) {
            remate.remate_numero = remateNum;
            // User confirmed: Use "Remate N° X" (e.g., "23313") as the expediente field
            // It's unique per convocatoria - use remateNum directly
            remate.expediente = remateNum;  // e.g., "23313" (not "REMATE-23313")
        }

        // Store the full title as description
        remate.descripcion = titleText;

        // Extract type (REMATE MÚLTIPLE, etc.) - text after gavel icon
        const tipoRemate = getTextAfterIcon($card, $, 'fa-gavel');
        if (tipoRemate) {
            remate.tipo_remate = tipoRemate;
        }

        // Extract location - text after map marker icon
        const ubicacion = getTextAfterIcon($card, $, 'fa-map-marker');
        if (ubicacion) {
            remate.ubicacion = ubicacion;
        }

        // Extract date - text after calendar icon
        const fechaText = getTextAfterIcon($card, $, 'fa-calendar-check-o');
        if (fechaText) {
            remate.fechaPresentacion = fechaText;
        }

        // Extract time - text after clock icon
        const horaText = getTextAfterIcon($card, $, 'fa-clock-o');

        // Combine date and time
        if (remate.fechaPresentacion && horaText) {
            const parsedDate = parseDate(remate.fechaPresentacion);
            if (parsedDate) {
                remate.fechaPresentacion = `${parsedDate}T${horaText}`;
            }
        }

        // Extract status (first .text-bold.titulo span)
        const statusElem = $card.find('span.text-bold.titulo').first();
        if (statusElem.length > 0) {
            remate.estado = statusElem.text().trim();
        }

        // Extract fase (last .text-bold.titulo span, if different from status)
        const tituloElems = $card.find('span.text-bold.titulo');
        if (tituloElems.length > 1) {
            const faseText = tituloElems.last().text().trim();
            if (faseText !== remate.estado) {
                remate.fase = faseText;
            }
        }

        // Extract description from texto-info-scroll
        const descElem = $card.find('div.texto-info-scroll label');
        if (descElem.length > 0) {
            remate.bienes = descElem.text().trim();
        }

        // Extract price - combine both spans in border-top-buttons
        const priceDiv = $card.find('div.border-top-buttons');
        if (priceDiv.length > 0) {
            const priceText = priceDiv.find('span.h4').text().trim().replace(/\s+/g, ' ');
            // Parse price - remove currency symbol and format
            const priceMatch = priceText.match(/([\d,\.]+)/);
            if (priceMatch) {
                const priceStr = priceMatch[1].replace(/,/g, '');
                const price = parseFloat(priceStr);
                if (!isNaN(price)) {
                    remate.precioBase = price;
                    remate.moneda = 'PEN'; // Sol peruano (S/.)
                }
            }
        }

        // Note: Expediente is NOT in the card - only available in detail view
        // If expediente is needed, the user must click "Detalle" button (slow!)
        if (!remate.expediente) {
            logger.warn('No Remate N° found in card', {
                cardPreview: titleText || $.html($card).substring(0, 200)
            });
        }

        return remate;

    } catch (error: any) {
        logger.warn('Error parsing card', { error: error.message });
        return remate; // Return partial data
    }
}

/**
 * Cleans text by removing extra whitespace and special characters
 */
function cleanText(text: string): string {
    if (!text) return '';
    return text
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/[\r\n\t]/g, '');
}

/**
 * Parses date string to ISO format
 */
function parseDate(dateStr: string): string {
    if (!dateStr) return '';
    
    try {
        // Try parsing common Argentine date formats
        // DD/MM/YYYY or DD-MM-YYYY
        const match = dateStr.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
        if (match) {
            const [, day, month, year] = match;
            return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        }
        
        // Try direct Date parsing
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
            return date.toISOString().split('T')[0];
        }
        
        return dateStr; // Return as-is if can't parse
    } catch {
        return dateStr;
    }
}

/**
 * Converts a Remate object to a DatabaseRow for SQLite storage
 * FIXED: Correct field mapping - tipo_remate from tipo_remate, not fase
 *         bienes should contain asset description only, NOT the title
 */
export function remateToDatabaseRow(remate: Remate): DatabaseRow {
    return {
        expediente: remate.expediente || 'unknown',
        remate_numero: remate.remate_numero || undefined,
        tipo_remate: remate.tipo_remate, // FIXED: Use tipo_remate, not fase
        fecha_remate: remate.fechaPresentacion,
        bienes: remate.bienes || '', // FIXED: Only use actual bienes field, not descripcion (title)
        estado: remate.estado,
        juzgado: remate.juzgado,
        direccion: remate.ubicacion,
        observaciones: remate.observaciones || '',
        scraped_at: remate.scrapedAt || new Date().toISOString(),
        source_url: remate.sourceUrl || ''
    };
}

/**
 * Converts multiple Remate objects to DatabaseRow array
 */
export function rematesToDatabaseRows(remates: Remate[]): DatabaseRow[] {
    return remates.map(remateToDatabaseRow);
}

/**
 * Validates a Remate object has required fields
 */
export function validateRemate(remate: Remate): { valid: boolean; missingFields: string[] } {
    const missingFields: string[] = [];
    
    // Either expediente or remate_numero must be present
    if (!remate.expediente && !remate.remate_numero) {
        missingFields.push('expediente or remate_numero');
    }
    if (!remate.juzgado) missingFields.push('juzgado');
    
    return {
        valid: missingFields.length === 0,
        missingFields
    };
}

/**
 * Extracts pagination information from PrimeFaces datagrid
 * FIXED: Updated for datagrid pagination (not datatable)
 *        Now uses "Total: X registros" text as highest priority (Strategy 0)
 */
export function extractPaginationInfo(html: string): {
    currentPage: number;
    totalPages: number;
    totalRows: number;
    hasNext: boolean;
} {
    // Load HTML with cheerio - MUST be outside try-catch so $ is accessible in catch block
    const $ = cheerio.load(html);
    
    try {
        // PrimeFaces paginator structure (same for datatable and datagrid)
        const paginator = $('.ui-paginator');
        
        if (paginator.length === 0) {
            // No paginator means single page
            return {
                currentPage: 1,
                totalPages: 1,
                totalRows: $('.ui-datagrid-column .card, .card').length,
                hasNext: false
            };
        }
        
        // Current page - look for active page button
        const activePage = paginator.find('.ui-paginator-page.ui-state-active, .ui-state-active[role="link"]');
        let currentPage = 1;
        
        if (activePage.length > 0) {
            const pageText = activePage.attr('aria-label') || activePage.text();
            const match = pageText.match(/(\d+)/);
            if (match) {
                currentPage = parseInt(match[1], 10);
            }
        }
        
        // Total pages - Strategy 0: Look for "Total: X registros" text (HIGHEST PRIORITY)
        // Example: "Total: 234 registros." - This gives us exact total records
        let totalPages = 1;
        let totalRows = 0;

        const paginatorText = paginator.text();

        const totalMatch = paginatorText.match(/Total:\s*(\d+)\s*registro/i);
        if (totalMatch) {
            totalRows = parseInt(totalMatch[1], 10);
            // Rows per page is 12 (as set in navigateToRemaju)
            const rowsPerPage = 12;
            totalPages = Math.ceil(totalRows / rowsPerPage);
        } else {
            // Strategy1: Look for "Página X de Y" (Spanish - REMAJU uses Spanish)
            const paginaMatch = paginatorText.match(/Página\s+(\d+)\s+de\s+(\d+)/i);
            if (paginaMatch) {
                totalPages = parseInt(paginaMatch[2], 10) || 1;
            } else {
                // Strategy2: Look for "Page X of Y" (English fallback)
                const pagesMatch = paginatorText.match(/Page\s+\d+\s+of\s+(\d+)/i);
                if (pagesMatch) {
                    totalPages = parseInt(pagesMatch[1], 10);
                } else {
                    // Strategy3: Count visible page buttons (fallback - may only show window of 5)
                    const pageButtons = paginator.find('.ui-paginator-page, a[role="link"][aria-label*="Page"]');
                    totalPages = pageButtons.length || 1;

                    // Strategy4: Check last page button
                    const lastPageBtn = paginator.find('.ui-paginator-last');
                    if (lastPageBtn.length > 0 && totalPages === 1) {
                        const lastPageData = lastPageBtn.attr('data-page');
                        if (lastPageData) {
                            totalPages = parseInt(lastPageData, 10) + 1;
                        }
                    }
                }
            }
        }
        
        // Total rows info (if not already set from "Total: X registros")
        if (totalRows === 0) {
            const statusBar = paginator.find('.ui-paginator-current');
            
            if (statusBar.length > 0) {
                const statusText = statusBar.text();
                const match = statusText.match(/(\d+)$/);
                if (match) {
                    totalRows = parseInt(match[1], 10);
                }
            }
        }
        
        // Check if there's a next button enabled
        const nextButton = paginator.find('.ui-paginator-next:not(.ui-state-disabled)');
        const hasNext = nextButton.length > 0 && currentPage < totalPages;
        
        return {
            currentPage,
            totalPages,
            totalRows,
            hasNext
        };
        
    } catch (error: any) {
        logger.warn('Failed to extract pagination info', { error: error.message });
        return {
            currentPage: 1,
            totalPages: 1,
            totalRows: $('.ui-datagrid-column .card, .card').length || 0,
            hasNext: false
        };
    }
}
