export interface RemateInput {
  id: number;
  expediente: string;
  remate_numero: string | null;

  tasacion: number | null;
  precio_base: number | null;
  convocatoria: 'PRIMERA' | 'SEGUNDA' | 'TERCERA' | null;
  num_inscritos: number;

  materia: string | null;

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

  fecha_fin_inscripcion: string | null;
  fecha_fin_ofertas: string | null;
  estado_temporal:
    | 'inscripcion_abierta'
    | 'inscripcion_cerrada'
    | 'ofertando'
    | 'cerrado'
    | null;

  archived_at: string | null;
  detail_extraction_failed: boolean;
  detail_scraped_at: string | null;
}

export interface SubScore {
  rule: string;
  value: number;
  weight: number;
  reason: string;
  data_quality: 'high' | 'medium' | 'low' | 'missing';
}

export interface ScoreResult {
  score: number;
  version: string;
  computed_at: string;
  excluded: boolean;
  exclusion_reason?: string;
  subscores: SubScore[];
}

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
  exclude_porcentaje_rematar_under: number;
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

export type RuleFunction = (input: RemateInput) => Omit<SubScore, 'weight'>;
