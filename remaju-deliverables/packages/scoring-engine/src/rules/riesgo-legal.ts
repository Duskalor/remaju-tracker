/**
 * packages/scoring-engine/src/rules/riesgo-legal.ts
 *
 * Regla #3 — Riesgo legal (peso 20%).
 *
 * Mide la complejidad legal del inmueble basándose en cargas y gravámenes
 * inscritos en la partida registral.
 *
 * Distinciones importantes:
 *  - HIPOTECA: se cancela con el remate. NO es problema grave. -10 pts.
 *  - EMBARGO del mismo proceso: normal. -5 pts.
 *  - EMBARGO DE TERCEROS (otros acreedores): ⚠️ riesgo serio. -30 pts.
 *    Pueden impugnar la venta después de comprado.
 *  - Múltiples cargas (>3): complejidad alta. -10 pts adicionales.
 *
 * Score = 100 - sum(penalties), mínimo 0.
 *
 * Decisión: la materia "EJECUCION DE GARANTIAS" es la más limpia
 * jurídicamente. Otras materias son más complejas.
 */

import type { RuleFunction, SubScore } from '../types';

export const riesgoLegal: RuleFunction = (input): Omit<SubScore, 'weight'> => {
  const { inmueble, materia } = input;

  if (!inmueble) {
    return {
      rule: 'riesgo_legal',
      value: 50, // neutral cuando no hay data
      reason: 'Sin información de cargas/gravámenes',
      data_quality: 'missing',
    };
  }

  let score = 100;
  const reasons: string[] = [];

  // Penalty por hipoteca (se cancela con remate, pero hay que tramitar)
  if (inmueble.tiene_hipoteca) {
    score -= 10;
    reasons.push('hipoteca registrada');
  }

  // Penalty por embargo de terceros (CRÍTICO)
  if (inmueble.embargo_terceros) {
    score -= 30;
    reasons.push('⚠️ embargo de terceros');
  } else if (inmueble.tiene_embargo) {
    score -= 5;
    reasons.push('embargo (probablemente del mismo proceso)');
  }

  // Penalty por múltiples cargas
  if (inmueble.num_cargas > 3) {
    score -= 10;
    reasons.push(`${inmueble.num_cargas} cargas registradas (complejidad alta)`);
  } else if (inmueble.num_cargas > 0) {
    reasons.push(`${inmueble.num_cargas} carga${inmueble.num_cargas > 1 ? 's' : ''}`);
  }

  // Bonus/penalty por materia
  if (materia) {
    const materiaUpper = materia.toUpperCase();
    if (materiaUpper.includes('EJECUCION DE GARANTIAS')) {
      // Materia más limpia: no penalizamos. Pero tampoco bonus, ya está implícito.
    } else if (
      materiaUpper.includes('OBLIGACION DE DAR') ||
      materiaUpper.includes('OBLIGACION DE PAGAR')
    ) {
      score -= 10;
      reasons.push('materia "obligación de dar/pagar" (riesgo de tercerías)');
    } else {
      score -= 5;
      reasons.push(`materia "${materia.toLowerCase()}" (revisar implicancias)`);
    }
  }

  score = Math.max(0, Math.round(score));

  const reason =
    reasons.length === 0
      ? 'Sin cargas registradas (situación legal limpia)'
      : reasons.join(' + ');

  return {
    rule: 'riesgo_legal',
    value: score,
    reason,
    data_quality: 'high',
  };
};
