import { NextRequest } from 'next/server';
import { successResponse, withRepositories, withRateLimit } from '@/lib/api';
import { ValidationError, AuthenticationError } from '@/lib/errors';
import { auth } from '@/lib/auth/config';
import {
  getStripeClient,
  CHECKOUT_URLS,
  getProductByPriceId,
  createStripeErrorFromSDK,
} from '@/lib/stripe';
import { analytics, AnalyticsEventType } from '@/lib/analytics';

export const runtime = 'edge';

/**
 * POST /api/stripe/checkout - Create a one-time payment checkout session
 *
 * Request body:
 * - priceId: string - Stripe price ID for the product
 * - successUrl?: string - Custom success URL (optional)
 * - cancelUrl?: string - Custom cancel URL (optional)
 * - metadata?: Record<string, string> - Additional metadata (optional)
 */
export async function POST(request: NextRequest) {
  return withRateLimit(
    request,
    async () => {
      // Authenticate user
      const session = await auth();
      if (!session?.user?.email) {
        throw new AuthenticationError('Authentication required');
      }

      return withRepositories(request, async repos => {
        // Parse request body
        let body: {
          priceId?: string;
          successUrl?: string;
          cancelUrl?: string;
          metadata?: Record<string, string>;
        };
        try {
          body = await request.json();
        } catch (error) {
          throw new ValidationError('Invalid JSON body', error);
        }

        const { priceId, successUrl, cancelUrl, metadata } = body;

        // Validate price ID
        if (!priceId) {
          throw new ValidationError('priceId is required');
        }

        // Verify this is a valid one-time product
        const product = getProductByPriceId(priceId);
        if (!product) {
          // Allow any price ID if not in our config (for flexibility)
          // But log a warning
          console.warn(`Price ID ${priceId} not found in ONE_TIME_PRODUCTS config`);
        }

        const userId = Number(session.user!.id);
        const userEmail = session.user!.email;
        const userName = session.user!.name ?? undefined;

        // Get or create Stripe customer
        let customer = await repos.customers.findByUserId(userId);
        const stripe = getStripeClient();

        if (!customer) {
          try {
            // Create Stripe customer
            const stripeCustomer = await stripe.customers.create({
              email: userEmail!,
              name: userName ?? undefined,
              metadata: {
                userId: String(userId),
              },
            });

            // Save to database
            customer = await repos.customers.create({
              userId,
              stripeCustomerId: stripeCustomer.id,
              email: userEmail!,
              name: userName ?? undefined,
            });
          } catch (error) {
            throw createStripeErrorFromSDK(error);
          }
        }

        // Build URLs
        const baseUrl = request.headers.get('origin') || process.env.NEXTAUTH_URL || '';
        const finalSuccessUrl = successUrl || `${baseUrl}${CHECKOUT_URLS.successUrl}`;
        const finalCancelUrl = cancelUrl || `${baseUrl}${CHECKOUT_URLS.cancelUrl}`;

        // Create Checkout Session
        try {
          const checkoutSession = await stripe.checkout.sessions.create({
            customer: customer.stripeCustomerId,
            mode: 'payment',
            payment_method_types: ['card'],
            line_items: [
              {
                price: priceId,
                quantity: 1,
              },
            ],
            success_url: finalSuccessUrl,
            cancel_url: finalCancelUrl,
            metadata: {
              userId: String(userId),
              customerId: String(customer.id),
              ...metadata,
            },
            allow_promotion_codes: true,
          });

          // Track analytics
          await analytics.trackBusinessEvent(AnalyticsEventType.CHECKOUT_STARTED, {
            userId,
            checkoutSessionId: checkoutSession.id,
            priceId,
            mode: 'payment',
          });

          return successResponse(
            {
              sessionId: checkoutSession.id,
              url: checkoutSession.url,
            },
            'Checkout session created successfully'
          );
        } catch (error) {
          throw createStripeErrorFromSDK(error);
        }
      });
    },
    { maxRequests: 10, windowSeconds: 60 }
  );
}
