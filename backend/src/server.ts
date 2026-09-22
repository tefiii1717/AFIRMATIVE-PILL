/**
 * Composición del servidor: Apollo Server sobre Express + graphql-ws.
 *
 * ZERO-REST: el único endpoint expuesto es /graphql
 *   - POST/GET /graphql  -> queries y mutations (Apollo Server)
 *   - WS       /graphql  -> subscriptions (protocolo graphql-transport-ws)
 * Cualquier otra ruta responde 404. No existen controladores REST.
 */
import { createServer, type Server } from 'node:http';
import { ApolloServer, type ApolloServerPlugin } from '@apollo/server';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { expressMiddleware } from '@as-integrations/express5';
import cors from 'cors';
import express from 'express';
import { useServer } from 'graphql-ws/use/ws';
import { WebSocketServer } from 'ws';
import { env } from './config/env.js';
import { log } from './config/logger.js';
import { createContext, type GraphQLContext } from './graphql/context.js';
import { depthLimit } from './graphql/depthLimit.js';
import { schema } from './graphql/schema.js';

export const GRAPHQL_PATH = '/graphql';

/** Registra cada operación: nombre, tipo y duración (útil para la sustentación). */
const operationLogger: ApolloServerPlugin<GraphQLContext> = {
  async requestDidStart({ contextValue }) {
    const started = performance.now();
    return {
      async willSendResponse({ operation, operationName }) {
        if (!operation) return;
        log.server(
          `[${contextValue.requestId}] ${operation.operation} ${operationName ?? '(anónima)'} ` +
            `(${(performance.now() - started).toFixed(0)}ms)`,
        );
      },
    };
  },
};

export async function createGraphQLServer(): Promise<{ httpServer: Server; stop: () => Promise<void> }> {
  const app = express();
  const httpServer = createServer(app);

  const wsServer = new WebSocketServer({ server: httpServer, path: GRAPHQL_PATH });
  const wsCleanup = useServer<Record<string, unknown>, { ctx?: GraphQLContext }>(
    {
      schema,
      context: () => createContext(),
      onSubscribe: (_ctx, _id, payload) => {
        log.server(`subscription ${payload.operationName ?? '(anónima)'} iniciada`);
      },
    },
    wsServer,
  );

  const apollo = new ApolloServer<GraphQLContext>({
    schema,
    validationRules: [depthLimit(8)],
    introspection: true,
    plugins: [
      ApolloServerPluginDrainHttpServer({ httpServer }),
      {
        async serverWillStart() {
          return {
            async drainServer() {
              await wsCleanup.dispose();
            },
          };
        },
      },
      operationLogger,
    ],
  });
  await apollo.start();

  app.use(
    GRAPHQL_PATH,
    cors<cors.CorsRequest>({ origin: env.corsOrigins, credentials: true }),
    express.json({ limit: '100kb' }),
    expressMiddleware(apollo, { context: async () => createContext() }),
  );

  // Zero-REST: nada fuera de /graphql.
  app.use((_req, res) => {
    res.status(404).type('text/plain').send('Not found. Esta API sólo expone GraphQL en /graphql');
  });

  return {
    httpServer,
    stop: async () => {
      await apollo.stop();
    },
  };
}
