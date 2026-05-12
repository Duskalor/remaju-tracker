/**
 * packages/scoring-engine/src/rules/tiempo-disponible.ts
 *
 * Regla #7 — Tiempo disponible (peso 5%).
 *
 * Mide cuántos días tiene tu papá para hacer due diligence (visitar el
 * inmueble, revisar la partida registral, juntar el oblaje, inscribirse).
 *
 * <2 días    → 0 pts (imposible hacer DD seria)
 * 2-3 días   → 30 pts
 * 4-7 días   → 70 pts
 * 8-14 días  → 100 pts (ideal)
 * >14 días   → 90 pts (un poco menos urgente, otro inversor podría ganar)
 *
 * Si la inscripción ya cerró → 0 (debería estar excluido por hard filter).
 */

import type { RuleFunction, SubScore } from '../types';

export const tiempoDisponible: RuleFunction = (input): Omit<SubScore, 'weight'> => {
  const { fecha_fin_inscripcion, estado_temporal } = input;

  if (!fecha_fin_inscripcion) {
    return {
      rule: 'tiempo_disponible',
      value: 50,
      reason: 'Fecha de fin de inscripción no disponible',
      data_quality: 'missing',
    };
  }

  // Si ya cerró la inscripción
  if (
    estado_temporal === 'inscripcion_cerrada' ||
    estado_temporal === 'ofertando' ||
    estado_temporal === 'cerrado'
  ) {
    return {
      rule: 'tiempo_disponible',
      value: 0,
      reason: 'Inscripción ya cerrada',
      data_quality: 'high',
    };
  }

  const finDate = new Date(fecha_fin_inscripcion);
  const now = new Date();
  const daysLeft = (finDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

  let value: number;
  let label: string;

  if (daysLeft < 2) {
    value = 0;
    label = 'menos de 2 días — insuficiente para due diligence';
  } else if (daysLeft < 4) {
    value = 30;
    label = `${Math.floor(daysLeft)} días — apurado`;
  } else if (daysLeft < 8) {
    value = 70;
    label = `${Math.floor(daysLeft)} días — tiempo razonable`;
  } else if (daysLeft <= 14) {
    value = 100;
    label = `${Math.floor(daysLeft)} días — tiempo ideal`;
  } else {
    value = 90;
    label = `${Math.floor(daysLeft)} días — tiempo amplio`;
  }

  return {
    rule: 'tiempo_disponible',
    value,
    reason: `${label} hasta fin de inscripción`,
    data_quality: 'high',
  };
};
