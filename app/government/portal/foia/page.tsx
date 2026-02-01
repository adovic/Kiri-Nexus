import { cookies } from 'next/headers';
import { adminDb } from '@/lib/firebase/admin';
import FoiaClient, { CallRecord } from './FoiaClient';

// Force dynamic rendering - always fetch fresh data
export const dynamic = 'force-dynamic';

// ===========================================
// SERVER COMPONENT — FOIA PUBLIC RECORDS PAGE
// ===========================================
// SECURITY: Resolves tenant from the session cookie
// and filters government_calls by tenant_id.
// Admin SDK bypasses Firestore rules, so the filter
// MUST be applied here — it is the only barrier.
// ===========================================

export default async function FoiaPage() {
  let calls: CallRecord[] = [];

  try {
    // ── Tenant resolution from session cookie ────────────────────
    const cookieStore = await cookies();
    const authCookie = cookieStore.get('gov-auth-token')?.value;

    if (!authCookie) {
      return <FoiaClient calls={[]} />;
    }

    const email = decodeURIComponent(authCookie).toLowerCase();
    const tenantSnap = await adminDb
      .collection('govTenants')
      .where('authorized_emails', 'array-contains', email)
      .where('status', 'in', ['active', 'provisioning'])
      .limit(1)
      .get();

    if (tenantSnap.empty) {
      return <FoiaClient calls={[]} />;
    }

    const tenantId = tenantSnap.docs[0].id;

    // ── Fetch ONLY this tenant's call records ────────────────────
    const snapshot = await adminDb
      .collection('government_calls')
      .where('tenant_id', '==', tenantId)
      .orderBy('timestamp', 'desc')
      .get();

    // Map Firestore documents to plain objects
    calls = snapshot.docs.map((doc) => {
      const data = doc.data();

      // Handle Firestore Timestamp if present
      let timestamp = data.timestamp;
      if (timestamp && typeof timestamp.toDate === 'function') {
        timestamp = timestamp.toDate().toISOString();
      } else if (!timestamp) {
        timestamp = new Date().toISOString();
      }

      return {
        id: doc.id,
        sessionId: data.sessionId || 'Unknown',
        transcript: data.transcript || [],
        duration: data.duration || 0,
        timestamp,
        status: data.status || 'completed',
        toolsUsed: data.toolsUsed || [],
        transcriptCount: data.transcriptCount || data.transcript?.length || 0,
      };
    });

  } catch (error) {
    console.error('[FOIA] Error fetching records:', error);
    // Return empty array on error - the client will show empty state
  }

  return <FoiaClient calls={calls} />;
}
