import type { OrderStatus, PrescriptionStatus, StockAvailability } from '@/graphql/types';

const currency = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const dateTime = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' });

export const formatMoney = (value: number) => currency.format(value);
export const formatDateTime = (value: string) => dateTime.format(new Date(value));

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING_APPROVAL: 'Pendiente de aprobación',
  APPROVED: 'Aprobada',
  DISPATCHED: 'Despachada',
  CANCELLED: 'Cancelada',
};

export const PRESCRIPTION_STATUS_LABEL: Record<PrescriptionStatus, string> = {
  NOT_REQUIRED: 'No requiere fórmula',
  PENDING_VERIFICATION: 'Fórmula en verificación',
  VERIFIED: 'Fórmula verificada',
  REJECTED: 'Fórmula rechazada',
};

export const AVAILABILITY_LABEL: Record<StockAvailability, string> = {
  IN_STOCK: 'Disponible',
  LOW_STOCK: 'Últimas unidades',
  OUT_OF_STOCK: 'Agotado',
};
