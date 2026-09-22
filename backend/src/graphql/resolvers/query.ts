/**
 * QUERY RESOLVERS — lado de lectura de CQRS.
 * Sólo consultan repositorios de read_model; jamás invocan comandos ni leen el
 * write_model.
 */
import { catalogReadRepository } from '../../read/catalogReadRepository.js';
import { orderReadRepository } from '../../read/orderReadRepository.js';
import type { GraphQLContext } from '../context.js';
import { connection, decodeCursor, MAX_PAGE_SIZE } from '../pagination.js';
import type { MedicationSearch } from '../../read/catalogReadRepository.js';

type Args<T> = T;

export const Query = {
  async medications(
    _: unknown,
    args: Args<{ filter?: MedicationSearch['filter']; sort?: MedicationSearch['sort']; first: number; after?: string }>,
  ) {
    const limit = Math.min(args.first, MAX_PAGE_SIZE);
    const offset = decodeCursor(args.after);
    const { rows, totalCount } = await catalogReadRepository.search({
      filter: args.filter,
      sort: args.sort,
      limit,
      offset,
    });
    return connection(rows, totalCount, offset);
  },

  medication(_: unknown, { id }: { id: string }, ctx: GraphQLContext) {
    return ctx.loaders.medicationById.load(id);
  },

  therapeuticCategories() {
    return catalogReadRepository.listCategories();
  },

  laboratories() {
    return catalogReadRepository.listLaboratories();
  },

  cart(_: unknown, { id }: { id: string }, ctx: GraphQLContext) {
    return ctx.loaders.cartById.load(id);
  },

  order(_: unknown, { id }: { id: string }, ctx: GraphQLContext) {
    return ctx.loaders.orderById.load(id);
  },

  async orders(
    _: unknown,
    args: { filter?: { status?: string | null; customerEmail?: string | null } | null; first: number; after?: string },
  ) {
    const limit = Math.min(args.first, MAX_PAGE_SIZE);
    const offset = decodeCursor(args.after);
    const { rows, totalCount } = await orderReadRepository.list(args.filter ?? {}, limit, offset);
    return connection(rows, totalCount, offset);
  },
};
