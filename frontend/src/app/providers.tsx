'use client';

/**
 * Raíz del árbol de contexto de Apollo: <ApolloProvider> expone una única
 * instancia de ApolloClient (y su caché normalizada) a toda la aplicación.
 */
import { ApolloProvider } from '@apollo/client/react';
import { useState, type ReactNode } from 'react';
import { makeApolloClient } from '@/lib/apollo';
import { CartProvider } from '@/lib/cart-context';

export function Providers({ children }: { children: ReactNode }) {
  // useState garantiza una instancia por pestaña del navegador (y por request en SSR).
  const [client] = useState(makeApolloClient);
  return (
    <ApolloProvider client={client}>
      <CartProvider>{children}</CartProvider>
    </ApolloProvider>
  );
}
