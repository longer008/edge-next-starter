import { NextRequest } from 'next/server';
import { successResponse, withRepositories, withRateLimit } from '@/lib/api';
import { ValidationError, AuthenticationError } from '@/lib/errors';
import { auth } from '@/lib/auth/config';
import {
  getStripeClient,
  PORTAL_CONFIG,
  StripeCustomerNotFoundError,
  createStripeErrorFromSDK,
} from '@/lib/stripe';

export const runtime = 'edge';

/**
 * POST /api/stripe/portal - Create a customer portal session
 *
 * Request body:
 * - returnUrl?: string - Custom return URL (optional)
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
        let body: { returnUrl?: string } = {};
        try {
          const text = await request.text();
          if (text) {
            body = JSON.parse(text);
          }
        } catch (error) {
          throw new ValidationError('Invalid JSON body', error);
        }

        const { returnUrl } = body;
        const userId = Number(session.user!.id);

        // Get customer
        const customer = await repos.customers.findByUserId(userId);
        if (!customer) {
          throw new StripeCustomerNotFoundError(`user ${userId}`);
        }

        // Build return URL
        const baseUrl = request.headers.get('origin') || process.env.NEXTAUTH_URL || '';
        const finalReturnUrl = returnUrl || `${baseUrl}${PORTAL_CONFIG.returnUrl}`;

        // Create Portal Session
        try {
          const stripe = getStripeClient();
          const portalSession = await stripe.billingPortal.sessions.create({
            customer: customer.stripeCustomerId,
            return_url: finalReturnUrl,
          });

          return successResponse(
            {
              url: portalSession.url,
            },
            'Portal session created successfully'
          );
        } catch (error) {
          throw createStripeErrorFromSDK(error);
        }
      });
    },
    { maxRequests: 20, windowSeconds: 60 }
  );
}
