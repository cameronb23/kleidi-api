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
