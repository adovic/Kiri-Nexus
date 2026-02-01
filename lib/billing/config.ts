// =============================================================================
// BILLING CONFIGURATION
// =============================================================================
// Controls whether billing features are enabled.
// Set BILLING_ENABLED=true in .env when ready to go live with Stripe.
//
// TODO: Enable billing when:
// 1. Stripe products and prices are created in Stripe Dashboard
// 2. Price IDs are updated in lib/stripe/products.ts
// 3. Webhook endpoint is configured in Stripe Dashboard
// 4. Customer Portal is configured in Stripe Dashboard
// 5. Testing is complete in Stripe test mode
// =============================================================================

/**
 * Whether billing/payments are enabled.
 * Default: false (disabled)
 *
 * Set BILLING_ENABLED=true in your environment when:
 * - Stripe products and prices are configured
 * - Webhook endpoints are set up
 * - You're ready to accept real payments
 */
export const BILLING_ENABLED = process.env.BILLING_ENABLED === 'true';

/**
 * Message to show when billing is disabled
 */
export const BILLING_DISABLED_MESSAGE =
  'Billing is not yet enabled. We are currently in development mode.';

/**
 * Check if billing is enabled, useful for API routes
 */
export function isBillingEnabled(): boolean {
  return BILLING_ENABLED;
}
