import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { resolvers } from './resolvers/index.js';

const schemaPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../schema.graphql');

export const typeDefs = readFileSync(schemaPath, 'utf8');

export const schema = makeExecutableSchema({ typeDefs, resolvers });
