/**
 * Stripe product and price configuration
 *
 * IMPORTANT: Configure these values in your Stripe Dashboard first:
 * 1. Go to https://dashboard.stripe.com/products
 * 2. Create products and prices
 * 3. Copy the price IDs (price_xxx) here
 *
 * For testing, use Stripe test mode prices.
 * For production, switch to live mode prices.
 */

/**
 * Subscription plan types
 */
export type PlanType = 'free' | 'starter' | 'pro' | 'enterprise';

/**
 * Billing interval types
 */
export type BillingInterval = 'month' | 'year';

/**
 * Price configuration interface
 */
export interface PriceConfig {
  /** Stripe price ID (e.g., price_xxx) */
  priceId: string;
  /** Display amount (for UI) */
  amount: number;
  /** Currency code */
  currency: string;
  /** Billing interval */
  interval: BillingInterval;
  /** Free trial days (0 for no trial) */
  trialDays: number;
}

/**
 * Plan configuration interface
 */
export interface PlanConfig {
  /** Plan identifier */
  id: PlanType;
  /** Display name */
  name: string;
  /** Description */
  description: string;
  /** Features list */
  features: string[];
  /** Monthly price config */
  monthly?: PriceConfig;
  /** Yearly price config */
  yearly?: PriceConfig;
  /** Whether this is a free plan */
  isFree: boolean;
  /** Sort order */
  order: number;
}

/**
 * One-time product configuration interface
 */
export interface ProductConfig {
  /** Stripe price ID */
  priceId: string;
  /** Product name */
  name: string;
  /** Description */
  description: string;
  /** Amount in cents */
  amount: number;
  /** Currency code */
  currency: string;
}

/**
 * Subscription plans configuration
 *
 * TODO: Replace placeholder price IDs with actual Stripe price IDs
 */
export const SUBSCRIPTION_PLANS: Record<PlanType, PlanConfig> = {
  free: {
    id: 'free',
    name: 'Free',
    description: 'For personal projects and exploration',
    features: ['Basic features', 'Community support', 'Limited API calls'],
    isFree: true,
    order: 0,
  },
  starter: {
    id: 'starter',
    name: 'Starter',
    description: 'For small teams getting started',
    features: [
      'All Free features',
      'Priority support',
      '10,000 API calls/month',
      'Basic analytics',
    ],
    monthly: {
      priceId: 'price_starter_monthly_REPLACE_ME', // TODO: Replace with actual Stripe price ID
      amount: 999, // $9.99
      currency: 'usd',
      interval: 'month',
      trialDays: 14,
    },
    yearly: {
      priceId: 'price_starter_yearly_REPLACE_ME', // TODO: Replace with actual Stripe price ID
      amount: 9990, // $99.90 (2 months free)
      currency: 'usd',
      interval: 'year',
      trialDays: 14,
    },
    isFree: false,
    order: 1,
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    description: 'For growing teams with advanced needs',
    features: [
      'All Starter features',
      '24/7 support',
      '100,000 API calls/month',
      'Advanced analytics',
      'Custom integrations',
    ],
    monthly: {
      priceId: 'price_pro_monthly_REPLACE_ME', // TODO: Replace with actual Stripe price ID
      amount: 2999, // $29.99
      currency: 'usd',
      interval: 'month',
      trialDays: 14,
    },
    yearly: {
      priceId: 'price_pro_yearly_REPLACE_ME', // TODO: Replace with actual Stripe price ID
      amount: 29990, // $299.90 (2 months free)
      currency: 'usd',
      interval: 'year',
      trialDays: 14,
    },
    isFree: false,
    order: 2,
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    description: 'For large organizations with custom requirements',
    features: [
      'All Pro features',
      'Dedicated support',
      'Unlimited API calls',
      'Custom SLA',
      'SSO & advanced security',
      'Custom contracts',
    ],
    monthly: {
      priceId: 'price_enterprise_monthly_REPLACE_ME', // TODO: Replace with actual Stripe price ID
      amount: 9999, // $99.99
      currency: 'usd',
      interval: 'month',
      trialDays: 0,
    },
    yearly: {
      priceId: 'price_enterprise_yearly_REPLACE_ME', // TODO: Replace with actual Stripe price ID
      amount: 99990, // $999.90 (2 months free)
      currency: 'usd',
      interval: 'year',
      trialDays: 0,
    },
    isFree: false,
    order: 3,
  },
};

/**
 * One-time products configuration
 *
 * TODO: Replace placeholder price IDs with actual Stripe price IDs
 */
export const ONE_TIME_PRODUCTS: Record<string, ProductConfig> = {
  credits_100: {
    priceId: 'price_credits_100_REPLACE_ME', // TODO: Replace with actual Stripe price ID
    name: '100 Credits',
    description: 'One-time purchase of 100 credits',
    amount: 999, // $9.99
    currency: 'usd',
  },
  credits_500: {
    priceId: 'price_credits_500_REPLACE_ME', // TODO: Replace with actual Stripe price ID
    name: '500 Credits',
    description: 'One-time purchase of 500 credits',
    amount: 3999, // $39.99
    currency: 'usd',
  },
  credits_1000: {
    priceId: 'price_credits_1000_REPLACE_ME', // TODO: Replace with actual Stripe price ID
    name: '1000 Credits',
    description: 'One-time purchase of 1000 credits',
    amount: 6999, // $69.99
    currency: 'usd',
  },
};

/**
 * Get plan configuration by price ID
 */
export function getPlanByPriceId(priceId: string): PlanConfig | null {
  for (const plan of Object.values(SUBSCRIPTION_PLANS)) {
    if (plan.monthly?.priceId === priceId || plan.yearly?.priceId === priceId) {
      return plan;
    }
  }
  return null;
}

/**
 * Get product configuration by price ID
 */
export function getProductByPriceId(priceId: string): ProductConfig | null {
  for (const product of Object.values(ONE_TIME_PRODUCTS)) {
    if (product.priceId === priceId) {
      return product;
    }
  }
  return null;
}

/**
 * Get all subscription plans sorted by order
 */
export function getSubscriptionPlans(): PlanConfig[] {
  return Object.values(SUBSCRIPTION_PLANS).sort((a, b) => a.order - b.order);
}

/**
 * Get all one-time products
 */
export function getOneTimeProducts(): ProductConfig[] {
  return Object.values(ONE_TIME_PRODUCTS);
}

/**
 * Format amount to display price
 */
export function formatPrice(amount: number, currency: string = 'usd'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  }).format(amount / 100);
}

/**
 * Checkout success and cancel URLs
 */
export const CHECKOUT_URLS = {
  /** URL to redirect after successful checkout */
  successUrl: '/checkout/success?session_id={CHECKOUT_SESSION_ID}',
  /** URL to redirect if user cancels checkout */
  cancelUrl: '/checkout/cancel',
  /** URL for billing/subscription management */
  billingUrl: '/billing',
};

/**
 * Stripe billing portal configuration
 */
export const PORTAL_CONFIG = {
  /** Return URL after exiting the portal */
  returnUrl: '/billing',
};
