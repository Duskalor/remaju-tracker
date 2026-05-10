/**
 * Pipeline de Parsing Híbrido — 3 etapas
 *
 * Stage 1: Extractors (Regex) → extrae campos del texto raw
 * Stage 2: Normalizers → estandariza formatos
 * Stage 3: Heuristics → infiere datos derivados
 *
 * Uso:
 *   const result = runPipeline(bienesText, precioBase);
 *   // result.distrito, result.areaM2, result.tipoInmueble, etc.
 */

import { extractAll, normalizeAll, parseAddress } from '@remaju/regex-engine';
import { applyHeuristics } from './heuristics';
import { DireccionComponentes } from '@remaju/shared';

export interface PipelineResult {
  distrito?: string;
  provincia?: string;
  departamento?: string;
  partidaRegistral?: string;
  areaM2?: number;
  precioPorM2?: number;
  tipoInmueble?: string;
  esBarato?: boolean;
}

/**
 * Ejecuta el pipeline completo de 3 etapas sobre el texto de bienes.
 *
 * @param bienesText - Texto raw del campo "bienes" extraído del card HTML
 * @param precioBase - Precio base del remate (opcional, para heurísticas)
 * @returns Objeto con todos los campos extraídos y derivados
 */
export function runPipeline(bienesText: string, precioBase?: number): PipelineResult {
  // Stage 1: Extracción con regex
  const extracted = extractAll(bienesText);

  // Stage 2: Normalización
  const normalized = normalizeAll(extracted);

  // Stage 3: Heurísticas
  const heuristics = applyHeuristics(normalized, bienesText, precioBase);

  return {
    distrito: heuristics.distrito,
    provincia: heuristics.provincia,
    departamento: heuristics.departamento,
    partidaRegistral: heuristics.partidaRegistral,
    areaM2: heuristics.areaM2,
    precioPorM2: heuristics.precioPorM2,
    tipoInmueble: heuristics.tipoInmueble,
    esBarato: heuristics.esBarato,
  };
}

/**
 * Versión con DireccionComponentes incluido.
 * Corre el pipeline + address parser.
 */
export type { DireccionComponentes };
