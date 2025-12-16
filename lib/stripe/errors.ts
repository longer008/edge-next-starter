import { AppError, ErrorType } from '@/lib/errors';

/**
 * Stripe-specific error types
 */
export enum StripeErrorType {
  // Configuration errors
  CONFIG_ERROR = 'STRIPE_CONFIG_ERROR',
  MISSING_SECRET_KEY = 'STRIPE_MISSING_SECRET_KEY',
  MISSING_WEBHOOK_SECRET = 'STRIPE_MISSING_WEBHOOK_SECRET',

  // Webhook errors
  WEBHOOK_SIGNATURE_INVALID = 'STRIPE_WEBHOOK_SIGNATURE_INVALID',
  WEBHOOK_PARSE_ERROR = 'STRIPE_WEBHOOK_PARSE_ERROR',
  WEBHOOK_EVENT_ALREADY_PROCESSED = 'STRIPE_WEBHOOK_EVENT_ALREADY_PROCESSED',

  // Customer errors
  CUSTOMER_NOT_FOUND = 'STRIPE_CUSTOMER_NOT_FOUND',
  CUSTOMER_CREATE_FAILED = 'STRIPE_CUSTOMER_CREATE_FAILED',

  // Payment errors
  PAYMENT_FAILED = 'STRIPE_PAYMENT_FAILED',
  PAYMENT_NOT_FOUND = 'STRIPE_PAYMENT_NOT_FOUND',
  CHECKOUT_SESSION_CREATE_FAILED = 'STRIPE_CHECKOUT_SESSION_CREATE_FAILED',

  // Subscription errors
  SUBSCRIPTION_NOT_FOUND = 'STRIPE_SUBSCRIPTION_NOT_FOUND',
  SUBSCRIPTION_CREATE_FAILED = 'STRIPE_SUBSCRIPTION_CREATE_FAILED',
  SUBSCRIPTION_CANCEL_FAILED = 'STRIPE_SUBSCRIPTION_CANCEL_FAILED',
  SUBSCRIPTION_UPDATE_FAILED = 'STRIPE_SUBSCRIPTION_UPDATE_FAILED',
  NO_ACTIVE_SUBSCRIPTION = 'STRIPE_NO_ACTIVE_SUBSCRIPTION',

  // Portal errors
  PORTAL_SESSION_CREATE_FAILED = 'STRIPE_PORTAL_SESSION_CREATE_FAILED',

  // General Stripe API errors
  API_ERROR = 'STRIPE_API_ERROR',
  RATE_LIMIT_ERROR = 'STRIPE_RATE_LIMIT_ERROR',
}

/**
 * Stripe error status code mapping
 */
export const STRIPE_ERROR_STATUS_MAP: Record<StripeErrorType, number> = {
  // Configuration errors - 500
  [StripeErrorType.CONFIG_ERROR]: 500,
  [StripeErrorType.MISSING_SECRET_KEY]: 500,
  [StripeErrorType.MISSING_WEBHOOK_SECRET]: 500,

  // Webhook errors - 400/409
  [StripeErrorType.WEBHOOK_SIGNATURE_INVALID]: 400,
  [StripeErrorType.WEBHOOK_PARSE_ERROR]: 400,
  [StripeErrorType.WEBHOOK_EVENT_ALREADY_PROCESSED]: 200, // Return 200 to acknowledge

  // Customer errors - 404/500
  [StripeErrorType.CUSTOMER_NOT_FOUND]: 404,
  [StripeErrorType.CUSTOMER_CREATE_FAILED]: 500,

  // Payment errors - 400/404/500
  [StripeErrorType.PAYMENT_FAILED]: 400,
  [StripeErrorType.PAYMENT_NOT_FOUND]: 404,
  [StripeErrorType.CHECKOUT_SESSION_CREATE_FAILED]: 500,

  // Subscription errors - 400/404/500
  [StripeErrorType.SUBSCRIPTION_NOT_FOUND]: 404,
  [StripeErrorType.SUBSCRIPTION_CREATE_FAILED]: 500,
  [StripeErrorType.SUBSCRIPTION_CANCEL_FAILED]: 500,
  [StripeErrorType.SUBSCRIPTION_UPDATE_FAILED]: 500,
  [StripeErrorType.NO_ACTIVE_SUBSCRIPTION]: 400,

  // Portal errors - 500
  [StripeErrorType.PORTAL_SESSION_CREATE_FAILED]: 500,

  // General Stripe API errors - 502/429
  [StripeErrorType.API_ERROR]: 502,
  [StripeErrorType.RATE_LIMIT_ERROR]: 429,
};

/**
 * Base Stripe error class
 */
export class StripeError extends AppError {
  public readonly stripeErrorType: StripeErrorType;

  constructor(message: string, stripeErrorType: StripeErrorType, details?: unknown) {
    const statusCode = STRIPE_ERROR_STATUS_MAP[stripeErrorType];
    super(message, ErrorType.EXTERNAL_SERVICE_ERROR, statusCode, true, details);
    this.stripeErrorType = stripeErrorType;
  }
}

/**
 * Stripe configuration error
 */
export class StripeConfigError extends StripeError {
  constructor(message: string, details?: unknown) {
    super(message, StripeErrorType.CONFIG_ERROR, details);
  }
}

/**
 * Stripe webhook signature validation error
 */
export class StripeWebhookSignatureError extends StripeError {
  constructor(message = 'Invalid webhook signature', details?: unknown) {
    super(message, StripeErrorType.WEBHOOK_SIGNATURE_INVALID, details);
  }
}

/**
 * Stripe webhook event already processed error
 */
export class StripeWebhookEventAlreadyProcessedError extends StripeError {
  constructor(eventId: string) {
    super(
      `Webhook event ${eventId} has already been processed`,
      StripeErrorType.WEBHOOK_EVENT_ALREADY_PROCESSED,
      { eventId }
    );
  }
}

/**
 * Stripe customer not found error
 */
export class StripeCustomerNotFoundError extends StripeError {
  constructor(identifier: string, details?: unknown) {
    super(`Stripe customer not found: ${identifier}`, StripeErrorType.CUSTOMER_NOT_FOUND, details);
  }
}

/**
 * Stripe payment failed error
 */
export class StripePaymentFailedError extends StripeError {
  constructor(message: string, details?: unknown) {
    super(message, StripeErrorType.PAYMENT_FAILED, details);
  }
}

/**
 * Stripe subscription not found error
 */
export class StripeSubscriptionNotFoundError extends StripeError {
  constructor(identifier: string, details?: unknown) {
    super(`Subscription not found: ${identifier}`, StripeErrorType.SUBSCRIPTION_NOT_FOUND, details);
  }
}

/**
 * No active subscription error
 */
export class StripeNoActiveSubscriptionError extends StripeError {
  constructor(customerId: string, details?: unknown) {
    super(
      `No active subscription found for customer: ${customerId}`,
      StripeErrorType.NO_ACTIVE_SUBSCRIPTION,
      details
    );
  }
}

/**
 * Stripe API error
 */
export class StripeAPIError extends StripeError {
  constructor(message: string, details?: unknown) {
    super(message, StripeErrorType.API_ERROR, details);
  }
}

/**
 * Convert Stripe SDK error to our custom error
 */
export function createStripeErrorFromSDK(error: unknown): StripeError {
  if (error instanceof StripeError) {
    return error;
  }

  // Handle Stripe SDK errors
  if (error && typeof error === 'object' && 'type' in error) {
    const stripeError = error as {
      type: string;
      message: string;
      code?: string;
      statusCode?: number;
    };

    switch (stripeError.type) {
      case 'StripeCardError':
        return new StripePaymentFailedError(stripeError.message, error);

      case 'StripeRateLimitError':
        return new StripeError(
          'Too many requests to Stripe API',
          StripeErrorType.RATE_LIMIT_ERROR,
          error
        );

      case 'StripeInvalidRequestError':
        return new StripeAPIError(stripeError.message, error);

      case 'StripeAPIError':
        return new StripeAPIError(stripeError.message, error);

      case 'StripeConnectionError':
        return new StripeAPIError('Failed to connect to Stripe', error);

      case 'StripeAuthenticationError':
        return new StripeConfigError('Stripe authentication failed', error);

      default:
        return new StripeAPIError(stripeError.message || 'Unknown Stripe error', error);
    }
  }

  // Handle generic errors
  if (error instanceof Error) {
    return new StripeAPIError(error.message, error);
  }

  return new StripeAPIError('Unknown Stripe error', error);
}
