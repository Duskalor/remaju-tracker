import type { RuleFunction, SubScore } from '../types';

export const riesgoLegal: RuleFunction = (input): Omit<SubScore, 'weight'> => {
  const { inmueble, materia } = input;

  if (!inmueble) {
    return {
      rule: 'riesgo_legal',
      value: 50,
      reason: 'Sin información de cargas/gravámenes',
      data_quality: 'missing',
    };
  }

  let score = 100;
  const reasons: string[] = [];

  if (inmueble.tiene_hipoteca) {
    score -= 10;
    reasons.push('hipoteca registrada');
  }

  if (inmueble.embargo_terceros) {
    score -= 30;
    reasons.push('⚠️ embargo de terceros');
  } else if (inmueble.tiene_embargo) {
    score -= 5;
    reasons.push('embargo (probablemente del mismo proceso)');
  }

  if (inmueble.num_cargas > 3) {
    score -= 10;
    reasons.push(`${inmueble.num_cargas} cargas registradas (complejidad alta)`);
  } else if (inmueble.num_cargas > 0) {
    reasons.push(`${inmueble.num_cargas} carga${inmueble.num_cargas > 1 ? 's' : ''}`);
  }

  if (materia) {
    const materiaUpper = materia.toUpperCase();
    if (materiaUpper.includes('EJECUCION DE GARANTIAS')) {
      // materia más limpia, sin penalización
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

  return {
    rule: 'riesgo_legal',
    value: Math.max(0, Math.round(score)),
    reason:
      reasons.length === 0
        ? 'Sin cargas registradas (situación legal limpia)'
        : reasons.join(' + '),
    data_quality: 'high',
  };
};
