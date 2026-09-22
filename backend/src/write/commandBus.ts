/**
 * COMMAND BUS: punto único de entrada al write model.
 *
 * Cada comando se ejecuta en una transacción. Si una invariante de negocio
 * falla, el handler lanza BusinessRuleViolation => ROLLBACK y los errores se
 * devuelven tipados en el payload. Tras el COMMIT se notifica al proyector para
 * que actualice el read model de forma asíncrona.
 */
import type pg from 'pg';
import { log } from '../config/logger.js';
import { withTransaction } from '../db/pool.js';
import { notifyNewEvents } from '../events/projector.js';
import { BusinessRuleViolation, type UserError } from './domain/errors.js';

export type CommandResult<T> = { ok: true; value: T; errors: [] } | { ok: false; value: null; errors: UserError[] };

export async function executeCommand<T>(
  name: string,
  input: unknown,
  handler: (client: pg.PoolClient) => Promise<T>,
): Promise<CommandResult<T>> {
  const started = performance.now();
  try {
    const value = await withTransaction(handler);
    log.command(`${name} ✔ (${(performance.now() - started).toFixed(0)}ms)`, input);
    notifyNewEvents();
    return { ok: true, value, errors: [] };
  } catch (error) {
    if (error instanceof BusinessRuleViolation) {
      log.command(`${name} ✖ rechazado: ${error.errors.map((e) => e.code).join(', ')}`);
      return { ok: false, value: null, errors: error.errors };
    }
    throw error;
  }
}

/** Azúcar para abortar la transacción con uno o más errores de negocio. */
export function reject(...errors: UserError[]): never {
  throw new BusinessRuleViolation(errors);
}
