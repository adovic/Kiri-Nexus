import { redirect } from 'next/navigation';
import { getSessionUser, getUserSubscription } from '@/lib/auth/session';
import { BILLING_ENABLED } from '@/lib/billing/config';
import BillingClient from './BillingClient';

// =============================================================================
// BILLING PAGE - Server Component
// =============================================================================

export default async function BillingPage() {
  const user = await getSessionUser();

  if (!user) {
    redirect('/login?redirect=/dashboard/billing');
  }

  const subscription = await getUserSubscription(user.uid);

  return (
    <BillingClient
      user={user}
      subscription={subscription}
      billingEnabled={BILLING_ENABLED}
    />
  );
}
