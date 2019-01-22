/* eslint-disable import/prefer-default-export */

const info = (parent, args, context) => `API UserID: ${context.user.id}`;
const users = (parent, args, context) => context.prisma.users();
const roles = (parent, args, context) => context.prisma.roles();

export default {
  info,
  users,
  roles
};
