/** Consultas de órdenes y carritos: SÓLO proyecciones del read_model. */
import { query } from '../db/pool.js';
import type { CartLineView, CartView, OrderLineView, OrderTimelineView, OrderView } from './views.js';

interface OrderRow {
  id: string;
  status: string;
  status_reason: string | null;
  customer_name: string;
  customer_email: string;
  total: string;
  item_count: number;
  requires_prescription: boolean;
  prescription_number: string | null;
  prescription_doctor: string | null;
  prescription_license: string | null;
  prescription_issued_at: string | null;
  prescription_status: string;
  prescription_rejection: string | null;
  placed_at: Date;
  updated_at: Date;
  last_event_id: number;
}

const ORDER_COLUMNS = `id, status, status_reason, customer_name, customer_email, total::text as total, item_count,
  requires_prescription, prescription_number, prescription_doctor, prescription_license, prescription_issued_at,
  prescription_status, prescription_rejection, placed_at, updated_at, last_event_id`;

const toOrder = (row: OrderRow): OrderView => ({
  id: row.id,
  status: row.status,
  statusReason: row.status_reason,
  customer: { fullName: row.customer_name, email: row.customer_email },
  itemCount: row.item_count,
  total: row.total,
  requiresPrescription: row.requires_prescription,
  prescriptionStatus: row.prescription_status,
  prescriptionRejectionReason: row.prescription_rejection,
  prescription: row.prescription_number
    ? {
        number: row.prescription_number,
        doctorName: row.prescription_doctor ?? '',
        doctorLicense: row.prescription_license ?? '',
        issuedAt: row.prescription_issued_at ?? '',
      }
    : null,
  placedAt: row.placed_at,
  updatedAt: row.updated_at,
  projectionVersion: row.last_event_id,
});

export const orderReadRepository = {
  async findByIds(ids: readonly string[]): Promise<OrderView[]> {
    const { rows } = await query<OrderRow>(
      `select ${ORDER_COLUMNS} from read_model.order_summary where id = any($1::uuid[])`,
      [ids],
    );
    return rows.map(toOrder);
  },

  async list(filter: { status?: string | null; customerEmail?: string | null }, limit: number, offset: number) {
    const where: string[] = [];
    const params: unknown[] = [];
    if (filter.status) {
      params.push(filter.status);
      where.push(`status = $${params.length}`);
    }
    if (filter.customerEmail) {
      params.push(filter.customerEmail.toLowerCase());
      where.push(`lower(customer_email) = $${params.length}`);
    }
    params.push(limit, offset);
    const { rows } = await query<OrderRow & { total_count: number }>(
      `select ${ORDER_COLUMNS}, count(*) over()::int as total_count
       from read_model.order_summary
       ${where.length ? `where ${where.join(' and ')}` : ''}
       order by placed_at desc, id
       limit $${params.length - 1} offset $${params.length}`,
      params,
    );
    return { rows: rows.map(toOrder), totalCount: rows[0]?.total_count ?? 0 };
  },

  async linesByOrderIds(ids: readonly string[]): Promise<(OrderLineView & { orderId: string })[]> {
    const { rows } = await query<{
      order_id: string;
      medication_id: string;
      commercial_name: string;
      presentation: string;
      quantity: number;
      unit_price: string;
      subtotal: string;
    }>(
      `select order_id, medication_id, commercial_name, presentation, quantity,
              unit_price::text as unit_price, subtotal::text as subtotal
       from read_model.order_line_view where order_id = any($1::uuid[]) order by commercial_name`,
      [ids],
    );
    return rows.map((row) => ({
      orderId: row.order_id,
      medicationId: row.medication_id,
      commercialName: row.commercial_name,
      presentation: row.presentation,
      quantity: row.quantity,
      unitPrice: row.unit_price,
      subtotal: row.subtotal,
    }));
  },

  async timelineByOrderIds(ids: readonly string[]): Promise<(OrderTimelineView & { orderId: string })[]> {
    const { rows } = await query<{ order_id: string; status: string; note: string | null; occurred_at: Date }>(
      `select order_id, status, note, occurred_at from read_model.order_timeline
       where order_id = any($1::uuid[]) order by occurred_at, id`,
      [ids],
    );
    return rows.map((row) => ({ orderId: row.order_id, status: row.status, note: row.note, occurredAt: row.occurred_at }));
  },

  async cartsByIds(ids: readonly string[]): Promise<CartView[]> {
    const { rows } = await query<{ id: string; status: CartView['status']; updated_at: Date }>(
      'select id, status, updated_at from read_model.cart_view where id = any($1::uuid[])',
      [ids],
    );
    return rows.map((row) => ({ id: row.id, status: row.status, updatedAt: row.updated_at }));
  },

  async cartLinesByCartIds(ids: readonly string[]): Promise<(CartLineView & { cartId: string })[]> {
    const { rows } = await query<{ cart_id: string; medication_id: string; quantity: number }>(
      `select cart_id, medication_id, quantity from read_model.cart_line_view
       where cart_id = any($1::uuid[]) order by added_at`,
      [ids],
    );
    return rows.map((row) => ({ cartId: row.cart_id, medicationId: row.medication_id, quantity: row.quantity }));
  },
};
