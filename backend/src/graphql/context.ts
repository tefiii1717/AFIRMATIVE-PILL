import { randomUUID } from 'node:crypto';
import { createLoaders, type Loaders } from '../read/loaders.js';

export interface GraphQLContext {
  requestId: string;
  loaders: Loaders;
  /** Descarta la caché de DataLoader (se usa en cada evento de una suscripción). */
  resetLoaders(): void;
}

export function createContext(): GraphQLContext {
  const context: GraphQLContext = {
    requestId: randomUUID().slice(0, 8),
    loaders: createLoaders(),
    resetLoaders() {
      context.loaders = createLoaders();
    },
  };
  return context;
}
