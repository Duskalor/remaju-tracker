import type { ScoringConfig } from './types';
import * as fs from 'node:fs';
import * as path from 'node:path';

export const DEFAULT_CONFIG: ScoringConfig = {
  version: 'v1.0',

  weights: {
    descuento_tasacion: 0.30,
    convocatoria: 0.10,
    riesgo_legal: 0.20,
    porcentaje_rematar: 0.10,
    competencia: 0.10,
    tipo_inmueble: 0.10,
    tiempo_disponible: 0.05,
    completitud: 0.05,
  },

  filters: {
    exclude_porcentaje_rematar_under: 50,
    exclude_archived: true,
    exclude_failed: true,
    exclude_cerrado: true,
  },

  preferences: {
    departamentos_bonus: [],
    tipos_inmueble_bonus: ['DEPARTAMENTO', 'CASA'],
    min_score_visible: 40,
  },
};

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

    return {
      version: parsed.version ?? DEFAULT_CONFIG.version,
      weights: { ...DEFAULT_CONFIG.weights, ...parsed.weights },
      filters: { ...DEFAULT_CONFIG.filters, ...parsed.filters },
      preferences: { ...DEFAULT_CONFIG.preferences, ...parsed.preferences },
    };
  } catch (err) {
    console.warn(`[scoring] Failed to load config: ${err}. Using defaults.`);
    return DEFAULT_CONFIG;
  }
}

export function normalizeWeights(weights: ScoringConfig['weights']): ScoringConfig['weights'] {
  const sum = Object.values(weights).reduce((acc, w) => acc + w, 0);
  if (sum === 0) return weights;
  if (Math.abs(sum - 1.0) < 0.001) return weights;

  const normalized = { ...weights };
  for (const key of Object.keys(normalized) as (keyof ScoringConfig['weights'])[]) {
    normalized[key] = normalized[key] / sum;
  }
  return normalized;
}
