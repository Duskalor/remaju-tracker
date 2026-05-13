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
    return { rule: 'tipo_inmueble', value: 50, reason: 'Tipo de inmueble no especificado', data_quality: 'missing' };
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
