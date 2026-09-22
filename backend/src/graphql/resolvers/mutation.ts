/**
 * MUTATION RESOLVERS — lado de escritura de CQRS.
 * Son adaptadores delgados: traducen el input GraphQL a un comando, lo
 * despachan al write model y devuelven un payload tipado con errores de negocio.
 */
import {
  addItemToCart,
  changeCartItemQuantity,
  createCart,
  removeItemFromCart,
} from '../../write/commands/cartCommands.js';
import {
  approveOrder,
  cancelOrder,
  dispatchOrder,
  placeOrder,
  type PlaceOrderInput,
} from '../../write/commands/orderCommands.js';
import type { CommandResult } from '../../write/commandBus.js';
import { notFound } from '../../write/domain/errors.js';
import { isUuid } from '../../read/catalogReadRepository.js';
import type { GraphQLContext } from '../context.js';

/** Tras un comando de carrito, la proyección síncrona ya está actualizada. */
async function cartPayload(result: CommandResult<string>, ctx: GraphQLContext) {
  if (!result.ok) return { cart: null, errors: result.errors };
  ctx.loaders.cartById.clear(result.value);
  ctx.loaders.cartLinesByCartId.clear(result.value);
  return { cart: await ctx.loaders.cartById.load(result.value), errors: [] };
}

function guardIds(ids: Record<string, string>) {
  for (const [field, value] of Object.entries(ids)) {
    if (!isUuid(value)) return notFound(field.replace(/Id$/, '').replace(/^./, (c) => c.toUpperCase()), value, ['input', field]);
  }
  return null;
}

const receiptPayload = (result: Awaited<ReturnType<typeof approveOrder>>) => ({
  receipt: result.value,
  errors: result.errors,
});

export const Mutation = {
  async createCart(_: unknown, __: unknown, ctx: GraphQLContext) {
    return cartPayload(await createCart(), ctx);
  },

  async addItemToCart(
    _: unknown,
    { input }: { input: { cartId: string; medicationId: string; quantity: number } },
    ctx: GraphQLContext,
  ) {
    const invalid = guardIds({ cartId: input.cartId, medicationId: input.medicationId });
    if (invalid) return { cart: null, errors: [invalid] };
    return cartPayload(await addItemToCart(input), ctx);
  },

  async changeCartItemQuantity(
    _: unknown,
    { input }: { input: { cartId: string; medicationId: string; quantity: number } },
    ctx: GraphQLContext,
  ) {
    const invalid = guardIds({ cartId: input.cartId, medicationId: input.medicationId });
    if (invalid) return { cart: null, errors: [invalid] };
    return cartPayload(await changeCartItemQuantity(input), ctx);
  },

  async removeItemFromCart(
    _: unknown,
    { input }: { input: { cartId: string; medicationId: string } },
    ctx: GraphQLContext,
  ) {
    const invalid = guardIds({ cartId: input.cartId, medicationId: input.medicationId });
    if (invalid) return { cart: null, errors: [invalid] };
    return cartPayload(await removeItemFromCart(input), ctx);
  },

  async placeOrder(_: unknown, { input }: { input: PlaceOrderInput }) {
    const invalid = guardIds({ cartId: input.cartId });
    if (invalid) return { receipt: null, errors: [invalid] };
    const result = await placeOrder(input);
    return { receipt: result.value, errors: result.errors };
  },

  async approveOrder(_: unknown, { input }: { input: { orderId: string; note?: string | null } }) {
    const invalid = guardIds({ orderId: input.orderId });
    if (invalid) return { receipt: null, errors: [invalid] };
    return receiptPayload(await approveOrder(input));
  },

  async dispatchOrder(_: unknown, { input }: { input: { orderId: string; carrier?: string | null } }) {
    const invalid = guardIds({ orderId: input.orderId });
    if (invalid) return { receipt: null, errors: [invalid] };
    return receiptPayload(await dispatchOrder(input));
  },

  async cancelOrder(_: unknown, { input }: { input: { orderId: string; reason: string } }) {
    const invalid = guardIds({ orderId: input.orderId });
    if (invalid) return { receipt: null, errors: [invalid] };
    return receiptPayload(await cancelOrder({ orderId: input.orderId, reason: input.reason }));
  },
};
