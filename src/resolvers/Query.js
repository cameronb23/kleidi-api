/* eslint-disable import/prefer-default-export */

const info = () => 'API Version 1';
const users = (parent, args, context) => context.prisma.users();
const roles = (parent, args, context) => context.prisma.roles();

export default {
  info,
  users,
  roles
};
