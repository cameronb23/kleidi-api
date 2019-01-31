import { createSource, attachSourceToCustomer } from '../billing/stripe';


const Query = {};

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
  }
};

export default {
  Query,
  Mutation
};
