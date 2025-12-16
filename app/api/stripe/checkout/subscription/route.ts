import { NextRequest } from 'next/server';
import { successResponse, withRepositories, withRateLimit } from '@/lib/api';
import { ValidationError, AuthenticationError } from '@/lib/errors';
import { auth } from '@/lib/auth/config';
import {
  getStripeClient,
  CHECKOUT_URLS,
  getPlanByPriceId,
  createStripeErrorFromSDK,
} from '@/lib/stripe';
import { analytics, AnalyticsEventType } from '@/lib/analytics';

export const runtime = 'edge';

/**
 * POST /api/stripe/checkout/subscription - Create a subscription checkout session
 *
 * Request body:
 * - priceId: string - Stripe price ID for the subscription
 * - successUrl?: string - Custom success URL (optional)
 * - cancelUrl?: string - Custom cancel URL (optional)
 * - trialDays?: number - Override trial days (optional)
 * - metadata?: Record<string, string> - Additional metadata (optional)
 * - allowPromotionCodes?: boolean - Allow promotion codes (default: true)
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
          trialDays?: number;
          metadata?: Record<string, string>;
          allowPromotionCodes?: boolean;
        };
        try {
          body = await request.json();
        } catch (error) {
          throw new ValidationError('Invalid JSON body', error);
        }

        const {
          priceId,
          successUrl,
          cancelUrl,
          trialDays,
          metadata,
          allowPromotionCodes = true,
        } = body;

        // Validate price ID
        if (!priceId) {
          throw new ValidationError('priceId is required');
        }

        // Get plan config for trial days
        const plan = getPlanByPriceId(priceId);
        let finalTrialDays = trialDays;
        if (finalTrialDays === undefined && plan) {
          // Use plan's configured trial days
          const priceConfig = plan.monthly?.priceId === priceId ? plan.monthly : plan.yearly;
          finalTrialDays = priceConfig?.trialDays;
        }

        const userId = Number(session.user!.id);
        const userEmail = session.user!.email;
        const userName = session.user!.name ?? undefined;

        // Check if user already has an active subscription
        const existingCustomer = await repos.customers.findByUserId(userId);
        if (existingCustomer) {
          const activeSubscription = await repos.subscriptions.findActiveByCustomerId(
            existingCustomer.id
          );
          if (activeSubscription) {
            throw new ValidationError(
              'You already have an active subscription. Please manage it from the billing page.',
              { subscriptionId: activeSubscription.id }
            );
          }
        }

        // Get or create Stripe customer
        let customer = existingCustomer;
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

        // Build subscription data
        const subscriptionData: {
          trial_period_days?: number;
          metadata: Record<string, string>;
        } = {
          metadata: {
            userId: String(userId),
            customerId: String(customer.id),
            ...metadata,
          },
        };

        // Add trial if configured (and user hasn't had a subscription before)
        if (finalTrialDays && finalTrialDays > 0) {
          // Check if user ever had a subscription (prevent trial abuse)
          const previousSubscriptions = await repos.subscriptions.findByCustomerId(customer.id);
          if (previousSubscriptions.length === 0) {
            subscriptionData.trial_period_days = finalTrialDays;
          }
        }

        // Create Checkout Session
        try {
          const checkoutSession = await stripe.checkout.sessions.create({
            customer: customer.stripeCustomerId,
            mode: 'subscription',
            payment_method_types: ['card'],
            line_items: [
              {
                price: priceId,
                quantity: 1,
              },
            ],
            success_url: finalSuccessUrl,
            cancel_url: finalCancelUrl,
            subscription_data: subscriptionData,
            allow_promotion_codes: allowPromotionCodes,
            metadata: {
              userId: String(userId),
              customerId: String(customer.id),
              priceId,
              ...metadata,
            },
          });

          // Track analytics
          await analytics.trackBusinessEvent(AnalyticsEventType.CHECKOUT_STARTED, {
            userId,
            checkoutSessionId: checkoutSession.id,
            priceId,
            mode: 'subscription',
            planName: plan?.name,
          });

          return successResponse(
            {
              sessionId: checkoutSession.id,
              url: checkoutSession.url,
            },
            'Subscription checkout session created successfully'
          );
        } catch (error) {
          throw createStripeErrorFromSDK(error);
        }
      });
    },
    { maxRequests: 10, windowSeconds: 60 }
  );
}
