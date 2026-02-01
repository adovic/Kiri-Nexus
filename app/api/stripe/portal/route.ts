import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import Stripe from 'stripe';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firestore/schema';
import { isBillingEnabled, BILLING_DISABLED_MESSAGE } from '@/lib/billing/config';

// =============================================================================
// STRIPE CUSTOMER PORTAL
// =============================================================================
// Creates a Stripe Customer Portal session for managing billing.
// Requires authenticated user with stripeCustomerId in Firestore.
// =============================================================================

const SESSION_COOKIE_NAME = '__session';

export async function POST(req: Request) {
  // Check if billing is enabled
  if (!isBillingEnabled()) {
    return NextResponse.json(
      { error: BILLING_DISABLED_MESSAGE, billingEnabled: false },
      { status: 503 }
    );
  }

  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecret) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 });
  }

  const stripe = new Stripe(stripeSecret);
  const appUrl = process.env.APP_URL || 'http://localhost:3000';

  // Verify user session
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionCookie) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  let uid: string;

  try {
    const decodedClaims = await adminAuth.verifySessionCookie(sessionCookie, true);
    uid = decodedClaims.uid;
  } catch {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
  }

  // Get Stripe customer ID from Firestore
  const userDoc = await adminDb.collection(COLLECTIONS.users).doc(uid).get();
  const userData = userDoc.data();

  if (!userData?.stripeCustomerId) {
    return NextResponse.json(
      { error: 'No billing account found. Please subscribe first.' },
      { status: 400 }
    );
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: userData.stripeCustomerId,
      return_url: `${appUrl}/dashboard/billing`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Portal error';
    console.error('[Portal] Failed to create session:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// =============================================================================
// GET - Redirect to portal
// =============================================================================

export async function GET(req: Request) {
  const response = await POST(req);
  const data = await response.json();

  if (data.url) {
    return NextResponse.redirect(data.url);
  }

  // On error, redirect to billing page with error
  const billingUrl = new URL('/dashboard/billing', req.url);
  billingUrl.searchParams.set('error', data.error || 'portal_failed');
  return NextResponse.redirect(billingUrl);
}
