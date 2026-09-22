/** Ejecuta supabase/seed.sql (idempotente) contra DATABASE_URL. */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../src/db/pool.js';

const seedPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../supabase/seed.sql');

async function main() {
  await pool.query(readFileSync(seedPath, 'utf8'));
  const { rows } = await pool.query<{ total: number; catalog: number }>(`
    select (select count(*) from write_model.medications)::int as total,
           (select count(*) from read_model.medication_catalog)::int as catalog`);
  console.log(`✔ Seed aplicado: ${rows[0].total} medicamentos en write_model, ${rows[0].catalog} en read_model.medication_catalog`);
}

main()
  .then(() => pool.end())
  .catch(async (error) => {
    console.error('✖ Error aplicando el seed:', error);
    await pool.end();
    process.exit(1);
  });
