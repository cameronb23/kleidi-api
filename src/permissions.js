import { rule, shield, and } from 'graphql-shield';

const rules = {
  isAuthenticated: rule()((parent, args, context) => context.user !== null),
  canManageRoles: rule()(async (parent, args, context) => {
    const canManage = await context.prisma.users({
      where: {
        AND: [
          {
            id: context.user.id
          },
          {
            roles_some: {
              permissions_contains: 'system.manageRoles'
            }
          }
        ]
      }
    });

    return canManage.length > 0;
  })
};


const permissions = shield({
  Query: {
    info: rules.isAuthenticated,
    roles: and(rules.isAuthenticated, rules.canManageRoles)
  },
  Mutation: {
    createRole: and(rules.isAuthenticated, rules.canManageRoles),
    updateRole: and(rules.isAuthenticated, rules.canManageRoles),
    deleteRole: and(rules.isAuthenticated, rules.canManageRoles)
  }
});

export default permissions;
