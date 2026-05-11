/**
 * apps/scraper/src/listing/__tests__/card.test.ts
 *
 * Tests del parser de card. Usamos el HTML real que vino del portal
 * REMAJU (remate N° 23430) como fixture principal, y casos sintéticos
 * para cobertura de edge cases.
 */

import { describe, it, expect } from 'vitest';
import { parseCard, parseSpanishDateTime } from '../parsers/card';

// HTML real del card 23430 (José Leonardo Ortiz, Chiclayo, Lambayeque)
const HTML_CARD_REAL = `
<div class="ui-panelgrid-cell ui-g-12 ui-md-8 ui-lg-8 ui-xl-9">
  <div class="ui-panelgrid">
    <div class="ui-panelgrid-content">
      <div class="ui-g">
        <div class="ui-panelgrid-cell ui-g-12 ui-md-8 ui-lg-8 ui-xl-8 text-left">
          <div class="ui-panelgrid">
            <div class="ui-panelgrid-content">
              <div class="ui-g">
                <div class="ui-panelgrid-cell ui-g-12">
                  <span class="text-bold label-danger h6">Remate N° 23430 - PRIMERA CONVOCATORIA</span>
                </div>
              </div>
              <div class="ui-g">
                <div class="ui-panelgrid-cell ui-g-12">
                  <i class="fa fa-gavel" aria-hidden="true"></i><span class="text-bold"> REMATE SIMPLE</span>
                </div>
              </div>
              <div class="ui-g">
                <div class="ui-panelgrid-cell ui-g-12">
                  <i class="fa fa-map-marker" aria-hidden="true"></i> JOSE LEONARDO ORTIZ
                </div>
              </div>
              <div class="ui-g">
                <div class="ui-panelgrid-cell ui-g-12">
                  <span class="text-bold">Presentación de Ofertas</span>
                </div>
              </div>
              <div class="ui-g">
                <div class="ui-panelgrid-cell ui-g-12">
                  <i class="fa fa-calendar-check-o" aria-hidden="true"></i> 22/05/2026
                </div>
              </div>
              <div class="ui-g">
                <div class="ui-panelgrid-cell ui-g-12">
                  <i class="fa fa-clock-o" aria-hidden="true"></i> <label>11:59 AM</label>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="ui-panelgrid-cell ui-g-12 ui-md-4 ui-lg-4 ui-xl-4">
          <div class="ui-panelgrid card-etiqueta">
            <div class="ui-panelgrid-content">
              <div class="ui-g">
                <div class="ui-panelgrid-cell ui-g-12 text-center text-bold">
                  <span class="text-bold titulo">En proceso</span>
                </div>
              </div>
              <div class="ui-g">
                <div class="ui-panelgrid-cell ui-g-12 text-center text-bold">
                  <span class="text-bold titulo">Publicación e Inscripcion</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  <div class="ui-panelgrid">
    <div class="ui-panelgrid-content">
      <div class="ui-g">
        <div class="ui-panelgrid-cell ui-g-12 text-justify">
          <div class="ui-scrollpanel">
            <label>INMUEBLE UBICADO EN CALLE PARDO Y MIGUEL N° 387, DISTRITO DE JOSÉ LEONARDO ORTIZ, PROVINCIA DE CHICLAYO, DEPARTAMENTO DE LAMBAYEQUE.</label>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
`;

describe('parseCard - HTML real del portal', () => {
  const result = parseCard(HTML_CARD_REAL);

  it('extrae número de remate', () => {
    expect(result.remate_numero).toBe('23430');
  });

  it('extrae convocatoria', () => {
    expect(result.convocatoria).toBe('PRIMERA');
  });

  it('extrae tipo de remate', () => {
    expect(result.tipo_remate).toContain('REMATE SIMPLE');
  });

  it('extrae ubicación', () => {
    expect(result.ubicacion_card).toContain('JOSE LEONARDO ORTIZ');
  });

  it('extrae estado actual', () => {
    expect(result.estado).toBe('En proceso');
  });

  it('extrae fase actual', () => {
    expect(result.fase_actual).toBe('Publicación e Inscripcion');
  });

  it('extrae fecha de presentación de ofertas como ISO', () => {
    expect(result.fecha_presentacion_ofertas).toBe('2026-05-22T11:59:00');
  });

  it('guarda fecha raw para auditoría', () => {
    expect(result.fecha_presentacion_ofertas_raw).toContain('22/05/2026');
    expect(result.fecha_presentacion_ofertas_raw).toContain('11:59 AM');
  });

  it('extrae descripción libre', () => {
    expect(result.descripcion).toContain('CALLE PARDO Y MIGUEL');
    expect(result.descripcion).toContain('LAMBAYEQUE');
  });

  it('no genera warnings cuando el HTML está completo', () => {
    expect(result.parse_warnings).toHaveLength(0);
  });
});

describe('parseSpanishDateTime', () => {
  it('parsea AM correctamente', () => {
    expect(parseSpanishDateTime('22/05/2026', '11:59 AM')).toBe('2026-05-22T11:59:00');
  });

  it('parsea PM correctamente (suma 12)', () => {
    expect(parseSpanishDateTime('22/05/2026', '11:59 PM')).toBe('2026-05-22T23:59:00');
  });

  it('maneja el caso especial 12:00 AM (medianoche → 00:00)', () => {
    expect(parseSpanishDateTime('22/05/2026', '12:00 AM')).toBe('2026-05-22T00:00:00');
  });

  it('maneja el caso especial 12:00 PM (mediodía → 12:00)', () => {
    expect(parseSpanishDateTime('22/05/2026', '12:00 PM')).toBe('2026-05-22T12:00:00');
  });

  it('asume 00:00 si no hay hora', () => {
    expect(parseSpanishDateTime('22/05/2026', null)).toBe('2026-05-22T00:00:00');
  });

  it('retorna null si no hay fecha', () => {
    expect(parseSpanishDateTime(null, '11:59 AM')).toBeNull();
  });

  it('retorna null si fecha es malformada', () => {
    expect(parseSpanishDateTime('no-es-fecha', '11:59 AM')).toBeNull();
  });

  it('parsea fechas con un solo dígito en día/mes', () => {
    expect(parseSpanishDateTime('5/3/2026', '9:00 AM')).toBe('2026-03-05T09:00:00');
  });
});

describe('parseCard - edge cases', () => {
  it('maneja HTML vacío sin crashear', () => {
    const result = parseCard('<div></div>');
    expect(result.remate_numero).toBeNull();
    expect(result.parse_warnings.length).toBeGreaterThan(0);
  });

  it('detecta convocatoria SEGUNDA', () => {
    const html = `
      <span class="label-danger h6">Remate N° 23500 - SEGUNDA CONVOCATORIA</span>
      <i class="fa fa-gavel"></i><span> REMATE SIMPLE</span>
    `;
    const result = parseCard(html);
    expect(result.convocatoria).toBe('SEGUNDA');
    expect(result.remate_numero).toBe('23500');
  });

  it('detecta convocatoria TERCERA', () => {
    const html = `<span class="label-danger h6">Remate N° 100 - TERCERA CONVOCATORIA</span>`;
    const result = parseCard(html);
    expect(result.convocatoria).toBe('TERCERA');
  });

  it('retorna null en convocatoria si no la encuentra', () => {
    const html = `<span class="label-danger h6">Remate N° 100</span>`;
    const result = parseCard(html);
    expect(result.convocatoria).toBeNull();
  });

  it('maneja card sin estado/fase (column derecha ausente)', () => {
    const html = `<span class="label-danger h6">Remate N° 100 - PRIMERA CONVOCATORIA</span>`;
    const result = parseCard(html);
    expect(result.estado).toBeNull();
    expect(result.fase_actual).toBeNull();
  });
});
