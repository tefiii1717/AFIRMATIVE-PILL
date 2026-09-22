/**
 * Eventos de dominio emitidos por los command handlers y persistidos en el
 * outbox (write_model.domain_events). Son el ÚNICO puente entre el write model
 * y el read model.
 */
import type { OrderStatus, PrescriptionStatus } from '../write/domain/order.js';

export interface CartUpdatedPayload {
  cartId: string;
  status: 'OPEN' | 'CHECKED_OUT';
  items: { medicationId: string; quantity: number; addedAt: string }[];
  updatedAt: string;
}

export interface OrderPlacedPayload {
  orderId: string;
  cartId: string;
  customer: { fullName: string; email: string };
  items: {
    medicationId: string;
    commercialName: string;
    presentation: string;
    quantity: number;
    unitPrice: string;
    subtotal: string;
  }[];
  itemCount: number;
  total: string;
  requiresPrescription: boolean;
  prescription: {
    number: string;
    doctorName: string;
    doctorLicense: string;
    issuedAt: string;
  } | null;
  placedAt: string;
}

export interface StockChangedPayload {
  medicationId: string;
  orderId: string;
  delta: number;
  stockAfter: number;
}

export interface OrderStatusChangedPayload {
  orderId: string;
  status: OrderStatus;
  prescriptionStatus: PrescriptionStatus;
  reason: string | null;
  note: string | null;
  occurredAt: string;
}

export type DomainEvent =
  | { type: 'CartUpdated'; aggregateType: 'Cart'; aggregateId: string; payload: CartUpdatedPayload }
  | { type: 'OrderPlaced'; aggregateType: 'Order'; aggregateId: string; payload: OrderPlacedPayload }
  | { type: 'StockReserved'; aggregateType: 'Medication'; aggregateId: string; payload: StockChangedPayload }
  | { type: 'StockReleased'; aggregateType: 'Medication'; aggregateId: string; payload: StockChangedPayload }
  | { type: 'OrderApproved'; aggregateType: 'Order'; aggregateId: string; payload: OrderStatusChangedPayload }
  | { type: 'OrderDispatched'; aggregateType: 'Order'; aggregateId: string; payload: OrderStatusChangedPayload }
  | { type: 'OrderCancelled'; aggregateType: 'Order'; aggregateId: string; payload: OrderStatusChangedPayload };

export type DomainEventType = DomainEvent['type'];

/** Evento tal como se lee del outbox (con id secuencial y fecha). */
export type StoredEvent = DomainEvent & { id: number; occurredAt: Date };
