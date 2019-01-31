/* eslint-disable import/prefer-default-export */

const infoRes = () => 'API Version 1';
const currentUser = async (parent, args, context, info) => context.db.query.user({
  where: {
    id: context.user.id
  }
}, info);
const roles = async (parent, args, context) => context.db.query.roles();
const products = async (parent, args, context, info) => context.db.query.products({}, info);
const productsForService = async (parent, args, context, info) => context.db.query.products({
  where: {
    forService: args.service,
    plans_some: {
      active: args.active
    }
  }
}, info);

export default {
  info: infoRes,
  currentUser,
  roles,
  products,
  productsForService
};
