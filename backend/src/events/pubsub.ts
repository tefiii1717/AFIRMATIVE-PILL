import { PubSub } from 'graphql-subscriptions';

/**
 * Bus de notificaciones para GraphQL Subscriptions. Para escalar a varias
 * instancias basta con reemplazarlo por graphql-postgres-subscriptions (LISTEN/
 * NOTIFY de Supabase) o Redis sin tocar los resolvers.
 */
export const TOPICS = {
  ORDER_UPDATED: 'ORDER_UPDATED',
  MEDICATION_STOCK_CHANGED: 'MEDICATION_STOCK_CHANGED',
} as const;

export interface OrderUpdatedMessage {
  orderId: string;
  version: number;
}

export interface MedicationStockChangedMessage {
  medicationId: string;
}

export const pubsub = new PubSub<{
  [TOPICS.ORDER_UPDATED]: OrderUpdatedMessage;
  [TOPICS.MEDICATION_STOCK_CHANGED]: MedicationStockChangedMessage;
}>();
