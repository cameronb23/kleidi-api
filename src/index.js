import '@babel/polyfill';

import dotenv from 'dotenv';
import path from 'path';
import { GraphQLServer } from 'graphql-yoga';

// import the prisma client
import { prisma } from './generated/prisma-client';

// import our permission middleware
import Permissions from './permissions';

// import resolvers
import Query from './resolvers/Query';
import Mutation from './resolvers/Mutation';

import Roles from './resolvers/roles';
import { getCurrentUser } from './auth';

dotenv.config();

const SCHEMA_PATH = path.join(__dirname, './schema.graphql');

const resolvers = {
  Query: Object.assign({}, Query, Roles.Query),
  Mutation: Object.assign({}, Mutation, Roles.Mutation)
};

const server = new GraphQLServer({
  typeDefs: SCHEMA_PATH,
  resolvers,
  middlewares: [Permissions],
  context: async request => ({
    ...request,
    prisma,
    user: await getCurrentUser(request)
  })
});

server.start(() => console.log('Server running at http://localhost:4000'));
