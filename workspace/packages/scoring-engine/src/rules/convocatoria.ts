import type { RuleFunction, SubScore } from '../types';

export const convocatoria: RuleFunction = (input): Omit<SubScore, 'weight'> => {
  const conv = input.convocatoria;

  if (!conv) {
    return {
      rule: 'convocatoria',
      value: 33,
      reason: 'Convocatoria no especificada (asumida primera)',
      data_quality: 'missing',
    };
  }

  switch (conv) {
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
        reason: `Convocatoria desconocida: "${conv}"`,
        data_quality: 'low',
      };
  }
};
