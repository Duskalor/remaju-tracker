import type { RuleFunction, SubScore } from '../types';

export const competencia: RuleFunction = (input): Omit<SubScore, 'weight'> => {
  const { num_inscritos, detail_scraped_at } = input;

  let dataQuality: 'high' | 'medium' | 'low' | 'missing' = 'high';
  let staleNote = '';

  if (detail_scraped_at) {
    const ageHours = (Date.now() - new Date(detail_scraped_at).getTime()) / (1000 * 60 * 60);
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

  return { rule: 'competencia', value, reason: reason + staleNote, data_quality: dataQuality };
};
