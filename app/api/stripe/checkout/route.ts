import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import Stripe from 'stripe';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firestore/schema';
import { getPriceId, getPlanDetails, isValidPlan, isValidStack, type PlanId, type StackId, type BillingInterval } from '@/lib/stripe/products';
import { isBillingEnabled, BILLING_DISABLED_MESSAGE } from '@/lib/billing/config';

// =============================================================================
// STRIPE CHECKOUT - Commercial & Government Billing
// =============================================================================
// Creates a Stripe Checkout Session for subscription purchases.
//
// For Commercial users (authenticated):
//   POST { planId, stackId, billingInterval? }
//   Requires valid session cookie
//
// For Government users (legacy support):
//   POST { tenantId, priceId, tier?, agency?, ... }
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

  const body = await req.json().catch(() => ({}));

  // ─────────────────────────────────────────────────────────────────────────
  // COMMERCIAL CHECKOUT (New authenticated flow)
  // ─────────────────────────────────────────────────────────────────────────
  if (body.planId && body.stackId) {
    const { planId, stackId, billingInterval = 'monthly' } = body as {
      planId: string;
      stackId: string;
      billingInterval?: BillingInterval;
    };

    // Validate plan and stack
    if (!isValidPlan(planId) || !isValidStack(stackId)) {
      return NextResponse.json({ error: 'Invalid plan or stack' }, { status: 400 });
    }

    // Verify user session
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;

    if (!sessionCookie) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    let uid: string;
    let email: string | undefined;

    try {
      const decodedClaims = await adminAuth.verifySessionCookie(sessionCookie, true);
      uid = decodedClaims.uid;
      email = decodedClaims.email;
    } catch {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    // Get or create Stripe customer
    let stripeCustomerId: string | null = null;

    const userDoc = await adminDb.collection(COLLECTIONS.users).doc(uid).get();
    const userData = userDoc.data();

    if (userData?.stripeCustomerId) {
      stripeCustomerId = userData.stripeCustomerId;
    } else if (email) {
      // Check if customer exists by email
      const existingCustomers = await stripe.customers.list({ email, limit: 1 });

      if (existingCustomers.data.length > 0) {
        stripeCustomerId = existingCustomers.data[0].id;
      } else {
        // Create new customer
        const customer = await stripe.customers.create({
          email,
          metadata: { uid },
        });
        stripeCustomerId = customer.id;
      }

      // Save customer ID to Firestore
      await adminDb.collection(COLLECTIONS.users).doc(uid).set(
        { stripeCustomerId },
        { merge: true }
      );
    }

    // Get price ID
    const priceId = getPriceId(planId as PlanId, stackId as StackId, billingInterval);

    if (!priceId) {
      return NextResponse.json({ error: 'Price not found' }, { status: 400 });
    }

    // Get plan details for metadata
    const planDetails = getPlanDetails(planId as PlanId, stackId as StackId);

    // Build metadata
    const metadata = {
      uid,
      planId,
      stackId,
      billingInterval,
      usageLimitMinutes: String(planDetails?.minutes || 0),
      overageRate: String(planDetails?.overageRate || 0.20),
    };

    try {
      const sessionParams: Stripe.Checkout.SessionCreateParams = {
        mode: 'subscription',
        customer: stripeCustomerId || undefined,
        customer_email: stripeCustomerId ? undefined : email,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${appUrl}/dashboard?checkout=success`,
        cancel_url: `${appUrl}/pricing/plans?stack=${stackId}&checkout=cancel`,
        metadata,
        subscription_data: { metadata },
        allow_promotion_codes: true,
      };

      const session = await stripe.checkout.sessions.create(sessionParams);

      return NextResponse.json({ url: session.url });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Stripe error';
      console.error('[Stripe Checkout] Commercial session failed:', message);

      // If price ID doesn't exist in Stripe (placeholders), return helpful error
      if (message.includes('No such price')) {
        return NextResponse.json(
          {
            error: 'Stripe prices not configured',
            details: 'Please configure Stripe prices in the dashboard and update lib/stripe/products.ts',
          },
          { status: 422 }
        );
      }

      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // GOVERNMENT CHECKOUT (Legacy flow)
  // ─────────────────────────────────────────────────────────────────────────
  const tenantId = body?.tenantId as string | undefined;
  const priceId = body?.priceId as string | undefined;
  const tier = body?.tier as string | undefined;
  const population = body?.population as number | undefined;
  const agency = body?.agency as string | undefined;
  const paymentStructure = body?.paymentStructure as string | undefined;

  if (!tenantId || !priceId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const isGovernment = tier || agency || population;
  const successUrl = isGovernment
    ? `${appUrl}/government/portal/dashboard?checkout=success`
    : `${appUrl}/dashboard?checkout=success`;
  const cancelUrl = isGovernment
    ? `${appUrl}/government/payment?checkout=cancel`
    : `${appUrl}/pricing?checkout=cancel`;

  const metadata: Record<string, string> = {
    tenantId,
    ...(tier && { tier }),
    ...(agency && { agency }),
    ...(paymentStructure && { paymentStructure }),
    ...(population && { population: String(population) }),
  };

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata,
      subscription_data: { metadata },
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Stripe error';
    console.warn(`[Stripe Checkout] Government session failed: ${message}`);
    return NextResponse.json(
      { error: 'Stripe checkout unavailable', details: message },
      { status: 422 }
    );
  }
}

// =============================================================================
// GET - Redirect handler for simple checkout links
// =============================================================================
// Usage: /api/stripe/checkout?plan=foundation&stack=velocity
// =============================================================================

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const planId = searchParams.get('plan');
  const stackId = searchParams.get('stack');
  const interval = (searchParams.get('interval') || 'monthly') as BillingInterval;

  if (!planId || !stackId) {
    return NextResponse.redirect(new URL('/pricing', req.url));
  }

  // For GET requests, redirect to login if not authenticated
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionCookie) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('redirect', `/api/stripe/checkout?plan=${planId}&stack=${stackId}&interval=${interval}`);
    return NextResponse.redirect(loginUrl);
  }

  // Create checkout session via POST
  const response = await POST(
    new Request(req.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `${SESSION_COOKIE_NAME}=${sessionCookie}` },
      body: JSON.stringify({ planId, stackId, billingInterval: interval }),
    })
  );

  const data = await response.json();

  if (data.url) {
    return NextResponse.redirect(data.url);
  }

  // On error, redirect to pricing with error
  const pricingUrl = new URL('/pricing/plans', req.url);
  pricingUrl.searchParams.set('error', data.error || 'checkout_failed');
  return NextResponse.redirect(pricingUrl);
}
