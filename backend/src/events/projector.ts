/**
 * PROYECTOR: traduce eventos de dominio en actualizaciones del read_model.
 *
 * - Proyecciones asíncronas (catálogo y órdenes): se aplican desde el outbox
 *   en un ciclo separado de la transacción del comando => consistencia
 *   eventual. PROJECTION_DELAY_MS agrega latencia artificial para la demo.
 * - Proyección síncrona (carrito): el comando la aplica dentro de su misma
 *   transacción (projectInline) porque el usuario necesita read-your-writes
 *   inmediato al armar el carrito.
 *
 * Todas las proyecciones son idempotentes (last_event_id / on conflict), por lo
 * que reprocesar un evento no corrompe el read model.
 */
import { env } from '../config/env.js';
import { log } from '../config/logger.js';
import { pool, query, type Queryable } from '../db/pool.js';
import { availabilityFor } from '../write/domain/order.js';
import { claimPendingEvents, markProcessed } from './outbox.js';
import { pubsub, TOPICS } from './pubsub.js';
import type { OrderStatusChangedPayload, StoredEvent } from './types.js';

type Effect = { kind: 'order'; orderId: string; version: number } | { kind: 'medication'; medicationId: string };
type Handler = (client: Queryable, event: StoredEvent) => Promise<Effect[]>;

async function applyStatusChange(client: Queryable, event: StoredEvent, payload: OrderStatusChangedPayload) {
  const { rowCount } = await query(
    `update read_model.order_summary
       set status = $2, status_reason = $3, prescription_status = $4,
           prescription_rejection = case when $4 = 'REJECTED' then $3 else prescription_rejection end,
           updated_at = $5, last_event_id = $6
     where id = $1 and last_event_id < $6`,
    [payload.orderId, payload.status, payload.reason, payload.prescriptionStatus, payload.occurredAt, event.id],
    client,
  );
  await query(
    `insert into read_model.order_timeline (order_id, event_id, status, note, occurred_at)
     values ($1, $2, $3, $4, $5) on conflict (event_id) do nothing`,
    [payload.orderId, event.id, payload.status, payload.note ?? payload.reason, payload.occurredAt],
    client,
  );
  return rowCount ? [{ kind: 'order', orderId: payload.orderId, version: event.id } as const] : [];
}

async function applyStockChange(client: Queryable, medicationId: string, stockAfter: number): Promise<Effect[]> {
  await query(
    `update read_model.medication_catalog
       set stock_available = $2, availability = $3, updated_at = now()
     where id = $1`,
    [medicationId, stockAfter, availabilityFor(stockAfter)],
    client,
  );
  return [{ kind: 'medication', medicationId }];
}

const handlers: Record<StoredEvent['type'], Handler> = {
  async CartUpdated(client, event) {
    if (event.type !== 'CartUpdated') return [];
    const { cartId, status, items, updatedAt } = event.payload;
    await query(
      `insert into read_model.cart_view (id, status, updated_at) values ($1, $2, $3)
       on conflict (id) do update set status = excluded.status, updated_at = excluded.updated_at`,
      [cartId, status, updatedAt],
      client,
    );
    await query('delete from read_model.cart_line_view where cart_id = $1', [cartId], client);
    if (items.length > 0) {
      await query(
        `insert into read_model.cart_line_view (cart_id, medication_id, quantity, added_at)
         select $1, * from unnest($2::uuid[], $3::int[], $4::timestamptz[])`,
        [cartId, items.map((i) => i.medicationId), items.map((i) => i.quantity), items.map((i) => i.addedAt)],
        client,
      );
    }
    return [];
  },

  async OrderPlaced(client, event) {
    if (event.type !== 'OrderPlaced') return [];
    const p = event.payload;
    const { rowCount } = await query(
      `insert into read_model.order_summary
         (id, status, status_reason, customer_name, customer_email, total, item_count, requires_prescription,
          prescription_number, prescription_doctor, prescription_license, prescription_issued_at,
          prescription_status, placed_at, updated_at, last_event_id)
       values ($1, 'PENDING_APPROVAL', null, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12, $13)
       on conflict (id) do nothing`,
      [
        p.orderId,
        p.customer.fullName,
        p.customer.email,
        p.total,
        p.itemCount,
        p.requiresPrescription,
        p.prescription?.number ?? null,
        p.prescription?.doctorName ?? null,
        p.prescription?.doctorLicense ?? null,
        p.prescription?.issuedAt ?? null,
        p.requiresPrescription ? 'PENDING_VERIFICATION' : 'NOT_REQUIRED',
        p.placedAt,
        event.id,
      ],
      client,
    );
    if (!rowCount) return [];
    await query(
      `insert into read_model.order_line_view
         (order_id, medication_id, commercial_name, presentation, quantity, unit_price, subtotal)
       select $1, * from unnest($2::uuid[], $3::text[], $4::text[], $5::int[], $6::numeric[], $7::numeric[])`,
      [
        p.orderId,
        p.items.map((i) => i.medicationId),
        p.items.map((i) => i.commercialName),
        p.items.map((i) => i.presentation),
        p.items.map((i) => i.quantity),
        p.items.map((i) => i.unitPrice),
        p.items.map((i) => i.subtotal),
      ],
      client,
    );
    await query(
      `insert into read_model.order_timeline (order_id, event_id, status, note, occurred_at)
       values ($1, $2, 'PENDING_APPROVAL', $3, $4) on conflict (event_id) do nothing`,
      [
        p.orderId,
        event.id,
        p.requiresPrescription ? 'Orden recibida; fórmula médica en verificación.' : 'Orden recibida; validando pago.',
        p.placedAt,
      ],
      client,
    );
    return [{ kind: 'order', orderId: p.orderId, version: event.id }];
  },

  async StockReserved(client, event) {
    if (event.type !== 'StockReserved') return [];
    return applyStockChange(client, event.payload.medicationId, event.payload.stockAfter);
  },

  async StockReleased(client, event) {
    if (event.type !== 'StockReleased') return [];
    return applyStockChange(client, event.payload.medicationId, event.payload.stockAfter);
  },

  async OrderApproved(client, event) {
    if (event.type !== 'OrderApproved') return [];
    return applyStatusChange(client, event, event.payload);
  },

  async OrderDispatched(client, event) {
    if (event.type !== 'OrderDispatched') return [];
    return applyStatusChange(client, event, event.payload);
  },

  async OrderCancelled(client, event) {
    if (event.type !== 'OrderCancelled') return [];
    return applyStatusChange(client, event, event.payload);
  },
};

type EventListener = (event: StoredEvent) => void;
const listeners: EventListener[] = [];

/** Permite a los process managers (sagas) reaccionar a eventos ya proyectados. */
export function onProjectedEvent(listener: EventListener): void {
  listeners.push(listener);
}

function publishEffects(effects: Effect[]) {
  const orders = new Map<string, number>();
  const medications = new Set<string>();
  for (const effect of effects) {
    if (effect.kind === 'order') orders.set(effect.orderId, Math.max(effect.version, orders.get(effect.orderId) ?? 0));
    else medications.add(effect.medicationId);
  }
  for (const [orderId, version] of orders) void pubsub.publish(TOPICS.ORDER_UPDATED, { orderId, version });
  for (const medicationId of medications) void pubsub.publish(TOPICS.MEDICATION_STOCK_CHANGED, { medicationId });
}

/** Proyección síncrona: se ejecuta dentro de la transacción del comando. */
export async function projectInline(client: Queryable, events: StoredEvent[]): Promise<void> {
  for (const event of events) await handlers[event.type](client, event);
  await markProcessed(
    client,
    events.map((event) => event.id),
  );
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let current: Promise<number> | null = null;
let drainRequested = false;

/**
 * Procesa todos los eventos pendientes del outbox (asíncrono respecto al
 * comando). Si ya hay un drenado en curso, solicita otra vuelta y devuelve la
 * misma promesa: quien espere el resultado verá también sus propios eventos.
 */
export function drainOutbox(options: { delayMs?: number } = {}): Promise<number> {
  if (current) {
    drainRequested = true;
    return current;
  }
  current = runDrain(options.delayMs ?? env.projectionDelayMs).finally(() => {
    current = null;
  });
  return current;
}

async function runDrain(delay: number): Promise<number> {
  let processed = 0;
  do {
    drainRequested = false;
    if (delay > 0) await sleep(delay);

    for (;;) {
      const client = await pool.connect();
      let batch: StoredEvent[] = [];
      const effects: Effect[] = [];
      try {
        await client.query('BEGIN');
        batch = await claimPendingEvents(client);
        for (const event of batch) {
          effects.push(...(await handlers[event.type](client, event)));
        }
        await markProcessed(
          client,
          batch.map((event) => event.id),
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      if (batch.length === 0) break;
      processed += batch.length;
      log.projector(
        `${batch.length} evento(s) proyectado(s): ${batch.map((event) => `#${event.id} ${event.type}`).join(', ')}`,
      );
      publishEffects(effects);
      for (const event of batch) for (const listener of listeners) listener(event);
    }
  } while (drainRequested);
  return processed;
}

let timer: NodeJS.Timeout | undefined;

/** Notificación del command bus tras un COMMIT: dispara el proyector. */
export function notifyNewEvents(): void {
  void drainOutbox().catch((error) => log.error('Fallo del proyector', error));
}

/** Red de seguridad: sondea el outbox periódicamente (reinicios, otras instancias). */
export function startProjector(intervalMs = 5000): void {
  notifyNewEvents();
  timer = setInterval(notifyNewEvents, intervalMs);
  timer.unref();
}

export function stopProjector(): void {
  if (timer) clearInterval(timer);
}
