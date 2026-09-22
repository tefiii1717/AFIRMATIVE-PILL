import type { OrderStatus, StockAvailability } from '@/graphql/types';
import { AVAILABILITY_LABEL, ORDER_STATUS_LABEL } from '@/lib/format';

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <span className={`badge status-${status.toLowerCase()}`}>{ORDER_STATUS_LABEL[status]}</span>;
}

export function AvailabilityBadge({ availability, stock }: { availability: StockAvailability; stock?: number }) {
  return (
    <span className={`badge availability-${availability.toLowerCase()}`}>
      {AVAILABILITY_LABEL[availability]}
      {availability === 'LOW_STOCK' && stock !== undefined ? ` (${stock})` : ''}
    </span>
  );
}

export function RxBadge() {
  return (
    <span className="badge rx" title="Requiere fórmula médica">
      Rx
    </span>
  );
}
