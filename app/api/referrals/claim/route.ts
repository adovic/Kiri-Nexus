import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firestore/schema';
import { nanoid } from 'nanoid';
import { getSessionUser } from '@/lib/auth/session';

export const runtime = 'nodejs';

// =============================================================================
// REFERRAL CLAIM API — PROTECTED (Requires Authentication)
// =============================================================================
// Records a referral claim after signup.
// The session user MUST match the claimed uid to prevent fraud.
// =============================================================================

export async function POST(req: Request) {
  // Require authentication
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const uid = body?.uid as string | undefined;
    const tenantId = body?.tenantId as string | undefined;
    const code = body?.code as string | undefined;

    if (!uid || !tenantId || !code) {
      return NextResponse.json(
        { error: 'Missing uid, tenantId, or code' },
        { status: 400 }
      );
    }

    // CRITICAL: Verify session user matches claimed uid
    if (sessionUser.uid !== uid) {
      console.warn(`[Referrals] UID mismatch: session=${sessionUser.uid}, claimed=${uid}`);
      return NextResponse.json(
        { error: 'Unauthorized: UID mismatch' },
        { status: 403 }
      );
    }

    // Find partner by code
    const partnerSnap = await adminDb
      .collection(COLLECTIONS.partners)
      .where('code', '==', code)
      .limit(1)
      .get();

    if (partnerSnap.empty) {
      return NextResponse.json(
        { error: 'Invalid referral code' },
        { status: 404 }
      );
    }

    const partnerId = partnerSnap.docs[0].id;
    const referralId = nanoid(12);

    await adminDb.collection(COLLECTIONS.referrals).doc(referralId).set({
      partnerId,
      referredTenantId: tenantId,
      referredUid: uid,
      createdAt: Date.now(),
      status: 'pending',
    });

    return NextResponse.json({ ok: true, partnerId, referralId });

  } catch (error) {
    console.error('[Referrals] Claim failed:', error instanceof Error ? error.message : 'Unknown');
    return NextResponse.json(
      { error: 'Failed to process referral' },
      { status: 500 }
    );
  }
}
