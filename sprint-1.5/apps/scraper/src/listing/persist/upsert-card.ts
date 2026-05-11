/**
 * apps/scraper/src/listing/persist/upsert-card.ts
 *
 * Lógica de persistencia idempotente para cards del listado.
 *
 * REGLA DE ORO: este UPSERT debe ser SEGURO de correr 100 veces seguidas.
 * Ninguna corrida debe destruir trabajo previo.
 *
 * Específicamente:
 *   ✅ Inserta remates nuevos con detail_scraped_at = NULL
 *   ✅ Actualiza campos del listado en remates existentes
 *   ✅ Marca last_seen_at = NOW en cada card visto
 *   ❌ NUNCA toca: detail_scraped_at, score, columnas del detail, archived_at
 *   ❌ NUNCA borra registros
 *
 * Idempotencia: correr esto N veces con el mismo input produce el mismo
 * estado en DB. La única columna que cambia es `last_seen_at`.
 */

import { eq, sql } from 'drizzle-orm';
// Estos imports los vas a tener que ajustar a tu setup real:
// import { db } from '../../db';
// import { remates, type NewRemate } from '@remaju/database';
import type { ParsedCard } from '../parsers/card';

// ============================================================================
// Tipos
// ============================================================================

export interface UpsertResult {
  expediente: string; // o remate_numero — lo que uses como key estable
  action: 'inserted' | 'updated' | 'unchanged';
  warnings: string[];
}

/**
 * Datos que necesitamos para el UPSERT. Combinación de:
 *   - Los campos parseados del card
 *   - Metadata del scrape (source_url, raw_html para auditoría)
 *   - Identificador estable (expediente del listado o remate_numero)
 */
export interface UpsertInput {
  // Identificador estable. Usa el que tengas — probablemente `remate_numero`
  // del card es lo más consistente. El `expediente` viene del detalle.
  remate_numero: string;

  // Campos parseados del card
  card: ParsedCard;

  // Metadata
  source_url: string;
  raw_html: string;
  scraped_at: string; // ISO datetime, normalmente NOW
}

// ============================================================================
// UPSERT principal
// ============================================================================

/**
 * Upsert de un card del listado.
 *
 * Usa SQLite's "INSERT ... ON CONFLICT ... DO UPDATE" via Drizzle.
 * Si tu DB es otra (Postgres, MySQL) la sintaxis cambia pero el patrón
 * es el mismo.
 *
 * NOTA: El conflict target depende de cuál columna tenés como UNIQUE.
 *       En el schema original es `expediente`. En el nuevo flujo usamos
 *       `remate_numero` porque es lo que viene del card del listado
 *       (el expediente solo aparece en el detalle).
 *
 *       Si tu DB actual tiene `expediente` como UNIQUE y `remate_numero`
 *       sin UNIQUE, agregá:
 *           CREATE UNIQUE INDEX idx_remate_numero ON remates(remate_numero);
 *       O mantené ambas keys: insertás un placeholder en expediente hasta
 *       que el detail scraper lo llene. Te explico ambas en el README.
 */
export async function upsertCardFromListing(
  // db: DrizzleDb,
  db: any, // reemplazar con tu tipo real
  remates: any, // import real desde @remaju/database
  input: UpsertInput,
): Promise<UpsertResult> {
  const { remate_numero, card, source_url, raw_html, scraped_at } = input;
  const warnings: string[] = [...card.parse_warnings];

  // 1. Construir el objeto de campos a escribir.
  //    NOTA IMPORTANTE: solo incluimos campos que el card REALMENTE provee.
  //    No tocamos columnas del detalle ni del scoring.
  const cardFields = {
    remate_numero,
    convocatoria: card.convocatoria,
    tipo_remate: card.tipo_remate,
    estado: card.estado,
    // El card da fase actual; la guardamos en estado o un campo nuevo si lo agregás.
    // En el schema actual no hay "fase_actual" explícito, así que la
    // concatenamos al estado para no perderla:
    // estado: card.fase_actual ? `${card.estado} — ${card.fase_actual}` : card.estado,

    // Ubicación del card (cruda, va a ser refinada por el detail)
    direccion: card.ubicacion_card,

    // Fecha del card
    fecha_remate: card.fecha_presentacion_ofertas, // ISO, alimenta scoring antes del detail

    // Descripción
    bienes: card.descripcion,
    descripcion_raw: card.descripcion, // backup raw para reprocesar

    // Metadata siempre actualizable
    source_url,
    raw_html,
    last_seen_at: scraped_at,
  };

  // 2. Hacer el UPSERT
  //
  // Pseudocódigo Drizzle. La sintaxis exacta puede variar según versión.
  /*
  const result = await db
    .insert(remates)
    .values({
      ...cardFields,
      expediente: `PENDING_${remate_numero}`, // placeholder, el detail lo arregla
      scraped_at, // solo en INSERT
    })
    .onConflictDoUpdate({
      target: remates.remate_numero, // o remates.expediente según tu schema
      set: {
        // ⚠️ IMPORTANTE: solo actualizamos campos del card.
        // NO tocamos: detail_scraped_at, score, tasacion, precio_base,
        // num_inscritos, inmuebles, cronograma, archived_at.
        ...cardFields,
        // scraped_at NO se actualiza — preservamos el momento del primer scrape
      },
    })
    .returning({
      id: remates.id,
      // Drizzle/SQLite no devuelve "was inserted vs updated" directamente.
      // Lo inferimos consultando antes O usando un trigger.
    });
  */

  // Para detectar inserted vs updated, hacemos un check previo:
  /*
  const existing = await db
    .select({ id: remates.id })
    .from(remates)
    .where(eq(remates.remate_numero, remate_numero))
    .limit(1);
  
  const action: UpsertResult['action'] = existing.length > 0 ? 'updated' : 'inserted';
  */

  return {
    expediente: remate_numero,
    action: 'inserted', // placeholder hasta que conectes el db real
    warnings,
  };
}

// ============================================================================
// Batch UPSERT
// ============================================================================

/**
 * Procesa una lista de cards en transacción. Más rápido que N upserts
 * individuales y más seguro: si una falla, ninguna se aplica (rollback).
 *
 * SIN EMBARGO: con 350 remates en una sola transacción, si UNO falla,
 * perdés los 349 buenos. Recomendación: lotes de 50.
 */
export async function batchUpsertCards(
  db: any,
  remates: any,
  inputs: UpsertInput[],
  batchSize = 50,
): Promise<{
  total: number;
  inserted: number;
  updated: number;
  failed: number;
  errors: { remate_numero: string; error: string }[];
}> {
  let inserted = 0;
  let updated = 0;
  let failed = 0;
  const errors: { remate_numero: string; error: string }[] = [];

  for (let i = 0; i < inputs.length; i += batchSize) {
    const batch = inputs.slice(i, i + batchSize);

    try {
      // await db.transaction(async (tx) => {
      //   for (const input of batch) {
      //     const result = await upsertCardFromListing(tx, remates, input);
      //     if (result.action === 'inserted') inserted++;
      //     else if (result.action === 'updated') updated++;
      //   }
      // });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      for (const input of batch) {
        failed++;
        errors.push({ remate_numero: input.remate_numero, error: msg });
      }
    }
  }

  return {
    total: inputs.length,
    inserted,
    updated,
    failed,
    errors,
  };
}
