/* eslint-disable import/prefer-default-export */

const infoRes = () => 'API Version 1';
const users = async (parent, args, context) => context.db.query.users();
const roles = async (parent, args, context) => context.db.query.roles();
const products = async (parent, args, context) => context.db.query.products();
const productsForService = async (parent, args, context, info) => context.db.query.products({
  where: {
    active: args.active,
    forService: args.service
  }
}, info);

export default {
  info: infoRes,
  users,
  roles,
  products,
  productsForService
};
