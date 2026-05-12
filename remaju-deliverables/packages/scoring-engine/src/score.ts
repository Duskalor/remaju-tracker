/**
 * packages/scoring-engine/src/score.ts
 *
 * Orquestador del scoring. Aplica filtros duros, ejecuta cada regla,
 * pondera con los pesos del config, y retorna un ScoreResult con el
 * breakdown completo.
 */

import type {
  RemateInput,
  ScoreResult,
  ScoringConfig,
  SubScore,
} from './types';
import { DEFAULT_CONFIG, normalizeWeights } from './weights';
import { applyHardFilters } from './filters/hard-filters';

// Reglas
import { descuentoTasacion } from './rules/descuento-tasacion';
import { convocatoria } from './rules/convocatoria';
import { riesgoLegal } from './rules/riesgo-legal';
import { porcentajeRematar } from './rules/porcentaje-rematar';
import { competencia } from './rules/competencia';
import { tipoInmueble } from './rules/tipo-inmueble';
import { tiempoDisponible } from './rules/tiempo-disponible';
import { completitud } from './rules/completitud';

const RULES = [
  { fn: descuentoTasacion, weightKey: 'descuento_tasacion' as const },
  { fn: convocatoria, weightKey: 'convocatoria' as const },
  { fn: riesgoLegal, weightKey: 'riesgo_legal' as const },
  { fn: porcentajeRematar, weightKey: 'porcentaje_rematar' as const },
  { fn: competencia, weightKey: 'competencia' as const },
  { fn: tipoInmueble, weightKey: 'tipo_inmueble' as const },
  { fn: tiempoDisponible, weightKey: 'tiempo_disponible' as const },
  { fn: completitud, weightKey: 'completitud' as const },
];

/**
 * Scorea un remate. Función pura — mismo input siempre da mismo output.
 */
export function scoreRemate(
  input: RemateInput,
  config: ScoringConfig = DEFAULT_CONFIG,
): ScoreResult {
  // 1. Filtros duros
  const filterResult = applyHardFilters(input, config);
  if (filterResult.excluded) {
    return {
      score: 0,
      version: config.version,
      computed_at: new Date().toISOString(),
      excluded: true,
      exclusion_reason: filterResult.reason,
      subscores: [],
    };
  }

  // 2. Ejecutar reglas
  const weights = normalizeWeights(config.weights);
  const subscores: SubScore[] = [];

  for (const { fn, weightKey } of RULES) {
    const partial = fn(input);
    const weight = weights[weightKey];
    subscores.push({ ...partial, weight });
  }

  // 3. Combinar con pesos
  let total = 0;
  for (const sub of subscores) {
    total += sub.value * sub.weight;
  }

  // 4. Aplicar bonus de preferencias (departamentos, tipos)
  let bonus = 0;
  const { preferences } = config;

  if (preferences.departamentos_bonus.length > 0 && input.inmueble?.departamento) {
    const dept = input.inmueble.departamento.toUpperCase();
    if (preferences.departamentos_bonus.some((d) => d.toUpperCase() === dept)) {
      bonus += 5;
    }
  }

  if (preferences.tipos_inmueble_bonus.length > 0 && input.inmueble?.tipo_inmueble) {
    const tipo = input.inmueble.tipo_inmueble.toUpperCase();
    if (preferences.tipos_inmueble_bonus.some((t) => t.toUpperCase() === tipo)) {
      bonus += 3;
    }
  }

  const finalScore = Math.min(100, Math.round(total + bonus));

  return {
    score: finalScore,
    version: config.version,
    computed_at: new Date().toISOString(),
    excluded: false,
    subscores,
  };
}

/**
 * Scorea un batch de remates. Útil para el comando `pnpm rescore`.
 */
export function scoreRemates(
  inputs: RemateInput[],
  config: ScoringConfig = DEFAULT_CONFIG,
): { input: RemateInput; result: ScoreResult }[] {
  return inputs.map((input) => ({
    input,
    result: scoreRemate(input, config),
  }));
}
