/**
 * Stage 2: Normalizers
 *
 * Estandariza los valores extraídos por los extractores.
 * Cada normalizador recibe un valor y devuelve su versión normalizada.
 */

import { ExtractedFields } from './extractors';

export interface NormalizedFields extends ExtractedFields {
  areaM2?: number;
}

/**
 * Normaliza el texto del distrito: uppercase consistente, sin espacios extra.
 */
function normalizeDistrito(valor?: string): string | undefined {
  if (!valor) return undefined;
  return valor.replace(/\s+/g, ' ').trim();
}

/**
 * Normaliza provincia.
 */
function normalizeProvincia(valor?: string): string | undefined {
  if (!valor) return undefined;
  return valor.replace(/\s+/g, ' ').trim();
}

/**
 * Normaliza departamento.
 */
function normalizeDepartamento(valor?: string): string | undefined {
  if (!valor) return undefined;
  return valor.replace(/\s+/g, ' ').trim();
}

/**
 * Normaliza partida registral: remueve espacios y puntos.
 * Ej: "Partida Electrónica N° P12345678" → "P12345678"
 */
function normalizePartida(valor?: string): string | undefined {
  if (!valor) return undefined;
  // Extraer solo el código alfanumérico (después de N°, N, etc.)
  const codigoMatch = valor.match(/(?:N|N\.|N°|Nº|NO\.?|N\s*°)\s*(P?[A-Z0-9][A-Z0-9\s\.-]{5,})$/i);
  if (codigoMatch) {
    return codigoMatch[1].replace(/\s+/g, '').replace(/\./g, '');
  }
  // Fallback: limpiar todo el string
  return valor.replace(/\s+/g, '').replace(/\./g, '');
}

/**
 * Normaliza área: convierte hectáreas a m².
 */
function normalizeArea(areaValor?: number, areaUnidad?: string): number | undefined {
  if (areaValor === undefined || areaUnidad === undefined) return undefined;

  if (areaUnidad === 'HA' || areaUnidad === 'HAS' || areaUnidad === 'HECTÁREAS' || areaUnidad === 'HECTAREAS') {
    return areaValor * 10000;
  }

  // Ya está en m² o metros cuadrados
  return areaValor;
}

/**
 * Aplica todos los normalizadores sobre los campos extraídos.
 */
export function normalizeAll(extracted: ExtractedFields): NormalizedFields {
  return {
    distrito: normalizeDistrito(extracted.distrito),
    provincia: normalizeProvincia(extracted.provincia),
    departamento: normalizeDepartamento(extracted.departamento),
    partidaRegistral: normalizePartida(extracted.partidaRegistral),
    areaValor: extracted.areaValor,
    areaUnidad: extracted.areaUnidad,
    areaM2: normalizeArea(extracted.areaValor, extracted.areaUnidad),
  };
}
