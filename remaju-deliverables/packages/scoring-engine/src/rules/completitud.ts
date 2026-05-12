/**
 * packages/scoring-engine/src/rules/completitud.ts
 *
 * Regla #8 — Completitud de datos (peso 5%).
 *
 * Es un meta-score que mide cuán confiable es el resto del scoring. Si un
 * remate tiene tasación y precio_base pero falta tipo_inmueble y cargas,
 * los otros sub-scores son menos confiables.
 *
 * Mide qué porcentaje de los campos críticos están poblados:
 *  - tasacion, precio_base, convocatoria
 *  - tipo_inmueble, distrito, porcentaje_rematar
 *  - num_cargas (no null)
 *  - fecha_fin_inscripcion
 *
 * 100% poblado → 100
 * <50% poblado → 30
 *
 * NOTA: este score NO debe ser excluyente — un remate con datos incompletos
 * sigue apareciendo en el ranking, solo con un disclaimer visible. La
 * decisión de si confiar o no es del cliente.
 */

import type { RuleFunction, SubScore } from '../types';

const CRITICAL_FIELDS: { key: string; check: (input: any) => boolean }[] = [
  { key: 'tasacion', check: (i) => i.tasacion !== null },
  { key: 'precio_base', check: (i) => i.precio_base !== null },
  { key: 'convocatoria', check: (i) => i.convocatoria !== null },
  { key: 'tipo_inmueble', check: (i) => i.inmueble?.tipo_inmueble != null },
  { key: 'distrito', check: (i) => i.inmueble?.distrito != null },
  { key: 'porcentaje_rematar', check: (i) => i.inmueble?.porcentaje_rematar != null },
  { key: 'cargas', check: (i) => i.inmueble != null },
  { key: 'fecha_fin_inscripcion', check: (i) => i.fecha_fin_inscripcion !== null },
];

export const completitud: RuleFunction = (input): Omit<SubScore, 'weight'> => {
  const total = CRITICAL_FIELDS.length;
  let populated = 0;
  const missing: string[] = [];

  for (const field of CRITICAL_FIELDS) {
    if (field.check(input)) {
      populated++;
    } else {
      missing.push(field.key);
    }
  }

  const ratio = populated / total;
  const value = Math.round(ratio * 100);

  let dataQuality: 'high' | 'medium' | 'low' | 'missing';
  if (ratio >= 0.9) dataQuality = 'high';
  else if (ratio >= 0.7) dataQuality = 'medium';
  else if (ratio >= 0.5) dataQuality = 'low';
  else dataQuality = 'missing';

  const reason =
    missing.length === 0
      ? `${populated}/${total} campos críticos poblados (data completa)`
      : `${populated}/${total} campos críticos poblados (faltan: ${missing.join(', ')})`;

  return {
    rule: 'completitud',
    value,
    reason,
    data_quality: dataQuality,
  };
};
