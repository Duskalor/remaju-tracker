/**
 * Stage 3: Heuristics
 *
 * Infiere información útil a partir de los campos ya extraídos y normalizados.
 * No usa regex — solo lógica de negocio.
 */

import type { NormalizedFields } from '@remaju/regex-engine';

export interface HeuristicFields extends NormalizedFields {
  precioPorM2?: number;
  tipoInmueble?: string;
  esBarato?: boolean;
}

const BARATO_THRESHOLD = 500; // USD/m² — ajustable

/**
 * Patrones para detectar tipo de inmueble en el texto.
 * Ordenados por especificidad (de más específico a menos).
 */
const TIPO_INMUEBLE_PATTERNS: Array<{ regex: RegExp; tipo: string }> = [
  { regex: /\b(?:departamento|departamento\s+uni)familiar\b/i, tipo: 'departamento' },
  { regex: /\bcasa\s+(?:habitaci[oó]n|hogar|familiar|playa|campo|independiente)\b/i, tipo: 'casa' },
  { regex: /\bcasa\b/i, tipo: 'casa' },
  { regex: /\bterreno\s+(?:r[uú]stico|urbano|er[iá]zzo|sin\s+construir)\b/i, tipo: 'terreno' },
  { regex: /\bterreno\b/i, tipo: 'terreno' },
  { regex: /\blocal\s+(?:comercial|industrial|venta|oficina)\b/i, tipo: 'local' },
  { regex: /\blocal\b/i, tipo: 'local' },
  { regex: /\boficina\b/i, tipo: 'oficina' },
  { regex: /\b(?:lote|terreno)\s+de\s+(?:terreno|superficie)\b/i, tipo: 'terreno' },
  { regex: /\bedificio\b/i, tipo: 'edificio' },
  { regex: /\b(?:fundo|hacienda|predio\s+r[uú]stico)\b/i, tipo: 'fundo' },
  { regex: /\bestacionamiento\b/i, tipo: 'estacionamiento' },
  { regex: /\bdep[eé]sito\b/i, tipo: 'deposito' },
  { regex: /\binmueble\s+(?:comercial|industrial)\b/i, tipo: 'local' },
];

/**
 * Detecta tipo de inmueble a partir del texto raw de bienes.
 */
function detectarTipoInmueble(texto: string): string | undefined {
  for (const pattern of TIPO_INMUEBLE_PATTERNS) {
    if (pattern.regex.test(texto)) {
      return pattern.tipo;
    }
  }
  return undefined;
}

/**
 * Calcula precio por m².
 */
function calcularPrecioPorM2(precioBase?: number, areaM2?: number): number | undefined {
  if (precioBase === undefined || areaM2 === undefined || areaM2 === 0) {
    return undefined;
  }
  return Math.round(precioBase / areaM2);
}

/**
 * Determina si un remate es sospechosamente barato.
 * Usa un umbral configurable de precio por m².
 */
function esBarato(precioPorM2?: number, _umbral?: number): boolean | undefined {
  if (precioPorM2 === undefined) return undefined;
  const threshold = _umbral ?? BARATO_THRESHOLD;
  return precioPorM2 < threshold;
}

/**
 * Aplica todas las heurísticas sobre los campos normalizados.
 *
 * @param normalized - Campos normalizados del stage 2
 * @param precioBase - Precio base del remate (opcional)
 * @param textoBienes - Texto raw de bienes para detectar tipo de inmueble
 * @param umbralBarato - Umbral opcional para precio/m² considerado "barato"
 */
export function applyHeuristics(
  normalized: NormalizedFields,
  textoBienes: string,
  precioBase?: number,
  umbralBarato?: number,
): HeuristicFields {
  const precioPorM2 = calcularPrecioPorM2(precioBase, normalized.areaM2);

  return {
    ...normalized,
    precioPorM2,
    tipoInmueble: detectarTipoInmueble(textoBienes),
    esBarato: esBarato(precioPorM2, umbralBarato),
  };
}
