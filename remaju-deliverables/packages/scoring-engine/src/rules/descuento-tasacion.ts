/**
 * packages/scoring-engine/src/rules/descuento-tasacion.ts
 *
 * Regla #1 — Descuento sobre tasación (peso 30%).
 *
 * Es la señal MÁS IMPORTANTE para flip. La tasación es el valor pericial
 * judicial; el precio base es a cuánto arranca el remate. La diferencia es
 * el descuento que tu papá podría capturar como margen.
 *
 * Por ley en Perú:
 *  - 1ra convocatoria: precio_base ≈ 66.6% de tasación (33% descuento)
 *  - 2da convocatoria: ~85% de la 1ra (~43% descuento total)
 *  - 3ra convocatoria: ~85% de la 2da (~52% descuento total)
 *
 * Por eso: 30% de descuento es el "piso" (1ra convocatoria estándar). Más allá
 * de eso es señal real. Calibramos:
 *   <30%  → score 30 (sospechosamente bajo, quizás tasación irreal)
 *   30%   → score 50 (estándar 1ra convocatoria)
 *   45%   → score 75
 *   55%+  → score 100 (excelente)
 */

import type { RuleFunction, SubScore } from '../types';

export const descuentoTasacion: RuleFunction = (input): Omit<SubScore, 'weight'> => {
  const { tasacion, precio_base } = input;

  if (tasacion === null || precio_base === null || tasacion <= 0) {
    return {
      rule: 'descuento_tasacion',
      value: 0,
      reason: 'Sin tasación o precio base disponible',
      data_quality: 'missing',
    };
  }

  if (precio_base > tasacion) {
    // Caso anómalo: precio base mayor que tasación. Posible bug en parsing.
    return {
      rule: 'descuento_tasacion',
      value: 0,
      reason: `⚠️ Precio base (${formatSoles(precio_base)}) supera tasación (${formatSoles(tasacion)}) — datos sospechosos`,
      data_quality: 'low',
    };
  }

  const descuento = (tasacion - precio_base) / tasacion; // 0..1
  const descuentoPct = descuento * 100;

  // Curva de scoring lineal por tramos
  let value: number;
  if (descuentoPct < 20) {
    value = 10;
  } else if (descuentoPct < 30) {
    value = 30 + ((descuentoPct - 20) / 10) * 20; // 30 → 50
  } else if (descuentoPct < 45) {
    value = 50 + ((descuentoPct - 30) / 15) * 25; // 50 → 75
  } else if (descuentoPct < 55) {
    value = 75 + ((descuentoPct - 45) / 10) * 25; // 75 → 100
  } else {
    value = 100;
  }

  value = Math.round(value);

  return {
    rule: 'descuento_tasacion',
    value,
    reason: `Descuento de ${descuentoPct.toFixed(1)}% sobre tasación (${formatSoles(tasacion)} → ${formatSoles(precio_base)})`,
    data_quality: 'high',
  };
};

function formatSoles(value: number): string {
  return `S/. ${value.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
