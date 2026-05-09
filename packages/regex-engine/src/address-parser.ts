/**
 * Address Parser — Extracción de dirección por componentes
 *
 * En lugar de intentar parsear una dirección completa con un solo regex,
 * separa en componentes individuales (tipo_vía, urbanización, manzana, lote, etc.)
 * y reconstruye una dirección normalizada.
 *
 * Uso:
 *   const comps = parseAddress(textoBienes);
 *   // comps.tipoVia, comps.urbanizacion, comps.manzana, etc.
 */

import { DireccionComponentes } from '@remaju/shared';

// --------------- Regex Patterns ---------------

const TIPO_VIA_RE = /\b(CALLE|JR\.?|JIRÓN|AV\.?|AVENIDA|PASAJE|CARRETERA|PROLONGACIÓN)\b/i;

const URBANIZACION_RE = /\b(URB\.?|URBANIZACI[ÓO]N)\s+([A-ZÁÉÍÓÚÑ0-9\s\-]+)/i;

const MANZANA_RE = /\bMZ\.?\s*([A-Z0-9]+)/i;

const LOTE_RE = /\b(LT\.?|LOTE)\s*([A-Z0-9]+)/i;

const NUMERO_RE = /\b(N°|NRO\.?|NÚMERO)\s*([A-Z0-9\-]+)/i;

const SN_RE = /\bS\/N\b/i;

// --------------- Component Extractors ---------------

function extractTipoVia(text: string): string | undefined {
  const match = text.match(TIPO_VIA_RE);
  if (!match) return undefined;
  return match[1].toUpperCase().replace(/\.$/, '');
}

/**
 * Extrae el nombre de la vía por heurística:
 * busca el texto entre el tipo de vía y el próximo patrón conocido.
 */
function extractNombreVia(text: string): string | undefined {
  const tipoMatch = text.match(TIPO_VIA_RE);
  if (!tipoMatch) return undefined;

  const afterTipo = text.substring(tipoMatch.index! + tipoMatch[0].length).trim();

  // Buscar el próximo patrón delimitador conocido
  const delimiters: RegExp[] = [
    URBANIZACION_RE,
    MANZANA_RE,
    LOTE_RE,
    NUMERO_RE,
    SN_RE,
    /\bDISTRITO\b/i,
    /\bPROVINCIA\b/i,
    /\bDEPARTAMENTO\b/i,
    /\bPARTIDA\b/i,
  ];

  let earliestIndex = afterTipo.length;

  for (const delim of delimiters) {
    const match = afterTipo.match(delim);
    if (match && match.index! < earliestIndex) {
      earliestIndex = match.index!;
    }
  }

  const nombreVia = afterTipo.substring(0, earliestIndex).trim();
  return nombreVia || undefined;
}

function extractUrbanizacion(text: string): string | undefined {
  const match = text.match(URBANIZACION_RE);
  if (!match) return undefined;
  return match[2].trim();
}

function extractManzana(text: string): string | undefined {
  const match = text.match(MANZANA_RE);
  if (!match) return undefined;
  return match[1].toUpperCase();
}

function extractLote(text: string): string | undefined {
  const match = text.match(LOTE_RE);
  if (!match) return undefined;
  return match[2].toUpperCase();
}

function extractNumero(text: string): string | undefined {
  const match = text.match(NUMERO_RE);
  if (!match) return undefined;
  return match[2].toUpperCase();
}

function extractSN(text: string): boolean | undefined {
  const match = text.match(SN_RE);
  return match ? true : undefined;
}

// --------------- Main ---------------

/**
 * Parsea el texto de bienes y extrae componentes de dirección.
 * Cada componente se extrae independientemente (fallo silencioso si no hay match).
 *
 * @param text - Texto raw de bienes (descripción del remate)
 * @returns DireccionComponentes con los campos encontrados
 */
export function parseAddress(text: string): DireccionComponentes {
  return {
    tipoVia: extractTipoVia(text),
    nombreVia: extractNombreVia(text),
    urbanizacion: extractUrbanizacion(text),
    manzana: extractManzana(text),
    lote: extractLote(text),
    numero: extractNumero(text),
    sn: extractSN(text),
  };
}

/**
 * Reconstruye una dirección normalizada a partir de los componentes.
 * Solo incluye los componentes no-nulos.
 *
 * @param comps - Componentes de dirección
 * @returns Dirección normalizada como string, o undefined si no hay componentes
 */
export function buildAddress(comps: DireccionComponentes): string | undefined {
  const parts: string[] = [];

  if (comps.tipoVia) parts.push(comps.tipoVia);
  if (comps.nombreVia) parts.push(comps.nombreVia);
  if (comps.urbanizacion) parts.push(`URB. ${comps.urbanizacion}`);
  if (comps.manzana) parts.push(`MZ ${comps.manzana}`);
  if (comps.lote) parts.push(`LT ${comps.lote}`);
  if (comps.numero) parts.push(`N° ${comps.numero}`);
  if (comps.sn) parts.push('S/N');

  if (parts.length === 0) return undefined;
  return parts.join(' ');
}
