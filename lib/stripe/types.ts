/**
 * Stripe subscription status enum
 */
export type SubscriptionStatus =
  | 'active'
  | 'canceled'
  | 'incomplete'
  | 'incomplete_expired'
  | 'past_due'
  | 'paused'
  | 'trialing'
  | 'unpaid';

/**
 * Stripe payment status enum
 */
export type PaymentStatus =
  | 'succeeded'
  | 'pending'
  | 'failed'
  | 'canceled'
  | 'processing'
  | 'requires_action'
  | 'requires_capture'
  | 'requires_confirmation'
  | 'requires_payment_method';

/**
 * Stripe invoice status enum
 */
export type InvoiceStatus = 'draft' | 'open' | 'paid' | 'uncollectible' | 'void';

/**
 * Customer data from our database
 */
export interface CustomerData {
  id: number;
  userId: number;
  stripeCustomerId: string;
  email: string | null;
  name: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: number;
  updatedAt: number;
}

/**
 * Payment data from our database
 */
export interface PaymentData {
  id: number;
  customerId: number;
  stripePaymentIntentId: string | null;
  stripeCheckoutSessionId: string | null;
  amount: number;
  currency: string;
  status: PaymentStatus;
  description: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: number;
  updatedAt: number;
}

/**
 * Subscription data from our database
 */
export interface SubscriptionData {
  id: number;
  customerId: number;
  stripeSubscriptionId: string;
  stripePriceId: string;
  status: SubscriptionStatus;
  currentPeriodStart: number | null;
  currentPeriodEnd: number | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: number | null;
  endedAt: number | null;
  trialStart: number | null;
  trialEnd: number | null;
  metadata: Record<string, unknown> | null;
  createdAt: number;
  updatedAt: number;
}

/**
 * Invoice data from our database
 */
export interface InvoiceData {
  id: number;
  customerId: number;
  subscriptionId: number | null;
  stripeInvoiceId: string;
  amountDue: number;
  amountPaid: number;
  currency: string;
  status: InvoiceStatus;
  invoiceUrl: string | null;
  invoicePdf: string | null;
  periodStart: number | null;
  periodEnd: number | null;
  createdAt: number;
  updatedAt: number;
}

/**
 * Webhook event data from our database
 */
export interface WebhookEventData {
  id: number;
  stripeEventId: string;
  eventType: string;
  processedAt: number;
}

/**
 * Create customer input
 */
export interface CreateCustomerInput {
  userId: number;
  email: string;
  name?: string;
  metadata?: Record<string, string>;
}

/**
 * Create payment input
 */
export interface CreatePaymentInput {
  customerId: number;
  stripePaymentIntentId?: string;
  stripeCheckoutSessionId?: string;
  amount: number;
  currency?: string;
  status: PaymentStatus;
  description?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Create subscription input
 */
export interface CreateSubscriptionInput {
  customerId: number;
  stripeSubscriptionId: string;
  stripePriceId: string;
  status: SubscriptionStatus;
  currentPeriodStart?: number;
  currentPeriodEnd?: number;
  cancelAtPeriodEnd?: boolean;
  trialStart?: number;
  trialEnd?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Update subscription input
 */
export interface UpdateSubscriptionInput {
  stripePriceId?: string;
  status?: SubscriptionStatus;
  currentPeriodStart?: number;
  currentPeriodEnd?: number;
  cancelAtPeriodEnd?: boolean;
  canceledAt?: number | null;
  endedAt?: number | null;
  trialStart?: number;
  trialEnd?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Create invoice input
 */
export interface CreateInvoiceInput {
  customerId: number;
  subscriptionId?: number;
  stripeInvoiceId: string;
  amountDue: number;
  amountPaid?: number;
  currency?: string;
  status: InvoiceStatus;
  invoiceUrl?: string;
  invoicePdf?: string;
  periodStart?: number;
  periodEnd?: number;
}

/**
 * Update invoice input
 */
export interface UpdateInvoiceInput {
  amountPaid?: number;
  status?: InvoiceStatus;
  invoiceUrl?: string;
  invoicePdf?: string;
}

/**
 * Checkout session create options
 */
export interface CheckoutSessionOptions {
  /** Customer user ID */
  userId: number;
  /** Customer email */
  email: string;
  /** Price ID to checkout */
  priceId: string;
  /** Checkout mode: payment or subscription */
  mode: 'payment' | 'subscription';
  /** Success redirect URL */
  successUrl: string;
  /** Cancel redirect URL */
  cancelUrl: string;
  /** Free trial days (for subscriptions) */
  trialDays?: number;
  /** Additional metadata */
  metadata?: Record<string, string>;
  /** Allow promotion codes */
  allowPromotionCodes?: boolean;
}

/**
 * Portal session create options
 */
export interface PortalSessionOptions {
  /** Stripe customer ID */
  stripeCustomerId: string;
  /** Return URL after leaving the portal */
  returnUrl: string;
}

/**
 * Webhook event types we handle
 */
export type WebhookEventType =
  | 'checkout.session.completed'
  | 'customer.created'
  | 'customer.updated'
  | 'customer.deleted'
  | 'customer.subscription.created'
  | 'customer.subscription.updated'
  | 'customer.subscription.deleted'
  | 'customer.subscription.paused'
  | 'customer.subscription.resumed'
  | 'invoice.created'
  | 'invoice.paid'
  | 'invoice.payment_succeeded'
  | 'invoice.payment_failed'
  | 'invoice.finalized'
  | 'payment_intent.succeeded'
  | 'payment_intent.payment_failed';

/**
 * Supported webhook events list
 */
export const SUPPORTED_WEBHOOK_EVENTS: WebhookEventType[] = [
  'checkout.session.completed',
  'customer.created',
  'customer.updated',
  'customer.deleted',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
  'invoice.created',
  'invoice.paid',
  'invoice.payment_succeeded',
  'invoice.payment_failed',
  'invoice.finalized',
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
];

/**
 * Check if subscription is active
 */
export function isSubscriptionActive(status: SubscriptionStatus): boolean {
  return status === 'active' || status === 'trialing';
}

/**
 * Check if payment succeeded
 */
export function isPaymentSucceeded(status: PaymentStatus): boolean {
  return status === 'succeeded';
}

/**
 * Check if invoice is paid
 */
export function isInvoicePaid(status: InvoiceStatus): boolean {
  return status === 'paid';
}
