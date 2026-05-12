/**
 * packages/scoring-engine/src/rules/porcentaje-rematar.ts
 *
 * Regla #4 — Porcentaje a rematar (peso 10%).
 *
 * Si solo se remata el 50% (típico en cuotas hereditarias o copropiedades),
 * tu papá quedaría en sociedad con el otro copropietario. Es un dolor de
 * cabeza para flip — vender el 50% es difícil y pelear partición es caro.
 *
 * 100%      → 100 pts (ideal)
 * 75-99%    → 70 pts (extraño, vale revisar)
 * 50-74%    → 30 pts (riesgoso, posible copropiedad complicada)
 * <50%      → 0 pts (probablemente excluido por hard filter)
 */

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
    return {
      rule: 'porcentaje_rematar',
      value: 100,
      reason: '100% del inmueble se remata',
      data_quality: 'high',
    };
  }

  if (pct >= 75) {
    return {
      rule: 'porcentaje_rematar',
      value: 70,
      reason: `Se remata ${pct}% del inmueble (situación inusual, revisar)`,
      data_quality: 'high',
    };
  }

  if (pct >= 50) {
    return {
      rule: 'porcentaje_rematar',
      value: 30,
      reason: `⚠️ Se remata solo ${pct}% del inmueble (copropiedad — complejo para flip)`,
      data_quality: 'high',
    };
  }

  return {
    rule: 'porcentaje_rematar',
    value: 0,
    reason: `⚠️ Se remata solo ${pct}% del inmueble`,
    data_quality: 'high',
  };
};
