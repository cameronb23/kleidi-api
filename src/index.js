import '@babel/polyfill';

import dotenv from 'dotenv';
import path from 'path';
import { GraphQLServer } from 'graphql-yoga';
import { makeExecutableSchema } from 'graphql-tools';
import { importSchema } from 'graphql-import';

// import the prisma client
import { Prisma } from 'prisma-binding';

// import our permission middleware
// import Permissions from './permissions';

// import resolvers
import Query from './resolvers/Query';
import Mutation from './resolvers/Mutation';

import Roles from './resolvers/roles';
import { getCurrentUser } from './auth';
import directiveResolvers from './directive-resolvers';

dotenv.config();

// const SCHEMA_PATH = path.join(__dirname, './schema.graphql');

const serverOptions = {
  endpoint: '/v1/graphql',
  port: process.env.PORT || 4000
};

const resolvers = {
  Query: Object.assign({}, Query, Roles.Query),
  Mutation: Object.assign({}, Mutation, Roles.Mutation)
};

const db = new Prisma({
  typeDefs: path.join(__dirname, './generated/prisma.graphql'),
  endpoint: 'https://us1.prisma.sh/cameron-b-4d8f44/kleidi/dev',
  secret: 'mysecret123',
  debug: true
});

const schema = makeExecutableSchema({
  typeDefs: importSchema(path.join(__dirname, './schema.graphql')),
  resolvers,
  directiveResolvers
});

const server = new GraphQLServer({
  schema,
  context: async request => ({
    ...request,
    db,
    user: await getCurrentUser(db, request)
  })
});

server.start(serverOptions, () => console.log(`Server running at http://localhost:${process.env.PORT || 4000}`));
