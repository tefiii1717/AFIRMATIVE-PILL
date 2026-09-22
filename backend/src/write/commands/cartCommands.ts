/**
 * Comandos del agregado Carrito: createCart, addItemToCart,
 * changeCartItemQuantity, removeItemFromCart.
 */
import type pg from 'pg';
import { query } from '../../db/pool.js';
import { appendEvents } from '../../events/outbox.js';
import { projectInline } from '../../events/projector.js';
import { executeCommand, reject } from '../commandBus.js';
import { cartNotOpen, insufficientStock, notFound, validation } from '../domain/errors.js';
import { MAX_UNITS_PER_LINE } from '../domain/order.js';

interface CartRow {
  id: string;
  status: 'OPEN' | 'CHECKED_OUT';
}

async function lockOpenCart(client: pg.PoolClient, cartId: string): Promise<CartRow> {
  const { rows } = await query<CartRow>(
    'select id, status from write_model.carts where id = $1 for update',
    [cartId],
    client,
  );
  const cart = rows[0];
  if (!cart) reject(notFound('Cart', cartId, ['input', 'cartId']));
  if (cart.status !== 'OPEN') reject(cartNotOpen(cart.status));
  return cart;
}

async function loadMedication(client: pg.PoolClient, medicationId: string) {
  const { rows } = await query<{ id: string; commercial_name: string; stock: number }>(
    'select id, commercial_name, stock from write_model.medications where id = $1',
    [medicationId],
    client,
  );
  if (!rows[0]) reject(notFound('Medication', medicationId, ['input', 'medicationId']));
  return rows[0];
}

function checkQuantity(quantity: number, name: string, stock: number, medicationId: string) {
  if (quantity > MAX_UNITS_PER_LINE) {
    reject(validation('quantity', `Máximo ${MAX_UNITS_PER_LINE} unidades por medicamento en una orden.`));
  }
  if (quantity > stock) reject(insufficientStock(medicationId, name, quantity, stock));
}

/** Emite CartUpdated con el snapshot del carrito y lo proyecta en la misma transacción. */
async function emitCartUpdated(client: pg.PoolClient, cartId: string) {
  const { rows: cartRows } = await query<{ status: 'OPEN' | 'CHECKED_OUT'; updated_at: Date }>(
    'update write_model.carts set updated_at = now() where id = $1 returning status, updated_at',
    [cartId],
    client,
  );
  const { rows: items } = await query<{ medication_id: string; quantity: number; added_at: Date }>(
    'select medication_id, quantity, added_at from write_model.cart_items where cart_id = $1 order by added_at',
    [cartId],
    client,
  );
  const events = await appendEvents(client, [
    {
      type: 'CartUpdated',
      aggregateType: 'Cart',
      aggregateId: cartId,
      payload: {
        cartId,
        status: cartRows[0].status,
        updatedAt: cartRows[0].updated_at.toISOString(),
        items: items.map((item) => ({
          medicationId: item.medication_id,
          quantity: item.quantity,
          addedAt: item.added_at.toISOString(),
        })),
      },
    },
  ]);
  await projectInline(client, events);
}

export function createCart() {
  return executeCommand('CreateCart', {}, async (client) => {
    const { rows } = await query<{ id: string }>('insert into write_model.carts default values returning id', [], client);
    await emitCartUpdated(client, rows[0].id);
    return rows[0].id;
  });
}

export function addItemToCart(input: { cartId: string; medicationId: string; quantity: number }) {
  return executeCommand('AddItemToCart', input, async (client) => {
    await lockOpenCart(client, input.cartId);
    const medication = await loadMedication(client, input.medicationId);
    const { rows } = await query<{ quantity: number }>(
      'select quantity from write_model.cart_items where cart_id = $1 and medication_id = $2',
      [input.cartId, input.medicationId],
      client,
    );
    const newQuantity = (rows[0]?.quantity ?? 0) + input.quantity;
    checkQuantity(newQuantity, medication.commercial_name, medication.stock, medication.id);
    await query(
      `insert into write_model.cart_items (cart_id, medication_id, quantity) values ($1, $2, $3)
       on conflict (cart_id, medication_id) do update set quantity = excluded.quantity`,
      [input.cartId, input.medicationId, newQuantity],
      client,
    );
    await emitCartUpdated(client, input.cartId);
    return input.cartId;
  });
}

export function changeCartItemQuantity(input: { cartId: string; medicationId: string; quantity: number }) {
  return executeCommand('ChangeCartItemQuantity', input, async (client) => {
    await lockOpenCart(client, input.cartId);
    const medication = await loadMedication(client, input.medicationId);
    checkQuantity(input.quantity, medication.commercial_name, medication.stock, medication.id);
    const { rowCount } = await query(
      'update write_model.cart_items set quantity = $3 where cart_id = $1 and medication_id = $2',
      [input.cartId, input.medicationId, input.quantity],
      client,
    );
    if (!rowCount) reject(notFound('CartItem', input.medicationId, ['input', 'medicationId']));
    await emitCartUpdated(client, input.cartId);
    return input.cartId;
  });
}

export function removeItemFromCart(input: { cartId: string; medicationId: string }) {
  return executeCommand('RemoveItemFromCart', input, async (client) => {
    await lockOpenCart(client, input.cartId);
    const { rowCount } = await query(
      'delete from write_model.cart_items where cart_id = $1 and medication_id = $2',
      [input.cartId, input.medicationId],
      client,
    );
    if (!rowCount) reject(notFound('CartItem', input.medicationId, ['input', 'medicationId']));
    await emitCartUpdated(client, input.cartId);
    return input.cartId;
  });
}

export { emitCartUpdated };
