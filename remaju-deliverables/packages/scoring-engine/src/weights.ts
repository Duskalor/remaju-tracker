/**
 * packages/scoring-engine/src/weights.ts
 *
 * Config del scoring engine. Defaults razonables + función para cargar
 * desde JSON externo (para que el cliente pueda tunear sin redeploy).
 */

import type { ScoringConfig } from './types';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ============================================================================
// Config por defecto (v1.0)
// ============================================================================

export const DEFAULT_CONFIG: ScoringConfig = {
  version: 'v1.0',

  weights: {
    descuento_tasacion: 0.30, // peso ALTO: es la señal más fuerte para flip
    convocatoria: 0.10,
    riesgo_legal: 0.20, // peso medio-alto: deal-breaker si hay embargos
    porcentaje_rematar: 0.10,
    competencia: 0.10,
    tipo_inmueble: 0.10,
    tiempo_disponible: 0.05,
    completitud: 0.05,
  },

  filters: {
    exclude_porcentaje_rematar_under: 50, // <50% es muy riesgoso
    exclude_archived: true,
    exclude_failed: true,
    exclude_cerrado: true,
  },

  preferences: {
    departamentos_bonus: [], // vacío = no hay preferencia geográfica
    tipos_inmueble_bonus: ['DEPARTAMENTO', 'CASA'],
    min_score_visible: 40,
  },
};

// ============================================================================
// Loader desde JSON
// ============================================================================

/**
 * Carga config desde archivo JSON. Si no existe o está malformado, retorna
 * DEFAULT_CONFIG y loggea warning. Nunca tira excepción para no romper el
 * scoring por un typo en el config.
 */
export function loadConfig(configPath?: string): ScoringConfig {
  if (!configPath) return DEFAULT_CONFIG;

  try {
    const fullPath = path.resolve(configPath);
    if (!fs.existsSync(fullPath)) {
      console.warn(`[scoring] Config file not found at ${fullPath}, using defaults`);
      return DEFAULT_CONFIG;
    }

    const raw = fs.readFileSync(fullPath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<ScoringConfig>;

    // Merge con defaults (deep merge superficial: cada sección se reemplaza completa si está)
    const merged: ScoringConfig = {
      version: parsed.version ?? DEFAULT_CONFIG.version,
      weights: { ...DEFAULT_CONFIG.weights, ...parsed.weights },
      filters: { ...DEFAULT_CONFIG.filters, ...parsed.filters },
      preferences: { ...DEFAULT_CONFIG.preferences, ...parsed.preferences },
    };

    return merged;
  } catch (err) {
    console.warn(`[scoring] Failed to load config: ${err}. Using defaults.`);
    return DEFAULT_CONFIG;
  }
}

/**
 * Normaliza pesos para que sumen 1.0. Útil si el cliente puso pesos
 * que suman 0.95 o 1.10 — el resultado no se distorsiona.
 */
export function normalizeWeights(weights: ScoringConfig['weights']): ScoringConfig['weights'] {
  const sum = Object.values(weights).reduce((acc, w) => acc + w, 0);
  if (sum === 0) return weights;
  if (Math.abs(sum - 1.0) < 0.001) return weights; // ya está normalizado

  const normalized = { ...weights };
  for (const key of Object.keys(normalized) as (keyof ScoringConfig['weights'])[]) {
    normalized[key] = normalized[key] / sum;
  }
  return normalized;
}
