/**
 * Tests de integración del write model (requieren DATABASE_URL con las
 * migraciones y el seed aplicados: `npm run db:setup`).
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { pool } from '../src/db/pool.js';
import { drainOutbox } from '../src/events/projector.js';
import { addItemToCart, createCart } from '../src/write/commands/cartCommands.js';
import { approveOrder, cancelOrder, placeOrder } from '../src/write/commands/orderCommands.js';
import { cleanupTestMedication, createTestMedication, databaseAvailable, validPrescription } from './helpers.js';

const customer = { fullName: 'Paciente de Prueba', email: 'test@example.com' };
const skip = !(await databaseAvailable()) && 'Base de datos no disponible (ejecuta npm run db:setup)';

async function cartWith(medicationId: string, quantity: number) {
  const cart = await createCart();
  assert.ok(cart.ok);
  const added = await addItemToCart({ cartId: cart.value, medicationId, quantity });
  assert.ok(added.ok, JSON.stringify(added.errors));
  return cart.value;
}

async function stockOf(medicationId: string) {
  const { rows } = await pool.query<{ stock: number }>('select stock from write_model.medications where id = $1', [
    medicationId,
  ]);
  return rows[0].stock;
}

describe('Invariantes del comando placeOrder', { skip }, () => {
  let rx: string;
  let otc: string;

  before(async () => {
    rx = await createTestMedication({ stock: 5, requiresPrescription: true });
    otc = await createTestMedication({ stock: 3, requiresPrescription: false, price: 2500.5 });
  });

  after(async () => {
    await cleanupTestMedication(rx);
    await cleanupTestMedication(otc);
    await pool.end();
  });

  it('exige fórmula médica si algún ítem la requiere y no modifica nada', async () => {
    const cartId = await cartWith(rx, 1);
    const result = await placeOrder({ cartId, customer });
    assert.equal(result.ok, false);
    assert.equal(result.errors[0].__typename, 'PrescriptionRequiredError');
    assert.equal(await stockOf(rx), 5, 'el stock no debe cambiar si el comando es rechazado');
  });

  it('rechaza fórmulas vencidas', async () => {
    const cartId = await cartWith(rx, 1);
    const result = await placeOrder({
      cartId,
      customer,
      prescription: { ...validPrescription(), issuedAt: '2020-01-01' },
    });
    assert.equal(result.errors[0]?.__typename, 'InvalidPrescriptionError');
  });

  it('reserva stock atómicamente y calcula el total en centavos', async () => {
    const cartId = await cartWith(otc, 2);
    const result = await placeOrder({ cartId, customer });
    assert.ok(result.ok, JSON.stringify(result.errors));
    assert.equal(result.value.total, '5001.00');
    assert.equal(result.value.status, 'PENDING_APPROVAL');
    assert.equal(await stockOf(otc), 1);
  });

  it('no vende más unidades de las disponibles bajo concurrencia', async () => {
    // 5 unidades de stock y 8 pacientes intentando comprar 1 unidad al mismo tiempo.
    const carts = await Promise.all(Array.from({ length: 8 }, () => cartWith(rx, 1)));
    const results = await Promise.all(
      carts.map((cartId) => placeOrder({ cartId, customer, prescription: validPrescription() })),
    );
    const succeeded = results.filter((result) => result.ok);
    const rejected = results.filter((result) => !result.ok);
    assert.equal(succeeded.length, 5);
    assert.equal(rejected.length, 3);
    assert.ok(rejected.every((result) => result.errors[0].__typename === 'InsufficientStockError'));
    assert.equal(await stockOf(rx), 0);
  });

  it('cancelar una orden libera el inventario y respeta la máquina de estados', async () => {
    const { rows } = await pool.query<{ order_id: string }>(
      'select order_id from write_model.order_items where medication_id = $1 limit 1',
      [rx],
    );
    const orderId = rows[0].order_id;
    const approved = await approveOrder({ orderId });
    assert.ok(approved.ok);
    const cancelled = await cancelOrder({ orderId, reason: 'Paciente desiste de la compra' });
    assert.ok(cancelled.ok);
    assert.equal(await stockOf(rx), 1);
    const again = await cancelOrder({ orderId, reason: 'Otra vez' });
    assert.equal(again.errors[0]?.__typename, 'InvalidStateTransitionError');
  });

  it('el read model converge tras procesar el outbox (consistencia eventual)', async () => {
    await drainOutbox({ delayMs: 0 });
    const { rows } = await pool.query<{ stock_available: number; availability: string }>(
      'select stock_available, availability from read_model.medication_catalog where id = $1',
      [rx],
    );
    assert.equal(rows[0].stock_available, 1);
    assert.equal(rows[0].availability, 'LOW_STOCK');
  });
});
