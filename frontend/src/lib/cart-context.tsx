'use client';

/**
 * Contexto del carrito: sólo guarda el ID del carrito (el estado real vive en
 * el servidor y en la caché normalizada de Apollo como Cart:<id>).
 */
import { useApolloClient, useMutation } from '@apollo/client/react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CREATE_CART } from '@/graphql/operations';
import { readStorage, writeStorage } from './storage';

const STORAGE_KEY = 'afirmative-pill:cartId';

interface CartContextValue {
  cartId: string | null;
  /** Devuelve el carrito actual o crea uno nuevo (comando createCart). */
  ensureCart(options?: { forceNew?: boolean }): Promise<string>;
  /** Olvida el carrito actual (p. ej. tras convertirlo en orden). */
  resetCart(): void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [cartId, setCartId] = useState<string | null>(null);
  const [createCart] = useMutation(CREATE_CART);
  const client = useApolloClient();
  const pending = useRef<Promise<string> | null>(null);

  useEffect(() => {
    setCartId(readStorage(STORAGE_KEY));
  }, []);

  const ensureCart = useCallback(
    async ({ forceNew = false }: { forceNew?: boolean } = {}) => {
    if (cartId && !forceNew) return cartId;
    pending.current ??= createCart().then(({ data }) => {
      const id = data?.createCart.cart?.id;
      if (!id) throw new Error(data?.createCart.errors[0]?.message ?? 'No fue posible crear el carrito');
      writeStorage(STORAGE_KEY, id);
      setCartId(id);
      return id;
    });
    try {
      return await pending.current;
    } finally {
      pending.current = null;
    }
    },
    [cartId, createCart],
  );

  const resetCart = useCallback(() => {
    if (cartId) {
      client.cache.evict({ id: client.cache.identify({ __typename: 'Cart', id: cartId }) });
      client.cache.gc();
    }
    writeStorage(STORAGE_KEY, null);
    setCartId(null);
  }, [cartId, client]);

  const value = useMemo(() => ({ cartId, ensureCart, resetCart }), [cartId, ensureCart, resetCart]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart debe usarse dentro de <CartProvider>');
  return context;
}
