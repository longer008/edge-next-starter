/**
 * Billing Page
 * Manage subscription and view payment history
 */

import { auth } from '@/lib/auth/config';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { PortalButton } from './portal-button';
import { SubscriptionCard } from './subscription-card';

export default async function BillingPage() {
  const session = await auth();

  if (!session?.user) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-background py-12 px-4">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Billing & Subscription</h1>
            <p className="text-muted-foreground mt-2">
              Manage your subscription and billing information
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link href="/dashboard">← Back to Dashboard</Link>
          </Button>
        </div>

        {/* Subscription Status */}
        <SubscriptionCard />

        {/* Billing Portal */}
        <Card>
          <CardHeader>
            <CardTitle>Billing Portal</CardTitle>
            <CardDescription>
              Manage your payment methods, update billing information, and view invoices
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PortalButton />
          </CardContent>
        </Card>

        {/* Upgrade/Downgrade */}
        <Card>
          <CardHeader>
            <CardTitle>Change Plan</CardTitle>
            <CardDescription>Upgrade or downgrade your subscription</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" asChild>
              <Link href="/pricing">View Available Plans</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
