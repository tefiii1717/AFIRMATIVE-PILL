'use client';

import { useMutation } from '@apollo/client/react';
import { useState } from 'react';
import { ADD_ITEM_TO_CART } from '@/graphql/operations';
import type { UserErrorData } from '@/graphql/types';
import { useCart } from '@/lib/cart-context';

interface Props {
  medicationId: string;
  disabled?: boolean;
  quantity?: number;
  compact?: boolean;
}

/**
 * Ejecuta el comando addItemToCart. La respuesta trae el Cart completo, así que
 * Apollo actualiza la caché normalizada (Cart:<id>) y el contador del header se
 * refresca sin refetch.
 */
export function AddToCartButton({ medicationId, disabled, quantity = 1, compact }: Props) {
  const { ensureCart } = useCart();
  const [addItem, { loading }] = useMutation(ADD_ITEM_TO_CART);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  async function handleClick() {
    setFeedback(null);
    const attempt = async (cartId: string) =>
      (await addItem({ variables: { input: { cartId, medicationId, quantity } } })).data?.addItemToCart;
    try {
      let result = await attempt(await ensureCart());
      const cartGone = (errors: UserErrorData[] = []) =>
        errors.some((e) => e.code === 'CART_NOT_OPEN' || (e.code === 'NOT_FOUND' && e.path?.includes('cartId')));
      if (cartGone(result?.errors)) {
        // El carrito guardado ya se convirtió en orden: se abre uno nuevo.
        result = await attempt(await ensureCart({ forceNew: true }));
      }
      if (result?.errors.length) setFeedback({ ok: false, text: result.errors[0].message });
      else setFeedback({ ok: true, text: 'Agregado al carrito' });
    } catch (error) {
      setFeedback({ ok: false, text: (error as Error).message });
    }
  }

  return (
    <div className={compact ? 'add-to-cart compact' : 'add-to-cart'}>
      <button className="btn btn-primary" onClick={handleClick} disabled={disabled || loading}>
        {loading ? 'Agregando…' : disabled ? 'Agotado' : 'Agregar al carrito'}
      </button>
      {feedback && <small className={feedback.ok ? 'text-ok' : 'text-error'}>{feedback.text}</small>}
    </div>
  );
}
