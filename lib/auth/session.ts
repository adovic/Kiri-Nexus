import 'server-only';
import { cookies } from 'next/headers';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firestore/schema';

// =============================================================================
// SERVER-SIDE SESSION UTILITIES
// =============================================================================
// These functions run in Server Components and API routes.
// They verify the session cookie and fetch user/subscription data.
// =============================================================================

const SESSION_COOKIE_NAME = '__session';

export type SessionUser = {
  uid: string;
  email: string | null;
  emailVerified: boolean;
};

export type UserSubscription = {
  status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'none';
  planId: string | null;
  stackId: string | null;
  currentPeriodEnd: number | null;
  stripeCustomerId: string | null;
  usageLimitMinutes: number;
  overageRate: number;
};

// =============================================================================
// Get Current Session User
// =============================================================================

export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;

    if (!sessionCookie) {
      return null;
    }

    // Verify the session cookie with checkRevoked = true for security
    const decodedClaims = await adminAuth.verifySessionCookie(sessionCookie, true);

    return {
      uid: decodedClaims.uid,
      email: decodedClaims.email ?? null,
      emailVerified: decodedClaims.email_verified ?? false,
    };
  } catch (error) {
    console.error('[Session] Verification failed:', error);
    return null;
  }
}

// =============================================================================
// Get User Subscription Status
// =============================================================================

export async function getUserSubscription(uid: string): Promise<UserSubscription> {
  const defaultSubscription: UserSubscription = {
    status: 'none',
    planId: null,
    stackId: null,
    currentPeriodEnd: null,
    stripeCustomerId: null,
    usageLimitMinutes: 0,
    overageRate: 0.20,
  };

  try {
    // Check the users collection for subscription data
    const userDoc = await adminDb.collection(COLLECTIONS.users).doc(uid).get();

    if (!userDoc.exists) {
      return defaultSubscription;
    }

    const userData = userDoc.data();
    if (!userData) {
      return defaultSubscription;
    }

    return {
      status: userData.subscriptionStatus ?? 'none',
      planId: userData.planId ?? null,
      stackId: userData.stackId ?? null,
      currentPeriodEnd: userData.currentPeriodEnd ?? null,
      stripeCustomerId: userData.stripeCustomerId ?? null,
      usageLimitMinutes: userData.usageLimitMinutes ?? 0,
      overageRate: userData.overageRate ?? 0.20,
    };
  } catch (error) {
    console.error('[Session] Failed to fetch subscription:', error);
    return defaultSubscription;
  }
}

// =============================================================================
// Check if User Has Active Subscription
// =============================================================================

export async function hasActiveSubscription(uid: string): Promise<boolean> {
  const subscription = await getUserSubscription(uid);
  return subscription.status === 'active' || subscription.status === 'trialing';
}

// =============================================================================
// Get Full Session (User + Subscription)
// =============================================================================

export type FullSession = {
  user: SessionUser;
  subscription: UserSubscription;
};

export async function getFullSession(): Promise<FullSession | null> {
  const user = await getSessionUser();

  if (!user) {
    return null;
  }

  const subscription = await getUserSubscription(user.uid);

  return { user, subscription };
}
