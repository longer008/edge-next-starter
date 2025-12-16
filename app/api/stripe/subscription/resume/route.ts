import { NextRequest } from 'next/server';
import { successResponse, withRepositories, withRateLimit } from '@/lib/api';
import { AuthenticationError, ValidationError } from '@/lib/errors';
import { auth } from '@/lib/auth/config';
import {
  getStripeClient,
  StripeCustomerNotFoundError,
  createStripeErrorFromSDK,
} from '@/lib/stripe';
import { analytics, AnalyticsEventType } from '@/lib/analytics';

export const runtime = 'edge';

/**
 * POST /api/stripe/subscription/resume - Resume a canceled subscription
 *
 * This only works for subscriptions that are set to cancel at period end
 * (i.e., cancel_at_period_end = true). Cannot resume already ended subscriptions.
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
        const userId = Number(session.user!.id);

        // Get customer
        const customer = await repos.customers.findByUserId(userId);
        if (!customer) {
          throw new StripeCustomerNotFoundError(`user ${userId}`);
        }

        // Get subscription that's set to cancel at period end
        const subscriptions = await repos.subscriptions.findByCustomerId(customer.id);
        const subscription = subscriptions.find(
          s => s.cancelAtPeriodEnd && (s.status === 'active' || s.status === 'trialing')
        );

        if (!subscription) {
          throw new ValidationError(
            'No subscription found that can be resumed. ' +
              'You can only resume subscriptions that are set to cancel at the end of the billing period.'
          );
        }

        try {
          const stripe = getStripeClient();

          // Resume subscription by removing cancel_at_period_end
          await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
            cancel_at_period_end: false,
          });

          // Update database
          await repos.subscriptions.updateByStripeSubscriptionId(
            subscription.stripeSubscriptionId,
            {
              cancelAtPeriodEnd: false,
              canceledAt: null,
            }
          );

          // Track analytics
          await analytics.trackBusinessEvent(AnalyticsEventType.SUBSCRIPTION_RESUMED, {
            userId,
            subscriptionId: subscription.stripeSubscriptionId,
          });

          return successResponse(
            {
              resumed: true,
              subscriptionId: subscription.stripeSubscriptionId,
              status: subscription.status,
              currentPeriodEnd: subscription.currentPeriodEnd,
            },
            'Subscription resumed successfully'
          );
        } catch (error) {
          throw createStripeErrorFromSDK(error);
        }
      });
    },
    { maxRequests: 5, windowSeconds: 60 }
  );
}
