/**
 * Stripe module exports
 */

// Client
export { getStripeClient, getWebhookSecret, resetStripeClient } from './client';
export type { Stripe } from './client';

// Errors
export {
  StripeErrorType,
  STRIPE_ERROR_STATUS_MAP,
  StripeError,
  StripeConfigError,
  StripeWebhookSignatureError,
  StripeWebhookEventAlreadyProcessedError,
  StripeCustomerNotFoundError,
  StripePaymentFailedError,
  StripeSubscriptionNotFoundError,
  StripeNoActiveSubscriptionError,
  StripeAPIError,
  createStripeErrorFromSDK,
} from './errors';

// Config
export {
  SUBSCRIPTION_PLANS,
  ONE_TIME_PRODUCTS,
  CHECKOUT_URLS,
  PORTAL_CONFIG,
  getPlanByPriceId,
  getProductByPriceId,
  getSubscriptionPlans,
  getOneTimeProducts,
  formatPrice,
} from './config';
export type { PlanType, BillingInterval, PriceConfig, PlanConfig, ProductConfig } from './config';

// Types
export {
  SUPPORTED_WEBHOOK_EVENTS,
  isSubscriptionActive,
  isPaymentSucceeded,
  isInvoicePaid,
} from './types';
export type {
  SubscriptionStatus,
  PaymentStatus,
  InvoiceStatus,
  CustomerData,
  PaymentData,
  SubscriptionData,
  InvoiceData,
  WebhookEventData,
  CreateCustomerInput,
  CreatePaymentInput,
  CreateSubscriptionInput,
  UpdateSubscriptionInput,
  CreateInvoiceInput,
  UpdateInvoiceInput,
  CheckoutSessionOptions,
  PortalSessionOptions,
  WebhookEventType,
} from './types';
