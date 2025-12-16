import { NextRequest } from 'next/server';
import { successResponse, withRepositories, withRateLimit } from '@/lib/api';
import { AuthenticationError, ValidationError } from '@/lib/errors';
import { auth } from '@/lib/auth/config';
import {
  getStripeClient,
  StripeCustomerNotFoundError,
  StripeNoActiveSubscriptionError,
  createStripeErrorFromSDK,
} from '@/lib/stripe';
import { analytics, AnalyticsEventType } from '@/lib/analytics';

export const runtime = 'edge';

/**
 * POST /api/stripe/subscription/cancel - Cancel subscription
 *
 * Request body:
 * - immediately?: boolean - Cancel immediately or at period end (default: false)
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
        let body: { immediately?: boolean } = {};
        try {
          const text = await request.text();
          if (text) {
            body = JSON.parse(text);
          }
        } catch (error) {
          throw new ValidationError('Invalid JSON body', error);
        }

        const { immediately = false } = body;
        const userId = Number(session.user!.id);

        // Get customer
        const customer = await repos.customers.findByUserId(userId);
        if (!customer) {
          throw new StripeCustomerNotFoundError(`user ${userId}`);
        }

        // Get active subscription
        const subscription = await repos.subscriptions.findActiveByCustomerId(customer.id);
        if (!subscription) {
          throw new StripeNoActiveSubscriptionError(customer.stripeCustomerId);
        }

        try {
          const stripe = getStripeClient();

          if (immediately) {
            // Cancel immediately
            await stripe.subscriptions.cancel(subscription.stripeSubscriptionId);

            // Update database
            await repos.subscriptions.updateByStripeSubscriptionId(
              subscription.stripeSubscriptionId,
              {
                status: 'canceled',
                canceledAt: Math.floor(Date.now() / 1000),
                endedAt: Math.floor(Date.now() / 1000),
              }
            );

            // Track analytics
            await analytics.trackBusinessEvent(AnalyticsEventType.SUBSCRIPTION_CANCELED, {
              userId,
              subscriptionId: subscription.stripeSubscriptionId,
              immediately: true,
            });

            return successResponse(
              {
                canceled: true,
                immediately: true,
                subscriptionId: subscription.stripeSubscriptionId,
              },
              'Subscription canceled immediately'
            );
          } else {
            // Cancel at period end
            await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
              cancel_at_period_end: true,
            });

            // Update database
            await repos.subscriptions.updateByStripeSubscriptionId(
              subscription.stripeSubscriptionId,
              {
                cancelAtPeriodEnd: true,
                canceledAt: Math.floor(Date.now() / 1000),
              }
            );

            // Track analytics
            await analytics.trackBusinessEvent(AnalyticsEventType.SUBSCRIPTION_CANCELED, {
              userId,
              subscriptionId: subscription.stripeSubscriptionId,
              immediately: false,
              cancelAt: subscription.currentPeriodEnd,
            });

            return successResponse(
              {
                canceled: true,
                immediately: false,
                cancelAt: subscription.currentPeriodEnd,
                subscriptionId: subscription.stripeSubscriptionId,
              },
              'Subscription will be canceled at the end of the billing period'
            );
          }
        } catch (error) {
          throw createStripeErrorFromSDK(error);
        }
      });
    },
    { maxRequests: 5, windowSeconds: 60 }
  );
}
