/* eslint-disable import/prefer-default-export */

const info = () => 'API Version 1';
const users = async (parent, args, context) => context.db.query.users();
const roles = async (parent, args, context) => context.db.query.roles();

export default {
  info,
  users,
  roles
};
