/**
 * packages/scoring-engine/src/__tests__/score.test.ts
 *
 * Tests del scoring engine. Validamos casos extremos y representativos.
 *
 * Correr con: pnpm test
 */

import { describe, it, expect } from 'vitest';
import { scoreRemate } from '../score';
import type { RemateInput } from '../types';

// Helper para construir un RemateInput con valores razonables por defecto
function makeInput(overrides: Partial<RemateInput> = {}): RemateInput {
  return {
    id: 1,
    expediente: '01339-2024-0-1401-JR-CI-02',
    remate_numero: '23431',
    tasacion: 200000,
    precio_base: 130000, // 35% descuento (estándar 1ra)
    convocatoria: 'PRIMERA',
    num_inscritos: 0,
    materia: 'EJECUCION DE GARANTIAS',
    inmueble: {
      tipo_inmueble: 'DEPARTAMENTO',
      distrito: 'TRUJILLO',
      provincia: 'TRUJILLO',
      departamento: 'LA LIBERTAD',
      porcentaje_rematar: 100,
      num_cargas: 1,
      tiene_hipoteca: true,
      tiene_embargo: false,
      embargo_terceros: false,
    },
    fecha_fin_inscripcion: futureISODate(10),
    fecha_fin_ofertas: futureISODate(13),
    estado_temporal: 'inscripcion_abierta',
    archived_at: null,
    detail_extraction_failed: false,
    detail_scraped_at: new Date().toISOString(),
    ...overrides,
  };
}

function futureISODate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

describe('scoreRemate', () => {
  describe('caso ideal', () => {
    it('da score alto a un departamento con buen descuento, sin embargos, 0 inscritos', () => {
      const result = scoreRemate(makeInput());
      expect(result.excluded).toBe(false);
      expect(result.score).toBeGreaterThan(70);
      expect(result.subscores).toHaveLength(8);
    });
  });

  describe('hard filters', () => {
    it('excluye remates archivados', () => {
      const result = scoreRemate(
        makeInput({ archived_at: '2026-05-01T00:00:00Z' }),
      );
      expect(result.excluded).toBe(true);
      expect(result.exclusion_reason).toContain('Archivado');
    });

    it('excluye remates cerrados', () => {
      const result = scoreRemate(
        makeInput({ estado_temporal: 'cerrado' }),
      );
      expect(result.excluded).toBe(true);
    });

    it('excluye remates con detail extraction failed', () => {
      const result = scoreRemate(
        makeInput({ detail_extraction_failed: true }),
      );
      expect(result.excluded).toBe(true);
    });

    it('excluye remates con porcentaje a rematar <50%', () => {
      const result = scoreRemate(
        makeInput({
          inmueble: {
            ...makeInput().inmueble!,
            porcentaje_rematar: 30,
          },
        }),
      );
      expect(result.excluded).toBe(true);
    });
  });

  describe('descuento_tasacion', () => {
    it('penaliza descuentos bajos (< 20%)', () => {
      const result = scoreRemate(
        makeInput({ tasacion: 200000, precio_base: 180000 }), // 10%
      );
      const subscore = result.subscores.find((s) => s.rule === 'descuento_tasacion');
      expect(subscore?.value).toBeLessThan(20);
    });

    it('da score perfecto a descuentos >55%', () => {
      const result = scoreRemate(
        makeInput({ tasacion: 200000, precio_base: 80000 }), // 60%
      );
      const subscore = result.subscores.find((s) => s.rule === 'descuento_tasacion');
      expect(subscore?.value).toBe(100);
    });

    it('detecta caso anómalo: precio_base > tasación', () => {
      const result = scoreRemate(
        makeInput({ tasacion: 100000, precio_base: 120000 }),
      );
      const subscore = result.subscores.find((s) => s.rule === 'descuento_tasacion');
      expect(subscore?.value).toBe(0);
      expect(subscore?.data_quality).toBe('low');
    });
  });

  describe('riesgo_legal', () => {
    it('penaliza fuerte el embargo de terceros', () => {
      const result = scoreRemate(
        makeInput({
          inmueble: {
            ...makeInput().inmueble!,
            embargo_terceros: true,
          },
        }),
      );
      const subscore = result.subscores.find((s) => s.rule === 'riesgo_legal');
      expect(subscore?.value).toBeLessThanOrEqual(70); // -30 por embargo terceros
    });

    it('da máximo a remates sin cargas', () => {
      const result = scoreRemate(
        makeInput({
          inmueble: {
            ...makeInput().inmueble!,
            num_cargas: 0,
            tiene_hipoteca: false,
            tiene_embargo: false,
            embargo_terceros: false,
          },
        }),
      );
      const subscore = result.subscores.find((s) => s.rule === 'riesgo_legal');
      expect(subscore?.value).toBe(100);
    });
  });

  describe('competencia', () => {
    it('da máximo a 0 inscritos', () => {
      const result = scoreRemate(makeInput({ num_inscritos: 0 }));
      const subscore = result.subscores.find((s) => s.rule === 'competencia');
      expect(subscore?.value).toBe(100);
    });

    it('da mínimo a 10+ inscritos', () => {
      const result = scoreRemate(makeInput({ num_inscritos: 15 }));
      const subscore = result.subscores.find((s) => s.rule === 'competencia');
      expect(subscore?.value).toBe(0);
    });
  });

  describe('tipo_inmueble', () => {
    it('da máximo a DEPARTAMENTO', () => {
      const result = scoreRemate(makeInput());
      const subscore = result.subscores.find((s) => s.rule === 'tipo_inmueble');
      expect(subscore?.value).toBe(100);
    });

    it('da bajo a OFICINA', () => {
      const result = scoreRemate(
        makeInput({
          inmueble: {
            ...makeInput().inmueble!,
            tipo_inmueble: 'OFICINA',
          },
        }),
      );
      const subscore = result.subscores.find((s) => s.rule === 'tipo_inmueble');
      expect(subscore?.value).toBe(40);
    });
  });

  describe('tiempo_disponible', () => {
    it('penaliza tiempo muy corto (<2 días)', () => {
      const result = scoreRemate(
        makeInput({ fecha_fin_inscripcion: futureISODate(1) }),
      );
      const subscore = result.subscores.find((s) => s.rule === 'tiempo_disponible');
      expect(subscore?.value).toBe(0);
    });

    it('da máximo al rango ideal (8-14 días)', () => {
      const result = scoreRemate(
        makeInput({ fecha_fin_inscripcion: futureISODate(10) }),
      );
      const subscore = result.subscores.find((s) => s.rule === 'tiempo_disponible');
      expect(subscore?.value).toBe(100);
    });
  });

  describe('completitud', () => {
    it('da score perfecto cuando todos los campos críticos están', () => {
      const result = scoreRemate(makeInput());
      const subscore = result.subscores.find((s) => s.rule === 'completitud');
      expect(subscore?.value).toBe(100);
    });

    it('penaliza cuando faltan campos', () => {
      const result = scoreRemate(
        makeInput({
          tasacion: null,
          precio_base: null,
          inmueble: null,
        }),
      );
      const subscore = result.subscores.find((s) => s.rule === 'completitud');
      expect(subscore?.value).toBeLessThan(50);
    });
  });

  describe('determinismo', () => {
    it('mismo input → mismo output (excepto computed_at)', () => {
      const input = makeInput();
      const r1 = scoreRemate(input);
      const r2 = scoreRemate(input);
      expect(r1.score).toBe(r2.score);
      expect(r1.subscores.map((s) => s.value)).toEqual(
        r2.subscores.map((s) => s.value),
      );
    });
  });
});
