import pg from 'pg';
import { env } from '../config/env.js';
import { log } from '../config/logger.js';

// numeric -> string (evita pérdida de precisión en precios; se formatea en el
// scalar Money). int8 (bigserial de eventos) -> number.
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => Number.parseInt(value, 10));
// date -> 'YYYY-MM-DD' tal cual (sin conversión a zona horaria).
pg.types.setTypeParser(pg.types.builtins.DATE, (value) => value);

export const pool = new pg.Pool({
  connectionString: env.databaseUrl,
  ssl: env.databaseSsl ? { rejectUnauthorized: false } : undefined,
  max: 10,
});

pool.on('error', (error) => log.error('Error inesperado en el pool de PostgreSQL', error));

export type Queryable = Pick<pg.PoolClient, 'query'>;

function compact(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

/** Contador global de consultas (lo usan los tests para demostrar la ausencia de N+1). */
export const queryStats = { count: 0 };

/** Ejecuta una consulta registrando el SQL y su duración (evidencia de lotes). */
export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  params: unknown[] = [],
  client: Queryable = pool,
): Promise<pg.QueryResult<T>> {
  const started = performance.now();
  queryStats.count++;
  const result = await client.query<T>(sql, params);
  if (env.logSql) {
    const elapsed = (performance.now() - started).toFixed(1);
    const text = compact(sql);
    log.sql(`${text.length > 160 ? `${text.slice(0, 157)}...` : text} | rows=${result.rowCount} | ${elapsed}ms`);
  }
  return result;
}

/** Ejecuta `work` dentro de una transacción; hace ROLLBACK ante cualquier error. */
export async function withTransaction<T>(work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
