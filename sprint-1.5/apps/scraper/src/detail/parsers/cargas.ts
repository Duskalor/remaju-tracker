/**
 * apps/scraper/src/detail/parsers/cargas.ts
 *
 * Parser de cargas y gravámenes del inmueble.
 * Extraído del orquestador original para poder testearlo de forma aislada.
 */

export interface CargasResult {
  num: number;
  hipoteca: boolean;
  embargo: boolean;
  embargo_terceros: boolean;
}

/**
 * Detecta hipoteca, embargo y embargo de terceros desde el texto crudo
 * de la columna "Cargas/Gravámenes" del portal.
 *
 * El texto sigue formatos como:
 *   "ASIENTO D00001: HIPOTECA a favor de BANCO INTERBANK..."
 *   "ASIENTO D00002: EMBARGO por medida cautelar..."
 */
export function parseCargas(raw: string): CargasResult {
  if (!raw || raw.trim().length === 0) {
    return { num: 0, hipoteca: false, embargo: false, embargo_terceros: false };
  }

  const normalized = raw.toUpperCase();

  const asientoMatches = normalized.match(/ASIENTO\s+[A-Z]?\d+/g);
  const num = asientoMatches?.length ?? 0;

  const hipoteca = /HIPOTECA/.test(normalized);
  const embargo  = /EMBARGO/.test(normalized);

  // Embargo de terceros: hay embargo Y más de una institución financiera mencionada
  const institucionesMencionadas = new Set<string>();
  const bankPatterns = [
    /BANCO\s+[A-Z]+/g,
    /CAJA\s+[A-Z]+/g,
    /FINANCIERA\s+[A-Z]+/g,
    /COOPERATIVA\s+[A-Z]+/g,
  ];
  for (const pattern of bankPatterns) {
    const matches = normalized.match(pattern);
    if (matches) matches.forEach((m) => institucionesMencionadas.add(m.trim()));
  }

  const embargo_terceros = embargo && institucionesMencionadas.size > 1;

  return { num, hipoteca, embargo, embargo_terceros };
}
