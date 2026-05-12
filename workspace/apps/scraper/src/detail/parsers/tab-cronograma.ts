/**
 * apps/scraper/src/detail/parsers/tab-cronograma.ts
 *
 * Parser de la pestaña "Cronograma" de la página de detalle.
 *
 * Entrada: innerHTML del tab Cronograma (Playwright: '[id$=":tbCronograma"]')
 *
 * ESTRUCTURA DEL HTML (PrimeFaces DataTable con 5 fases fijas):
 *   <tbody id="...:dtCronograma_data">
 *     <tr>
 *       <td>1</td>
 *       <td>Publicación e Inscripcion</td>
 *       <td>05/05/2026</td>
 *       <td>22/05/2026</td>
 *     </tr>
 *     <tr>... (fila 2: Presentación de Ofertas)</tr>
 *     <tr>... (fila 3: Calificación de Ofertas)</tr>
 *     <tr>... (fila 4: Acto de Remate)</tr>
 *     <tr>... (fila 5: Resultado del Remate)</tr>
 *   </tbody>
 *
 * Las fechas críticas para el scoring son:
 *   - Inscripción: fecha_fin → deadline para inscribirse
 *   - Ofertas: fecha_inicio/fin → ventana para ofertar
 */

import * as cheerio from 'cheerio';

// ============================================================================
// Tipos
// ============================================================================

export interface ParsedFase {
  fase_numero: number;
  fase_nombre: string;
  fecha_inicio: string | null;  // ISO date "YYYY-MM-DD"
  fecha_fin: string | null;     // ISO date "YYYY-MM-DD"
}

export interface TabCronogramaResult {
  fases: ParsedFase[];

  // Shortcuts de las fechas más usadas por el scoring (null si no se encontró)
  fecha_inicio_inscripcion: string | null;
  fecha_fin_inscripcion: string | null;
  fecha_inicio_ofertas: string | null;
  fecha_fin_ofertas: string | null;

  parse_warnings: string[];
}

// Índices de columna en el DataTable (0-based). VALIDAR con HTML real.
const COL = {
  NUMERO:  0,
  NOMBRE:  1,
  INICIO:  2,
  FIN:     3,
} as const;

// Patrones de nombre de fase para identificar las que nos importan
const FASE_INSCRIPCION = /publicaci[oó]n\s*(e|y)\s*inscripci[oó]n/i;
const FASE_OFERTAS     = /presentaci[oó]n\s*(de)?\s*ofertas/i;

// ============================================================================
// Parser principal
// ============================================================================

export function parseTabCronograma(html: string): TabCronogramaResult {
  const $ = cheerio.load(html);
  const warnings: string[] = [];
  const fases: ParsedFase[] = [];

  // Buscar el tbody del DataTable de cronograma
  const tbody = $('tbody[id$=":dtCronograma_data"]');

  if (tbody.length === 0) {
    warnings.push('no se encontró tbody[id$=":dtCronograma_data"] — usando primer tbody');
    parseRows($, $('tbody').first(), fases, warnings);
  } else {
    parseRows($, tbody, fases, warnings);
  }

  if (fases.length === 0) {
    warnings.push('no se encontraron fases en el cronograma');
  }

  // Extraer shortcuts
  const inscripcion = fases.find((f) => FASE_INSCRIPCION.test(f.fase_nombre));
  const ofertas     = fases.find((f) => FASE_OFERTAS.test(f.fase_nombre));

  if (!inscripcion) warnings.push('no se encontró fase de inscripción');
  if (!ofertas)     warnings.push('no se encontró fase de presentación de ofertas');

  return {
    fases,
    fecha_inicio_inscripcion: inscripcion?.fecha_inicio ?? null,
    fecha_fin_inscripcion:    inscripcion?.fecha_fin ?? null,
    fecha_inicio_ofertas:     ofertas?.fecha_inicio ?? null,
    fecha_fin_ofertas:        ofertas?.fecha_fin ?? null,
    parse_warnings: warnings,
  };
}

// ============================================================================
// Helpers
// ============================================================================

function parseRows(
  $: cheerio.CheerioAPI,
  tbody: cheerio.Cheerio<any>,
  fases: ParsedFase[],
  warnings: string[],
): void {
  tbody.find('tr').each((_, row) => {
    const cells = $(row).find('td');
    if (cells.length < 4) return; // header o fila vacía

    const getText = (col: number) => cells.eq(col).text().trim();

    const numeroRaw = getText(COL.NUMERO);
    const nombre    = getText(COL.NOMBRE);
    const inicioRaw = getText(COL.INICIO);
    const finRaw    = getText(COL.FIN);

    const fase_numero = parseInt(numeroRaw, 10);
    if (isNaN(fase_numero)) {
      warnings.push(`fila con número de fase inválido: "${numeroRaw}"`);
      return;
    }

    const fecha_inicio = parsePeruDate(inicioRaw);
    const fecha_fin    = parsePeruDate(finRaw);

    if (inicioRaw && !fecha_inicio)
      warnings.push(`fase ${fase_numero}: no se pudo parsear fecha inicio "${inicioRaw}"`);
    if (finRaw && !fecha_fin)
      warnings.push(`fase ${fase_numero}: no se pudo parsear fecha fin "${finRaw}"`);

    fases.push({ fase_numero, fase_nombre: nombre, fecha_inicio, fecha_fin });
  });
}

/**
 * "DD/MM/YYYY" → "YYYY-MM-DD"
 */
function parsePeruDate(raw: string): string | null {
  if (!raw) return null;
  const m = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}
