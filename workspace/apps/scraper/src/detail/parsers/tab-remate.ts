/**
 * apps/scraper/src/detail/parsers/tab-remate.ts
 *
 * Parser de la pestaña "Remate" de la página de detalle.
 *
 * Entrada: innerHTML del tab Remate (lo que retorna Playwright después de
 *          page.locator('[id$=":tbRemate"]').innerHTML())
 *
 * Salida: TabRemateResult con todos los campos económicos y legales.
 *
 * ESTRUCTURA DEL HTML (PrimeFaces panelGrid típico del portal REMAJU):
 *   El portal usa tablas de dos columnas: celda izquierda = label, celda
 *   derecha = valor. Los IDs siguen el patrón JSF ":outputText_NNN".
 *   Usamos texto del label para encontrar el valor — más estable que IDs.
 *
 * ⚠️  IMPORTANTE: Los selectores son estimaciones basadas en el patrón
 *   PrimeFaces del portal. VALIDAR contra el HTML real antes de usar en prod.
 *   El test en __tests__/tab-remate.test.ts te guía para hacerlo.
 */

import * as cheerio from 'cheerio';

// ============================================================================
// Tipos
// ============================================================================

export interface TabRemateResult {
  // Identificación legal
  expediente: string | null;          // "01339-2024-0-1401-JR-CI-02"
  distrito_judicial: string | null;   // "LAMBAYEQUE"
  juzgado_completo: string | null;    // "1° JUZGADO CIVIL - CHICLAYO"
  juez: string | null;
  especialista: string | null;
  materia: string | null;             // "OBLIGACION DE DAR SUMA DE DINERO"

  // Datos del remate
  convocatoria: 'PRIMERA' | 'SEGUNDA' | 'TERCERA' | null;
  tipo_remate: string | null;         // "REMATE SIMPLE"

  // Datos económicos (en soles)
  tasacion: number | null;
  precio_base: number | null;
  incremento_oferta: number | null;
  arancel: number | null;
  oblaje: number | null;

  // Participantes
  num_inscritos: number | null;

  // Resolución
  resolucion_numero: string | null;
  resolucion_fecha: string | null;    // ISO date
  resolucion_pdf_url: string | null;

  // Descripción larga del bien
  descripcion_detalle: string | null;

  parse_warnings: string[];
}

// ============================================================================
// Parser principal
// ============================================================================

export function parseTabRemate(html: string): TabRemateResult {
  const $ = cheerio.load(html);
  const warnings: string[] = [];

  // Estrategia: buscar el valor buscando la celda de label y tomando la
  // celda hermana siguiente. El helper findValueByLabel hace esto.

  const expediente = findValueByLabel($, /expediente/i) ??
    findValueByLabel($, /nro\.\s*expediente/i);

  const distrito_judicial = findValueByLabel($, /distrito judicial/i);
  const juzgado_completo  = findValueByLabel($, /[oó]rgano\s*jurisdisc|juzgado/i);
  const juez              = findValueByLabel($, /^juez$/i);
  const especialista      = findValueByLabel($, /especialista/i);
  const materia           = findValueByLabel($, /materia/i);

  // Convocatoria
  const convocatoriaRaw = findValueByLabel($, /convocatoria/i);
  const convocatoria = parseConvocatoria(convocatoriaRaw);

  const tipo_remate = findValueByLabel($, /tipo\s*(de)?\s*remate/i);

  // Valores monetarios
  const tasacionRaw       = findValueByLabel($, /tasaci[oó]n/i);
  const precioBaseRaw     = findValueByLabel($, /precio\s*base/i);
  const incrementoRaw     = findValueByLabel($, /incremento/i);
  const arancelRaw        = findValueByLabel($, /arancel/i);
  const oblajeRaw         = findValueByLabel($, /oblaje/i);

  const tasacion         = parseSoles(tasacionRaw);
  const precio_base      = parseSoles(precioBaseRaw);
  const incremento_oferta = parseSoles(incrementoRaw);
  const arancel          = parseSoles(arancelRaw);
  const oblaje           = parseSoles(oblajeRaw);

  if (tasacionRaw && tasacion === null)
    warnings.push(`no se pudo parsear tasación: "${tasacionRaw}"`);
  if (precioBaseRaw && precio_base === null)
    warnings.push(`no se pudo parsear precio_base: "${precioBaseRaw}"`);

  // Inscritos
  const inscritosRaw = findValueByLabel($, /inscritos?/i) ??
    findValueByLabel($, /participantes?/i);
  const num_inscritos = inscritosRaw ? parseInt(inscritosRaw.replace(/\D/g, ''), 10) : null;

  // Resolución — el label en el portal es simplemente "Resolución"
  const resolucion_numero  = findValueByLabel($, /^resoluci[oó]n$/i);
  const resolucionFechaRaw = findValueByLabel($, /fecha\s*(de\s*)?resoluci[oó]n/i);
  const resolucion_fecha   = parsePeruDate(resolucionFechaRaw);

  // PDF url — puede ser un <a> dentro de la celda
  const resolucion_pdf_url = findPdfLink($, /resoluci[oó]n/i);

  // Descripción larga
  const descripcion_detalle = findValueByLabel($, /descripci[oó]n/i) ??
    findValueByLabel($, /bien(es)?/i);

  // Validaciones mínimas
  if (!expediente)    warnings.push('no se encontró expediente');
  if (!tasacion)      warnings.push('no se encontró tasación');
  if (!precio_base)   warnings.push('no se encontró precio_base');

  return {
    expediente,
    distrito_judicial,
    juzgado_completo,
    juez,
    especialista,
    materia,
    convocatoria,
    tipo_remate,
    tasacion,
    precio_base,
    incremento_oferta,
    arancel,
    oblaje,
    num_inscritos: isNaN(num_inscritos as number) ? null : num_inscritos,
    resolucion_numero,
    resolucion_fecha,
    resolucion_pdf_url,
    descripcion_detalle,
    parse_warnings: warnings,
  };
}

// ============================================================================
// Helpers
// ============================================================================

// Layout real del portal: div.text-bold (label) + siguiente div hermano (valor)
// Estructura: <div class="ui-g"><div class="... text-bold">Label</div><div class="...">Valor</div></div>
function findValueByLabel($: cheerio.CheerioAPI, labelRegex: RegExp): string | null {
  let found: string | null = null;
  $('div.text-bold').each((_, el) => {
    if (labelRegex.test($(el).text().trim())) {
      const val = $(el).next('div').text().trim().replace(/\s+/g, ' ');
      if (val) {
        found = val;
        return false;
      }
    }
  });
  return found;
}

// El PDF se descarga vía form submit (onclick), no hay href real — retorna null.
function findPdfLink($: cheerio.CheerioAPI, _labelRegex: RegExp): string | null {
  return null;
}

/**
 * Parsea montos en soles. Formatos comunes del portal:
 *   "S/ 150,000.00"  →  150000
 *   "S/.150000.00"   →  150000
 *   "150,000"        →  150000
 */
function parseSoles(raw: string | null): number | null {
  if (!raw) return null;
  // Eliminar símbolo de moneda (S/., $, USD, etc.) y separadores de miles
  const cleaned = raw.replace(/^[^\d]+/, '').replace(/,/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * Parsea fecha formato "DD/MM/YYYY" → "YYYY-MM-DD".
 */
function parsePeruDate(raw: string | null): string | null {
  if (!raw) return null;
  const m = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

function parseConvocatoria(raw: string | null): 'PRIMERA' | 'SEGUNDA' | 'TERCERA' | null {
  if (!raw) return null;
  const upper = raw.toUpperCase();
  if (upper.includes('PRIMERA')) return 'PRIMERA';
  if (upper.includes('SEGUNDA')) return 'SEGUNDA';
  if (upper.includes('TERCERA')) return 'TERCERA';
  return null;
}
