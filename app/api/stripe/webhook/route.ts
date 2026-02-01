import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { adminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firestore/schema';

export const runtime = 'nodejs';

// =============================================================================
// STRIPE WEBHOOK HANDLER
// =============================================================================
// Handles subscription lifecycle events and syncs to Firestore.
// Supports both commercial users (users collection) and government tenants.
// =============================================================================

async function readRawBody(req: Request): Promise<Buffer> {
  const arrayBuffer = await req.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// Find user ID from Stripe customer ID
async function findUidFromCustomer(customerId: string | null): Promise<string | null> {
  if (!customerId) return null;

  // Check users collection for stripeCustomerId
  const usersQuery = await adminDb
    .collection(COLLECTIONS.users)
    .where('stripeCustomerId', '==', customerId)
    .limit(1)
    .get();

  if (!usersQuery.empty) {
    return usersQuery.docs[0].id;
  }

  // Check stripeCustomers collection (legacy)
  const stripeDoc = await adminDb.collection(COLLECTIONS.stripeCustomers).doc(customerId).get();
  const tenantId = stripeDoc.data()?.tenantId as string | undefined;

  return tenantId ?? null;
}

export async function POST(req: Request) {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    return NextResponse.json({ error: 'Missing STRIPE_SECRET_KEY' }, { status: 500 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: 'Missing STRIPE_WEBHOOK_SECRET' }, { status: 500 });
  }

  const stripe = new Stripe(secret);
  const sig = req.headers.get('stripe-signature');

  if (!sig) {
    return NextResponse.json({ error: 'Missing stripe-signature' }, { status: 400 });
  }

  const rawBody = await readRawBody(req);

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err: any) {
    console.error('[Webhook] Signature verification failed:', err.message);
    return NextResponse.json({ error: `Webhook signature failed: ${err.message}` }, { status: 400 });
  }

  // Idempotency check
  const evRef = adminDb.collection(COLLECTIONS.stripeEvents).doc(event.id);
  const evSnap = await evRef.get();
  if (evSnap.exists) {
    return NextResponse.json({ ok: true, deduped: true });
  }

  await evRef.set({
    eventId: event.id,
    type: event.type,
    receivedAt: Date.now(),
  });

  console.log(`[Webhook] Processing ${event.type}`);

  try {
    switch (event.type) {
      // ─────────────────────────────────────────────────────────────────────
      // CHECKOUT COMPLETED
      // ─────────────────────────────────────────────────────────────────────
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const metadata = session.metadata || {};

        // Commercial user checkout
        if (metadata.uid) {
          const uid = metadata.uid;
          const subscriptionId = typeof session.subscription === 'string' ? session.subscription : null;
          const customerId = typeof session.customer === 'string' ? session.customer : null;

          // Fetch subscription details
          let currentPeriodEnd: number | null = null;
          let status = 'active';

          if (subscriptionId) {
            const subscription = await stripe.subscriptions.retrieve(subscriptionId);
            currentPeriodEnd = subscription.current_period_end * 1000;
            status = subscription.status;
          }

          await adminDb.collection(COLLECTIONS.users).doc(uid).set(
            {
              stripeCustomerId: customerId,
              stripeSubscriptionId: subscriptionId,
              subscriptionStatus: status,
              planId: metadata.planId || null,
              stackId: metadata.stackId || null,
              billingInterval: metadata.billingInterval || 'monthly',
              usageLimitMinutes: parseInt(metadata.usageLimitMinutes || '0', 10),
              overageRate: parseFloat(metadata.overageRate || '0.20'),
              currentPeriodEnd,
              currentPeriodStart: Date.now(),
              updatedAt: Date.now(),
            },
            { merge: true }
          );

          console.log(`[Webhook] User ${uid} subscription created: ${subscriptionId}`);
        }
        // Government tenant checkout (legacy)
        else if (metadata.tenantId) {
          const tenantId = metadata.tenantId;
          const subId = typeof session.subscription === 'string' ? session.subscription : null;
          const customerId = typeof session.customer === 'string' ? session.customer : null;

          await adminDb
            .collection(COLLECTIONS.tenants)
            .doc(tenantId)
            .collection('billing')
            .doc('current')
            .set(
              {
                customerId,
                subscriptionId: subId,
                status: 'active',
                stripeCustomerId: customerId ?? null,
                stripeSubscriptionId: subId ?? null,
                updatedAt: Date.now(),
              },
              { merge: true }
            );
        }
        break;
      }

      // ─────────────────────────────────────────────────────────────────────
      // SUBSCRIPTION UPDATED
      // ─────────────────────────────────────────────────────────────────────
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = typeof subscription.customer === 'string' ? subscription.customer : null;
        const metadata = subscription.metadata || {};

        // Try to find user by metadata.uid or customer lookup
        let uid: string | undefined = metadata.uid;
        if (!uid && customerId) {
          uid = await findUidFromCustomer(customerId) || undefined;
        }

        if (uid) {
          const priceId = subscription.items?.data?.[0]?.price?.id ?? null;

          await adminDb.collection(COLLECTIONS.users).doc(uid).set(
            {
              subscriptionStatus: subscription.status,
              stripeSubscriptionId: subscription.id,
              currentPeriodEnd: subscription.current_period_end * 1000,
              currentPeriodStart: subscription.current_period_start * 1000,
              cancelAtPeriodEnd: subscription.cancel_at_period_end,
              updatedAt: Date.now(),
            },
            { merge: true }
          );

          console.log(`[Webhook] User ${uid} subscription updated: ${subscription.status}`);
        }
        // Legacy tenant handling
        else if (metadata.tenantId) {
          const tenantId = metadata.tenantId;
          const priceId = subscription.items?.data?.[0]?.price?.id ?? null;

          await adminDb
            .collection(COLLECTIONS.tenants)
            .doc(tenantId)
            .collection('billing')
            .doc('current')
            .set(
              {
                stripeSubscriptionId: subscription.id,
                status: subscription.status,
                priceId,
                currentPeriodEnd: subscription.current_period_end * 1000,
                updatedAt: Date.now(),
              },
              { merge: true }
            );
        }
        break;
      }

      // ─────────────────────────────────────────────────────────────────────
      // SUBSCRIPTION DELETED (Canceled)
      // ─────────────────────────────────────────────────────────────────────
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = typeof subscription.customer === 'string' ? subscription.customer : null;
        const metadata = subscription.metadata || {};

        let uid: string | undefined = metadata.uid;
        if (!uid && customerId) {
          uid = await findUidFromCustomer(customerId) || undefined;
        }

        if (uid) {
          await adminDb.collection(COLLECTIONS.users).doc(uid).set(
            {
              subscriptionStatus: 'canceled',
              canceledAt: Date.now(),
              updatedAt: Date.now(),
            },
            { merge: true }
          );

          console.log(`[Webhook] User ${uid} subscription canceled`);
        }
        // Legacy tenant handling
        else if (metadata.tenantId) {
          await adminDb
            .collection(COLLECTIONS.tenants)
            .doc(metadata.tenantId)
            .collection('billing')
            .doc('current')
            .set(
              {
                status: 'canceled',
                canceledAt: Date.now(),
                updatedAt: Date.now(),
              },
              { merge: true }
            );
        }
        break;
      }

      // ─────────────────────────────────────────────────────────────────────
      // INVOICE PAYMENT FAILED
      // ─────────────────────────────────────────────────────────────────────
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === 'string' ? invoice.customer : null;
        const subscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : null;

        // Try to find user
        const uid = customerId ? await findUidFromCustomer(customerId) : null;

        if (uid) {
          await adminDb.collection(COLLECTIONS.users).doc(uid).set(
            {
              subscriptionStatus: 'past_due',
              lastPaymentFailedAt: Date.now(),
              lastPaymentError: invoice.last_finalization_error?.message ?? 'Payment failed',
              updatedAt: Date.now(),
            },
            { merge: true }
          );

          console.log(`[Webhook] User ${uid} payment failed`);

          // TODO: Send email notification about failed payment
        }
        break;
      }

      // ─────────────────────────────────────────────────────────────────────
      // INVOICE PAID (Subscription renewed)
      // ─────────────────────────────────────────────────────────────────────
      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === 'string' ? invoice.customer : null;

        const uid = customerId ? await findUidFromCustomer(customerId) : null;

        if (uid) {
          // Reset usage for new billing period
          await adminDb.collection(COLLECTIONS.users).doc(uid).set(
            {
              subscriptionStatus: 'active',
              lastPaymentAt: Date.now(),
              usedMinutes: 0, // Reset usage for new period
              updatedAt: Date.now(),
            },
            { merge: true }
          );

          console.log(`[Webhook] User ${uid} payment successful, usage reset`);
        }
        break;
      }

      default:
        console.log(`[Webhook] Unhandled event type: ${event.type}`);
    }
  } catch (err) {
    console.error(`[Webhook] Error processing ${event.type}:`, err);
    // Don't return error - we've already stored the event for idempotency
  }

  return NextResponse.json({ ok: true });
}
