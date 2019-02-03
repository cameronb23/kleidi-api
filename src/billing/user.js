// @flow
import _ from 'underscore';

/**
 * Check if a user has a service entitlement (if their subscribed plans have access)
 * @param {Object} user the user to check entitlements of
 * @param {String} service the service type to check entitlements of
 * @param {Object} entitlementKey the key of the entitlement to fetch
 * @returns {Array} array of the entitlement values across all active subscriptions
 */
export const getEntitlements = (user, service, entitlementKey) => {
  if (user.billing == null) {
    return [];
  }

  const { subscriptions } = user.billing;

  if (subscriptions.length < 1) return [];

  const subscriptionsForService = _.filter(subscriptions,
    subscription => subscription.active
      && subscription.plan.product.forService.toLowerCase() === service.toLowerCase());

  const foundEntitlementSubscriptions = _.filter(subscriptionsForService,
    subscription => _.has(subscription.plan.serviceEntitlements, entitlementKey));

  const entitlements = [];

  foundEntitlementSubscriptions.forEach(
    sub => entitlements.push(sub.plan.serviceEntitlements[entitlementKey])
  );

  return entitlements;
};
