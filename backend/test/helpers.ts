/** Utilidades para tests de integración contra PostgreSQL (DATABASE_URL). */
import { pool } from '../src/db/pool.js';
import { drainOutbox } from '../src/events/projector.js';

export async function databaseAvailable(): Promise<boolean> {
  try {
    await pool.query('select 1 from read_model.medication_catalog limit 1');
    return true;
  } catch {
    return false;
  }
}

/** Crea un medicamento aislado para el test (sku TEST-*) y lo proyecta. */
export async function createTestMedication(opts: { stock: number; requiresPrescription: boolean; price?: number }) {
  const sku = `TEST-${Math.random().toString(36).slice(2, 10)}`;
  const { rows } = await pool.query<{ id: string }>(
    `insert into write_model.medications
       (sku, commercial_name, active_ingredient, concentration, dosage_form, presentation,
        laboratory_id, category_id, price, stock, requires_prescription)
     select $1, 'Medicamento ' || $1, 'Principio test', '1 mg', 'Tableta', 'Caja x 1',
            (select id from write_model.laboratories limit 1),
            (select id from write_model.therapeutic_categories limit 1), $2, $3, $4
     returning id`,
    [sku, opts.price ?? 1000, opts.stock, opts.requiresPrescription],
  );
  const id = rows[0].id;
  await pool.query(
    `insert into read_model.medication_catalog
       (id, sku, commercial_name, active_ingredient, concentration, dosage_form, presentation, price,
        stock_available, availability, requires_prescription, laboratory_id, category_id,
        indications, contraindications, search_text)
     select id, sku, commercial_name, active_ingredient, concentration, dosage_form, presentation, price,
            stock, 'IN_STOCK', requires_prescription, laboratory_id, category_id, '', '', lower(sku)
     from write_model.medications where id = $1`,
    [id],
  );
  return id;
}

/** Elimina todo rastro del medicamento de prueba y de las órdenes/carritos asociados. */
export async function cleanupTestMedication(medicationId: string) {
  await drainOutbox({ delayMs: 0 });
  const { rows } = await pool.query<{ order_id: string }>(
    'select order_id from write_model.order_items where medication_id = $1',
    [medicationId],
  );
  const orders = rows.map((row) => row.order_id);
  const { rows: cartRows } = await pool.query<{ cart_id: string }>(
    `select cart_id from write_model.cart_items where medication_id = $1
     union select cart_id from write_model.orders where id = any($2::uuid[])`,
    [medicationId, orders],
  );
  const carts = cartRows.map((row) => row.cart_id);
  const aggregates = [medicationId, ...orders, ...carts];
  await pool.query('delete from read_model.order_summary where id = any($1::uuid[])', [orders]);
  await pool.query('delete from read_model.cart_view where id = any($1::uuid[])', [carts]);
  await pool.query('delete from read_model.medication_catalog where id = $1', [medicationId]);
  await pool.query('delete from write_model.orders where id = any($1::uuid[])', [orders]);
  await pool.query('delete from write_model.carts where id = any($1::uuid[])', [carts]);
  await pool.query('delete from write_model.medications where id = $1', [medicationId]);
  await pool.query('delete from write_model.domain_events where aggregate_id = any($1::uuid[])', [aggregates]);
}

export const todayIso = () => new Date().toISOString().slice(0, 10);

export const validPrescription = () => ({
  number: 'RX-TEST-1',
  doctorName: 'Dr. Test',
  doctorLicense: 'RM-12345',
  patientDocument: '1020304050',
  issuedAt: todayIso(),
});
