import { eq } from '@remaju/database';
import type { ParsedCard } from '../parsers/card';

export interface UpsertResult {
  expediente: string;
  action: 'inserted' | 'updated' | 'unchanged';
  warnings: string[];
}

export interface UpsertInput {
  remate_numero: string;
  card: ParsedCard;
  source_url: string;
  raw_html: string;
  scraped_at: string;
}

export function upsertCardFromListing(
  db: any,
  remates: any,
  input: UpsertInput,
): UpsertResult {
  const { remate_numero, card, source_url, raw_html, scraped_at } = input;
  const warnings: string[] = [...card.parse_warnings];

  const cardFields = {
    remate_numero,
    convocatoria: card.convocatoria,
    tipo_remate: card.tipo_remate,
    estado: card.estado,
    direccion: card.ubicacion_card,
    fecha_remate: card.fecha_presentacion_ofertas,
    bienes: card.descripcion,
    descripcion_raw: card.descripcion,
    source_url,
    raw_html,
    last_seen_at: scraped_at,
  };

  const existing = db
    .select({ id: remates.id })
    .from(remates)
    .where(eq(remates.remate_numero, remate_numero))
    .limit(1)
    .all();

  const action: UpsertResult['action'] = existing.length > 0 ? 'updated' : 'inserted';

  db
    .insert(remates)
    .values({
      ...cardFields,
      expediente: `PENDING_${remate_numero}`,
      scraped_at,
    })
    .onConflictDoUpdate({
      target: remates.remate_numero,
      set: cardFields,
    })
    .run();

  return { expediente: remate_numero, action, warnings };
}

export function batchUpsertCards(
  db: any,
  remates: any,
  inputs: UpsertInput[],
  batchSize = 50,
): {
  total: number;
  inserted: number;
  updated: number;
  failed: number;
  errors: { remate_numero: string; error: string }[];
} {
  let inserted = 0;
  let updated = 0;
  let failed = 0;
  const errors: { remate_numero: string; error: string }[] = [];

  for (let i = 0; i < inputs.length; i += batchSize) {
    const batch = inputs.slice(i, i + batchSize);

    try {
      db.transaction((tx: any) => {
        for (const input of batch) {
          const result = upsertCardFromListing(tx, remates, input);
          if (result.action === 'inserted') inserted++;
          else if (result.action === 'updated') updated++;
        }
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      for (const input of batch) {
        failed++;
        errors.push({ remate_numero: input.remate_numero, error: msg });
      }
    }
  }

  return { total: inputs.length, inserted, updated, failed, errors };
}
