import type Stripe from 'stripe';
import { RepositoryFactory } from '@/repositories';
import { logger } from '@/lib/logger';
import { analytics, AnalyticsEventType } from '@/lib/analytics';
import type { SubscriptionStatus, PaymentStatus, InvoiceStatus } from '@/lib/stripe/types';

const log = logger.child('stripe-webhook-handlers');

/**
 * Handle checkout.session.completed event
 */
export async function handleCheckoutSessionCompleted(
  event: Stripe.CheckoutSessionCompletedEvent,
  repos: RepositoryFactory
): Promise<void> {
  const session = event.data.object;

  log.info('Processing checkout.session.completed', {
    sessionId: session.id,
    mode: session.mode,
    customerId: session.customer,
  });

  const customerId = session.metadata?.customerId;
  if (!customerId) {
    log.warn('No customerId in session metadata', undefined, { sessionId: session.id });
    return;
  }

  const dbCustomerId = parseInt(customerId, 10);

  if (session.mode === 'payment') {
    // One-time payment completed
    await repos.payments.create({
      customerId: dbCustomerId,
      stripeCheckoutSessionId: session.id,
      stripePaymentIntentId: session.payment_intent as string | undefined,
      amount: session.amount_total || 0,
      currency: session.currency || 'usd',
      status: 'succeeded' as PaymentStatus,
      description: 'One-time payment via checkout',
      metadata: session.metadata as Record<string, unknown>,
    });

    await analytics.trackBusinessEvent(AnalyticsEventType.PAYMENT_SUCCEEDED, {
      customerId: dbCustomerId,
      sessionId: session.id,
      amount: session.amount_total,
    });
  } else if (session.mode === 'subscription') {
    // Subscription created via checkout
    // The actual subscription creation is handled by customer.subscription.created
    log.info('Subscription checkout completed', {
      sessionId: session.id,
      subscriptionId: session.subscription,
    });
  }
}

/**
 * Handle customer.created event
 */
export async function handleCustomerCreated(
  event: Stripe.CustomerCreatedEvent,
  repos: RepositoryFactory
): Promise<void> {
  const customer = event.data.object;

  log.info('Processing customer.created', {
    stripeCustomerId: customer.id,
    email: customer.email,
  });

  // Check if customer already exists (may have been created during checkout)
  const existing = await repos.customers.findByStripeCustomerId(customer.id);
  if (existing) {
    log.info('Customer already exists in database', {
      stripeCustomerId: customer.id,
      dbCustomerId: existing.id,
    });
    return;
  }

  // Customer created outside our app - we can't link to a user without metadata
  log.warn('Customer created without userId metadata', undefined, {
    stripeCustomerId: customer.id,
  });
}

/**
 * Handle customer.subscription.created event
 */
export async function handleSubscriptionCreated(
  event: Stripe.CustomerSubscriptionCreatedEvent,
  repos: RepositoryFactory
): Promise<void> {
  const subscription = event.data.object;

  log.info('Processing customer.subscription.created', {
    subscriptionId: subscription.id,
    customerId: subscription.customer,
    status: subscription.status,
  });

  // Find customer by Stripe customer ID
  const stripeCustomerId =
    typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;

  const customer = await repos.customers.findByStripeCustomerId(stripeCustomerId);
  if (!customer) {
    log.warn('Customer not found for subscription', undefined, {
      stripeCustomerId,
      subscriptionId: subscription.id,
    });
    return;
  }

  // Check if subscription already exists
  const existing = await repos.subscriptions.findByStripeSubscriptionId(subscription.id);
  if (existing) {
    log.info('Subscription already exists, updating', {
      subscriptionId: subscription.id,
    });
    await repos.subscriptions.updateByStripeSubscriptionId(subscription.id, {
      status: subscription.status as SubscriptionStatus,
      currentPeriodStart: (subscription as unknown as { current_period_start: number })
        .current_period_start,
      currentPeriodEnd: (subscription as unknown as { current_period_end: number })
        .current_period_end,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    });
    return;
  }

  // Get price ID from subscription items
  const priceId = subscription.items.data[0]?.price.id;
  if (!priceId) {
    log.error('No price ID found in subscription', undefined, {
      subscriptionId: subscription.id,
    });
    return;
  }

  // Create subscription in database
  await repos.subscriptions.create({
    customerId: customer.id,
    stripeSubscriptionId: subscription.id,
    stripePriceId: priceId,
    status: subscription.status as SubscriptionStatus,
    currentPeriodStart: (subscription as unknown as { current_period_start: number })
      .current_period_start,
    currentPeriodEnd: (subscription as unknown as { current_period_end: number })
      .current_period_end,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    trialStart: subscription.trial_start ?? undefined,
    trialEnd: subscription.trial_end ?? undefined,
  });

  await analytics.trackBusinessEvent(AnalyticsEventType.SUBSCRIPTION_CREATED, {
    customerId: customer.id,
    subscriptionId: subscription.id,
    priceId,
    status: subscription.status,
  });
}

/**
 * Handle customer.subscription.updated event
 */
export async function handleSubscriptionUpdated(
  event: Stripe.CustomerSubscriptionUpdatedEvent,
  repos: RepositoryFactory
): Promise<void> {
  const subscription = event.data.object;

  log.info('Processing customer.subscription.updated', {
    subscriptionId: subscription.id,
    status: subscription.status,
  });

  // Get price ID from subscription items
  const priceId = subscription.items.data[0]?.price.id;

  try {
    await repos.subscriptions.updateByStripeSubscriptionId(subscription.id, {
      stripePriceId: priceId,
      status: subscription.status as SubscriptionStatus,
      currentPeriodStart: (subscription as unknown as { current_period_start: number })
        .current_period_start,
      currentPeriodEnd: (subscription as unknown as { current_period_end: number })
        .current_period_end,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      canceledAt: subscription.canceled_at ?? undefined,
      endedAt: subscription.ended_at ?? undefined,
      trialStart: subscription.trial_start ?? undefined,
      trialEnd: subscription.trial_end ?? undefined,
    });

    await analytics.trackBusinessEvent(AnalyticsEventType.SUBSCRIPTION_UPDATED, {
      subscriptionId: subscription.id,
      status: subscription.status,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    });
  } catch (error) {
    log.error('Failed to update subscription', undefined, {
      subscriptionId: subscription.id,
      error,
    });
  }
}

/**
 * Handle customer.subscription.deleted event
 */
export async function handleSubscriptionDeleted(
  event: Stripe.CustomerSubscriptionDeletedEvent,
  repos: RepositoryFactory
): Promise<void> {
  const subscription = event.data.object;

  log.info('Processing customer.subscription.deleted', {
    subscriptionId: subscription.id,
  });

  try {
    await repos.subscriptions.updateByStripeSubscriptionId(subscription.id, {
      status: 'canceled' as SubscriptionStatus,
      canceledAt: subscription.canceled_at ?? Math.floor(Date.now() / 1000),
      endedAt: subscription.ended_at ?? Math.floor(Date.now() / 1000),
    });

    await analytics.trackBusinessEvent(AnalyticsEventType.SUBSCRIPTION_ENDED, {
      subscriptionId: subscription.id,
    });
  } catch (error) {
    log.error('Failed to mark subscription as deleted', undefined, {
      subscriptionId: subscription.id,
      error,
    });
  }
}

/**
 * Handle invoice.paid event
 */
export async function handleInvoicePaid(
  event: Stripe.InvoicePaidEvent,
  repos: RepositoryFactory
): Promise<void> {
  const invoice = event.data.object;

  log.info('Processing invoice.paid', {
    invoiceId: invoice.id,
    customerId: invoice.customer,
    amount: invoice.amount_paid,
  });

  // Find customer
  const stripeCustomerId =
    typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;

  if (!stripeCustomerId) {
    log.warn('No customer ID in invoice', undefined, { invoiceId: invoice.id });
    return;
  }

  const customer = await repos.customers.findByStripeCustomerId(stripeCustomerId);
  if (!customer) {
    log.warn('Customer not found for invoice', undefined, {
      stripeCustomerId,
      invoiceId: invoice.id,
    });
    return;
  }

  // Find subscription if this is a subscription invoice
  let subscriptionId: number | undefined;
  const invoiceWithSub = invoice as unknown as { subscription?: string | { id: string } };
  if (invoiceWithSub.subscription) {
    const stripeSubId =
      typeof invoiceWithSub.subscription === 'string'
        ? invoiceWithSub.subscription
        : invoiceWithSub.subscription.id;
    const subscription = await repos.subscriptions.findByStripeSubscriptionId(stripeSubId);
    subscriptionId = subscription?.id;
  }

  // Check if invoice exists
  const existing = await repos.invoices.findByStripeInvoiceId(invoice.id);
  if (existing) {
    // Update existing invoice
    await repos.invoices.updateByStripeInvoiceId(invoice.id, {
      status: 'paid' as InvoiceStatus,
      amountPaid: invoice.amount_paid,
      invoiceUrl: invoice.hosted_invoice_url ?? undefined,
      invoicePdf: invoice.invoice_pdf ?? undefined,
    });
  } else {
    // Create new invoice record
    await repos.invoices.create({
      customerId: customer.id,
      subscriptionId,
      stripeInvoiceId: invoice.id,
      amountDue: invoice.amount_due,
      amountPaid: invoice.amount_paid,
      currency: invoice.currency,
      status: 'paid' as InvoiceStatus,
      invoiceUrl: invoice.hosted_invoice_url ?? undefined,
      invoicePdf: invoice.invoice_pdf ?? undefined,
      periodStart: invoice.period_start,
      periodEnd: invoice.period_end,
    });
  }

  await analytics.trackBusinessEvent(AnalyticsEventType.PAYMENT_SUCCEEDED, {
    customerId: customer.id,
    invoiceId: invoice.id,
    amount: invoice.amount_paid,
    isSubscription: !!(invoice as unknown as { subscription?: unknown }).subscription,
  });
}

/**
 * Handle invoice.payment_failed event
 */
export async function handleInvoicePaymentFailed(
  event: Stripe.InvoicePaymentFailedEvent,
  repos: RepositoryFactory
): Promise<void> {
  const invoice = event.data.object;

  log.warn('Processing invoice.payment_failed', undefined, {
    invoiceId: invoice.id,
    customerId: invoice.customer,
  });

  // Find customer
  const stripeCustomerId =
    typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;

  if (!stripeCustomerId) {
    return;
  }

  const customer = await repos.customers.findByStripeCustomerId(stripeCustomerId);
  if (!customer) {
    return;
  }

  // Find subscription
  let subscriptionId: number | undefined;
  const invoiceWithSub2 = invoice as unknown as { subscription?: string | { id: string } };
  if (invoiceWithSub2.subscription) {
    const stripeSubId =
      typeof invoiceWithSub2.subscription === 'string'
        ? invoiceWithSub2.subscription
        : invoiceWithSub2.subscription.id;
    const subscription = await repos.subscriptions.findByStripeSubscriptionId(stripeSubId);
    subscriptionId = subscription?.id;
  }

  // Check if invoice exists
  const existing = await repos.invoices.findByStripeInvoiceId(invoice.id);
  if (existing) {
    await repos.invoices.updateByStripeInvoiceId(invoice.id, {
      status: 'open' as InvoiceStatus,
    });
  } else {
    await repos.invoices.create({
      customerId: customer.id,
      subscriptionId,
      stripeInvoiceId: invoice.id,
      amountDue: invoice.amount_due,
      amountPaid: 0,
      currency: invoice.currency,
      status: 'open' as InvoiceStatus,
      invoiceUrl: invoice.hosted_invoice_url ?? undefined,
      periodStart: invoice.period_start,
      periodEnd: invoice.period_end,
    });
  }

  await analytics.trackBusinessEvent(AnalyticsEventType.PAYMENT_FAILED, {
    customerId: customer.id,
    invoiceId: invoice.id,
    amountDue: invoice.amount_due,
    isSubscription: !!(invoice as unknown as { subscription?: unknown }).subscription,
  });
}

/**
 * Handle payment_intent.succeeded event
 */
export async function handlePaymentIntentSucceeded(
  event: Stripe.PaymentIntentSucceededEvent,
  repos: RepositoryFactory
): Promise<void> {
  const paymentIntent = event.data.object;

  log.info('Processing payment_intent.succeeded', {
    paymentIntentId: paymentIntent.id,
    amount: paymentIntent.amount,
  });

  // Try to update existing payment record
  try {
    const existing = await repos.payments.findByPaymentIntentId(paymentIntent.id);
    if (existing) {
      await repos.payments.updateByPaymentIntentId(paymentIntent.id, {
        status: 'succeeded' as PaymentStatus,
      });
    }
    // If no existing record, it was likely created via checkout session
  } catch (error) {
    log.error('Failed to update payment intent', undefined, {
      paymentIntentId: paymentIntent.id,
      error,
    });
  }
}

/**
 * Handle payment_intent.payment_failed event
 */
export async function handlePaymentIntentFailed(
  event: Stripe.PaymentIntentPaymentFailedEvent,
  repos: RepositoryFactory
): Promise<void> {
  const paymentIntent = event.data.object;

  log.warn('Processing payment_intent.payment_failed', undefined, {
    paymentIntentId: paymentIntent.id,
    lastPaymentError: paymentIntent.last_payment_error?.message,
  });

  // Try to update existing payment record
  try {
    const existing = await repos.payments.findByPaymentIntentId(paymentIntent.id);
    if (existing) {
      await repos.payments.updateByPaymentIntentId(paymentIntent.id, {
        status: 'failed' as PaymentStatus,
      });
    }
  } catch (error) {
    log.error('Failed to update payment intent', undefined, {
      paymentIntentId: paymentIntent.id,
      error,
    });
  }
}
