'use client';

/** Lista de pedidos del paciente (proyección order_summary filtrada por correo). */
import { useQuery } from '@apollo/client/react';
import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { OrderStatusBadge } from '@/components/StatusBadge';
import { ORDERS_QUERY } from '@/graphql/operations';
import { formatDateTime, formatMoney } from '@/lib/format';
import { readStorage } from '@/lib/storage';

export default function MyOrdersPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState('');

  useEffect(() => {
    const saved = readStorage('afirmative-pill:customer');
    if (saved) {
      const customer = JSON.parse(saved) as { email?: string };
      if (customer.email) {
        setEmail(customer.email);
        setSubmitted(customer.email.toLowerCase());
      }
    }
  }, []);

  const { data, loading, error } = useQuery(ORDERS_QUERY, {
    variables: { filter: { customerEmail: submitted }, first: 20 },
    skip: !submitted,
    pollInterval: 5000,
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(email.trim().toLowerCase());
  }

  return (
    <section>
      <div className="page-header">
        <h1>Mis pedidos</h1>
      </div>
      <form className="filters card" onSubmit={handleSubmit}>
        <input
          className="input search"
          type="email"
          placeholder="Correo con el que hiciste el pedido"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <button className="btn btn-primary" type="submit">
          Consultar
        </button>
      </form>
      {error && <div className="alert alert-error">{error.message}</div>}
      {loading && !data && <p className="muted">Cargando…</p>}
      {data && data.orders.edges.length === 0 && <p className="empty">No hay pedidos para {submitted}.</p>}
      <div className="list">
        {data?.orders.edges.map(({ node }) => (
          <Link key={node.id} href={`/orders/${node.id}`} className="card order-row">
            <div>
              <strong>Pedido {node.id.slice(0, 8).toUpperCase()}</strong>
              <div className="muted small">
                {formatDateTime(node.placedAt)} · {node.itemCount} unidad(es)
              </div>
            </div>
            <div className="order-row-right">
              <OrderStatusBadge status={node.status} />
              <strong>{formatMoney(node.total)}</strong>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
