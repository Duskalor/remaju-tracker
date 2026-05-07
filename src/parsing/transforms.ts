import { Remate, DatabaseRow } from '../types/remate';

export function remateToDatabaseRow(remate: Remate): DatabaseRow {
  return {
    expediente: remate.expediente || 'unknown',
    remate_numero: remate.remate_numero,
    tipo_remate: remate.tipo_remate,
    fecha_remate: remate.fecha_remate || '',
    bienes: remate.bienes || '',
    estado: remate.estado,
    juzgado: remate.juzgado,
    direccion: remate.ubicacion,
    observaciones: remate.observaciones || '',
    raw_html: undefined,
    scraped_at: remate.scrapedAt || new Date().toISOString(),
    source_url: remate.sourceUrl || '',
  };
}

export function rematesToDatabaseRows(remates: Remate[]): DatabaseRow[] {
  return remates.map(remateToDatabaseRow);
}
