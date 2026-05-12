import { Remate } from '@remaju/shared';
import { NewRemate } from '@remaju/database';

export function rematesToDatabaseRows(remates: Remate[]): NewRemate[] {
  return remates.map(remateToDatabaseRow);
}

export function remateToDatabaseRow(remate: Remate): NewRemate {
  return {
    expediente: remate.expediente || 'unknown',
    remate_numero: remate.remate_numero,
    tipo_remate: remate.tipo_remate,
    fecha_remate: remate.fecha_remate || remate.fechaPresentacion || '',
    bienes: remate.bienes || '',
    estado: remate.estado,
    juzgado: remate.juzgado,
    direccion: remate.ubicacion,
    observaciones: remate.observaciones || '',
    scraped_at: remate.scrapedAt || new Date().toISOString(),
    source_url: remate.sourceUrl || '',

    // Enriched parsing fields
    distrito: remate.distrito,
    provincia: remate.provincia,
    departamento: remate.departamento,
    partida: remate.partidaRegistral,
    area_m2: remate.areaM2,
    descripcion_raw: remate.descripcionRaw || remate.bienes || undefined,
    direccion_raw: remate.direccionRaw,
    precio_por_m2: remate.precioPorM2,
    tipo_inmueble: remate.tipoInmueble,
  };
}
