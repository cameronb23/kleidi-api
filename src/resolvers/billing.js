import _ from 'underscore';
import {
  createSource,
  attachSourceToCustomer,
  subscribeUserToPlan,
  cancelUserSubscription
} from '../billing/stripe';


const Query = {
  paymentMethods: async (parent, args, context, info) => {
    const userQuery = await context.db.query.user({ where: { id: context.user.id } }, '{ billing { paymentMethods { id } } }');
    const ids = _.pluck(userQuery.billing.paymentMethods, 'id');
    return context.db.query.paymentMethods({
      where: {
        id_in: ids
      }
    }, info);
  },
  subscriptions: async (parent, args, context, info) => {
    // check if user actually owns that subscription
    const userBilling = await context.db.query.userBillingsConnection({
      where: {
        forUser: {
          id: context.user.id
        }
      }
    }, '{ edges { node { subscriptions { id } } } }');

    console.log(userBilling.edges[0].node);

    if (userBilling.edges.length < 1) {
      return [];
    }

    const billingNode = userBilling.edges[0].node;

    if (billingNode.subscriptions == null || billingNode.subscriptions.length < 1) {
      return [];
    }

    const ids = _.pluck(billingNode.subscriptions, 'id');

    const subscriptions = await context.db.query.subscriptions({
      where: {
        id_in: ids
      }
    }, info);

    return subscriptions;
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
  cancelSubscription: async (parent, args, context) => {
    const { subscriptionId } = args;

    // check if user actually owns that subscription
    const userOwnsSubscription = await context.db.query.userBillings({
      where: {
        forUser: {
          id: context.user.id
        },
        subscriptions_some: {
          id: subscriptionId
        }
      }
    });

    console.log(userOwnsSubscription);

    if (userOwnsSubscription.length < 1) {
      return {
        status: 1,
        error: 'Invalid subscription for user'
      };
    }

    const subscriptionRes = await context.db.query.subscription({ where: { id: subscriptionId } }, '{ id, stripeSubscriptionId }');

    const { id, stripeSubscriptionId } = subscriptionRes;

    const res = await cancelUserSubscription(stripeSubscriptionId);

    if (res == null) {
      return {
        status: 1,
        error: 'Error cancelling subscription. Please try again later. If issue persists, contact support.'
      };
    }

    await context.db.mutation.updateSubscription({
      where: { id },
      data: {
        active: false
      }
    });

    return {
      resourceId: id,
      status: 0,
      message: 'Subscription cancelled successfully.'
    };
  },
  subscribeToPlan: async (parent, args, context) => {
    const { planId } = args;

    const userBillingRes = await context.db.query.user({ where: { id: context.user.id } }, '{ billing { id stripeCustomerId defaultPaymentMethod { id stripeSourceId } paymentMethods { id stripeSourceId } } }');
    const planRes = await context.db.query.productPlan({ where: { id: planId } }, '{ id active stripePlanId }');

    if (!planRes) {
      return {
        status: 1,
        error: 'Invalid plan supplied.'
      };
    }

    if (!planRes.active) {
      return {
        status: 1,
        error: 'Plan is not active.'
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
