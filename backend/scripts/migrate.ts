/**
 * Aplica, en orden, los archivos de supabase/migrations que aún no se hayan
 * ejecutado (control en public.schema_migrations). Compatible con los mismos
 * archivos que usa la CLI de Supabase (`supabase db push`).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../src/db/pool.js';

const dir = resolve(dirname(fileURLToPath(import.meta.url)), '../../supabase/migrations');

async function main() {
  await pool.query(`
    create table if not exists public.schema_migrations (
      version text primary key,
      applied_at timestamptz not null default now()
    )`);
  await pool.query('alter table public.schema_migrations enable row level security');

  const { rows } = await pool.query<{ version: string }>('select version from public.schema_migrations');
  const applied = new Set(rows.map((row) => row.version));
  const files = readdirSync(dir).filter((file) => file.endsWith('.sql')).sort();

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`· ${file} (ya aplicada)`);
      continue;
    }
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(readFileSync(resolve(dir, file), 'utf8'));
      await client.query('insert into public.schema_migrations (version) values ($1)', [file]);
      await client.query('commit');
      console.log(`✔ ${file}`);
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }
}

main()
  .then(() => pool.end())
  .catch(async (error) => {
    console.error('✖ Error aplicando migraciones:', error);
    await pool.end();
    process.exit(1);
  });
