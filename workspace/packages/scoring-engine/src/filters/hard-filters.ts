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

  if (filters.exclude_archived && input.archived_at !== null) {
    return { excluded: true, reason: 'Archivado — ya no aparece en el portal' };
  }

  if (filters.exclude_failed && input.detail_extraction_failed) {
    return { excluded: true, reason: 'Extracción del detalle falló — datos no confiables' };
  }

  if (filters.exclude_cerrado && input.estado_temporal === 'cerrado') {
    return { excluded: true, reason: 'Remate ya cerrado' };
  }

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
