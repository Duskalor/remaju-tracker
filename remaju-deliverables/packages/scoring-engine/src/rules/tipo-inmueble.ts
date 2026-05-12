/**
 * packages/scoring-engine/src/rules/tipo-inmueble.ts
 *
 * Regla #6 — Tipo de inmueble (peso 10%).
 *
 * Mide la "liquidez de salida": qué tan rápido y a qué precio se podría
 * revender el inmueble. Tipos urbanos residenciales son los más líquidos.
 *
 * DEPARTAMENTO  → 100 (mayor demanda, fácil de vender)
 * CASA          → 95
 * TERRENO       → 70 (más lento, requiere visión del comprador)
 * OFICINA       → 40 (mercado pequeño, difícil flip rápido)
 * LOCAL COMERCIAL → 50
 * Otros/desconocido → 50 (neutral)
 *
 * El cliente puede tunear esto via preferences.tipos_inmueble_bonus.
 */

import type { RuleFunction, SubScore } from '../types';

const TIPO_SCORES: Record<string, number> = {
  DEPARTAMENTO: 100,
  CASA: 95,
  'CASA HABITACION': 95,
  VIVIENDA: 90,
  TERRENO: 70,
  LOTE: 70,
  'LOCAL COMERCIAL': 50,
  LOCAL: 50,
  OFICINA: 40,
  COCHERA: 30,
  ESTACIONAMIENTO: 30,
  DEPOSITO: 30,
};

export const tipoInmueble: RuleFunction = (input): Omit<SubScore, 'weight'> => {
  const { inmueble } = input;

  if (!inmueble?.tipo_inmueble) {
    return {
      rule: 'tipo_inmueble',
      value: 50,
      reason: 'Tipo de inmueble no especificado',
      data_quality: 'missing',
    };
  }

  const tipo = inmueble.tipo_inmueble.toUpperCase().trim();
  const score = TIPO_SCORES[tipo] ?? 50;

  return {
    rule: 'tipo_inmueble',
    value: score,
    reason: `Tipo: ${tipo}${score >= 90 ? ' (alta liquidez de venta)' : score >= 60 ? ' (liquidez media)' : ' (liquidez baja)'}`,
    data_quality: 'high',
  };
};
