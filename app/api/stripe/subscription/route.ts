import { NextRequest } from 'next/server';
import { successResponse, withRepositories } from '@/lib/api';
import { AuthenticationError } from '@/lib/errors';
import { auth } from '@/lib/auth/config';
import { getPlanByPriceId, isSubscriptionActive, PlanConfig } from '@/lib/stripe';
import type { SubscriptionStatus } from '@/lib/stripe/types';

export const runtime = 'edge';

/**
 * GET /api/stripe/subscription - Get current subscription status
 */
export async function GET(request: NextRequest) {
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
      return successResponse(
        {
          hasSubscription: false,
          subscription: null,
          plan: null,
        } as {
          hasSubscription: boolean;
          subscription: null;
          plan: null;
        },
        'No subscription found'
      );
    }

    // Get active subscription
    const subscription = await repos.subscriptions.findActiveByCustomerId(customer.id);

    if (!subscription) {
      // Check for any subscription (even canceled)
      const allSubscriptions = await repos.subscriptions.findByCustomerId(customer.id);
      const latestSubscription = allSubscriptions[0];

      return successResponse(
        {
          hasSubscription: false,
          subscription: latestSubscription
            ? {
                id: latestSubscription.id,
                stripeSubscriptionId: latestSubscription.stripeSubscriptionId,
                stripePriceId: latestSubscription.stripePriceId,
                status: latestSubscription.status,
                endedAt: latestSubscription.endedAt,
                canceledAt: latestSubscription.canceledAt,
              }
            : null,
          plan: latestSubscription ? getPlanByPriceId(latestSubscription.stripePriceId) : null,
        } as {
          hasSubscription: boolean;
          subscription: {
            id: number;
            stripeSubscriptionId: string;
            stripePriceId: string;
            status: SubscriptionStatus;
            endedAt: number | null;
            canceledAt: number | null;
          } | null;
          plan: PlanConfig | null;
        },
        'No active subscription'
      );
    }

    // Get plan details
    const plan = getPlanByPriceId(subscription.stripePriceId);

    return successResponse(
      {
        hasSubscription: true,
        subscription: {
          id: subscription.id,
          stripeSubscriptionId: subscription.stripeSubscriptionId,
          stripePriceId: subscription.stripePriceId,
          status: subscription.status,
          isActive: isSubscriptionActive(subscription.status),
          currentPeriodStart: subscription.currentPeriodStart,
          currentPeriodEnd: subscription.currentPeriodEnd,
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
          canceledAt: subscription.canceledAt,
          endedAt: subscription.endedAt,
          trialStart: subscription.trialStart,
          trialEnd: subscription.trialEnd,
          isTrialing: subscription.status === 'trialing',
        },
        plan: plan
          ? {
              id: plan.id,
              name: plan.name,
              description: plan.description,
              features: plan.features,
              isFree: plan.isFree,
              order: plan.order,
            }
          : null,
      },
      'Subscription retrieved successfully'
    );
  });
}
