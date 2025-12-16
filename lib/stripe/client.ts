import Stripe from 'stripe';
import { getCloudflareEnv } from '@/lib/db/client';
import { StripeConfigError } from './errors';

/**
 * Stripe client singleton
 * Creates and caches a Stripe instance for reuse across requests
 */
let stripeInstance: Stripe | null = null;

/**
 * Get or create a Stripe client instance
 * Uses environment variables from Cloudflare or process.env
 *
 * @returns Stripe client instance
 * @throws StripeConfigError if STRIPE_SECRET_KEY is not configured
 */
export function getStripeClient(): Stripe {
  if (stripeInstance) {
    return stripeInstance;
  }

  // Try to get secret key from Cloudflare env first, then process.env
  let secretKey: string | undefined;

  try {
    const env = getCloudflareEnv();
    secretKey = env?.STRIPE_SECRET_KEY as string | undefined;
  } catch {
    // Not in Cloudflare context, fallback to process.env
  }

  if (!secretKey) {
    secretKey = process.env.STRIPE_SECRET_KEY;
  }

  if (!secretKey) {
    throw new StripeConfigError('STRIPE_SECRET_KEY is not configured');
  }

  stripeInstance = new Stripe(secretKey, {
    apiVersion: '2025-11-17.clover', // Use latest stable API version
    typescript: true,
    // Edge Runtime compatible - no custom fetch needed for Stripe SDK v14+
  });

  return stripeInstance;
}

/**
 * Reset the Stripe client instance
 * Useful for testing or when credentials change
 */
export function resetStripeClient(): void {
  stripeInstance = null;
}

/**
 * Get webhook secret from environment
 *
 * @returns Webhook secret string
 * @throws StripeConfigError if STRIPE_WEBHOOK_SECRET is not configured
 */
export function getWebhookSecret(): string {
  let webhookSecret: string | undefined;

  try {
    const env = getCloudflareEnv();
    webhookSecret = env?.STRIPE_WEBHOOK_SECRET as string | undefined;
  } catch {
    // Not in Cloudflare context, fallback to process.env
  }

  if (!webhookSecret) {
    webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  }

  if (!webhookSecret) {
    throw new StripeConfigError('STRIPE_WEBHOOK_SECRET is not configured');
  }

  return webhookSecret;
}

// Re-export Stripe types for convenience
export type { Stripe };
