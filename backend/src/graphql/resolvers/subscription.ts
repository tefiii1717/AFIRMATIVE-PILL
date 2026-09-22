/**
 * SUBSCRIPTIONS — el proyector publica cuando una proyección cambia y aquí se
 * re-lee la proyección fresca (nuevos DataLoaders por evento => sin caché
 * obsoleta dentro de una suscripción de larga duración).
 */
import { withFilter } from 'graphql-subscriptions';
import {
  pubsub,
  TOPICS,
  type MedicationStockChangedMessage,
  type OrderUpdatedMessage,
} from '../../events/pubsub.js';
import type { GraphQLContext } from '../context.js';

async function loadFreshOrder(message: OrderUpdatedMessage, _args: unknown, ctx: GraphQLContext) {
  ctx.resetLoaders();
  return ctx.loaders.orderById.load(message.orderId);
}

export const Subscription = {
  orderUpdated: {
    subscribe: withFilter(
      () => pubsub.asyncIterableIterator(TOPICS.ORDER_UPDATED),
      (message: OrderUpdatedMessage | undefined, args: { orderId: string } | undefined) =>
        message?.orderId === args?.orderId,
    ),
    resolve: loadFreshOrder,
  },
  ordersFeed: {
    subscribe: () => pubsub.asyncIterableIterator(TOPICS.ORDER_UPDATED),
    resolve: loadFreshOrder,
  },
  medicationStockChanged: {
    subscribe: () => pubsub.asyncIterableIterator(TOPICS.MEDICATION_STOCK_CHANGED),
    resolve(message: MedicationStockChangedMessage, _: unknown, ctx: GraphQLContext) {
      ctx.resetLoaders();
      return ctx.loaders.medicationById.load(message.medicationId);
    },
  },
};
