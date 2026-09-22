/**
 * Configuración de Apollo Client.
 *
 * - HttpLink  -> queries y mutations (POST /graphql)
 * - GraphQLWsLink -> subscriptions (WS /graphql, protocolo graphql-transport-ws)
 * - ApolloLink.split enruta cada operación según su tipo.
 * - InMemoryCache normaliza por __typename:id; las typePolicies definen la
 *   paginación del catálogo y redirecciones de caché (lista -> ficha).
 */
import { ApolloClient, ApolloLink, HttpLink, InMemoryCache } from '@apollo/client';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { OperationTypeNode } from 'graphql';
import { createClient } from 'graphql-ws';

export const GRAPHQL_HTTP_URL = process.env.NEXT_PUBLIC_GRAPHQL_HTTP_URL ?? 'http://localhost:4000/graphql';
export const GRAPHQL_WS_URL = process.env.NEXT_PUBLIC_GRAPHQL_WS_URL ?? 'ws://localhost:4000/graphql';

type Edge = { __ref?: string; cursor: string };
type ConnectionShape = { edges: Edge[]; pageInfo: unknown; totalCount: number };

/** Paginación por cursor: concatena páginas cuando `after` está presente. */
function cursorPagination(keyArgs: string[]) {
  return {
    keyArgs,
    merge(existing: ConnectionShape | undefined, incoming: ConnectionShape, { args }: { args: Record<string, unknown> | null }) {
      if (!existing || !args?.after) return incoming;
      return { ...incoming, edges: [...existing.edges, ...incoming.edges] };
    },
  };
}

function createCache() {
  return new InMemoryCache({
    // Necesario para que los fragmentos `... on InsufficientStockError` coincidan
    // con la interfaz UserError en la caché.
    possibleTypes: {
      UserError: [
        'ValidationError',
        'NotFoundError',
        'InsufficientStockError',
        'PrescriptionRequiredError',
        'InvalidPrescriptionError',
        'EmptyCartError',
        'CartNotOpenError',
        'InvalidStateTransitionError',
      ],
      Node: ['Medication', 'Laboratory', 'TherapeuticCategory', 'Cart', 'Order'],
    },
    typePolicies: {
      Query: {
        fields: {
          medications: cursorPagination(['filter', 'sort']),
          orders: cursorPagination(['filter']),
          // Si el medicamento ya está en caché (vino del catálogo), la ficha lo
          // muestra al instante y sólo pide al servidor los campos faltantes.
          medication: {
            read(_, { args, toReference }) {
              return toReference({ __typename: 'Medication', id: args?.id as string });
            },
          },
        },
      },
      // Tipos embebidos sin identidad propia: se guardan dentro de su padre.
      CartItem: { keyFields: false },
      OrderItem: { keyFields: false },
      OrderStatusChange: { keyFields: false },
      ClinicalInformation: { keyFields: false },
      Customer: { keyFields: false },
      Prescription: { keyFields: false },
    },
  });
}

export function makeApolloClient() {
  const httpLink = new HttpLink({ uri: GRAPHQL_HTTP_URL });

  // En el servidor (SSR de Next.js) no hay WebSocket: todo va por HTTP.
  const link =
    typeof window === 'undefined'
      ? httpLink
      : ApolloLink.split(
          (operation) => operation.operationType === OperationTypeNode.SUBSCRIPTION,
          new GraphQLWsLink(createClient({ url: GRAPHQL_WS_URL, retryAttempts: Infinity, lazy: true })),
          httpLink,
        );

  return new ApolloClient({
    link,
    cache: createCache(),
    ssrMode: typeof window === 'undefined',
    defaultOptions: {
      watchQuery: { fetchPolicy: 'cache-and-network', nextFetchPolicy: 'cache-first' },
    },
  });
}
