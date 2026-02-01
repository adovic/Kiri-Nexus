// =============================================================================
// STRIPE PRODUCT & PRICE CONFIGURATION
// =============================================================================
// Maps plan IDs and stack IDs to Stripe price IDs.
// In production, replace placeholder IDs with real Stripe price IDs.
// =============================================================================

export type PlanId = 'foundation' | 'momentum' | 'professional' | 'executive' | 'corporate' | 'syndicate' | 'enterprise';
export type StackId = 'velocity' | 'presence' | 'oracle';
export type BillingInterval = 'monthly' | 'annual';

// =============================================================================
// PLAN CONFIGURATIONS
// =============================================================================

export const PLANS: Record<PlanId, {
  name: string;
  basePrice: number;
  minutes: number;
  overageRate: number;
}> = {
  foundation: { name: 'Foundation', basePrice: 149, minutes: 750, overageRate: 0.20 },
  momentum: { name: 'Momentum', basePrice: 299, minutes: 1500, overageRate: 0.20 },
  professional: { name: 'Professional', basePrice: 499, minutes: 2500, overageRate: 0.20 },
  executive: { name: 'Executive', basePrice: 749, minutes: 4000, overageRate: 0.20 },
  corporate: { name: 'Corporate', basePrice: 999, minutes: 5500, overageRate: 0.15 },
  syndicate: { name: 'Syndicate', basePrice: 1299, minutes: 7500, overageRate: 0.15 },
  enterprise: { name: 'Enterprise', basePrice: 1699, minutes: 10000, overageRate: 0.15 },
};

export const STACKS: Record<StackId, {
  name: string;
  multiplier: number;
}> = {
  velocity: { name: 'Velocity', multiplier: 1.0 },
  presence: { name: 'Presence', multiplier: 1.4 },
  oracle: { name: 'Oracle', multiplier: 2.5 },
};

// =============================================================================
// STRIPE PRICE IDS
// =============================================================================
// Replace these with your actual Stripe price IDs from the Stripe Dashboard.
// Format: price_XXXXXXXXXXXXXX
//
// To set up in Stripe:
// 1. Create products for each plan (Foundation, Momentum, etc.)
// 2. Add prices for each stack × billing interval combination
// 3. Copy the price IDs here
// =============================================================================

type PriceMatrix = Record<PlanId, Record<StackId, Record<BillingInterval, string>>>;

// Placeholder price IDs - REPLACE WITH REAL STRIPE PRICE IDS
const PRICE_IDS: PriceMatrix = {
  foundation: {
    velocity: { monthly: 'price_foundation_velocity_monthly', annual: 'price_foundation_velocity_annual' },
    presence: { monthly: 'price_foundation_presence_monthly', annual: 'price_foundation_presence_annual' },
    oracle: { monthly: 'price_foundation_oracle_monthly', annual: 'price_foundation_oracle_annual' },
  },
  momentum: {
    velocity: { monthly: 'price_momentum_velocity_monthly', annual: 'price_momentum_velocity_annual' },
    presence: { monthly: 'price_momentum_presence_monthly', annual: 'price_momentum_presence_annual' },
    oracle: { monthly: 'price_momentum_oracle_monthly', annual: 'price_momentum_oracle_annual' },
  },
  professional: {
    velocity: { monthly: 'price_professional_velocity_monthly', annual: 'price_professional_velocity_annual' },
    presence: { monthly: 'price_professional_presence_monthly', annual: 'price_professional_presence_annual' },
    oracle: { monthly: 'price_professional_oracle_monthly', annual: 'price_professional_oracle_annual' },
  },
  executive: {
    velocity: { monthly: 'price_executive_velocity_monthly', annual: 'price_executive_velocity_annual' },
    presence: { monthly: 'price_executive_presence_monthly', annual: 'price_executive_presence_annual' },
    oracle: { monthly: 'price_executive_oracle_monthly', annual: 'price_executive_oracle_annual' },
  },
  corporate: {
    velocity: { monthly: 'price_corporate_velocity_monthly', annual: 'price_corporate_velocity_annual' },
    presence: { monthly: 'price_corporate_presence_monthly', annual: 'price_corporate_presence_annual' },
    oracle: { monthly: 'price_corporate_oracle_monthly', annual: 'price_corporate_oracle_annual' },
  },
  syndicate: {
    velocity: { monthly: 'price_syndicate_velocity_monthly', annual: 'price_syndicate_velocity_annual' },
    presence: { monthly: 'price_syndicate_presence_monthly', annual: 'price_syndicate_presence_annual' },
    oracle: { monthly: 'price_syndicate_oracle_monthly', annual: 'price_syndicate_oracle_annual' },
  },
  enterprise: {
    velocity: { monthly: 'price_enterprise_velocity_monthly', annual: 'price_enterprise_velocity_annual' },
    presence: { monthly: 'price_enterprise_presence_monthly', annual: 'price_enterprise_presence_annual' },
    oracle: { monthly: 'price_enterprise_oracle_monthly', annual: 'price_enterprise_oracle_annual' },
  },
};

// =============================================================================
// HELPERS
// =============================================================================

export function getPriceId(
  planId: PlanId,
  stackId: StackId,
  interval: BillingInterval = 'monthly'
): string | null {
  return PRICE_IDS[planId]?.[stackId]?.[interval] ?? null;
}

export function calculatePrice(planId: PlanId, stackId: StackId): number {
  const plan = PLANS[planId];
  const stack = STACKS[stackId];
  if (!plan || !stack) return 0;

  // Psychological pricing: ceil to nearest 10, subtract 1
  return Math.ceil((plan.basePrice * stack.multiplier) / 10) * 10 - 1;
}

export function getPlanDetails(planId: PlanId, stackId: StackId) {
  const plan = PLANS[planId];
  const stack = STACKS[stackId];

  if (!plan || !stack) return null;

  return {
    planId,
    stackId,
    planName: plan.name,
    stackName: stack.name,
    price: calculatePrice(planId, stackId),
    minutes: plan.minutes,
    overageRate: plan.overageRate,
  };
}

export function isValidPlan(planId: string): planId is PlanId {
  return planId in PLANS;
}

export function isValidStack(stackId: string): stackId is StackId {
  return stackId in STACKS;
}
