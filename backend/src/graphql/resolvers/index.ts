import { scalarResolvers } from '../scalars.js';
import { Mutation } from './mutation.js';
import { Query } from './query.js';
import { Subscription } from './subscription.js';
import { typeResolvers } from './types.js';

export const resolvers = {
  ...scalarResolvers,
  ...typeResolvers,
  Query,
  Mutation,
  Subscription,
};
