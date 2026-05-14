import * as cheerio from 'cheerio';
import { parseCargas } from '../parsers/cargas';

// ============================================================================
// Tipos
// ============================================================================

export interface ParsedInmueble {
  partida_registral: string | null;
  tipo_inmueble: string | null;
  direccion_completa: string | null;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;

  carga_gravamen_raw: string | null;
  num_cargas: number;
  tiene_hipoteca: boolean;
  tiene_embargo: boolean;
  embargo_terceros: boolean;

  porcentaje_rematar: number | null;
  num_imagenes: number | null;
}

export interface TabInmueblesResult {
  inmuebles: ParsedInmueble[];
  parse_warnings: string[];
}

// Columnas reales del DataTable (6 columnas — sin Departamento/Provincia/Distrito por fila)
const COL = {
  PARTIDA:    0,
  TIPO:       1,
  DIRECCION:  2,
  CARGAS:     3,
  PORCENTAJE: 4,
  IMAGENES:   5,
} as const;

// ============================================================================
// Parser principal
// ============================================================================

export function parseTabInmuebles(html: string): TabInmueblesResult {
  const $ = cheerio.load(html);
  const warnings: string[] = [];
  const inmuebles: ParsedInmueble[] = [];

  // Departamento/Provincia/Distrito están en el panelgrid superior del tab, no por fila
  const tabDepartamento = findPanelValue($, /^departamento$/i);
  const tabProvincia    = findPanelValue($, /^provincia$/i);
  const tabDistrito     = findPanelValue($, /^distrito$/i);

  // El DataTable usa id que termina en ":dtResumenInmueble_data"
  let tbody = $('tbody[id$=":dtResumenInmueble_data"]');
  if (tbody.length === 0) {
    warnings.push('no se encontró tbody[id$=":dtResumenInmueble_data"] — usando primer tbody con datos');
    tbody = $('tbody').first();
  }

  tbody.find('tr').each((rowIdx, row) => {
    const cells = $(row).find('td');
    if (cells.length < 5) return;

    // PrimeFaces DataTable reflow inserta span.ui-column-title en cada td — lo eliminamos
    const getText = (colIdx: number): string | null => {
      const cell = cells.eq(colIdx).clone();
      cell.find('span.ui-column-title').remove();
      const text = cell.text().trim().replace(/\s+/g, ' ');
      return text || null;
    };

    const partida_registral  = getText(COL.PARTIDA);
    const tipo_inmueble      = getText(COL.TIPO)?.toUpperCase() ?? null;
    const direccion_completa = getText(COL.DIRECCION);
    const carga_gravamen_raw = getText(COL.CARGAS);

    const porcentaje_rematar = parsePercent(getText(COL.PORCENTAJE));
    const imagenesRaw = getText(COL.IMAGENES);
    const num_imagenes = imagenesRaw ? parseInt(imagenesRaw.replace(/\D/g, ''), 10) : null;

    const cargas = parseCargas(carga_gravamen_raw ?? '');

    if (!partida_registral) {
      warnings.push(`fila ${rowIdx}: sin partida registral`);
    }

    inmuebles.push({
      partida_registral,
      tipo_inmueble,
      direccion_completa,
      departamento: tabDepartamento?.toUpperCase() ?? null,
      provincia:    tabProvincia?.toUpperCase() ?? null,
      distrito:     tabDistrito?.toUpperCase() ?? null,
      carga_gravamen_raw,
      num_cargas:       cargas.num,
      tiene_hipoteca:   cargas.hipoteca,
      tiene_embargo:    cargas.embargo,
      embargo_terceros: cargas.embargo_terceros,
      porcentaje_rematar: isNaN(porcentaje_rematar as number) ? null : porcentaje_rematar,
      num_imagenes:       isNaN(num_imagenes as number) ? null : num_imagenes,
    });
  });

  if (inmuebles.length === 0) {
    warnings.push('no se encontraron inmuebles en la pestaña');
  }

  return { inmuebles, parse_warnings: warnings };
}

// ============================================================================
// Helpers
// ============================================================================

// Busca en div.text-bold (label) → siguiente div hermano (valor)
function findPanelValue($: cheerio.CheerioAPI, labelRegex: RegExp): string | null {
  let found: string | null = null;
  $('div.text-bold').each((_, el) => {
    if (labelRegex.test($(el).text().trim())) {
      const val = $(el).next('div').text().trim();
      if (val) { found = val; return false; }
    }
  });
  return found;
}

function parsePercent(raw: string | null): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/%/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}
