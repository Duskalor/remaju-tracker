/**
 * packages/scoring-engine/src/index.ts
 *
 * API pública del scoring engine. Importá desde acá, no desde archivos
 * internos:
 *
 *   import { scoreRemate, loadConfig } from '@remaju/scoring-engine';
 */

export { scoreRemate, scoreRemates } from './score';
export { loadConfig, DEFAULT_CONFIG, normalizeWeights } from './weights';
export type {
  RemateInput,
  ScoreResult,
  SubScore,
  ScoringConfig,
  ScoringWeights,
  ScoringFilters,
  ScoringPreferences,
  RuleFunction,
} from './types';
