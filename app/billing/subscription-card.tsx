'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface SubscriptionInfo {
  hasSubscription: boolean;
  subscription: {
    id: number;
    stripeSubscriptionId: string;
    stripePriceId: string;
    status: string;
    isActive: boolean;
    currentPeriodStart: number | null;
    currentPeriodEnd: number | null;
    cancelAtPeriodEnd: boolean;
    canceledAt: number | null;
    trialEnd: number | null;
    isTrialing: boolean;
  } | null;
  plan: {
    id: string;
    name: string;
    description: string;
    features: string[];
  } | null;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
  };
}

export function SubscriptionCard() {
  const [data, setData] = useState<SubscriptionInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCanceling, setIsCanceling] = useState(false);
  const [isResuming, setIsResuming] = useState(false);

  useEffect(() => {
    fetchSubscription();
  }, []);

  const fetchSubscription = async () => {
    try {
      const response = await fetch('/api/stripe/subscription');
      const result: ApiResponse<SubscriptionInfo> = await response.json();

      if (!response.ok) {
        throw new Error(result.error?.message || 'Failed to fetch subscription');
      }

      setData(result.data || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load subscription');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = async () => {
    if (
      !confirm(
        'Are you sure you want to cancel your subscription? You can reactivate it before the end of the billing period.'
      )
    ) {
      return;
    }

    setIsCanceling(true);
    try {
      const response = await fetch('/api/stripe/subscription/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ immediately: false }),
      });

      const result: ApiResponse<unknown> = await response.json();

      if (!response.ok) {
        throw new Error(result.error?.message || 'Failed to cancel subscription');
      }

      // Refresh subscription data
      await fetchSubscription();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to cancel subscription');
    } finally {
      setIsCanceling(false);
    }
  };

  const handleResume = async () => {
    setIsResuming(true);
    try {
      const response = await fetch('/api/stripe/subscription/resume', {
        method: 'POST',
      });

      const result: ApiResponse<unknown> = await response.json();

      if (!response.ok) {
        throw new Error(result.error?.message || 'Failed to resume subscription');
      }

      // Refresh subscription data
      await fetchSubscription();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to resume subscription');
    } finally {
      setIsResuming(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Subscription</CardTitle>
          <CardDescription>Loading...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Subscription</CardTitle>
          <CardDescription className="text-red-500">{error}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!data?.hasSubscription) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Subscription</CardTitle>
          <CardDescription>You don&apos;t have an active subscription</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <a href="/pricing">View Plans</a>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { subscription, plan } = data;
  const periodEnd = subscription?.currentPeriodEnd
    ? new Date(subscription.currentPeriodEnd * 1000).toLocaleDateString()
    : 'N/A';
  const trialEnd = subscription?.trialEnd
    ? new Date(subscription.trialEnd * 1000).toLocaleDateString()
    : null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{plan?.name || 'Subscription'}</CardTitle>
            <CardDescription>{plan?.description}</CardDescription>
          </div>
          <StatusBadge status={subscription?.status || 'unknown'} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Subscription Details */}
        <div className="grid gap-2">
          {subscription?.isTrialing && trialEnd && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Trial ends</span>
              <span>{trialEnd}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              {subscription?.cancelAtPeriodEnd ? 'Access until' : 'Next billing date'}
            </span>
            <span>{periodEnd}</span>
          </div>
        </div>

        {/* Features */}
        {plan?.features && (
          <div>
            <h4 className="text-sm font-medium mb-2">Included Features:</h4>
            <ul className="space-y-1">
              {plan.features.slice(0, 4).map((feature, index) => (
                <li key={index} className="text-sm text-muted-foreground flex items-center gap-2">
                  <svg
                    className="w-4 h-4 text-green-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  {feature}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-4">
          {subscription?.cancelAtPeriodEnd ? (
            <Button onClick={handleResume} disabled={isResuming}>
              {isResuming ? 'Resuming...' : 'Resume Subscription'}
            </Button>
          ) : subscription?.isActive ? (
            <Button variant="destructive" onClick={handleCancel} disabled={isCanceling}>
              {isCanceling ? 'Canceling...' : 'Cancel Subscription'}
            </Button>
          ) : null}
        </div>

        {subscription?.cancelAtPeriodEnd && (
          <p className="text-sm text-yellow-600">
            Your subscription will be canceled on {periodEnd}. Resume to continue your subscription.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    active: 'default',
    trialing: 'secondary',
    past_due: 'destructive',
    canceled: 'outline',
    incomplete: 'outline',
    unpaid: 'destructive',
  };

  const labels: Record<string, string> = {
    active: 'Active',
    trialing: 'Trial',
    past_due: 'Past Due',
    canceled: 'Canceled',
    incomplete: 'Incomplete',
    unpaid: 'Unpaid',
  };

  return <Badge variant={variants[status] || 'outline'}>{labels[status] || status}</Badge>;
}
