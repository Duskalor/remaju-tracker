/**
 * packages/scoring-engine/src/rules/competencia.ts
 *
 * Regla #5 — Competencia (peso 10%).
 *
 * Mide la presión competitiva en el remate. Más inscritos = más probabilidad
 * de que el precio suba arriba del precio base, comiendo el margen de flip.
 *
 * 0 inscritos     → 100 pts (sin competencia, podés ofrecer precio base)
 * 1-2 inscritos   → 80 pts
 * 3-5 inscritos   → 50 pts
 * 6-9 inscritos   → 25 pts
 * 10+ inscritos   → 0 pts (probablemente la puja sube fuerte)
 *
 * IMPORTANTE: este número cambia con el tiempo (la gente se inscribe a medida
 * que se acerca la fecha). Por eso refrescamos el detail cada 2 días en
 * remates "vivos". Si el detalle es viejo, el dato es estimativo.
 */

import type { RuleFunction, SubScore } from '../types';

export const competencia: RuleFunction = (input): Omit<SubScore, 'weight'> => {
  const { num_inscritos, detail_scraped_at } = input;

  // Calcular antigüedad del dato
  let dataQuality: 'high' | 'medium' | 'low' | 'missing' = 'high';
  let staleNote = '';

  if (detail_scraped_at) {
    const ageHours =
      (Date.now() - new Date(detail_scraped_at).getTime()) / (1000 * 60 * 60);
    if (ageHours > 72) {
      dataQuality = 'medium';
      staleNote = ' (dato con +3 días)';
    }
  } else {
    dataQuality = 'missing';
  }

  let value: number;
  let reason: string;

  if (num_inscritos === 0) {
    value = 100;
    reason = '0 inscritos hasta el momento';
  } else if (num_inscritos <= 2) {
    value = 80;
    reason = `${num_inscritos} inscrito${num_inscritos > 1 ? 's' : ''} (competencia baja)`;
  } else if (num_inscritos <= 5) {
    value = 50;
    reason = `${num_inscritos} inscritos (competencia media)`;
  } else if (num_inscritos <= 9) {
    value = 25;
    reason = `${num_inscritos} inscritos (competencia alta)`;
  } else {
    value = 0;
    reason = `${num_inscritos} inscritos (competencia muy alta — la puja probablemente sube)`;
  }

  return {
    rule: 'competencia',
    value,
    reason: reason + staleNote,
    data_quality: dataQuality,
  };
};
