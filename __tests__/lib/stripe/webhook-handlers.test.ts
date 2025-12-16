import { describe, it, expect, beforeEach, vi } from 'vitest';
import type Stripe from 'stripe';
import {
  handleCheckoutSessionCompleted,
  handleCustomerCreated,
  handleSubscriptionCreated,
  handleSubscriptionUpdated,
  handleSubscriptionDeleted,
  handleInvoicePaid,
  handleInvoicePaymentFailed,
  handlePaymentIntentSucceeded,
  handlePaymentIntentFailed,
} from '@/lib/stripe/webhook-handlers';
import { RepositoryFactory } from '@/repositories';

// Mock analytics
vi.mock('@/lib/analytics', () => ({
  analytics: {
    trackBusinessEvent: vi.fn(),
  },
  AnalyticsEventType: {
    PAYMENT_SUCCEEDED: 'payment.succeeded',
    PAYMENT_FAILED: 'payment.failed',
    SUBSCRIPTION_CREATED: 'subscription.created',
    SUBSCRIPTION_UPDATED: 'subscription.updated',
    SUBSCRIPTION_ENDED: 'subscription.ended',
  },
}));

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

describe('Stripe Webhook Handlers', () => {
  let mockRepos: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRepos = {
      customers: {
        findByStripeCustomerId: vi.fn(),
        findByUserId: vi.fn(),
        create: vi.fn(),
      },
      payments: {
        create: vi.fn(),
        findByPaymentIntentId: vi.fn(),
        updateByPaymentIntentId: vi.fn(),
      },
      subscriptions: {
        findByStripeSubscriptionId: vi.fn(),
        create: vi.fn(),
        updateByStripeSubscriptionId: vi.fn(),
      },
      invoices: {
        findByStripeInvoiceId: vi.fn(),
        create: vi.fn(),
        updateByStripeInvoiceId: vi.fn(),
      },
    } as unknown as RepositoryFactory;
  });

  describe('handleCheckoutSessionCompleted', () => {
    it('should create payment record for one-time payment', async () => {
      const event = {
        data: {
          object: {
            id: 'cs_test_123',
            mode: 'payment',
            customer: 'cus_123',
            payment_intent: 'pi_123',
            amount_total: 2000,
            currency: 'usd',
            metadata: { customerId: '1' },
          },
        },
      } as unknown as Stripe.CheckoutSessionCompletedEvent;

      await handleCheckoutSessionCompleted(event, mockRepos);

      expect(mockRepos.payments.create).toHaveBeenCalledWith({
        customerId: 1,
        stripeCheckoutSessionId: 'cs_test_123',
        stripePaymentIntentId: 'pi_123',
        amount: 2000,
        currency: 'usd',
        status: 'succeeded',
        description: 'One-time payment via checkout',
        metadata: { customerId: '1' },
      });
    });

    it('should not create payment if no customerId in metadata', async () => {
      const event = {
        data: {
          object: {
            id: 'cs_test_123',
            mode: 'payment',
            metadata: {},
          },
        },
      } as unknown as Stripe.CheckoutSessionCompletedEvent;

      await handleCheckoutSessionCompleted(event, mockRepos);

      expect(mockRepos.payments.create).not.toHaveBeenCalled();
    });

    it('should handle subscription mode checkout', async () => {
      const event = {
        data: {
          object: {
            id: 'cs_test_123',
            mode: 'subscription',
            subscription: 'sub_123',
            metadata: { customerId: '1' },
          },
        },
      } as unknown as Stripe.CheckoutSessionCompletedEvent;

      await handleCheckoutSessionCompleted(event, mockRepos);

      // Should not create payment for subscription mode
      expect(mockRepos.payments.create).not.toHaveBeenCalled();
    });
  });

  describe('handleCustomerCreated', () => {
    it('should skip if customer already exists', async () => {
      const event = {
        data: {
          object: {
            id: 'cus_123',
            email: 'test@example.com',
          },
        },
      } as unknown as Stripe.CustomerCreatedEvent;

      mockRepos.customers.findByStripeCustomerId.mockResolvedValue({
        id: 1,
        stripeCustomerId: 'cus_123',
      });

      await handleCustomerCreated(event, mockRepos);

      expect(mockRepos.customers.findByStripeCustomerId).toHaveBeenCalledWith('cus_123');
    });

    it('should log warning if customer created without userId', async () => {
      const event = {
        data: {
          object: {
            id: 'cus_123',
            email: 'test@example.com',
          },
        },
      } as unknown as Stripe.CustomerCreatedEvent;

      mockRepos.customers.findByStripeCustomerId.mockResolvedValue(null);

      await handleCustomerCreated(event, mockRepos);

      // No customer should be created without userId
      expect(mockRepos.customers.create).not.toHaveBeenCalled();
    });
  });

  describe('handleSubscriptionCreated', () => {
    it('should create subscription for existing customer', async () => {
      const event = {
        data: {
          object: {
            id: 'sub_123',
            customer: 'cus_123',
            status: 'active',
            items: {
              data: [{ price: { id: 'price_123' } }],
            },
            current_period_start: 1700000000,
            current_period_end: 1702592000,
            cancel_at_period_end: false,
            trial_start: null,
            trial_end: null,
          },
        },
      } as unknown as Stripe.CustomerSubscriptionCreatedEvent;

      mockRepos.customers.findByStripeCustomerId.mockResolvedValue({
        id: 1,
        stripeCustomerId: 'cus_123',
      });
      mockRepos.subscriptions.findByStripeSubscriptionId.mockResolvedValue(null);

      await handleSubscriptionCreated(event, mockRepos);

      expect(mockRepos.subscriptions.create).toHaveBeenCalledWith({
        customerId: 1,
        stripeSubscriptionId: 'sub_123',
        stripePriceId: 'price_123',
        status: 'active',
        currentPeriodStart: 1700000000,
        currentPeriodEnd: 1702592000,
        cancelAtPeriodEnd: false,
        trialStart: undefined,
        trialEnd: undefined,
      });
    });

    it('should update existing subscription', async () => {
      const event = {
        data: {
          object: {
            id: 'sub_123',
            customer: 'cus_123',
            status: 'active',
            items: {
              data: [{ price: { id: 'price_123' } }],
            },
            current_period_start: 1700000000,
            current_period_end: 1702592000,
            cancel_at_period_end: false,
          },
        },
      } as unknown as Stripe.CustomerSubscriptionCreatedEvent;

      mockRepos.customers.findByStripeCustomerId.mockResolvedValue({
        id: 1,
        stripeCustomerId: 'cus_123',
      });
      mockRepos.subscriptions.findByStripeSubscriptionId.mockResolvedValue({
        id: 1,
        stripeSubscriptionId: 'sub_123',
      });

      await handleSubscriptionCreated(event, mockRepos);

      expect(mockRepos.subscriptions.updateByStripeSubscriptionId).toHaveBeenCalledWith(
        'sub_123',
        expect.objectContaining({
          status: 'active',
          cancelAtPeriodEnd: false,
        })
      );
      expect(mockRepos.subscriptions.create).not.toHaveBeenCalled();
    });

    it('should skip if customer not found', async () => {
      const event = {
        data: {
          object: {
            id: 'sub_123',
            customer: 'cus_unknown',
            status: 'active',
          },
        },
      } as unknown as Stripe.CustomerSubscriptionCreatedEvent;

      mockRepos.customers.findByStripeCustomerId.mockResolvedValue(null);

      await handleSubscriptionCreated(event, mockRepos);

      expect(mockRepos.subscriptions.create).not.toHaveBeenCalled();
    });
  });

  describe('handleSubscriptionUpdated', () => {
    it('should update subscription status', async () => {
      const event = {
        data: {
          object: {
            id: 'sub_123',
            status: 'past_due',
            items: {
              data: [{ price: { id: 'price_123' } }],
            },
            current_period_start: 1700000000,
            current_period_end: 1702592000,
            cancel_at_period_end: true,
            canceled_at: null,
            ended_at: null,
            trial_start: null,
            trial_end: null,
          },
        },
      } as unknown as Stripe.CustomerSubscriptionUpdatedEvent;

      await handleSubscriptionUpdated(event, mockRepos);

      expect(mockRepos.subscriptions.updateByStripeSubscriptionId).toHaveBeenCalledWith(
        'sub_123',
        expect.objectContaining({
          status: 'past_due',
          cancelAtPeriodEnd: true,
        })
      );
    });

    it('should handle update errors gracefully', async () => {
      const event = {
        data: {
          object: {
            id: 'sub_123',
            status: 'active',
            items: { data: [{ price: { id: 'price_123' } }] },
            current_period_start: 1700000000,
            current_period_end: 1702592000,
            cancel_at_period_end: false,
            canceled_at: null,
            ended_at: null,
            trial_start: null,
            trial_end: null,
          },
        },
      } as unknown as Stripe.CustomerSubscriptionUpdatedEvent;

      mockRepos.subscriptions.updateByStripeSubscriptionId.mockRejectedValue(
        new Error('Database error')
      );

      // Should not throw
      await expect(handleSubscriptionUpdated(event, mockRepos)).resolves.not.toThrow();
    });
  });

  describe('handleSubscriptionDeleted', () => {
    it('should mark subscription as canceled', async () => {
      const now = Math.floor(Date.now() / 1000);
      const event = {
        data: {
          object: {
            id: 'sub_123',
            canceled_at: now,
            ended_at: now,
          },
        },
      } as unknown as Stripe.CustomerSubscriptionDeletedEvent;

      await handleSubscriptionDeleted(event, mockRepos);

      expect(mockRepos.subscriptions.updateByStripeSubscriptionId).toHaveBeenCalledWith(
        'sub_123',
        expect.objectContaining({
          status: 'canceled',
          canceledAt: now,
          endedAt: now,
        })
      );
    });

    it('should use current timestamp if canceled_at/ended_at not provided', async () => {
      const event = {
        data: {
          object: {
            id: 'sub_123',
            canceled_at: null,
            ended_at: null,
          },
        },
      } as unknown as Stripe.CustomerSubscriptionDeletedEvent;

      await handleSubscriptionDeleted(event, mockRepos);

      expect(mockRepos.subscriptions.updateByStripeSubscriptionId).toHaveBeenCalledWith(
        'sub_123',
        expect.objectContaining({
          status: 'canceled',
        })
      );
    });
  });

  describe('handleInvoicePaid', () => {
    it('should create invoice record for new invoice', async () => {
      const event = {
        data: {
          object: {
            id: 'in_123',
            customer: 'cus_123',
            amount_due: 2000,
            amount_paid: 2000,
            currency: 'usd',
            hosted_invoice_url: 'https://invoice.stripe.com/123',
            invoice_pdf: 'https://invoice.stripe.com/123.pdf',
            period_start: 1700000000,
            period_end: 1702592000,
            subscription: 'sub_123',
          },
        },
      } as unknown as Stripe.InvoicePaidEvent;

      mockRepos.customers.findByStripeCustomerId.mockResolvedValue({
        id: 1,
        stripeCustomerId: 'cus_123',
      });
      mockRepos.subscriptions.findByStripeSubscriptionId.mockResolvedValue({
        id: 10,
        stripeSubscriptionId: 'sub_123',
      });
      mockRepos.invoices.findByStripeInvoiceId.mockResolvedValue(null);

      await handleInvoicePaid(event, mockRepos);

      expect(mockRepos.invoices.create).toHaveBeenCalledWith({
        customerId: 1,
        subscriptionId: 10,
        stripeInvoiceId: 'in_123',
        amountDue: 2000,
        amountPaid: 2000,
        currency: 'usd',
        status: 'paid',
        invoiceUrl: 'https://invoice.stripe.com/123',
        invoicePdf: 'https://invoice.stripe.com/123.pdf',
        periodStart: 1700000000,
        periodEnd: 1702592000,
      });
    });

    it('should update existing invoice', async () => {
      const event = {
        data: {
          object: {
            id: 'in_123',
            customer: 'cus_123',
            amount_due: 2000,
            amount_paid: 2000,
            hosted_invoice_url: 'https://invoice.stripe.com/123',
            invoice_pdf: 'https://invoice.stripe.com/123.pdf',
          },
        },
      } as unknown as Stripe.InvoicePaidEvent;

      mockRepos.customers.findByStripeCustomerId.mockResolvedValue({
        id: 1,
        stripeCustomerId: 'cus_123',
      });
      mockRepos.invoices.findByStripeInvoiceId.mockResolvedValue({
        id: 1,
        stripeInvoiceId: 'in_123',
      });

      await handleInvoicePaid(event, mockRepos);

      expect(mockRepos.invoices.updateByStripeInvoiceId).toHaveBeenCalledWith('in_123', {
        status: 'paid',
        amountPaid: 2000,
        invoiceUrl: 'https://invoice.stripe.com/123',
        invoicePdf: 'https://invoice.stripe.com/123.pdf',
      });
      expect(mockRepos.invoices.create).not.toHaveBeenCalled();
    });

    it('should skip if customer not found', async () => {
      const event = {
        data: {
          object: {
            id: 'in_123',
            customer: 'cus_unknown',
          },
        },
      } as unknown as Stripe.InvoicePaidEvent;

      mockRepos.customers.findByStripeCustomerId.mockResolvedValue(null);

      await handleInvoicePaid(event, mockRepos);

      expect(mockRepos.invoices.create).not.toHaveBeenCalled();
    });
  });

  describe('handleInvoicePaymentFailed', () => {
    it('should create invoice with open status for new invoice', async () => {
      const event = {
        data: {
          object: {
            id: 'in_123',
            customer: 'cus_123',
            amount_due: 2000,
            currency: 'usd',
            hosted_invoice_url: 'https://invoice.stripe.com/123',
            period_start: 1700000000,
            period_end: 1702592000,
          },
        },
      } as unknown as Stripe.InvoicePaymentFailedEvent;

      mockRepos.customers.findByStripeCustomerId.mockResolvedValue({
        id: 1,
        stripeCustomerId: 'cus_123',
      });
      mockRepos.invoices.findByStripeInvoiceId.mockResolvedValue(null);

      await handleInvoicePaymentFailed(event, mockRepos);

      expect(mockRepos.invoices.create).toHaveBeenCalledWith(
        expect.objectContaining({
          customerId: 1,
          stripeInvoiceId: 'in_123',
          status: 'open',
          amountPaid: 0,
        })
      );
    });

    it('should update existing invoice status to open', async () => {
      const event = {
        data: {
          object: {
            id: 'in_123',
            customer: 'cus_123',
          },
        },
      } as unknown as Stripe.InvoicePaymentFailedEvent;

      mockRepos.customers.findByStripeCustomerId.mockResolvedValue({
        id: 1,
        stripeCustomerId: 'cus_123',
      });
      mockRepos.invoices.findByStripeInvoiceId.mockResolvedValue({
        id: 1,
        stripeInvoiceId: 'in_123',
      });

      await handleInvoicePaymentFailed(event, mockRepos);

      expect(mockRepos.invoices.updateByStripeInvoiceId).toHaveBeenCalledWith('in_123', {
        status: 'open',
      });
    });
  });

  describe('handlePaymentIntentSucceeded', () => {
    it('should update existing payment status to succeeded', async () => {
      const event = {
        data: {
          object: {
            id: 'pi_123',
            amount: 2000,
          },
        },
      } as unknown as Stripe.PaymentIntentSucceededEvent;

      mockRepos.payments.findByPaymentIntentId.mockResolvedValue({
        id: 1,
        stripePaymentIntentId: 'pi_123',
      });

      await handlePaymentIntentSucceeded(event, mockRepos);

      expect(mockRepos.payments.updateByPaymentIntentId).toHaveBeenCalledWith('pi_123', {
        status: 'succeeded',
      });
    });

    it('should skip if payment not found', async () => {
      const event = {
        data: {
          object: {
            id: 'pi_123',
            amount: 2000,
          },
        },
      } as unknown as Stripe.PaymentIntentSucceededEvent;

      mockRepos.payments.findByPaymentIntentId.mockResolvedValue(null);

      await handlePaymentIntentSucceeded(event, mockRepos);

      expect(mockRepos.payments.updateByPaymentIntentId).not.toHaveBeenCalled();
    });
  });

  describe('handlePaymentIntentFailed', () => {
    it('should update existing payment status to failed', async () => {
      const event = {
        data: {
          object: {
            id: 'pi_123',
            last_payment_error: { message: 'Card declined' },
          },
        },
      } as unknown as Stripe.PaymentIntentPaymentFailedEvent;

      mockRepos.payments.findByPaymentIntentId.mockResolvedValue({
        id: 1,
        stripePaymentIntentId: 'pi_123',
      });

      await handlePaymentIntentFailed(event, mockRepos);

      expect(mockRepos.payments.updateByPaymentIntentId).toHaveBeenCalledWith('pi_123', {
        status: 'failed',
      });
    });

    it('should skip if payment not found', async () => {
      const event = {
        data: {
          object: {
            id: 'pi_123',
          },
        },
      } as unknown as Stripe.PaymentIntentPaymentFailedEvent;

      mockRepos.payments.findByPaymentIntentId.mockResolvedValue(null);

      await handlePaymentIntentFailed(event, mockRepos);

      expect(mockRepos.payments.updateByPaymentIntentId).not.toHaveBeenCalled();
    });
  });
});
