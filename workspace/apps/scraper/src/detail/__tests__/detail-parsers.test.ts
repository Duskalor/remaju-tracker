/**
 * Tests del detail scraper.
 *
 * CÓMO USAR ESTOS TESTS:
 *
 * 1. Correr el scraper en modo "captura" para obtener el HTML real:
 *
 *    En scrape-detail.ts, antes de parsear, agregar temporalmente:
 *      import { writeFileSync } from 'fs';
 *      writeFileSync('debug-tab-remate.html', htmlRemate);
 *      writeFileSync('debug-tab-inmuebles.html', htmlInmuebles);
 *      writeFileSync('debug-tab-cronograma.html', htmlCronograma);
 *
 * 2. Copiar el contenido de esos archivos a las constantes de abajo.
 *
 * 3. Correr: pnpm test detail-parsers
 *
 * 4. Ajustar los selectores en los parsers hasta que todos pasen.
 *
 * Una vez que tenés el HTML real, estos tests son tu red de seguridad:
 * si el portal cambia su HTML, los tests te dicen exactamente qué se rompió.
 */

import { describe, it, expect } from 'vitest';
import { parseTabRemate } from '../parsers/tab-remate';
import { parseTabInmuebles } from '../parsers/tab-inmuebles';
import { parseTabCronograma } from '../parsers/tab-cronograma';
import { parseCargas } from '../parsers/cargas';

// ============================================================================
// Fixtures — reemplazar con HTML real del portal
// ============================================================================

// TODO: pegar el HTML real de la pestaña Remate
const HTML_TAB_REMATE = `
  <div>
    <table>
      <tr><td>Expediente:</td><td>01339-2024-0-1401-JR-CI-02</td></tr>
      <tr><td>Tasación:</td><td>S/ 150,000.00</td></tr>
      <tr><td>Precio Base:</td><td>S/ 105,000.00</td></tr>
      <tr><td>Convocatoria:</td><td>PRIMERA CONVOCATORIA</td></tr>
      <tr><td>Inscritos:</td><td>3</td></tr>
      <tr><td>Oblaje:</td><td>S/ 10,500.00</td></tr>
    </table>
  </div>
`;

// TODO: pegar el HTML real de la pestaña Inmuebles
const HTML_TAB_INMUEBLES = `
  <div>
    <tbody id="form:pgRemate:tbInmuebles:dtInmuebles_data">
      <tr>
        <td>P00000123</td>
        <td>DEPARTAMENTO</td>
        <td>AV. SALAVERRY 1234 DPTO 502</td>
        <td>LAMBAYEQUE</td>
        <td>CHICLAYO</td>
        <td>JOSE LEONARDO ORTIZ</td>
        <td>ASIENTO D00001: HIPOTECA a favor de BANCO INTERBANK por S/ 80,000</td>
        <td>100%</td>
        <td>5</td>
      </tr>
    </tbody>
  </div>
`;

// TODO: pegar el HTML real de la pestaña Cronograma
const HTML_TAB_CRONOGRAMA = `
  <div>
    <tbody id="form:pgRemate:tbCronograma:dtCronograma_data">
      <tr>
        <td>1</td>
        <td>Publicación e Inscripcion</td>
        <td>05/05/2026</td>
        <td>22/05/2026</td>
      </tr>
      <tr>
        <td>2</td>
        <td>Presentación de Ofertas</td>
        <td>22/05/2026</td>
        <td>22/05/2026</td>
      </tr>
      <tr>
        <td>3</td>
        <td>Calificación de Ofertas</td>
        <td>23/05/2026</td>
        <td>26/05/2026</td>
      </tr>
      <tr>
        <td>4</td>
        <td>Acto de Remate</td>
        <td>27/05/2026</td>
        <td>27/05/2026</td>
      </tr>
      <tr>
        <td>5</td>
        <td>Resultado del Remate</td>
        <td>28/05/2026</td>
        <td>30/05/2026</td>
      </tr>
    </tbody>
  </div>
`;

// ============================================================================
// Tests de tab-remate
// ============================================================================

describe('parseTabRemate', () => {
  it('extrae expediente', () => {
    const result = parseTabRemate(HTML_TAB_REMATE);
    expect(result.expediente).toBe('01339-2024-0-1401-JR-CI-02');
  });

  it('extrae tasación como número', () => {
    const result = parseTabRemate(HTML_TAB_REMATE);
    expect(result.tasacion).toBe(150000);
  });

  it('extrae precio_base como número', () => {
    const result = parseTabRemate(HTML_TAB_REMATE);
    expect(result.precio_base).toBe(105000);
  });

  it('extrae convocatoria correctamente', () => {
    const result = parseTabRemate(HTML_TAB_REMATE);
    expect(result.convocatoria).toBe('PRIMERA');
  });

  it('extrae num_inscritos', () => {
    const result = parseTabRemate(HTML_TAB_REMATE);
    expect(result.num_inscritos).toBe(3);
  });
});

// ============================================================================
// Tests de tab-inmuebles
// ============================================================================

describe('parseTabInmuebles', () => {
  it('extrae al menos un inmueble', () => {
    const result = parseTabInmuebles(HTML_TAB_INMUEBLES);
    expect(result.inmuebles.length).toBeGreaterThan(0);
  });

  it('extrae tipo_inmueble', () => {
    const result = parseTabInmuebles(HTML_TAB_INMUEBLES);
    expect(result.inmuebles[0].tipo_inmueble).toBe('DEPARTAMENTO');
  });

  it('detecta hipoteca', () => {
    const result = parseTabInmuebles(HTML_TAB_INMUEBLES);
    expect(result.inmuebles[0].tiene_hipoteca).toBe(true);
  });

  it('extrae porcentaje_rematar', () => {
    const result = parseTabInmuebles(HTML_TAB_INMUEBLES);
    expect(result.inmuebles[0].porcentaje_rematar).toBe(100);
  });
});

// ============================================================================
// Tests de tab-cronograma
// ============================================================================

describe('parseTabCronograma', () => {
  it('extrae 5 fases', () => {
    const result = parseTabCronograma(HTML_TAB_CRONOGRAMA);
    expect(result.fases.length).toBe(5);
  });

  it('extrae fechas de inscripción', () => {
    const result = parseTabCronograma(HTML_TAB_CRONOGRAMA);
    expect(result.fecha_inicio_inscripcion).toBe('2026-05-05');
    expect(result.fecha_fin_inscripcion).toBe('2026-05-22');
  });

  it('extrae fechas de ofertas', () => {
    const result = parseTabCronograma(HTML_TAB_CRONOGRAMA);
    expect(result.fecha_inicio_ofertas).toBe('2026-05-22');
    expect(result.fecha_fin_ofertas).toBe('2026-05-22');
  });

  it('numera las fases correctamente', () => {
    const result = parseTabCronograma(HTML_TAB_CRONOGRAMA);
    expect(result.fases[0].fase_numero).toBe(1);
    expect(result.fases[4].fase_numero).toBe(5);
  });
});

// ============================================================================
// Tests de parseCargas (unitarios, no dependen de HTML real)
// ============================================================================

describe('parseCargas', () => {
  it('retorna vacío para texto vacío', () => {
    const result = parseCargas('');
    expect(result).toEqual({ num: 0, hipoteca: false, embargo: false, embargo_terceros: false });
  });

  it('detecta hipoteca', () => {
    const result = parseCargas('ASIENTO D00001: HIPOTECA a favor de BANCO INTERBANK');
    expect(result.hipoteca).toBe(true);
    expect(result.num).toBe(1);
  });

  it('detecta embargo', () => {
    const result = parseCargas('ASIENTO D00001: EMBARGO por medida cautelar');
    expect(result.embargo).toBe(true);
  });

  it('detecta embargo de terceros (>1 institución)', () => {
    const raw = `
      ASIENTO D00001: HIPOTECA a favor de BANCO INTERBANK
      ASIENTO D00002: EMBARGO a favor de CAJA PIURA
    `;
    const result = parseCargas(raw);
    expect(result.embargo_terceros).toBe(true);
  });

  it('no marca embargo_terceros con una sola institución', () => {
    const raw = 'ASIENTO D00001: HIPOTECA a favor de BANCO INTERBANK';
    const result = parseCargas(raw);
    expect(result.embargo_terceros).toBe(false);
  });
});
