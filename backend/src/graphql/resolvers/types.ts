/**
 * Resolvers de campos anidados. TODA relación pasa por un DataLoader => las
 * listas no disparan N consultas (N+1) sino una consulta por tipo de relación.
 */
import { GraphQLError } from 'graphql';
import { money } from '../../write/domain/order.js';
import type { UserError } from '../../write/domain/errors.js';
import type { CartView, LaboratoryView, MedicationView, OrderLineView, OrderView } from '../../read/views.js';
import type { GraphQLContext } from '../context.js';

async function required<T>(promise: Promise<T | null>, what: string): Promise<T> {
  const value = await promise;
  if (value === null) throw new GraphQLError(`${what} no encontrado en el read model`);
  return value;
}

async function cartItems(cart: CartView, ctx: GraphQLContext) {
  const lines = await ctx.loaders.cartLinesByCartId.load(cart.id);
  const medications = await ctx.loaders.medicationById.loadMany(lines.map((line) => line.medicationId));
  return lines.flatMap((line, index) => {
    const medication = medications[index];
    if (!medication || medication instanceof Error) return [];
    return [
      {
        medication,
        quantity: line.quantity,
        lineTotal: money.fromCents(money.toCents(medication.price) * line.quantity),
      },
    ];
  });
}

export const typeResolvers = {
  Node: {
    __resolveType(obj: { __typename?: string }) {
      return obj.__typename ?? null;
    },
  },

  UserError: {
    __resolveType(error: UserError) {
      return error.__typename;
    },
  },

  Medication: {
    laboratory: (m: MedicationView, _: unknown, ctx: GraphQLContext) =>
      required(ctx.loaders.laboratoryById.load(m.laboratoryId), 'Laboratorio'),
    category: (m: MedicationView, _: unknown, ctx: GraphQLContext) =>
      required(ctx.loaders.categoryById.load(m.categoryId), 'Categoría'),
    clinicalInfo: (m: MedicationView, _: unknown, ctx: GraphQLContext) =>
      required(ctx.loaders.clinicalInfoByMedicationId.load(m.id), 'Información clínica'),
  },

  Laboratory: {
    medications: async (lab: LaboratoryView, { first }: { first: number }, ctx: GraphQLContext) =>
      (await ctx.loaders.medicationsByLaboratoryId.load(lab.id)).slice(0, first),
  },

  Cart: {
    items: (cart: CartView, _: unknown, ctx: GraphQLContext) => cartItems(cart, ctx),
    itemCount: async (cart: CartView, _: unknown, ctx: GraphQLContext) =>
      (await ctx.loaders.cartLinesByCartId.load(cart.id)).reduce((sum, line) => sum + line.quantity, 0),
    subtotal: async (cart: CartView, _: unknown, ctx: GraphQLContext) =>
      money.fromCents((await cartItems(cart, ctx)).reduce((sum, item) => sum + money.toCents(item.lineTotal), 0)),
    requiresPrescription: async (cart: CartView, _: unknown, ctx: GraphQLContext) =>
      (await cartItems(cart, ctx)).some((item) => item.medication.requiresPrescription),
  },

  Order: {
    items: (order: OrderView, _: unknown, ctx: GraphQLContext) => ctx.loaders.orderLinesByOrderId.load(order.id),
    timeline: (order: OrderView, _: unknown, ctx: GraphQLContext) =>
      ctx.loaders.orderTimelineByOrderId.load(order.id),
  },

  OrderItem: {
    medication: (line: OrderLineView, _: unknown, ctx: GraphQLContext) =>
      required(ctx.loaders.medicationById.load(line.medicationId), 'Medicamento'),
  },

  InsufficientStockError: {
    medication: (error: { medicationId: string }, _: unknown, ctx: GraphQLContext) =>
      required(ctx.loaders.medicationById.load(error.medicationId), 'Medicamento'),
  },

  PrescriptionRequiredError: {
    medications: async (error: { medicationIds: string[] }, _: unknown, ctx: GraphQLContext) =>
      (await ctx.loaders.medicationById.loadMany(error.medicationIds)).filter(
        (m): m is MedicationView => !!m && !(m instanceof Error),
      ),
  },
};
