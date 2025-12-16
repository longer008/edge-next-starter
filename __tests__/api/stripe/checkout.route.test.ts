/**
 * Stripe Checkout API Tests (One-time Payment)
 *
 * Tests for the /api/stripe/checkout endpoint.
 * These tests focus on the one-time payment checkout flow.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Hoist all mocks to ensure they're available before module imports
const mockAuth = vi.hoisted(() => vi.fn());
const mockStripeCustomersCreate = vi.hoisted(() => vi.fn());
const mockStripeCheckoutSessionsCreate = vi.hoisted(() => vi.fn());
const mockCustomersRepo = vi.hoisted(() => ({
  findByUserId: vi.fn(),
  create: vi.fn(),
}));

// Mock auth
vi.mock('@/lib/auth/config', () => ({
  auth: mockAuth,
}));

// Mock Stripe client
vi.mock('@/lib/stripe', () => ({
  getStripeClient: vi.fn(() => ({
    customers: {
      create: mockStripeCustomersCreate,
    },
    checkout: {
      sessions: {
        create: mockStripeCheckoutSessionsCreate,
      },
    },
  })),
  CHECKOUT_URLS: {
    successUrl: '/checkout/success',
    cancelUrl: '/checkout/cancel',
  },
  getProductByPriceId: vi.fn().mockReturnValue({ id: 'test', name: 'Test Product' }),
  getPlanByPriceId: vi.fn().mockReturnValue({ id: 'basic', name: 'Basic Plan' }),
  createStripeErrorFromSDK: vi.fn(error => error),
}));

// Mock analytics
vi.mock('@/lib/analytics', () => ({
  analytics: {
    trackBusinessEvent: vi.fn(),
  },
  AnalyticsEventType: {
    CHECKOUT_STARTED: 'checkout.started',
  },
}));

// Mock repositories
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual('@/lib/api');
  return {
    ...actual,
    withRepositories: vi.fn((req, handler) =>
      handler({
        customers: mockCustomersRepo,
      })
    ),
    withRateLimit: vi.fn((req, handler) => handler()),
  };
});

// Import after mocks
import { POST } from '@/app/api/stripe/checkout/route';

function createRequest(body: unknown, origin = 'http://localhost:3000'): NextRequest {
  return new NextRequest('http://localhost:3000/api/stripe/checkout', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: origin,
    },
    body: JSON.stringify(body),
  });
}

describe('Stripe Checkout API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockReset();
    mockStripeCustomersCreate.mockReset();
    mockStripeCheckoutSessionsCreate.mockReset();
    mockCustomersRepo.findByUserId.mockReset();
    mockCustomersRepo.create.mockReset();
  });

  describe('POST /api/stripe/checkout (one-time payment)', () => {
    it('should create checkout session for new customer', async () => {
      mockAuth.mockResolvedValue({
        user: { id: '1', email: 'test@example.com', name: 'Test User' },
      });

      mockCustomersRepo.findByUserId.mockResolvedValue(null);
      mockStripeCustomersCreate.mockResolvedValue({
        id: 'cus_new123',
      });
      mockCustomersRepo.create.mockResolvedValue({
        id: 1,
        userId: 1,
        stripeCustomerId: 'cus_new123',
      });
      mockStripeCheckoutSessionsCreate.mockResolvedValue({
        id: 'cs_test_123',
        url: 'https://checkout.stripe.com/cs_test_123',
      });

      const request = createRequest({ priceId: 'price_123' });
      const response = await POST(request);
      const data = (await response.json()) as {
        success: boolean;
        data: { sessionId: string; url: string };
      };

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.sessionId).toBe('cs_test_123');
      expect(data.data.url).toContain('checkout.stripe.com');

      // Verify Stripe customer was created
      expect(mockStripeCustomersCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'test@example.com',
          name: 'Test User',
        })
      );
    });

    it('should use existing customer for checkout', async () => {
      mockAuth.mockResolvedValue({
        user: { id: '1', email: 'test@example.com' },
      });

      mockCustomersRepo.findByUserId.mockResolvedValue({
        id: 1,
        userId: 1,
        stripeCustomerId: 'cus_existing123',
      });
      mockStripeCheckoutSessionsCreate.mockResolvedValue({
        id: 'cs_test_456',
        url: 'https://checkout.stripe.com/cs_test_456',
      });

      const request = createRequest({ priceId: 'price_123' });
      const response = await POST(request);
      const data = (await response.json()) as {
        success: boolean;
      };

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);

      // Should not create new customer
      expect(mockStripeCustomersCreate).not.toHaveBeenCalled();

      // Should use existing customer ID
      expect(mockStripeCheckoutSessionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          customer: 'cus_existing123',
          mode: 'payment',
        })
      );
    });

    it('should use custom success and cancel URLs', async () => {
      mockAuth.mockResolvedValue({
        user: { id: '1', email: 'test@example.com' },
      });

      mockCustomersRepo.findByUserId.mockResolvedValue({
        id: 1,
        stripeCustomerId: 'cus_123',
      });
      mockStripeCheckoutSessionsCreate.mockResolvedValue({
        id: 'cs_test_789',
        url: 'https://checkout.stripe.com/cs_test_789',
      });

      const request = createRequest({
        priceId: 'price_123',
        successUrl: 'https://myapp.com/success',
        cancelUrl: 'https://myapp.com/cancel',
      });

      await POST(request);

      expect(mockStripeCheckoutSessionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          success_url: 'https://myapp.com/success',
          cancel_url: 'https://myapp.com/cancel',
        })
      );
    });

    it('should pass metadata to checkout session', async () => {
      mockAuth.mockResolvedValue({
        user: { id: '1', email: 'test@example.com' },
      });

      mockCustomersRepo.findByUserId.mockResolvedValue({
        id: 1,
        stripeCustomerId: 'cus_123',
      });
      mockStripeCheckoutSessionsCreate.mockResolvedValue({
        id: 'cs_test_meta',
        url: 'https://checkout.stripe.com/cs_test_meta',
      });

      const request = createRequest({
        priceId: 'price_123',
        metadata: { orderId: '12345', campaign: 'summer_sale' },
      });

      await POST(request);

      expect(mockStripeCheckoutSessionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            orderId: '12345',
            campaign: 'summer_sale',
          }),
        })
      );
    });
  });
});
