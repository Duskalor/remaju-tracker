/**
 * packages/scoring-engine/src/filters/hard-filters.ts
 *
 * Filtros duros: condiciones que EXCLUYEN un remate del ranking en lugar de
 * solo penalizarlo. Si un filtro dispara, el remate no se rankea — el cliente
 * no debería verlo en su lista de oportunidades.
 *
 * Diferencia con sub-scores:
 *   - Sub-score: "este es peor que ese" → 30 vs 80, pero ambos visibles.
 *   - Hard filter: "este no debería estar en la lista" → invisible.
 */

import type { RemateInput, ScoringConfig } from '../types';

export interface FilterResult {
  excluded: boolean;
  reason?: string;
}

export function applyHardFilters(
  input: RemateInput,
  config: ScoringConfig,
): FilterResult {
  const { filters } = config;

  // Filtro 1: archivado (ya no aparece en el portal)
  if (filters.exclude_archived && input.archived_at !== null) {
    return {
      excluded: true,
      reason: 'Archivado — ya no aparece en el portal',
    };
  }

  // Filtro 2: extracción del detalle falló
  if (filters.exclude_failed && input.detail_extraction_failed) {
    return {
      excluded: true,
      reason: 'Extracción del detalle falló — datos no confiables',
    };
  }

  // Filtro 3: remate cerrado (ya pasó la fecha de ofertas)
  if (filters.exclude_cerrado && input.estado_temporal === 'cerrado') {
    return {
      excluded: true,
      reason: 'Remate ya cerrado',
    };
  }

  // Filtro 4: porcentaje a rematar muy bajo
  if (
    input.inmueble?.porcentaje_rematar !== null &&
    input.inmueble?.porcentaje_rematar !== undefined &&
    input.inmueble.porcentaje_rematar < filters.exclude_porcentaje_rematar_under
  ) {
    return {
      excluded: true,
      reason: `Solo se remata ${input.inmueble.porcentaje_rematar}% del inmueble (umbral: ${filters.exclude_porcentaje_rematar_under}%)`,
    };
  }

  return { excluded: false };
}
