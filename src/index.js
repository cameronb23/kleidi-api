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

import { init as initStripe } from './billing/stripe';
import { init as initMailer } from './email';

// import resolvers
import Query from './resolvers/Query';
import Mutation from './resolvers/Mutation';

import Roles from './resolvers/roles';
import ProductResolvers from './resolvers/products';
import KeybotResolvers from './resolvers/keybot';
import { setupCrypt } from './crypto';
import { getCurrentUser } from './auth';
import directiveResolvers from './directive-resolvers';

dotenv.config();

initStripe(process.env.STRIPE_SECRET_KEY);
setupCrypt(process.env.APP_SECRET);

// const SCHEMA_PATH = path.join(__dirname, './schema.graphql');

const serverOptions = {
  endpoint: '/v1/graphql',
  port: process.env.PORT || 4000,
  uploads: {
    maxFileSize: 10000000
  }
};

const resolvers = {
  Query: Object.assign({}, Query, Roles.Query, KeybotResolvers.Query, ProductResolvers.Query),
  Mutation: Object.assign(
    {}, Mutation, Roles.Mutation, KeybotResolvers.Mutation, ProductResolvers.Mutation
  )
};

const db = new Prisma({
  typeDefs: path.join(__dirname, '../gql/generated/prisma.graphql'),
  endpoint: 'https://us1.prisma.sh/cameron-b-4d8f44/kleidi/dev',
  secret: 'mysecret123',
  // debug: true
});

const schema = makeExecutableSchema({
  typeDefs: importSchema(path.join(__dirname, '../gql/schema.graphql')),
  resolvers,
  directiveResolvers
});

initMailer(process.env);

const server = new GraphQLServer({
  schema,
  context: async request => ({
    ...request,
    db,
    user: await getCurrentUser(db, request)
  })
});

server.start(serverOptions, () => console.log(`Server running at http://localhost:${process.env.PORT || 4000}`));
