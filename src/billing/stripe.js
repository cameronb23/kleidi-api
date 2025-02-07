import stripeSdk from 'stripe';

let stripe;

export const init = (key) => {
  stripe = stripeSdk(key);
};

export const formatPrice = priceFloat => Math.round(parseFloat(priceFloat) * 100);

export const createCustomer = async (email) => {
  const params = { email };

  try {
    const customer = await stripe.customers.create(params);

    return customer;
  } catch (e) {
    console.error('Error creating Stripe customer: ', e);
    return null;
  }
};

export const createSource = async (token) => {
  const params = {
    type: 'card',
    usage: 'reusable',
    token
  };

  try {
    const source = await stripe.sources.create(params);

    return source;
  } catch (e) {
    console.error('Error creating payment method source: ', e);
    return null;
  }
};

export const attachSourceToCustomer = async (customerId, sourceId) => {
  console.log('customer: ', customerId);
  try {
    const source = await stripe.customers.createSource(customerId, { source: sourceId });

    return source;
  } catch (e) {
    console.error('Error adding source to customer: ', e);
    return null;
  }
};

export const subscribeUserToPlan = async (customerId, planId) => {
  const params = {
    customer: customerId,
    items: [
      {
        plan: planId
      }
    ]
  };

  try {
    const subscription = await stripe.subscriptions.create(params);

    return subscription;
  } catch (e) {
    console.error('Error updating subscription: ', e);
    return null;
  }
};

export const cancelUserSubscription = async (subscriptionId) => {
  const params = {
    cancel_at_period_end: true
  };

  try {
    const sub = await stripe.subscriptions.update(subscriptionId, params);

    return sub;
  } catch (e) {
    console.error('Error canceling subscription at period end: ', e);
    return null;
  }
};

export const createProduct = async (name) => {
  const params = {
    name,
    type: 'service'
  };

  try {
    const product = await stripe.products.create(params);

    return product;
  } catch (e) {
    console.error('Error creating product: ', e);
    return null;
  }
};

export const createProductPlan = async (stripeProductId, name, billingType, price) => {
  let interval = 'month';

  if (billingType === 'RECURRING_STATIC') {
    interval = 'month';
  }
  const params = {
    currency: 'USD',
    interval,
    nickname: name,
    product: stripeProductId,
    amount: formatPrice(price)
  };

  try {
    const plan = await stripe.plans.create(params);

    return plan;
  } catch (e) {
    console.error('Error creating Stripe product plan: ', e);
    return null;
  }
};
