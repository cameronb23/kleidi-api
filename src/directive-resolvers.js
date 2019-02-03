/* eslint-disable */
import _ from 'underscore';

const privateDirectiveResolver = async (next, source, args, ctx) => {
  throw new Error('PRIVATE');
};

const isAuthenticatedResolver = async (next, source, args, ctx) => {
  if (ctx.user == null) {
    throw new Error('NOT_AUTHORIZED');
  }

  return next();
}

const hasPermissionsResolver = async (next, source, { permissions }, ctx) => {
  if (!ctx.user || !ctx.user.roles) throw new Error('NOT_AUTHORIZED');

  const userTotalPermissions = _.flatten(_.pluck(ctx.user.roles, 'permissions'));
  const diff = _.difference(permissions, userTotalPermissions);

  const hasPermissions = diff.length === 0;

  if (!hasPermissions) throw new Error('NO_PERMISSIONS');

  return next();
}

export default {
  private: privateDirectiveResolver,
  hasPermissions: hasPermissionsResolver,
  isAuthenticated: isAuthenticatedResolver
};