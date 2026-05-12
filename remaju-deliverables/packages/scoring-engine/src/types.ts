/**
 * packages/scoring-engine/src/types.ts
 *
 * Tipos centrales del scoring engine.
 *
 * Filosofía: cada regla recibe un `RemateInput` (data plana, fácil de testear)
 * y retorna un `SubScore` con su valor + razón legible. El orquestador combina
 * sub-scores en un `ScoreResult` final.
 */

// ============================================================================
// Input al scoring engine
// ============================================================================

/**
 * Datos planos necesarios para scorear un remate. Se construye desde la DB
 * uniendo `remates` + su `remate_inmuebles` principal + `remate_cronograma`.
 *
 * Mantenemos esto independiente del schema de Drizzle para que el scoring
 * sea testeable sin DB y reutilizable desde diferentes contextos.
 */
export interface RemateInput {
  // Identificación
  id: number;
  expediente: string;
  remate_numero: string | null;

  // Económico (del detalle)
  tasacion: number | null;
  precio_base: number | null;
  convocatoria: 'PRIMERA' | 'SEGUNDA' | 'TERCERA' | null;
  num_inscritos: number;

  // Legal
  materia: string | null;

  // Inmueble principal (primer registro de remate_inmuebles)
  inmueble: {
    tipo_inmueble: string | null;
    distrito: string | null;
    provincia: string | null;
    departamento: string | null;
    porcentaje_rematar: number | null;
    num_cargas: number;
    tiene_hipoteca: boolean;
    tiene_embargo: boolean;
    embargo_terceros: boolean;
  } | null;

  // Temporal
  fecha_fin_inscripcion: string | null; // ISO datetime
  fecha_fin_ofertas: string | null;
  estado_temporal:
    | 'inscripcion_abierta'
    | 'inscripcion_cerrada'
    | 'ofertando'
    | 'cerrado'
    | null;

  // Operacional
  archived_at: string | null;
  detail_extraction_failed: boolean;
  detail_scraped_at: string | null;
}

// ============================================================================
// Output del scoring engine
// ============================================================================

/**
 * Resultado de una sola regla. El `value` es 0-100. La `reason` es texto
 * legible para humanos — se muestra en el dashboard como "por qué este score".
 */
export interface SubScore {
  rule: string; // 'descuento_tasacion', 'convocatoria', etc.
  value: number; // 0-100
  weight: number; // del config
  reason: string; // legible
  data_quality: 'high' | 'medium' | 'low' | 'missing';
}

/**
 * Resultado completo del scoring de un remate.
 */
export interface ScoreResult {
  score: number; // 0-100, redondeado
  version: string; // del config
  computed_at: string; // ISO datetime
  excluded: boolean; // si pasó por hard filter
  exclusion_reason?: string;
  subscores: SubScore[];
}

// ============================================================================
// Config
// ============================================================================

/**
 * Pesos del scoring. Suma debería ser ~1.0 (se normaliza igual).
 */
export interface ScoringWeights {
  descuento_tasacion: number;
  convocatoria: number;
  riesgo_legal: number;
  porcentaje_rematar: number;
  competencia: number;
  tipo_inmueble: number;
  tiempo_disponible: number;
  completitud: number;
}

export interface ScoringFilters {
  exclude_porcentaje_rematar_under: number; // 50 por default
  exclude_archived: boolean;
  exclude_failed: boolean;
  exclude_cerrado: boolean;
}

export interface ScoringPreferences {
  departamentos_bonus: string[];
  tipos_inmueble_bonus: string[];
  min_score_visible: number;
}

export interface ScoringConfig {
  version: string;
  weights: ScoringWeights;
  filters: ScoringFilters;
  preferences: ScoringPreferences;
}

// ============================================================================
// Tipo de función de regla (para uniformidad)
// ============================================================================

export type RuleFunction = (input: RemateInput) => Omit<SubScore, 'weight'>;
