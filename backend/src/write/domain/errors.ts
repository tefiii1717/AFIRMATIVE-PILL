/**
 * Errores de negocio tipados. Su forma coincide 1:1 con los tipos que
 * implementan la interfaz UserError en schema.graphql (__typename incluido).
 */
import type { OrderStatus } from './order.js';

type Base = { message: string; path: string[] | null };

export type UserError =
  | (Base & { __typename: 'ValidationError'; code: 'VALIDATION_FAILED'; field: string })
  | (Base & { __typename: 'NotFoundError'; code: 'NOT_FOUND'; resource: string; resourceId: string })
  | (Base & {
      __typename: 'InsufficientStockError';
      code: 'INSUFFICIENT_STOCK';
      medicationId: string;
      requested: number;
      available: number;
    })
  | (Base & { __typename: 'PrescriptionRequiredError'; code: 'PRESCRIPTION_REQUIRED'; medicationIds: string[] })
  | (Base & { __typename: 'InvalidPrescriptionError'; code: 'INVALID_PRESCRIPTION'; reason: string })
  | (Base & { __typename: 'EmptyCartError'; code: 'EMPTY_CART' })
  | (Base & { __typename: 'CartNotOpenError'; code: 'CART_NOT_OPEN'; status: 'OPEN' | 'CHECKED_OUT' })
  | (Base & {
      __typename: 'InvalidStateTransitionError';
      code: 'INVALID_STATE_TRANSITION';
      currentStatus: OrderStatus;
      attemptedStatus: OrderStatus;
    });

export const validation = (field: string, message: string, path: string[] = ['input', field]): UserError => ({
  __typename: 'ValidationError',
  code: 'VALIDATION_FAILED',
  field,
  message,
  path,
});

export const notFound = (resource: string, resourceId: string, path: string[] | null = null): UserError => ({
  __typename: 'NotFoundError',
  code: 'NOT_FOUND',
  resource,
  resourceId,
  message: `${resource} ${resourceId} no existe.`,
  path,
});

export const insufficientStock = (
  medicationId: string,
  name: string,
  requested: number,
  available: number,
): UserError => ({
  __typename: 'InsufficientStockError',
  code: 'INSUFFICIENT_STOCK',
  medicationId,
  requested,
  available,
  message:
    available === 0
      ? `${name} está agotado.`
      : `Stock insuficiente para ${name}: solicitaste ${requested} y hay ${available} disponibles.`,
  path: null,
});

export const prescriptionRequired = (medicationIds: string[], names: string[]): UserError => ({
  __typename: 'PrescriptionRequiredError',
  code: 'PRESCRIPTION_REQUIRED',
  medicationIds,
  message: `Los siguientes medicamentos exigen fórmula médica: ${names.join(', ')}.`,
  path: ['input', 'prescription'],
});

export const invalidPrescription = (reason: string, path: string[] = ['input', 'prescription']): UserError => ({
  __typename: 'InvalidPrescriptionError',
  code: 'INVALID_PRESCRIPTION',
  reason,
  message: reason,
  path,
});

export const emptyCart = (): UserError => ({
  __typename: 'EmptyCartError',
  code: 'EMPTY_CART',
  message: 'El carrito está vacío.',
  path: ['input', 'cartId'],
});

export const cartNotOpen = (status: 'OPEN' | 'CHECKED_OUT'): UserError => ({
  __typename: 'CartNotOpenError',
  code: 'CART_NOT_OPEN',
  status,
  message: 'El carrito ya fue convertido en una orden; crea un carrito nuevo.',
  path: ['input', 'cartId'],
});

export const invalidTransition = (currentStatus: OrderStatus, attemptedStatus: OrderStatus): UserError => ({
  __typename: 'InvalidStateTransitionError',
  code: 'INVALID_STATE_TRANSITION',
  currentStatus,
  attemptedStatus,
  message: `No es posible pasar una orden de ${currentStatus} a ${attemptedStatus}.`,
  path: null,
});

/**
 * Se lanza dentro de una transacción para abortarla (ROLLBACK) cuando una
 * invariante falla; el command bus la convierte en `errors` del payload.
 */
export class BusinessRuleViolation extends Error {
  constructor(public readonly errors: UserError[]) {
    super(errors.map((error) => error.message).join(' '));
  }
}
