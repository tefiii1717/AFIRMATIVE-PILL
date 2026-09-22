/**
 * Demuestra la mitigación del problema N+1: una consulta de catálogo con
 * relaciones anidadas se resuelve con un número CONSTANTE de consultas SQL,
 * independiente de cuántos medicamentos se listen.
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { graphql } from 'graphql';
import { pool, queryStats } from '../src/db/pool.js';
import { createContext } from '../src/graphql/context.js';
import { schema } from '../src/graphql/schema.js';
import { databaseAvailable } from './helpers.js';

const skip = !(await databaseAvailable()) && 'Base de datos no disponible (ejecuta npm run db:setup)';

const CATALOG_WITH_RELATIONS = /* GraphQL */ `
  query ($first: PositiveInt!) {
    medications(first: $first) {
      edges {
        node {
          commercialName
          laboratory { name }
          category { name }
          clinicalInfo { indications }
        }
      }
    }
  }
`;

async function countQueries(first: number) {
  const before = queryStats.count;
  const result = await graphql({
    schema,
    source: CATALOG_WITH_RELATIONS,
    variableValues: { first },
    contextValue: createContext(),
  });
  assert.equal(result.errors, undefined);
  return queryStats.count - before;
}

describe('DataLoader (N+1)', { skip }, () => {
  after(() => pool.end());

  it('usa 4 consultas para 5 o para 50 medicamentos (búsqueda + 3 lotes)', async () => {
    const small = await countQueries(5);
    const large = await countQueries(50);
    // Sin DataLoader serían 1 + 3 × N consultas (151 para N = 50).
    assert.equal(small, 4);
    assert.equal(large, 4);
  });

  it('cachea por request: la misma entidad no se consulta dos veces', async () => {
    const ctx = createContext();
    const before = queryStats.count;
    const [a, b] = await Promise.all([
      ctx.loaders.laboratoryById.load('00000000-0000-0000-0000-000000000001'),
      ctx.loaders.laboratoryById.load('00000000-0000-0000-0000-000000000001'),
    ]);
    await ctx.loaders.laboratoryById.load('00000000-0000-0000-0000-000000000001');
    assert.equal(a, null);
    assert.equal(b, null);
    assert.equal(queryStats.count - before, 1);
  });
});
