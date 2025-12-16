'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

interface PortalResponse {
  success: boolean;
  data?: {
    url: string;
  };
  error?: {
    message: string;
  };
}

export function PortalButton() {
  const [isLoading, setIsLoading] = useState(false);

  const handleOpenPortal = async () => {
    setIsLoading(true);

    try {
      const response = await fetch('/api/stripe/portal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data: PortalResponse = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || 'Failed to create portal session');
      }

      // Redirect to Stripe Customer Portal
      if (data.data?.url) {
        window.location.href = data.data.url;
      }
    } catch (error) {
      console.error('Portal error:', error);
      alert(error instanceof Error ? error.message : 'Failed to open billing portal');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button onClick={handleOpenPortal} disabled={isLoading}>
      {isLoading ? 'Loading...' : 'Open Billing Portal'}
    </Button>
  );
}
