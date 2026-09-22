import type { OrderStatus } from '@/graphql/types';
import { ORDER_STATUS_LABEL } from '@/lib/format';

const FLOW: OrderStatus[] = ['PENDING_APPROVAL', 'APPROVED', 'DISPATCHED'];

/** Stepper visual del ciclo de vida de la orden. */
export function OrderTracker({ status, syncing }: { status: OrderStatus | null; syncing?: boolean }) {
  if (status === 'CANCELLED') {
    return <div className="tracker cancelled">✕ Orden cancelada</div>;
  }
  const currentIndex = status ? FLOW.indexOf(status) : -1;
  return (
    <ol className="tracker">
      <li className={syncing ? 'step current syncing' : 'step done'}>
        <span className="dot" />
        {syncing ? 'Sincronizando…' : 'Recibida'}
      </li>
      {FLOW.map((step, index) => (
        <li
          key={step}
          className={`step ${index < currentIndex || status === 'DISPATCHED' ? 'done' : index === currentIndex ? 'current' : ''}`}
        >
          <span className="dot" />
          {ORDER_STATUS_LABEL[step]}
        </li>
      ))}
    </ol>
  );
}
