/**
 * PROCESS MANAGER (saga) de verificación de órdenes.
 *
 * Reacciona al evento OrderPlaced (una vez proyectado) y, tras APPROVAL_DELAY_MS
 * (simula al químico farmacéutico / la pasarela de pago), emite un NUEVO
 * COMANDO por el write model:
 *   - approveOrder  -> si la orden es OTC o la fórmula existe en el registro.
 *   - cancelOrder   -> si el registro médico no existe (libera el stock).
 * Así la transición PENDING_APPROVAL -> APPROVED/CANCELLED ocurre de forma
 * asíncrona y el cliente la recibe por la suscripción orderUpdated.
 */
import { env } from '../config/env.js';
import { log } from '../config/logger.js';
import { query } from '../db/pool.js';
import { onProjectedEvent } from '../events/projector.js';
import { approveOrder, cancelOrder } from './commands/orderCommands.js';
import { verifyAgainstRegistry } from './domain/order.js';

const scheduled = new Map<string, NodeJS.Timeout>();

async function verify(orderId: string) {
  scheduled.delete(orderId);
  const { rows } = await query<{ status: string; requires_prescription: boolean; doctor_license: string | null }>(
    `select o.status, o.requires_prescription, p.doctor_license
     from write_model.orders o left join write_model.prescriptions p on p.order_id = o.id
     where o.id = $1`,
    [orderId],
  );
  const order = rows[0];
  if (!order || order.status !== 'PENDING_APPROVAL') return;

  if (!order.requires_prescription) {
    log.saga(`Orden ${orderId}: sólo OTC, pago confirmado -> approveOrder`);
    await approveOrder({ orderId, note: 'Pago confirmado. Orden OTC aprobada automáticamente.' }, 'Sistema');
    return;
  }

  const verdict = verifyAgainstRegistry(order.doctor_license ?? '');
  if (verdict.valid) {
    log.saga(`Orden ${orderId}: fórmula verificada en RETHUS -> approveOrder`);
    await approveOrder({ orderId, note: 'Fórmula médica verificada por el químico farmacéutico.' }, 'Sistema');
  } else {
    log.saga(`Orden ${orderId}: fórmula rechazada (${verdict.reason}) -> cancelOrder`);
    await cancelOrder({ orderId, reason: verdict.reason, prescriptionRejected: true });
  }
}

function schedule(orderId: string, delayMs = env.approvalDelayMs) {
  if (scheduled.has(orderId)) return;
  const timer = setTimeout(() => {
    verify(orderId).catch((error) => log.error(`Saga de verificación falló para ${orderId}`, error));
  }, delayMs);
  timer.unref();
  scheduled.set(orderId, timer);
}

export async function startPrescriptionVerificationSaga(): Promise<void> {
  if (!env.autoApproval) {
    log.saga('AUTO_APPROVAL=false: las órdenes se aprueban manualmente desde /admin.');
    return;
  }
  onProjectedEvent((event) => {
    if (event.type === 'OrderPlaced') schedule(event.payload.orderId);
  });
  // Recupera órdenes pendientes tras un reinicio del servidor.
  const { rows } = await query<{ id: string }>("select id from write_model.orders where status = 'PENDING_APPROVAL'");
  rows.forEach((row, index) => schedule(row.id, 1000 + index * 200));
  if (rows.length > 0) log.saga(`${rows.length} orden(es) pendiente(s) reprogramada(s) para verificación.`);
}

export function stopPrescriptionVerificationSaga(): void {
  for (const timer of scheduled.values()) clearTimeout(timer);
  scheduled.clear();
}
