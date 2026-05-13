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
    return {
      rule: 'descuento_tasacion',
      value: 0,
      reason: `⚠️ Precio base (${formatSoles(precio_base)}) supera tasación (${formatSoles(tasacion)}) — datos sospechosos`,
      data_quality: 'low',
    };
  }

  const descuento = (tasacion - precio_base) / tasacion;
  const descuentoPct = descuento * 100;

  let value: number;
  if (descuentoPct < 20) {
    value = 10;
  } else if (descuentoPct < 30) {
    value = 30 + ((descuentoPct - 20) / 10) * 20;
  } else if (descuentoPct < 45) {
    value = 50 + ((descuentoPct - 30) / 15) * 25;
  } else if (descuentoPct < 55) {
    value = 75 + ((descuentoPct - 45) / 10) * 25;
  } else {
    value = 100;
  }

  return {
    rule: 'descuento_tasacion',
    value: Math.round(value),
    reason: `Descuento de ${descuentoPct.toFixed(1)}% sobre tasación (${formatSoles(tasacion)} → ${formatSoles(precio_base)})`,
    data_quality: 'high',
  };
};

function formatSoles(value: number): string {
  return `S/. ${value.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
