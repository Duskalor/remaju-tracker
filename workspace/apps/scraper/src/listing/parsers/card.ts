/**
 * apps/scraper/src/listing/parsers/card.ts
 *
 * Parser de un card del listado de remates del REMAJU.
 *
 * Entrada: el HTML interno de UN card (lo que recibe Playwright cuando hace
 *          `.locator('.card-remate').nth(i).innerHTML()` o similar).
 *
 * Salida: ParsedCard con TODOS los campos visibles del card.
 *
 * DECISIÓN DE DISEÑO: Trabajamos sobre HTML string en lugar de Playwright
 * locators directos para que:
 *   1. Sea testeable sin browser (vitest puro)
 *   2. Sea más rápido (un solo trip al DOM, no N queries)
 *   3. Sea más robusto: si la estructura HTML cambia un wrapper, no se
 *      rompen 8 queries — se rompe el parser y vemos qué pasa.
 *
 * Para parsear HTML usamos cheerio (jQuery-like, sync, rápido).
 * Instalación: pnpm add cheerio
 */

import * as cheerio from 'cheerio';

// ============================================================================
// Tipos
// ============================================================================

export interface ParsedCard {
  // Identificación
  remate_numero: string | null; // "23430"

  // Características del remate
  convocatoria: 'PRIMERA' | 'SEGUNDA' | 'TERCERA' | null;
  tipo_remate: string | null; // "REMATE SIMPLE", "REMATE COMÚN", etc.

  // Ubicación tal como aparece en el card (texto crudo)
  ubicacion_card: string | null; // "JOSE LEONARDO ORTIZ"

  // Fecha de presentación de ofertas (lo más útil del card temporal)
  fecha_presentacion_ofertas: string | null; // ISO datetime
  fecha_presentacion_ofertas_raw: string | null; // como vino: "22/05/2026 11:59 AM"

  // Estado y fase
  estado: string | null; // "En proceso", "Concluido", etc.
  fase_actual: string | null; // "Publicación e Inscripcion", etc.

  // Descripción libre
  descripcion: string | null;

  // Calidad del parsing
  parse_warnings: string[]; // mensajes si algún campo no se pudo extraer
}

// ============================================================================
// Parser principal
// ============================================================================

export function parseCard(html: string): ParsedCard {
  const $ = cheerio.load(html);
  const warnings: string[] = [];

  // --------------------------------------------------------------------------
  // 1. Número de remate y convocatoria
  //    Vienen juntos en un span tipo "Remate N° 23430 - PRIMERA CONVOCATORIA"
  // --------------------------------------------------------------------------
  const remateHeaderText = extractTextSafe($, 'span.label-danger.h6', warnings, 'header_remate');

  const remateMatch = remateHeaderText?.match(/Remate\s+N°\s+(\d+)/i);
  const remate_numero = remateMatch ? remateMatch[1] : null;
  if (!remate_numero) warnings.push('no se pudo extraer número de remate');

  const convocatoriaMatch = remateHeaderText?.match(
    /(PRIMERA|SEGUNDA|TERCERA)\s+CONVOCATORIA/i,
  );
  const convocatoria = convocatoriaMatch
    ? (convocatoriaMatch[1].toUpperCase() as 'PRIMERA' | 'SEGUNDA' | 'TERCERA')
    : null;

  // --------------------------------------------------------------------------
  // 2. Tipo de remate
  //    Viene con ícono gavel: <i class="fa fa-gavel"></i><span class="text-bold"> REMATE SIMPLE</span>
  // --------------------------------------------------------------------------
  const tipo_remate = extractTextNextToIcon($, 'fa-gavel');

  // --------------------------------------------------------------------------
  // 3. Ubicación
  //    Viene con ícono map-marker
  // --------------------------------------------------------------------------
  const ubicacion_card = extractTextNextToIcon($, 'fa-map-marker');

  // --------------------------------------------------------------------------
  // 4. Fecha y hora de presentación de ofertas
  //    Hay un bloque "Presentación de Ofertas" seguido de fecha (calendar-check-o)
  //    y hora (clock-o)
  // --------------------------------------------------------------------------
  const fechaRaw = extractTextNextToIcon($, 'fa-calendar-check-o');
  const horaRaw = extractTextNextToIcon($, 'fa-clock-o');
  const fecha_presentacion_ofertas_raw = combineDateTime(fechaRaw, horaRaw);
  const fecha_presentacion_ofertas = parseSpanishDateTime(fechaRaw, horaRaw);

  if (fechaRaw && !fecha_presentacion_ofertas) {
    warnings.push(`no se pudo parsear fecha "${fecha_presentacion_ofertas_raw}"`);
  }

  // --------------------------------------------------------------------------
  // 5. Estado y fase actual
  //    Vienen en la columna derecha del card, dentro de .card-etiqueta
  //    Primer span.titulo = estado ("En proceso")
  //    Segundo span.titulo = fase ("Publicación e Inscripcion")
  // --------------------------------------------------------------------------
  const titulos = $('.card-etiqueta span.titulo')
    .map((_, el) => $(el).text().trim())
    .get()
    .filter((t) => t.length > 0);

  const estado = titulos[0] ?? null;
  const fase_actual = titulos[1] ?? null;

  // --------------------------------------------------------------------------
  // 6. Descripción libre
  //    Está en un ui-scrollpanel con un label adentro
  // --------------------------------------------------------------------------
  const descripcion = $('.ui-scrollpanel label')
    .first()
    .text()
    .trim()
    .replace(/\s+/g, ' ') || null;

  return {
    remate_numero,
    convocatoria,
    tipo_remate,
    ubicacion_card,
    fecha_presentacion_ofertas,
    fecha_presentacion_ofertas_raw,
    estado,
    fase_actual,
    descripcion,
    parse_warnings: warnings,
  };
}

// ============================================================================
// Helpers
// ============================================================================

function extractTextSafe(
  $: cheerio.CheerioAPI,
  selector: string,
  warnings: string[],
  fieldName: string,
): string | null {
  const text = $(selector).first().text().trim();
  if (!text) {
    warnings.push(`selector "${selector}" vacío (campo: ${fieldName})`);
    return null;
  }
  return text;
}

/**
 * Extrae el texto que aparece JUSTO DESPUÉS de un ícono Font Awesome dado.
 *
 * Patrón típico en el HTML del portal:
 *   <i class="fa fa-gavel" aria-hidden="true"></i><span class="text-bold"> REMATE SIMPLE</span>
 *
 * Tomamos el <i> con la clase del ícono y leemos el texto del parent,
 * limpiando espacios. Es robusto a si el texto está en span, label, o
 * directamente en el nodo de texto.
 */
function extractTextNextToIcon(
  $: cheerio.CheerioAPI,
  iconClass: string,
): string | null {
  const icon = $(`i.${iconClass}`).first();
  if (icon.length === 0) return null;

  // Texto del parent quitando el contenido del ícono
  const parentText = icon.parent().text().trim().replace(/\s+/g, ' ');
  if (!parentText) return null;

  return parentText;
}

/**
 * Combina fecha + hora string para el campo "raw" (auditoría).
 */
function combineDateTime(fecha: string | null, hora: string | null): string | null {
  if (!fecha && !hora) return null;
  if (!fecha) return hora;
  if (!hora) return fecha;
  return `${fecha} ${hora}`;
}

/**
 * Parsea fecha formato Perú ("DD/MM/YYYY") y hora ("HH:MM AM/PM") a ISO.
 *
 * Ejemplos:
 *   parseSpanishDateTime("22/05/2026", "11:59 AM") → "2026-05-22T11:59:00"
 *   parseSpanishDateTime("22/05/2026", "11:59 PM") → "2026-05-22T23:59:00"
 *   parseSpanishDateTime("22/05/2026", null)        → "2026-05-22T00:00:00"
 *   parseSpanishDateTime(null, null)                → null
 *
 * NOTA: retornamos LOCAL time sin offset, asumiendo que el portal trabaja en
 * hora local de Perú (UTC-5). Para queries de "remates próximos a vencer"
 * esto es suficiente. Si necesitás strict timezone, agregá "-05:00".
 */
export function parseSpanishDateTime(
  fecha: string | null,
  hora: string | null,
): string | null {
  if (!fecha) return null;

  const fechaMatch = fecha.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!fechaMatch) return null;

  const day = fechaMatch[1].padStart(2, '0');
  const month = fechaMatch[2].padStart(2, '0');
  const year = fechaMatch[3];

  let hour24 = '00';
  let minute = '00';

  if (hora) {
    const horaMatch = hora.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
    if (horaMatch) {
      let h = parseInt(horaMatch[1], 10);
      minute = horaMatch[2];
      const ampm = horaMatch[3]?.toUpperCase();

      if (ampm === 'PM' && h !== 12) h += 12;
      if (ampm === 'AM' && h === 12) h = 0;

      hour24 = String(h).padStart(2, '0');
    }
  }

  return `${year}-${month}-${day}T${hour24}:${minute}:00`;
}
