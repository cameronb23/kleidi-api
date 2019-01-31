// @flow
import _ from 'underscore';

/**
 * Check if a user has a service entitlement (if their subscribed plans have access)
 * @param {Object} user the user to check entitlements of
 * @param {String} service the service type to check entitlements of
 * @param {Object} entitlementKey the key of the entitlement to fetch
 */
export const getEntitlement = (user, service, entitlementKey) => {
  if (user.billing == null) {
    return null;
  }

  const { associatedPlans } = user.billing;

  if (associatedPlans.length < 1) return null;

  const plansForService = _.filter(associatedPlans,
    plan => plan.product.forService.toLowerCase() === service.toLowerCase());

  const foundEntitlementPlan = _.find(plansForService,
    plan => _.has(plan.serviceEntitlements, entitlementKey));

  if (foundEntitlementPlan) {
    return foundEntitlementPlan.serviceEntitlements[entitlementKey];
  }

  return null;
};
