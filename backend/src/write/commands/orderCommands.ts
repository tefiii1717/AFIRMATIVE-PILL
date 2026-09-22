/**
 * Comandos del agregado Orden: placeOrder, approveOrder, dispatchOrder,
 * cancelOrder. Aquí viven las invariantes farmacéuticas:
 *   - Sin fórmula médica válida no hay orden con medicamentos de venta bajo receta.
 *   - Sin stock no hay venta: la reserva es atómica (bloqueo de filas + CHECK).
 *   - Una orden sólo se aprueba si su fórmula (cuando aplica) quedó verificada.
 */
import type pg from 'pg';
import { query } from '../../db/pool.js';
import { appendEvents } from '../../events/outbox.js';
import type { DomainEvent, OrderStatusChangedPayload } from '../../events/types.js';
import { executeCommand, reject } from '../commandBus.js';
import {
  cartNotOpen,
  emptyCart,
  insufficientStock,
  invalidPrescription,
  notFound,
  prescriptionRequired,
  validation,
  type UserError,
} from '../domain/errors.js';
import {
  checkTransition,
  money,
  validatePrescription,
  type OrderStatus,
  type PrescriptionData,
  type PrescriptionStatus,
} from '../domain/order.js';
import { emitCartUpdated } from './cartCommands.js';

export interface OrderReceipt {
  orderId: string;
  status: OrderStatus;
  total: string;
  requiresPrescription: boolean;
  acceptedAt: Date;
  eventVersion: number;
}

export interface PlaceOrderInput {
  cartId: string;
  customer: { fullName: string; email: string };
  prescription?: PrescriptionData | null;
}

interface CartLine {
  medication_id: string;
  quantity: number;
  commercial_name: string;
  presentation: string;
  price: string;
  stock: number;
  requires_prescription: boolean;
}

export function placeOrder(input: PlaceOrderInput) {
  return executeCommand<OrderReceipt>('PlaceOrder', { cartId: input.cartId }, async (client) => {
    const errors: UserError[] = [];
    if (input.customer.fullName.trim().length < 3) {
      errors.push(
        validation('fullName', 'Ingresa el nombre completo del paciente.', ['input', 'customer', 'fullName']),
      );
    }

    // 1. Carrito: debe existir, estar abierto y tener ítems (bloqueado FOR UPDATE
    //    para que dos placeOrder simultáneos sobre el mismo carrito no dupliquen).
    const { rows: carts } = await query<{ status: 'OPEN' | 'CHECKED_OUT' }>(
      'select status from write_model.carts where id = $1 for update',
      [input.cartId],
      client,
    );
    if (!carts[0]) reject(notFound('Cart', input.cartId, ['input', 'cartId']));
    if (carts[0].status !== 'OPEN') reject(cartNotOpen(carts[0].status));

    // 2. Ítems + medicamentos. Las filas de medications se bloquean en orden de id
    //    (FOR UPDATE) => serializa reservas concurrentes sin deadlocks.
    const { rows: lines } = await query<CartLine>(
      `select ci.medication_id, ci.quantity, m.commercial_name, m.presentation, m.price::text as price,
              m.stock, m.requires_prescription
       from write_model.cart_items ci
       join write_model.medications m on m.id = ci.medication_id
       where ci.cart_id = $1
       order by m.id
       for update of m`,
      [input.cartId],
      client,
    );
    if (lines.length === 0) reject(emptyCart());

    // 3. Invariante de fórmula médica.
    const rxLines = lines.filter((line) => line.requires_prescription);
    const requiresPrescription = rxLines.length > 0;
    if (requiresPrescription) {
      if (!input.prescription) {
        errors.push(
          prescriptionRequired(
            rxLines.map((line) => line.medication_id),
            rxLines.map((line) => line.commercial_name),
          ),
        );
      } else {
        errors.push(...validatePrescription(input.prescription));
      }
    }

    // 4. Invariante de inventario (sobre el write model, nunca sobre la proyección).
    for (const line of lines) {
      if (line.stock < line.quantity) {
        errors.push(insufficientStock(line.medication_id, line.commercial_name, line.quantity, line.stock));
      }
    }
    if (errors.length > 0) reject(...errors);

    // 5. Reserva atómica. El WHERE stock >= cantidad + CHECK (stock >= 0) son
    //    defensa en profundidad además del bloqueo de fila.
    const stockEvents: DomainEvent[] = [];
    const { rows: orderRows } = await query<{ id: string; created_at: Date }>(
      `insert into write_model.orders (cart_id, customer_name, customer_email, status, total, requires_prescription)
       values ($1, $2, $3, 'PENDING_APPROVAL', 0, $4) returning id, created_at`,
      [input.cartId, input.customer.fullName.trim(), input.customer.email, requiresPrescription],
      client,
    );
    const { id: orderId, created_at: placedAt } = orderRows[0];

    for (const line of lines) {
      const { rows } = await query<{ stock: number }>(
        `update write_model.medications
           set stock = stock - $2, version = version + 1, updated_at = now()
         where id = $1 and stock >= $2
         returning stock`,
        [line.medication_id, line.quantity],
        client,
      );
      if (!rows[0]) reject(insufficientStock(line.medication_id, line.commercial_name, line.quantity, line.stock));
      stockEvents.push({
        type: 'StockReserved',
        aggregateType: 'Medication',
        aggregateId: line.medication_id,
        payload: { medicationId: line.medication_id, orderId, delta: -line.quantity, stockAfter: rows[0].stock },
      });
    }

    const items = lines.map((line) => ({
      medicationId: line.medication_id,
      commercialName: line.commercial_name,
      presentation: line.presentation,
      quantity: line.quantity,
      unitPrice: line.price,
      subtotal: money.fromCents(money.toCents(line.price) * line.quantity),
    }));
    const total = money.fromCents(items.reduce((sum, item) => sum + money.toCents(item.subtotal), 0));

    await query('update write_model.orders set total = $2 where id = $1', [orderId, total], client);
    await query(
      `insert into write_model.order_items (order_id, medication_id, quantity, unit_price, requires_prescription)
       select $1, * from unnest($2::uuid[], $3::int[], $4::numeric[], $5::boolean[])`,
      [
        orderId,
        lines.map((line) => line.medication_id),
        lines.map((line) => line.quantity),
        lines.map((line) => line.price),
        lines.map((line) => line.requires_prescription),
      ],
      client,
    );

    const prescription = requiresPrescription && input.prescription ? input.prescription : null;
    if (prescription) {
      await query(
        `insert into write_model.prescriptions
           (order_id, prescription_number, doctor_name, doctor_license, patient_document, issued_at)
         values ($1, $2, $3, $4, $5, $6)`,
        [
          orderId,
          prescription.number.trim(),
          prescription.doctorName.trim(),
          prescription.doctorLicense.trim().toUpperCase(),
          prescription.patientDocument.trim(),
          prescription.issuedAt,
        ],
        client,
      );
    }

    await query("update write_model.carts set status = 'CHECKED_OUT' where id = $1", [input.cartId], client);
    await emitCartUpdated(client, input.cartId);

    const [placed] = await appendEvents(client, [
      {
        type: 'OrderPlaced',
        aggregateType: 'Order',
        aggregateId: orderId,
        payload: {
          orderId,
          cartId: input.cartId,
          customer: { fullName: input.customer.fullName.trim(), email: input.customer.email },
          items,
          itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
          total,
          requiresPrescription,
          prescription: prescription && {
            number: prescription.number.trim(),
            doctorName: prescription.doctorName.trim(),
            doctorLicense: prescription.doctorLicense.trim().toUpperCase(),
            issuedAt: prescription.issuedAt,
          },
          placedAt: placedAt.toISOString(),
        },
      },
      ...stockEvents,
    ]);

    return {
      orderId,
      status: 'PENDING_APPROVAL',
      total,
      requiresPrescription,
      acceptedAt: placedAt,
      eventVersion: placed.id,
    };
  });
}

interface OrderRow {
  id: string;
  status: OrderStatus;
  total: string;
  requires_prescription: boolean;
  prescription_status: 'PENDING_VERIFICATION' | 'VERIFIED' | 'REJECTED' | null;
}

async function lockOrder(client: pg.PoolClient, orderId: string): Promise<OrderRow> {
  const { rows } = await query<OrderRow>(
    `select o.id, o.status, o.total::text as total, o.requires_prescription, p.status as prescription_status
     from write_model.orders o
     left join write_model.prescriptions p on p.order_id = o.id
     where o.id = $1
     for update of o`,
    [orderId],
    client,
  );
  if (!rows[0]) reject(notFound('Order', orderId, ['input', 'orderId']));
  return rows[0];
}

async function transition(
  client: pg.PoolClient,
  order: OrderRow,
  target: OrderStatus,
  details: { reason?: string | null; note?: string | null; prescriptionStatus: PrescriptionStatus },
  extraEvents: DomainEvent[] = [],
): Promise<OrderReceipt> {
  const { rows } = await query<{ updated_at: Date }>(
    `update write_model.orders
       set status = $2, status_reason = $3, version = version + 1, updated_at = now()
     where id = $1 returning updated_at`,
    [order.id, target, details.reason ?? null],
    client,
  );
  const payload: OrderStatusChangedPayload = {
    orderId: order.id,
    status: target,
    prescriptionStatus: details.prescriptionStatus,
    reason: details.reason ?? null,
    note: details.note ?? null,
    occurredAt: rows[0].updated_at.toISOString(),
  };
  const type = target === 'APPROVED' ? 'OrderApproved' : target === 'DISPATCHED' ? 'OrderDispatched' : 'OrderCancelled';
  const [event] = await appendEvents(client, [
    { type, aggregateType: 'Order', aggregateId: order.id, payload } as DomainEvent,
    ...extraEvents,
  ]);
  return {
    orderId: order.id,
    status: target,
    total: order.total,
    requiresPrescription: order.requires_prescription,
    acceptedAt: rows[0].updated_at,
    eventVersion: event.id,
  };
}

function currentPrescriptionStatus(order: OrderRow): PrescriptionStatus {
  return order.requires_prescription ? (order.prescription_status ?? 'PENDING_VERIFICATION') : 'NOT_REQUIRED';
}

export function approveOrder(input: { orderId: string; note?: string | null }, actor = 'Químico farmacéutico') {
  return executeCommand<OrderReceipt>('ApproveOrder', input, async (client) => {
    const order = await lockOrder(client, input.orderId);
    const transitionError = checkTransition(order.status, 'APPROVED');
    if (transitionError) reject(transitionError);

    let prescriptionStatus: PrescriptionStatus = 'NOT_REQUIRED';
    if (order.requires_prescription) {
      // Invariante: no se aprueba una orden con receta sin fórmula verificada.
      if (!order.prescription_status || order.prescription_status === 'REJECTED') {
        reject(invalidPrescription('La orden no tiene una fórmula médica válida para aprobar.', ['input', 'orderId']));
      }
      await query(
        "update write_model.prescriptions set status = 'VERIFIED', verified_at = now() where order_id = $1",
        [order.id],
        client,
      );
      prescriptionStatus = 'VERIFIED';
    }
    return transition(client, order, 'APPROVED', {
      prescriptionStatus,
      note: input.note ?? `Aprobada por ${actor}.`,
    });
  });
}

export function dispatchOrder(input: { orderId: string; carrier?: string | null }) {
  return executeCommand<OrderReceipt>('DispatchOrder', input, async (client) => {
    const order = await lockOrder(client, input.orderId);
    const transitionError = checkTransition(order.status, 'DISPATCHED');
    if (transitionError) reject(transitionError);
    return transition(client, order, 'DISPATCHED', {
      prescriptionStatus: currentPrescriptionStatus(order),
      note: `Despachada con ${input.carrier?.trim() || 'Afirmative Express'}.`,
    });
  });
}

export function cancelOrder(input: { orderId: string; reason: string; prescriptionRejected?: boolean }) {
  return executeCommand<OrderReceipt>('CancelOrder', input, async (client) => {
    if (input.reason.trim().length < 3) {
      reject(validation('reason', 'Indica el motivo de la cancelación.'));
    }
    const order = await lockOrder(client, input.orderId);
    const transitionError = checkTransition(order.status, 'CANCELLED');
    if (transitionError) reject(transitionError);

    let prescriptionStatus = currentPrescriptionStatus(order);
    if (input.prescriptionRejected && order.requires_prescription) {
      await query(
        "update write_model.prescriptions set status = 'REJECTED', rejection_reason = $2 where order_id = $1",
        [order.id, input.reason],
        client,
      );
      prescriptionStatus = 'REJECTED';
    }

    // Compensación: liberar el inventario reservado. Se bloquean primero las
    // filas en orden de id (mismo orden que placeOrder => sin deadlocks).
    await query(
      `select m.id from write_model.medications m
       join write_model.order_items oi on oi.medication_id = m.id
       where oi.order_id = $1 order by m.id for update of m`,
      [order.id],
      client,
    );
    const { rows: released } = await query<{ id: string; stock: number; quantity: number }>(
      `update write_model.medications m
         set stock = m.stock + oi.quantity, version = m.version + 1, updated_at = now()
       from write_model.order_items oi
       where oi.order_id = $1 and m.id = oi.medication_id
       returning m.id, m.stock, oi.quantity`,
      [order.id],
      client,
    );
    const stockEvents: DomainEvent[] = released.map((row) => ({
      type: 'StockReleased',
      aggregateType: 'Medication',
      aggregateId: row.id,
      payload: { medicationId: row.id, orderId: order.id, delta: row.quantity, stockAfter: row.stock },
    }));

    return transition(
      client,
      order,
      'CANCELLED',
      { prescriptionStatus, reason: input.reason.trim(), note: `Cancelada: ${input.reason.trim()}` },
      stockEvents,
    );
  });
}
