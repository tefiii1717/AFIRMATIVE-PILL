'use client';

/**
 * Escenario C — Seguimiento y proyección del pedido.
 *
 * Estrategia de consistencia eventual en la UI:
 *  1. Justo después de placeOrder la proyección puede no existir (order = null).
 *     Se muestra el OrderReceipt del comando (total, estado inicial) con el
 *     aviso "sincronizando" y se sondea cada segundo hasta que aparezca.
 *  2. Desde ese momento, la suscripción orderUpdated empuja cada cambio de la
 *     proyección; como el payload trae Order:{id}, Apollo actualiza la caché
 *     normalizada y la vista se re-renderiza sola.
 *  3. projectionVersion (id del último evento aplicado) permite saber si la
 *     proyección ya refleja el comando (>= receipt.eventVersion).
 */
import { useQuery, useSubscription } from '@apollo/client/react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { OrderStatusBadge } from '@/components/StatusBadge';
import { OrderTracker } from '@/components/OrderTracker';
import { ORDER_QUERY, ORDER_UPDATED } from '@/graphql/operations';
import type { OrderReceiptData } from '@/graphql/types';
import { formatDateTime, formatMoney, ORDER_STATUS_LABEL, PRESCRIPTION_STATUS_LABEL } from '@/lib/format';
import { readStorage } from '@/lib/storage';

export default function OrderPage() {
  const { id } = useParams<{ id: string }>();
  const [receipt, setReceipt] = useState<OrderReceiptData | null>(null);

  useEffect(() => {
    const saved = readStorage(`afirmative-pill:receipt:${id}`, true);
    if (saved) setReceipt(JSON.parse(saved));
  }, [id]);

  const { data, loading, error, startPolling, stopPolling } = useQuery(ORDER_QUERY, {
    variables: { id },
    fetchPolicy: 'cache-and-network',
  });
  const order = data?.order ?? null;

  // Sondeo sólo mientras la proyección aún no existe.
  useEffect(() => {
    if (order) stopPolling();
    else startPolling(1000);
    return () => stopPolling();
  }, [order, startPolling, stopPolling]);

  // Tiempo real: cada cambio de la proyección llega por WebSocket.
  const { data: live } = useSubscription(ORDER_UPDATED, { variables: { orderId: id } });
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (!live) return;
    setFlash(true);
    const timer = setTimeout(() => setFlash(false), 1200);
    return () => clearTimeout(timer);
  }, [live]);

  if (error) return <div className="alert alert-error">Error: {error.message}</div>;

  const syncing = !order;
  const behind = order && receipt ? order.projectionVersion < receipt.eventVersion : false;

  return (
    <section>
      <Link href="/orders" className="back">
        ← Mis pedidos
      </Link>
      <div className="page-header">
        <h1>Pedido {id.slice(0, 8).toUpperCase()}</h1>
        {order && <OrderStatusBadge status={order.status} />}
      </div>

      <OrderTracker status={order?.status ?? receipt?.status ?? null} syncing={syncing} />

      {syncing && (
        <div className="alert alert-info">
          <span className="spinner" aria-hidden /> Tu pedido fue <strong>aceptado por el sistema</strong> y estamos
          sincronizando su proyección (consistencia eventual). Esto toma sólo unos instantes.
          {receipt && (
            <div className="receipt">
              Recibo del comando · Estado: {ORDER_STATUS_LABEL[receipt.status]} · Total:{' '}
              <strong>{formatMoney(receipt.total)}</strong> · {formatDateTime(receipt.acceptedAt)}
            </div>
          )}
          {!receipt && !loading && <div className="receipt">Si el pedido no existe, verifica el enlace.</div>}
        </div>
      )}

      {order && (
        <div className={`order-grid ${flash ? 'flash' : ''}`}>
          <div className="card">
            <h2>Detalle</h2>
            <table className="table">
              <thead>
                <tr>
                  <th>Medicamento</th>
                  <th>Cant.</th>
                  <th>Precio unit.</th>
                  <th>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item) => (
                  <tr key={item.medication.id}>
                    <td>
                      <Link href={`/medications/${item.medication.id}`}>{item.commercialName}</Link>
                      <div className="muted small">{item.presentation}</div>
                    </td>
                    <td>{item.quantity}</td>
                    <td>{formatMoney(item.unitPrice)}</td>
                    <td>{formatMoney(item.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="total">
              Total: <strong>{formatMoney(order.total)}</strong>
            </p>
          </div>

          <div className="card">
            <h2>Estado</h2>
            <dl className="specs">
              <dt>Paciente</dt>
              <dd>
                {order.customer.fullName} · {order.customer.email}
              </dd>
              <dt>Realizado</dt>
              <dd>{formatDateTime(order.placedAt)}</dd>
              <dt>Fórmula médica</dt>
              <dd>{PRESCRIPTION_STATUS_LABEL[order.prescriptionStatus]}</dd>
              {order.prescription && (
                <>
                  <dt>Prescriptor</dt>
                  <dd>
                    {order.prescription.doctorName} ({order.prescription.doctorLicense}) · Nº {order.prescription.number}
                  </dd>
                </>
              )}
              {order.statusReason && (
                <>
                  <dt>Motivo</dt>
                  <dd>{order.statusReason}</dd>
                </>
              )}
              <dt>Versión de proyección</dt>
              <dd>
                v{order.projectionVersion} {behind && <span className="muted">(actualizando…)</span>}
                {live && <span className="live-dot" title="Recibiendo actualizaciones en tiempo real" />}
              </dd>
            </dl>
            <h3>Historial</h3>
            <ul className="timeline">
              {order.timeline.map((entry, index) => (
                <li key={`${entry.occurredAt}-${index}`}>
                  <OrderStatusBadge status={entry.status} />
                  <span className="muted small">{formatDateTime(entry.occurredAt)}</span>
                  {entry.note && <div>{entry.note}</div>}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
