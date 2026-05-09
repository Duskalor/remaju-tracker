import { Remate } from '@remaju/shared';
import { NewRemate } from '@remaju/database';

export function remateToDatabaseRow(remate: Remate): NewRemate {
  return {
    expediente: remate.expediente || 'unknown',
    remateNumero: remate.remate_numero,
    tipoRemate: remate.tipo_remate,
    fechaRemate: remate.fecha_remate || remate.fechaPresentacion || '',
    bienes: remate.bienes || '',
    estado: remate.estado,
    juzgado: remate.juzgado,
    direccion: remate.ubicacion,
    observaciones: remate.observaciones || '',
    scrapedAt: remate.scrapedAt || new Date().toISOString(),
    sourceUrl: remate.sourceUrl || '',

    // Enriched parsing fields
    distrito: remate.distrito,
    provincia: remate.provincia,
    departamento: remate.departamento,
    partida: remate.partidaRegistral,
    areaM2: remate.areaM2,
    descripcionRaw: remate.descripcionRaw || remate.bienes || undefined,
    direccionRaw: remate.direccionRaw,
    precioPorM2: remate.precioPorM2,
    tipoInmueble: remate.tipoInmueble,
  };
}

export function rematesToDatabaseRows(remates: Remate[]): NewRemate[] {
  return remates.map(remateToDatabaseRow);
}
