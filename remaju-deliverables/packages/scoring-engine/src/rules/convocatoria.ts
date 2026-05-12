/**
 * packages/scoring-engine/src/rules/convocatoria.ts
 *
 * Regla #2 — Convocatoria (peso 10%).
 *
 * 1ra convocatoria  → score 33  (estándar, sin descuento extra)
 * 2da convocatoria  → score 66  (15% adicional bajo de la 1ra)
 * 3ra convocatoria  → score 100 (otro 15% bajo, mejor precio)
 *
 * Pero ojo: 3ra convocatoria también significa "ya nadie lo compró antes".
 * Eso PUEDE ser oportunidad (precio cae sin que la calidad caiga) o señal
 * de que algo está mal con la propiedad. El cliente lo evalúa caso a caso.
 *
 * El scoring acá es solo por descuento, no juzga calidad.
 */

import type { RuleFunction, SubScore } from '../types';

export const convocatoria: RuleFunction = (input): Omit<SubScore, 'weight'> => {
  const { convocatoria } = input;

  if (!convocatoria) {
    return {
      rule: 'convocatoria',
      value: 33, // asumimos 1ra como default conservador
      reason: 'Convocatoria no especificada (asumida primera)',
      data_quality: 'missing',
    };
  }

  switch (convocatoria) {
    case 'PRIMERA':
      return {
        rule: 'convocatoria',
        value: 33,
        reason: 'Primera convocatoria (precio base estándar al 66% de tasación)',
        data_quality: 'high',
      };

    case 'SEGUNDA':
      return {
        rule: 'convocatoria',
        value: 66,
        reason: 'Segunda convocatoria (~15% descuento adicional sobre la primera)',
        data_quality: 'high',
      };

    case 'TERCERA':
      return {
        rule: 'convocatoria',
        value: 100,
        reason: 'Tercera convocatoria (mayor descuento — verificar por qué no se vendió antes)',
        data_quality: 'high',
      };

    default:
      return {
        rule: 'convocatoria',
        value: 33,
        reason: `Convocatoria desconocida: "${convocatoria}"`,
        data_quality: 'low',
      };
  }
};
