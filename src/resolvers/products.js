import { createProduct, createProductPlan } from '../billing/stripe';

const Query = {
  product: async (parent, args, context, info) => {
    const res = await context.db.query.products({
      where: {
        id: args.productId
      }
    }, info);

    return res[0];
  },
  productPlan: async (parent, args, context, info) => context.db.query.productPlan({
    where: {
      id: args.planId
    }
  }, info),
  productPlans: async (parent, args, context, info) => context.db.query.productPlans({
    where: {
      product: {
        id: args.productId
      }
    }
  }, info)
};

const Mutation = {
  createProduct: async (parent, args, context) => {
    const { name, forService } = args;

    const stripeProduct = await createProduct(name);

    if (stripeProduct == null) {
      return {
        status: 1,
        error: 'Error creating product. Please try again later.'
      };
    }

    try {
      const product = await context.db.mutation.createProduct({
        data: {
          name,
          forService,
          stripeProductId: stripeProduct.id
        }
      }, '{ id }');

      return {
        status: 0,
        resourceId: product.id,
        message: 'Product created successfully.'
      };
    } catch (e) {
      console.error('Error creating product in database: ', e);
      return {
        status: 1,
        error: 'Error creating product.'
      };
    }
  },
  createProductPlan: async (parent, args, context) => {
    const product = await context.db.query.product(
      {
        where: {
          id: args.productId
        }
      }, '{ id stripeProductId }'
    );

    if (product == null) {
      return {
        status: 1,
        error: 'Product not found.'
      };
    }

    const { stripeProductId } = product;
    const {
      title, description, price, billingType
    } = args;

    const stripePlan = await createProductPlan(stripeProductId, title, billingType, price);

    if (stripePlan == null) {
      return {
        status: 1,
        error: 'Error creating plan. Please try again later.'
      };
    }

    try {
      const plan = await context.db.mutation.createProductPlan({
        data: {
          title,
          description,
          price,
          billingType,
          price_currency: 'USD',
          stripePlanId: stripePlan.id,
          product: {
            connect: { id: product.id }
          }
        }
      }, '{ id }');

      return {
        status: 0,
        resourceId: plan.id,
        message: 'Plan created successfully.'
      };
    } catch (e) {
      console.error('Error creating plan in database: ', e);
      return {
        status: 1,
        error: 'Error creating plan.'
      };
    }
  }
};

export default {
  Query,
  Mutation
};
