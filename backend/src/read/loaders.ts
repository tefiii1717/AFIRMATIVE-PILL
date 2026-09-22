/**
 * DataLoaders por request: mitigación del problema N+1.
 *
 * Cada loader acumula las claves pedidas por los resolvers anidados durante un
 * mismo tick del event loop y las resuelve con UNA consulta `= any($1)`. Además
 * cachea por request (una misma entidad pedida dos veces no vuelve a la BD).
 * Se crean nuevos en cada request => no hay fugas de datos entre usuarios ni
 * datos obsoletos entre operaciones.
 */
import DataLoader from 'dataloader';
import { env } from '../config/env.js';
import { log } from '../config/logger.js';
import { catalogReadRepository, isUuid } from './catalogReadRepository.js';
import { orderReadRepository } from './orderReadRepository.js';
import type {
  CartLineView,
  CartView,
  CategoryView,
  ClinicalInfoView,
  LaboratoryView,
  MedicationView,
  OrderLineView,
  OrderTimelineView,
  OrderView,
} from './views.js';

/** Envuelve una función de lote para registrar la agrupación (evidencia en logs). */
function batch<K, V>(name: string, fn: (keys: readonly K[]) => Promise<V[]>) {
  return async (keys: readonly K[]): Promise<V[]> => {
    if (env.logDataLoader) log.loader(`${name}: ${keys.length} clave(s) agrupadas -> 1 consulta SQL`);
    return fn(keys);
  };
}

/** Relación 1:1 — devuelve los resultados en el mismo orden de las claves. */
function byId<V extends { id: string }>(name: string, fetch: (ids: readonly string[]) => Promise<V[]>) {
  return new DataLoader<string, V | null>(
    batch(name, async (ids) => {
      const valid = ids.filter(isUuid);
      const rows = valid.length ? await fetch(valid) : [];
      const map = new Map(rows.map((row) => [row.id, row]));
      return ids.map((id) => map.get(id) ?? null);
    }),
  );
}

/** Relación 1:N — agrupa filas hijas por la clave del padre. */
function groupBy<V>(name: string, key: (row: V) => string, fetch: (ids: readonly string[]) => Promise<V[]>) {
  return new DataLoader<string, V[]>(
    batch(name, async (ids) => {
      const rows = await fetch(ids);
      const groups = new Map<string, V[]>(ids.map((id) => [id, []]));
      for (const row of rows) groups.get(key(row))?.push(row);
      return ids.map((id) => groups.get(id) ?? []);
    }),
  );
}

export function createLoaders() {
  return {
    medicationById: byId<MedicationView>('medicationById', catalogReadRepository.findByIds),
    clinicalInfoByMedicationId: byId<ClinicalInfoView & { id: string }>(
      'clinicalInfoByMedicationId',
      catalogReadRepository.clinicalInfoByIds,
    ),
    laboratoryById: byId<LaboratoryView>('laboratoryById', catalogReadRepository.laboratoriesByIds),
    categoryById: byId<CategoryView>('categoryById', catalogReadRepository.categoriesByIds),
    medicationsByLaboratoryId: groupBy<MedicationView>(
      'medicationsByLaboratoryId',
      (row) => row.laboratoryId,
      (ids) => catalogReadRepository.byLaboratoryIds(ids, 50),
    ),
    orderById: byId<OrderView>('orderById', orderReadRepository.findByIds),
    orderLinesByOrderId: groupBy<OrderLineView & { orderId: string }>(
      'orderLinesByOrderId',
      (row) => row.orderId,
      orderReadRepository.linesByOrderIds,
    ),
    orderTimelineByOrderId: groupBy<OrderTimelineView & { orderId: string }>(
      'orderTimelineByOrderId',
      (row) => row.orderId,
      orderReadRepository.timelineByOrderIds,
    ),
    cartById: byId<CartView>('cartById', orderReadRepository.cartsByIds),
    cartLinesByCartId: groupBy<CartLineView & { cartId: string }>(
      'cartLinesByCartId',
      (row) => row.cartId,
      orderReadRepository.cartLinesByCartIds,
    ),
  };
}

export type Loaders = ReturnType<typeof createLoaders>;
