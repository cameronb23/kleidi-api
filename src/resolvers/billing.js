import _ from 'underscore';
import { createSource, attachSourceToCustomer, subscribeUserToPlan } from '../billing/stripe';


const Query = {
  paymentMethods: async (parent, args, context, info) => {
    const userQuery = await context.db.query.user({ where: { id: context.user.id } }, '{ billing { paymentMethods { id } } }');
    const ids = _.pluck(userQuery.billing.paymentMethods, 'id');
    return context.db.query.paymentMethods({
      where: {
        id_in: ids
      }
    }, info);
  }
};

const Mutation = {
  addPaymentMethod: async (parent, args, context) => {
    const stripeSource = await createSource(args.token);
    const { card } = stripeSource;

    if (stripeSource == null) {
      return {
        status: 1,
        error: 'Error adding payment method. Please try again later'
      };
    }

    try {
      // get their billing
      const res = await context.db.query.user({ where: { id: context.user.id } }, '{ billing { id stripeCustomerId paymentMethods { id } } }');

      // create new payment method
      const methodData = {
        stripeSourceId: stripeSource.id,
        cardBrand: card.brand,
        expMonth: card.exp_month,
        expYear: card.exp_year,
        lastFour: card.last4
      };

      const paymentMethod = await context.db.mutation.createPaymentMethod({
        data: methodData
      }, '{ id }');

      const billingId = res.billing.id;

      const updateArgs = {};

      if (!res.paymentMethods || res.paymentMethods.length === 0) {
        updateArgs.defaultPaymentMethod = { connect: { id: paymentMethod.id } };
      }

      // attach to customer
      await attachSourceToCustomer(res.billing.stripeCustomerId, stripeSource.id);

      await context.db.mutation.updateUserBilling({
        where: {
          id: billingId
        },
        data: {
          ...updateArgs,
          paymentMethods: {
            connect: { id: paymentMethod.id }
          }
        }
      });

      return {
        status: 0,
        message: 'Payment method added successfully'
      };
    } catch (e) {
      console.error(e);
      return {
        status: 1,
        error: 'Error creating payment method. Please try again later'
      };
    }
  },
  subscribeToPlan: async (parent, args, context) => {
    const { planId } = args;

    const userBillingRes = await context.db.query.user({ where: { id: context.user.id } }, '{ billing { id stripeCustomerId defaultPaymentMethod { id stripeSourceId } paymentMethods { id stripeSourceId } } }');
    const planRes = await context.db.query.productPlan({ where: { id: planId } }, '{ id stripePlanId }');

    if (!planRes) {
      return {
        status: 1,
        error: 'Invalid plan supplied.'
      };
    }

    const userBilling = userBillingRes.billing;

    if (userBilling.paymentMethods.length === 0) {
      return {
        status: 1,
        error: 'You must have a valid method of payment on file to select a plan.'
      };
    }

    let paymentMethod = userBilling.defaultPaymentMethod;

    if (paymentMethod == null) {
      [paymentMethod] = userBilling.paymentMethods;
    }

    try {
      const subscription = await subscribeUserToPlan(
        userBilling.stripeCustomerId, planRes.stripePlanId
      );

      if (!subscription) {
        return {
          status: 1,
          error: 'Unable to create subscription. Please try again later.'
        };
      }

      const newBilling = await context.db.mutation.updateUserBilling({
        where: {
          id: userBilling.id
        },
        data: {
          subscriptions: {
            create: {
              stripeSubscriptionId: subscription.id,
              plan: { connect: { id: planRes.id } }
            }
          }
        }
      }, '{ id }');

      return {
        resourceId: newBilling.id,
        status: 0,
        message: 'Subscription processed successfully.'
      };
    } catch (e) {
      console.error(e);
      return {
        status: 1,
        error: 'Error creating subscription. Please try again later.'
      };
    }
  }
};

export default {
  Query,
  Mutation
};
