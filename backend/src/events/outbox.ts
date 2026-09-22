import type { Queryable } from '../db/pool.js';
import { query } from '../db/pool.js';
import type { DomainEvent, StoredEvent } from './types.js';

interface EventRow {
  id: number;
  aggregate_type: string;
  aggregate_id: string;
  event_type: string;
  payload: unknown;
  occurred_at: Date;
}

export function toStoredEvent(row: EventRow): StoredEvent {
  return {
    id: row.id,
    type: row.event_type,
    aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id,
    payload: row.payload,
    occurredAt: row.occurred_at,
  } as StoredEvent;
}

/** Inserta eventos en el outbox dentro de la transacción del comando. */
export async function appendEvents(client: Queryable, events: DomainEvent[]): Promise<StoredEvent[]> {
  if (events.length === 0) return [];
  const { rows } = await query<EventRow>(
    `insert into write_model.domain_events (aggregate_type, aggregate_id, event_type, payload)
     select * from unnest($1::text[], $2::uuid[], $3::text[], $4::jsonb[])
     returning id, aggregate_type, aggregate_id, event_type, payload, occurred_at`,
    [
      events.map((event) => event.aggregateType),
      events.map((event) => event.aggregateId),
      events.map((event) => event.type),
      events.map((event) => JSON.stringify(event.payload)),
    ],
    client,
  );
  return rows.map(toStoredEvent);
}

export async function markProcessed(client: Queryable, ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  await query('update write_model.domain_events set processed_at = now() where id = any($1::bigint[])', [ids], client);
}

/**
 * Toma un lote de eventos pendientes; SKIP LOCKED permite varias instancias.
 * No se registra en el log SQL porque el sondeo periódico lo haría ruidoso; el
 * proyector registra cada lote que efectivamente procesa.
 */
export async function claimPendingEvents(client: Queryable, limit = 100): Promise<StoredEvent[]> {
  const { rows } = await client.query<EventRow>(
    `select id, aggregate_type, aggregate_id, event_type, payload, occurred_at
     from write_model.domain_events
     where processed_at is null
     order by id
     limit $1
     for update skip locked`,
    [limit],
  );
  return rows.map(toStoredEvent);
}
