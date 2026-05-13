import type { RuleFunction, SubScore } from '../types';

export const porcentajeRematar: RuleFunction = (input): Omit<SubScore, 'weight'> => {
  const { inmueble } = input;

  if (!inmueble || inmueble.porcentaje_rematar === null) {
    return {
      rule: 'porcentaje_rematar',
      value: 50,
      reason: 'Porcentaje a rematar no especificado',
      data_quality: 'missing',
    };
  }

  const pct = inmueble.porcentaje_rematar;

  if (pct >= 100) {
    return { rule: 'porcentaje_rematar', value: 100, reason: '100% del inmueble se remata', data_quality: 'high' };
  }
  if (pct >= 75) {
    return { rule: 'porcentaje_rematar', value: 70, reason: `Se remata ${pct}% del inmueble (situación inusual, revisar)`, data_quality: 'high' };
  }
  if (pct >= 50) {
    return { rule: 'porcentaje_rematar', value: 30, reason: `⚠️ Se remata solo ${pct}% del inmueble (copropiedad — complejo para flip)`, data_quality: 'high' };
  }

  return { rule: 'porcentaje_rematar', value: 0, reason: `⚠️ Se remata solo ${pct}% del inmueble`, data_quality: 'high' };
};
