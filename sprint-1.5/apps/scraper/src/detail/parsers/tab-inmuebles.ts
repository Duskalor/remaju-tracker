/**
 * apps/scraper/src/detail/parsers/tab-inmuebles.ts
 *
 * Parser de la pestaña "Inmuebles" de la página de detalle.
 *
 * Entrada: innerHTML del tab Inmuebles (Playwright: '[id$=":tbInmuebles"]')
 *
 * ESTRUCTURA DEL HTML (PrimeFaces DataTable):
 *   <tbody id="...:dtInmuebles_data">
 *     <tr>
 *       <td>partida registral</td>
 *       <td>tipo inmueble</td>
 *       <td>dirección</td>
 *       <td>departamento</td>
 *       <td>provincia</td>
 *       <td>distrito</td>
 *       <td>cargas/gravámenes (texto largo)</td>
 *       <td>% a rematar</td>
 *       <td>N° imágenes</td>
 *     </tr>
 *     ... (puede haber N filas — un remate puede tener N inmuebles)
 *   </tbody>
 *
 * ⚠️ Los índices de columna (COL_*) son ESTIMACIONES. Validar contra el HTML
 *    real con el test en __tests__/tab-inmuebles.test.ts.
 */

import * as cheerio from 'cheerio';
import { parseCargas } from '../parsers/cargas';

// ============================================================================
// Tipos
// ============================================================================

export interface ParsedInmueble {
  partida_registral: string | null;
  tipo_inmueble: string | null;         // "DEPARTAMENTO", "CASA", "TERRENO", etc.
  direccion_completa: string | null;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;

  // Cargas — texto crudo Y flags parseados
  carga_gravamen_raw: string | null;
  num_cargas: number;
  tiene_hipoteca: boolean;
  tiene_embargo: boolean;
  embargo_terceros: boolean;

  porcentaje_rematar: number | null;    // 0-100
  num_imagenes: number | null;
}

export interface TabInmueblesResult {
  inmuebles: ParsedInmueble[];
  parse_warnings: string[];
}

// Índices de columna en el DataTable (0-based). VALIDAR con HTML real.
const COL = {
  PARTIDA:     0,
  TIPO:        1,
  DIRECCION:   2,
  DEPARTAMENTO: 3,
  PROVINCIA:   4,
  DISTRITO:    5,
  CARGAS:      6,
  PORCENTAJE:  7,
  IMAGENES:    8,
} as const;

// ============================================================================
// Parser principal
// ============================================================================

export function parseTabInmuebles(html: string): TabInmueblesResult {
  const $ = cheerio.load(html);
  const warnings: string[] = [];
  const inmuebles: ParsedInmueble[] = [];

  // Buscar el tbody del DataTable de inmuebles
  // El ID sigue el patrón JSF: "form:...:dtInmuebles_data"
  const tbody = $('tbody[id$=":dtInmuebles_data"]');

  if (tbody.length === 0) {
    // Fallback: cualquier tbody con filas que parezcan inmuebles
    warnings.push('no se encontró tbody[id$=":dtInmuebles_data"] — usando primer tbody con datos');
    const fallbackTbody = $('tbody').first();
    parseRows($, fallbackTbody, inmuebles, warnings);
  } else {
    parseRows($, tbody, inmuebles, warnings);
  }

  if (inmuebles.length === 0) {
    warnings.push('no se encontraron inmuebles en la pestaña');
  }

  return { inmuebles, parse_warnings: warnings };
}

// ============================================================================
// Helpers
// ============================================================================

function parseRows(
  $: cheerio.CheerioAPI,
  tbody: cheerio.Cheerio<cheerio.Element>,
  inmuebles: ParsedInmueble[],
  warnings: string[],
): void {
  tbody.find('tr').each((rowIdx, row) => {
    const cells = $(row).find('td');
    const cellCount = cells.length;

    if (cellCount < 7) {
      // Muy pocas celdas — probablemente header o fila vacía
      return;
    }

    const getText = (colIdx: number): string | null => {
      const el = cells.eq(colIdx);
      if (!el.length) return null;
      const text = el.text().trim().replace(/\s+/g, ' ');
      return text || null;
    };

    const partida_registral  = getText(COL.PARTIDA);
    const tipo_inmueble      = getText(COL.TIPO)?.toUpperCase() ?? null;
    const direccion_completa = getText(COL.DIRECCION);
    const departamento       = getText(COL.DEPARTAMENTO)?.toUpperCase() ?? null;
    const provincia          = getText(COL.PROVINCIA)?.toUpperCase() ?? null;
    const distrito           = getText(COL.DISTRITO)?.toUpperCase() ?? null;
    const carga_gravamen_raw = getText(COL.CARGAS);

    // Porcentaje: puede venir "100%", "100.00%", "100" — normalizamos a número
    const porcentajeRaw = getText(COL.PORCENTAJE);
    const porcentaje_rematar = parsePercent(porcentajeRaw);

    // Imágenes: número entero
    const imagenesRaw = getText(COL.IMAGENES);
    const num_imagenes = imagenesRaw ? parseInt(imagenesRaw.replace(/\D/g, ''), 10) : null;

    // Parsear cargas desde el texto crudo
    const cargas = parseCargas(carga_gravamen_raw ?? '');

    if (!partida_registral) {
      warnings.push(`fila ${rowIdx}: sin partida registral`);
    }

    inmuebles.push({
      partida_registral,
      tipo_inmueble,
      direccion_completa,
      departamento,
      provincia,
      distrito,
      carga_gravamen_raw,
      num_cargas: cargas.num,
      tiene_hipoteca: cargas.hipoteca,
      tiene_embargo: cargas.embargo,
      embargo_terceros: cargas.embargo_terceros,
      porcentaje_rematar: isNaN(porcentaje_rematar as number) ? null : porcentaje_rematar,
      num_imagenes: isNaN(num_imagenes as number) ? null : num_imagenes,
    });
  });
}

function parsePercent(raw: string | null): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/%/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}
