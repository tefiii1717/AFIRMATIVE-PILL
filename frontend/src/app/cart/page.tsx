'use client';

/**
 * Escenario B — Armado del pedido y control de prescripción.
 *
 * - Cambios de cantidad con optimisticResponse: la UI responde al instante y
 *   Apollo reconcilia con la respuesta real del comando.
 * - placeOrder devuelve un OrderReceipt (acuse del write model). La proyección
 *   de la orden llega después (consistencia eventual), por eso el recibo se
 *   guarda y se navega a /orders/[id], que sabe esperar la proyección.
 */
import { useMutation, useQuery } from '@apollo/client/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { ErrorList } from '@/components/ErrorList';
import { RxBadge } from '@/components/StatusBadge';
import {
  CART_QUERY,
  CHANGE_CART_ITEM_QUANTITY,
  PLACE_ORDER,
  REMOVE_ITEM_FROM_CART,
  type PlaceOrderVars,
} from '@/graphql/operations';
import type { CartData, UserErrorData } from '@/graphql/types';
import { useCart } from '@/lib/cart-context';
import { formatMoney } from '@/lib/format';
import { readStorage, writeStorage } from '@/lib/storage';

const today = () => new Date().toISOString().slice(0, 10);

function recalculate(cart: CartData, medicationId: string, quantity: number): CartData {
  const items = cart.items
    .map((item) =>
      item.medication.id === medicationId
        ? { ...item, quantity, lineTotal: Math.round(item.medication.price * quantity * 100) / 100 }
        : item,
    )
    .filter((item) => item.quantity > 0);
  return {
    ...cart,
    items,
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    subtotal: items.reduce((sum, item) => sum + item.lineTotal, 0),
    requiresPrescription: items.some((item) => item.medication.requiresPrescription),
  };
}

export default function CartPage() {
  const router = useRouter();
  const { cartId, resetCart } = useCart();
  const { data, loading, error } = useQuery(CART_QUERY, { variables: { id: cartId ?? '' }, skip: !cartId });
  const [changeQuantity] = useMutation(CHANGE_CART_ITEM_QUANTITY);
  const [removeItem] = useMutation(REMOVE_ITEM_FROM_CART);
  const [placeOrder, { loading: placing }] = useMutation(PLACE_ORDER);

  const [lineErrors, setLineErrors] = useState<UserErrorData[]>([]);
  const [orderErrors, setOrderErrors] = useState<UserErrorData[]>([]);
  const [customer, setCustomer] = useState({ fullName: '', email: '' });
  const [prescription, setPrescription] = useState({
    number: '',
    doctorName: '',
    doctorLicense: '',
    patientDocument: '',
    issuedAt: today(),
  });

  useEffect(() => {
    const saved = readStorage('afirmative-pill:customer');
    if (saved) setCustomer(JSON.parse(saved));
  }, []);

  const cart = data?.cart;

  if (!cartId || (cart && cart.status !== 'OPEN')) {
    return (
      <div className="empty">
        Tu carrito está vacío. <Link href="/">Explorar el catálogo</Link>
      </div>
    );
  }
  if (error) return <div className="alert alert-error">Error: {error.message}</div>;
  if (loading && !cart) return <p className="muted">Cargando carrito…</p>;
  if (!cart || cart.items.length === 0) {
    return (
      <div className="empty">
        Tu carrito está vacío. <Link href="/">Explorar el catálogo</Link>
      </div>
    );
  }

  async function updateQuantity(medicationId: string, quantity: number) {
    if (!cart) return;
    setLineErrors([]);
    const optimisticCart = recalculate(cart, medicationId, quantity);
    const result =
      quantity === 0
        ? (
            await removeItem({
              variables: { input: { cartId: cart.id, medicationId } },
              optimisticResponse: { removeItemFromCart: { __typename: 'CartPayload', cart: optimisticCart, errors: [] } },
            })
          ).data?.removeItemFromCart
        : (
            await changeQuantity({
              variables: { input: { cartId: cart.id, medicationId, quantity } },
              optimisticResponse: {
                changeCartItemQuantity: { __typename: 'CartPayload', cart: optimisticCart, errors: [] },
              },
            })
          ).data?.changeCartItemQuantity;
    // Si el comando fue rechazado (p. ej. stock insuficiente) Apollo descarta la
    // capa optimista y la UI vuelve al estado confirmado del servidor.
    if (result?.errors.length) setLineErrors(result.errors);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!cart) return;
    setOrderErrors([]);
    writeStorage('afirmative-pill:customer', JSON.stringify(customer));
    const input: PlaceOrderVars['input'] = {
      cartId: cart.id,
      customer,
      prescription: cart.requiresPrescription ? prescription : null,
    };
    try {
      const { data: result } = await placeOrder({ variables: { input } });
      const payload = result?.placeOrder;
      if (!payload?.receipt) {
        setOrderErrors(payload?.errors ?? []);
        return;
      }
      // Recibo del comando: lo usa /orders/[id] mientras la proyección se sincroniza.
      writeStorage(`afirmative-pill:receipt:${payload.receipt.orderId}`, JSON.stringify(payload.receipt), true);
      resetCart();
      router.push(`/orders/${payload.receipt.orderId}`);
    } catch (mutationError) {
      setOrderErrors([
        { __typename: 'NetworkError', code: 'NETWORK', message: (mutationError as Error).message, path: null },
      ]);
    }
  }

  const fieldError = (field: string) =>
    orderErrors.find((error) => error.path?.at(-1) === field || error.field === field)?.message;

  return (
    <section className="cart-layout">
      <div>
        <div className="page-header">
          <h1>Tu carrito</h1>
          <p className="muted">{cart.itemCount} unidad(es)</p>
        </div>
        <ErrorList errors={lineErrors} />
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>Medicamento</th>
                <th>Precio</th>
                <th>Cantidad</th>
                <th>Subtotal</th>
                <th aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {cart.items.map((item) => (
                <tr key={item.medication.id}>
                  <td>
                    <Link href={`/medications/${item.medication.id}`}>{item.medication.commercialName}</Link>{' '}
                    {item.medication.requiresPrescription && <RxBadge />}
                    <div className="muted small">{item.medication.presentation}</div>
                  </td>
                  <td>{formatMoney(item.medication.price)}</td>
                  <td>
                    <div className="stepper">
                      <button
                        className="btn btn-small"
                        onClick={() => updateQuantity(item.medication.id, item.quantity - 1)}
                        aria-label="Disminuir"
                      >
                        −
                      </button>
                      <span>{item.quantity}</span>
                      <button
                        className="btn btn-small"
                        onClick={() => updateQuantity(item.medication.id, item.quantity + 1)}
                        aria-label="Aumentar"
                      >
                        +
                      </button>
                    </div>
                  </td>
                  <td>{formatMoney(item.lineTotal)}</td>
                  <td>
                    <button className="btn btn-link" onClick={() => updateQuantity(item.medication.id, 0)}>
                      Quitar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="total">
            Total: <strong>{formatMoney(cart.subtotal)}</strong>
          </p>
        </div>
      </div>

      <form className="card checkout" onSubmit={handleSubmit}>
        <h2>Confirmar pedido</h2>
        <ErrorList errors={orderErrors} />
        <label>
          Nombre completo
          <input
            className="input"
            required
            value={customer.fullName}
            onChange={(event) => setCustomer({ ...customer, fullName: event.target.value })}
          />
          {fieldError('fullName') && <small className="text-error">{fieldError('fullName')}</small>}
        </label>
        <label>
          Correo electrónico
          <input
            className="input"
            type="email"
            required
            value={customer.email}
            onChange={(event) => setCustomer({ ...customer, email: event.target.value })}
          />
        </label>

        {cart.requiresPrescription && (
          <fieldset className="prescription">
            <legend>
              <RxBadge /> Fórmula médica
            </legend>
            <p className="muted small">
              Tu pedido incluye medicamentos de venta bajo fórmula. El químico farmacéutico verificará estos datos
              antes de aprobar la orden. (Demo: un registro médico terminado en <code>000</code> será rechazado.)
            </p>
            {(
              [
                ['number', 'Número de la fórmula', 'text'],
                ['doctorName', 'Médico tratante', 'text'],
                ['doctorLicense', 'Registro médico (RETHUS)', 'text'],
                ['patientDocument', 'Documento del paciente', 'text'],
                ['issuedAt', 'Fecha de expedición', 'date'],
              ] as const
            ).map(([field, label, type]) => (
              <label key={field}>
                {label}
                <input
                  className="input"
                  type={type}
                  required
                  max={type === 'date' ? today() : undefined}
                  value={prescription[field]}
                  onChange={(event) => setPrescription({ ...prescription, [field]: event.target.value })}
                />
                {fieldError(field) && <small className="text-error">{fieldError(field)}</small>}
              </label>
            ))}
          </fieldset>
        )}

        <button className="btn btn-primary btn-block" type="submit" disabled={placing}>
          {placing ? 'Enviando comando…' : `Pagar ${formatMoney(cart.subtotal)}`}
        </button>
      </form>
    </section>
  );
}
