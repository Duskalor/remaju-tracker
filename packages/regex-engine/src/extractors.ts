/**
 * Stage 1: Regex Extractors
 *
 * Extrae campos estructurados del texto raw de bienes/descripción.
 * Cada extractor es autónomo, tolerante, y devuelve null si no hay match.
 */

// --------------- Regex Patterns ---------------

const DISTRITO_RE = /distrito\s+(?:de\s+(?:los\s+)?|del\s+)([A-ZÁÉÍÓÚÑa-záéíóúñ\s\-–—']+?)(?:[.,;]|$|\s+(?:provincia|departamento|partida|calle|jr\.|av\.|pasaje|avenida|jirón|n°|nº|nro|inscrito|con))/i;

const PROVINCIA_RE = /(?:provincia\s+(?:de\s+|del\s+))([A-ZÁÉÍÓÚÑa-záéíóúñ\s\-–—']+?)(?:[.,;]|$|\s+(?:departamento|partida|calle|jr\.|av\.|pasaje|avenida|jirón|n°|nº|nro|inscrito|con))/i;

const PROVINCIA_ALT_RE = /provincia\s+y\s+departamento\s+de\s+([A-ZÁÉÍÓÚÑa-záéíóúñ\s\-–—']+?)(?:[.,;]|$|\s+(?:partida|calle|jr\.|av\.|pasaje|avenida|jirón|n°|nº|nro|inscrito|con))/i;

const DEPARTAMENTO_RE = /(?:departamento\s+(?:de\s+|del\s+))([A-ZÁÉÍÓÚÑa-záéíóúñ\s\-–—']+?)(?:[.,;]|$|\s+(?:partida|calle|jr\.|av\.|pasaje|avenida|jirón|n°|nº|nro|inscrito|con))/i;

const PARTIDA_RE = /Partida\s+(?:Electr[oó]nica|Registral)?\s*(?:N|N\.|N°|Nº|NO\.?|N\s*°)?\s*(P?[A-Z0-9][A-Z0-9\s\.-]{5,})/i;

const AREA_RE = /(\d+[.,]?\d*)\s*(M2|m2|metros\s+cuadrados|HA|HAS|Hect[áa]reas)/i;

// --------------- Extracted Fields Interface ---------------

export interface ExtractedFields {
  distrito?: string;
  provincia?: string;
  departamento?: string;
  partidaRegistral?: string;
  areaValor?: number;
  areaUnidad?: string;
}

// --------------- Individual Extractors ---------------

function extractDistrito(text: string): string | undefined {
  const match = text.match(DISTRITO_RE);
  if (!match) return undefined;
  return match[1].trim();
}

function extractProvincia(text: string): string | undefined {
  // Try alternate pattern first (provincia y departamento de X)
  const altMatch = text.match(PROVINCIA_ALT_RE);
  if (altMatch) return altMatch[1].trim();

  const match = text.match(PROVINCIA_RE);
  if (!match) return undefined;
  return match[1].trim();
}

function extractDepartamento(text: string): string | undefined {
  const match = text.match(DEPARTAMENTO_RE);
  if (!match) return undefined;
  return match[1].trim();
}

function extractPartidaRegistral(text: string): string | undefined {
  const match = text.match(PARTIDA_RE);
  if (!match) return undefined;
  return match[0].trim();
}

function extractArea(text: string): { valor?: number; unidad?: string } {
  const match = text.match(AREA_RE);
  if (!match) return {};

  const rawValor = match[1].replace(',', '.');
  const valor = parseFloat(rawValor);
  if (isNaN(valor)) return {};

  const unidad = match[2].toUpperCase();
  return { valor, unidad };
}

// --------------- Orchestrator ---------------

/**
 * Ejecuta todos los extractores sobre el texto dado.
 * Cada extractor falla silenciosamente si no encuentra match.
 */
export function extractAll(text: string): ExtractedFields {
  const area = extractArea(text);

  return {
    distrito: extractDistrito(text),
    provincia: extractProvincia(text),
    departamento: extractDepartamento(text),
    partidaRegistral: extractPartidaRegistral(text),
    areaValor: area.valor,
    areaUnidad: area.unidad,
  };
}
