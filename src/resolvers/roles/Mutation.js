const createRole = async (parent, args, context) => context.prisma.createRole({ ...args });

const updateRole = async (parent, args, context) => context.prisma.updateRole({
  where: {
    id: args.id
  },
  data: {
    name: args.name,
    permissions: args.permissions
  }
});

const deleteRole = async (parent, args, context) => {
  try {
    await context.prisma.deleteRole({
      id: args.id
    });

    return {
      resourceId: args.id,
      status: 0
    };
  } catch (err) {
    console.error(err);
    return {
      resourceId: args.id,
      status: 1,
      error: 'Error deleting role',
      message: 'Failed'
    };
  }
};

export default {
  createRole,
  updateRole,
  deleteRole
};
