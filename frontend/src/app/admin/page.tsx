'use client';

/**
 * Panel de la farmacia (químico farmacéutico / logística).
 * - Lista órdenes desde la proyección order_summary.
 * - Ejecuta los comandos approveOrder / dispatchOrder / cancelOrder.
 * - La suscripción ordersFeed actualiza la caché normalizada en tiempo real;
 *   si llega una orden nueva que no está en la lista, se re-consulta la página.
 */
import { useMutation, useQuery, useSubscription } from '@apollo/client/react';
import Link from 'next/link';
import { useState } from 'react';
import { ErrorList } from '@/components/ErrorList';
import { OrderStatusBadge, RxBadge } from '@/components/StatusBadge';
import { APPROVE_ORDER, CANCEL_ORDER, DISPATCH_ORDER, ORDERS_FEED, ORDERS_QUERY } from '@/graphql/operations';
import type { OrderStatus, UserErrorData } from '@/graphql/types';
import { formatDateTime, formatMoney, ORDER_STATUS_LABEL, PRESCRIPTION_STATUS_LABEL } from '@/lib/format';

const STATUSES: (OrderStatus | '')[] = ['', 'PENDING_APPROVAL', 'APPROVED', 'DISPATCHED', 'CANCELLED'];

export default function AdminPage() {
  const [status, setStatus] = useState<OrderStatus | ''>('');
  const [errors, setErrors] = useState<UserErrorData[]>([]);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const variables = { filter: status ? { status } : {}, first: 30 };
  const { data, loading, error, refetch } = useQuery(ORDERS_QUERY, { variables });

  useSubscription(ORDERS_FEED, {
    onData: ({ data: event }) => {
      const updated = event.data?.ordersFeed;
      if (!updated) return;
      const known = data?.orders.edges.some((edge) => edge.node.id === updated.id);
      // Las órdenes conocidas se actualizan solas (Order:<id> normalizado).
      // Una orden nueva o que cambió de estado bajo un filtro requiere re-consultar la lista.
      if (!known || (status && updated.status !== status)) void refetch();
    },
  });

  const [approve] = useMutation(APPROVE_ORDER);
  const [dispatch] = useMutation(DISPATCH_ORDER);
  const [cancel] = useMutation(CANCEL_ORDER);

  async function run(orderId: string, action: 'approve' | 'dispatch' | 'cancel') {
    setErrors([]);
    setPendingId(orderId);
    try {
      let payload;
      if (action === 'approve') payload = (await approve({ variables: { input: { orderId } } })).data?.approveOrder;
      else if (action === 'dispatch') {
        payload = (await dispatch({ variables: { input: { orderId, carrier: 'Afirmative Express' } } })).data
          ?.dispatchOrder;
      } else {
        const reason = window.prompt('Motivo de la cancelación', 'Solicitud del paciente');
        if (!reason) return;
        payload = (await cancel({ variables: { input: { orderId, reason } } })).data?.cancelOrder;
      }
      if (payload?.errors.length) setErrors(payload.errors);
      // No se toca la caché aquí: el comando devuelve sólo un recibo; la
      // proyección actualizada llegará por la suscripción ordersFeed.
    } finally {
      setPendingId(null);
    }
  }

  return (
    <section>
      <div className="page-header">
        <h1>Panel de la farmacia</h1>
        <p className="muted">Validación de fórmulas y despacho. Las filas se actualizan en tiempo real.</p>
      </div>

      <div className="filters card">
        <select className="input" value={status} onChange={(event) => setStatus(event.target.value as OrderStatus | '')}>
          {STATUSES.map((value) => (
            <option key={value} value={value}>
              {value ? ORDER_STATUS_LABEL[value] : 'Todos los estados'}
            </option>
          ))}
        </select>
        <span className="muted">{data?.orders.totalCount ?? 0} orden(es)</span>
      </div>

      <ErrorList errors={errors} />
      {error && <div className="alert alert-error">{error.message}</div>}
      {loading && !data && <p className="muted">Cargando…</p>}

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Pedido</th>
              <th>Paciente</th>
              <th>Total</th>
              <th>Fórmula</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {data?.orders.edges.map(({ node }) => (
              <tr key={node.id}>
                <td>
                  <Link href={`/orders/${node.id}`}>{node.id.slice(0, 8).toUpperCase()}</Link>
                  <div className="muted small">{formatDateTime(node.placedAt)}</div>
                </td>
                <td>
                  {node.customer.fullName}
                  <div className="muted small">{node.customer.email}</div>
                </td>
                <td>{formatMoney(node.total)}</td>
                <td>
                  {node.requiresPrescription && <RxBadge />} {PRESCRIPTION_STATUS_LABEL[node.prescriptionStatus]}
                </td>
                <td>
                  <OrderStatusBadge status={node.status} />
                  {node.statusReason && <div className="muted small">{node.statusReason}</div>}
                </td>
                <td className="actions">
                  {node.status === 'PENDING_APPROVAL' && (
                    <button className="btn btn-small" disabled={pendingId === node.id} onClick={() => run(node.id, 'approve')}>
                      Aprobar
                    </button>
                  )}
                  {node.status === 'APPROVED' && (
                    <button className="btn btn-small btn-primary" disabled={pendingId === node.id} onClick={() => run(node.id, 'dispatch')}>
                      Despachar
                    </button>
                  )}
                  {(node.status === 'PENDING_APPROVAL' || node.status === 'APPROVED') && (
                    <button className="btn btn-small btn-danger" disabled={pendingId === node.id} onClick={() => run(node.id, 'cancel')}>
                      Cancelar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && data.orders.edges.length === 0 && <p className="empty">No hay órdenes.</p>}
      </div>
    </section>
  );
}
