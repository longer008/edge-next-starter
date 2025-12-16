import { NextRequest, NextResponse } from 'next/server';
import { successResponse, withRepositories, type ApiSuccessResponse } from '@/lib/api';
import { AuthenticationError } from '@/lib/errors';
import { auth } from '@/lib/auth/config';

export const runtime = 'edge';

type CustomerEmptyResponse = {
  hasCustomer: false;
  customer: null;
  subscription: null;
  payments: never[];
  invoices: never[];
};

type CustomerDataResponse = {
  hasCustomer: true;
  customer: {
    id: number;
    stripeCustomerId: string;
    email: string | null;
    name: string | null;
    createdAt: number;
  };
  subscription: {
    id: number;
    stripeSubscriptionId: string;
    stripePriceId: string;
    status: string;
    currentPeriodStart: number | null;
    currentPeriodEnd: number | null;
    cancelAtPeriodEnd: boolean;
    trialEnd: number | null;
  } | null;
  payments: Array<{
    id: number;
    amount: number;
    currency: string;
    status: string;
    description: string | null;
    createdAt: number;
  }>;
  invoices: Array<{
    id: number;
    stripeInvoiceId: string;
    amountDue: number;
    amountPaid: number;
    currency: string;
    status: string;
    invoiceUrl: string | null;
    invoicePdf: string | null;
    createdAt: number;
  }>;
};

type CustomerResponse = CustomerEmptyResponse | CustomerDataResponse;

/**
 * GET /api/stripe/customer - Get customer info and subscription status
 */
export async function GET(
  request: NextRequest
): Promise<NextResponse<ApiSuccessResponse<CustomerResponse>>> {
  // Authenticate user
  const session = await auth();
  if (!session?.user?.email) {
    throw new AuthenticationError('Authentication required');
  }

  return withRepositories(
    request,
    async (repos): Promise<NextResponse<ApiSuccessResponse<CustomerResponse>>> => {
      const userId = Number(session.user!.id);

      // Get customer
      const customer = await repos.customers.findByUserId(userId);

      if (!customer) {
        return successResponse<CustomerEmptyResponse>(
          {
            hasCustomer: false,
            customer: null,
            subscription: null,
            payments: [],
            invoices: [],
          },
          'No customer record found'
        );
      }

      // Get active subscription
      const subscription = await repos.subscriptions.findActiveByCustomerId(customer.id);

      // Get recent payments
      const payments = await repos.payments.findByCustomerId(customer.id, { limit: 10 });

      // Get recent invoices
      const invoices = await repos.invoices.findByCustomerId(customer.id, { limit: 10 });

      return successResponse<CustomerDataResponse>(
        {
          hasCustomer: true,
          customer: {
            id: customer.id,
            stripeCustomerId: customer.stripeCustomerId,
            email: customer.email,
            name: customer.name,
            createdAt: customer.createdAt,
          },
          subscription: subscription
            ? {
                id: subscription.id,
                stripeSubscriptionId: subscription.stripeSubscriptionId,
                stripePriceId: subscription.stripePriceId,
                status: subscription.status,
                currentPeriodStart: subscription.currentPeriodStart,
                currentPeriodEnd: subscription.currentPeriodEnd,
                cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
                trialEnd: subscription.trialEnd,
              }
            : null,
          payments: payments.map(p => ({
            id: p.id,
            amount: p.amount,
            currency: p.currency,
            status: p.status,
            description: p.description,
            createdAt: p.createdAt,
          })),
          invoices: invoices.map(i => ({
            id: i.id,
            stripeInvoiceId: i.stripeInvoiceId,
            amountDue: i.amountDue,
            amountPaid: i.amountPaid,
            currency: i.currency,
            status: i.status,
            invoiceUrl: i.invoiceUrl,
            invoicePdf: i.invoicePdf,
            createdAt: i.createdAt,
          })),
        },
        'Customer info retrieved successfully'
      );
    }
  );
}
