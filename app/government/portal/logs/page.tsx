import { cookies } from 'next/headers';
import { adminDb } from '@/lib/firebase/admin';
import CallLogsClient, { CallRecord } from './CallLogsClient';

// Force dynamic rendering - always fetch fresh data
export const dynamic = 'force-dynamic';

// ===========================================
// SERVER COMPONENT — CALL LOGS PAGE
// ===========================================
// SECURITY: Resolves tenant from the session cookie
// and filters government_calls by tenant_id.
// Admin SDK bypasses Firestore rules, so the filter
// MUST be applied here — it is the only barrier.
// ===========================================

export default async function CallLogsPage() {
  let calls: CallRecord[] = [];
  let agencyName = 'Unknown Agency';

  try {
    // ── Tenant resolution from session cookie ────────────────────
    const cookieStore = await cookies();
    const authCookie = cookieStore.get('gov-auth-token')?.value;

    if (!authCookie) {
      return <CallLogsClient calls={[]} agencyName={agencyName} />;
    }

    const email = decodeURIComponent(authCookie).toLowerCase();
    const tenantSnap = await adminDb
      .collection('govTenants')
      .where('authorized_emails', 'array-contains', email)
      .where('status', 'in', ['active', 'provisioning'])
      .limit(1)
      .get();

    if (tenantSnap.empty) {
      return <CallLogsClient calls={[]} agencyName={agencyName} />;
    }

    const tenantDoc = tenantSnap.docs[0];
    const tenantId = tenantDoc.id;
    const tenantData = tenantDoc.data();
    agencyName = tenantData.agency_name || tenantData.name || 'Unknown Agency';

    // ── Fetch ONLY this tenant's call records ────────────────────
    // Wrapped in its own try/catch to gracefully handle missing
    // composite indexes (FAILED_PRECONDITION) during first deploy.
    try {
      const snapshot = await adminDb
        .collection('government_calls')
        .where('tenant_id', '==', tenantId)
        .orderBy('timestamp', 'desc')
        .get();

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

    } catch (queryError: unknown) {
      // ── Handle missing composite index (FAILED_PRECONDITION) ──
      const errMsg = queryError instanceof Error ? queryError.message : String(queryError);
      const isMissingIndex =
        errMsg.includes('FAILED_PRECONDITION') ||
        errMsg.includes('requires an index') ||
        errMsg.includes('indexes?create_composite');

      if (isMissingIndex) {
        console.warn('[Call Logs] Composite index not yet built:', errMsg);
        return (
          <div style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '16px',
            background: '#0C1220',
            color: '#94A3B8',
            fontFamily: 'system-ui, sans-serif',
          }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderWidth: '3px',
              borderStyle: 'solid',
              borderColor: 'rgba(30, 64, 175, 0.2)',
              borderTopColor: '#3B82F6',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#F8FAFC', margin: 0 }}>
              Optimizing Database...
            </h2>
            <p style={{ fontSize: '14px', maxWidth: '420px', textAlign: 'center', lineHeight: 1.6 }}>
              Firestore is building the required composite index for this query.
              This is a one-time operation that typically completes within a few minutes.
              Please refresh this page shortly.
            </p>
          </div>
        );
      }

      // Re-throw non-index errors to be caught by the outer handler
      throw queryError;
    }
  } catch (error) {
    console.error('[Call Logs] Error fetching records:', error);
    // Return empty array on error - the client will show "No records"
  }

  return <CallLogsClient calls={calls} agencyName={agencyName} />;
}
