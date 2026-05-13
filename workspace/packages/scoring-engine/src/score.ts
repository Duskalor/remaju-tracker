import type { RemateInput, ScoreResult, ScoringConfig, SubScore } from './types';
import { DEFAULT_CONFIG, normalizeWeights } from './weights';
import { applyHardFilters } from './filters/hard-filters';
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

export function scoreRemate(
  input: RemateInput,
  config: ScoringConfig = DEFAULT_CONFIG,
): ScoreResult {
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

  const weights = normalizeWeights(config.weights);
  const subscores: SubScore[] = [];

  for (const { fn, weightKey } of RULES) {
    const partial = fn(input);
    subscores.push({ ...partial, weight: weights[weightKey] });
  }

  let total = subscores.reduce((acc, s) => acc + s.value * s.weight, 0);

  const { preferences } = config;

  if (preferences.departamentos_bonus.length > 0 && input.inmueble?.departamento) {
    const dept = input.inmueble.departamento.toUpperCase();
    if (preferences.departamentos_bonus.some((d) => d.toUpperCase() === dept)) {
      total += 5;
    }
  }

  if (preferences.tipos_inmueble_bonus.length > 0 && input.inmueble?.tipo_inmueble) {
    const tipo = input.inmueble.tipo_inmueble.toUpperCase();
    if (preferences.tipos_inmueble_bonus.some((t) => t.toUpperCase() === tipo)) {
      total += 3;
    }
  }

  return {
    score: Math.min(100, Math.round(total)),
    version: config.version,
    computed_at: new Date().toISOString(),
    excluded: false,
    subscores,
  };
}

export function scoreRemates(
  inputs: RemateInput[],
  config: ScoringConfig = DEFAULT_CONFIG,
): { input: RemateInput; result: ScoreResult }[] {
  return inputs.map((input) => ({ input, result: scoreRemate(input, config) }));
}
