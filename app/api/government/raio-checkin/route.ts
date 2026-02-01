import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { resolveTenantFromSession } from '@/lib/government/tenant-resolver';
import {
  recordRaioCheckin,
  isRaioAuthorizationValid,
  verifyLedgerIntegrity,
} from '@/lib/government/governance-ledger';

// =============================================================================
// RAIO GOVERNANCE CHECK-IN — Identity-Bound Authorization Endpoint
// =============================================================================
// Implements the RAIO (Responsible AI Operations) Ledger API with:
//
//   - Session-based authentication (Zero Trust) via resolveTenantFromSession
//   - Backward-compatible query param fallback for existing consumers
//   - Firestore `governance` sub-collection sync (certification state)
//   - Certification status enum: ACTIVE | GRACE_PERIOD | EXPIRED
//   - Recertification flag for UI banner rendering
//
// POST — Record a new RAIO check-in (identity-bound):
//   Body: { raio_user_id: string, tenant_id?: string }
//   Auth: Session cookie (Zero Trust) — tenant_id in body is verified against session
//   Writes: Disk ledger (tamper-evident chain) + Firestore governance sub-collection
//   Returns: The signed ledger entry + authorization window + certification status
//
// GET — Query current authorization & certification status:
//   Auth: Session cookie (Zero Trust) OR ?tenant_id= query param (backward compat)
//   Reads: Disk ledger (authoritative) + Firestore governance sub-collection
//   Returns: Authorization status + certification_status + days_until_expiry
//
// Data Sources:
//   Disk:      data/audit/{tenant_id}/governance_ledger.json (tamper-evident)
//   Firestore: govTenants/{tenant_id}/governance/certification_state
// =============================================================================

const GOV_TENANTS_COLLECTION = 'govTenants';
const GOVERNANCE_SUB_COLLECTION = 'governance';
const CERTIFICATION_DOC_ID = 'certification_state';

/** Certification window: 30 days from last RAIO check-in */
const CERTIFICATION_WINDOW_DAYS = 30;

/** Grace period: final 7 days before expiry trigger warnings */
const GRACE_PERIOD_DAYS = 7;

// ── Certification Status ─────────────────────────────────────────────────────

type CertificationStatus = 'ACTIVE' | 'GRACE_PERIOD' | 'EXPIRED';

/**
 * Derive the certification status from days remaining in the authorization window.
 *
 *   ACTIVE       — > 7 days remaining (healthy)
 *   GRACE_PERIOD — 1–7 days remaining (warning band)
 *   EXPIRED      — 0 days remaining   (recertification required)
 */
function deriveCertificationStatus(daysRemaining: number, authorized: boolean): CertificationStatus {
  if (!authorized || daysRemaining <= 0) return 'EXPIRED';
  if (daysRemaining <= GRACE_PERIOD_DAYS) return 'GRACE_PERIOD';
  return 'ACTIVE';
}

// ── Firestore Governance Sub-Collection Sync ─────────────────────────────────

interface CertificationStateDoc {
  certification_status: CertificationStatus;
  days_until_expiry: number;
  recertification_required: boolean;
  last_audit_timestamp: string | null;
  last_certified_by: string | null;
  certification_window_days: number;
  grace_period_days: number;
  authorized: boolean;
  updated_at: string;
}

/**
 * Write the derived certification state to Firestore governance sub-collection.
 * Non-fatal: if Firestore write fails, the disk ledger remains authoritative.
 */
async function syncCertificationState(
  tenantId: string,
  state: CertificationStateDoc,
): Promise<void> {
  try {
    await adminDb
      .collection(GOV_TENANTS_COLLECTION)
      .doc(tenantId)
      .collection(GOVERNANCE_SUB_COLLECTION)
      .doc(CERTIFICATION_DOC_ID)
      .set(state, { merge: true });
  } catch (err) {
    console.error(
      `[RAIO] Firestore governance sync failed for tenant:${tenantId}:`,
      err instanceof Error ? err.message : String(err),
    );
  }
}

/**
 * Read the certification state from Firestore governance sub-collection.
 * Returns null if the document doesn't exist or the read fails.
 */
async function readCertificationState(
  tenantId: string,
): Promise<CertificationStateDoc | null> {
  try {
    const snap = await adminDb
      .collection(GOV_TENANTS_COLLECTION)
      .doc(tenantId)
      .collection(GOVERNANCE_SUB_COLLECTION)
      .doc(CERTIFICATION_DOC_ID)
      .get();

    if (!snap.exists) return null;
    return snap.data() as CertificationStateDoc;
  } catch (err) {
    console.error(
      `[RAIO] Firestore governance read failed for tenant:${tenantId}:`,
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}

// =============================================================================
// POST — Record RAIO Check-In
// =============================================================================

export async function POST(req: Request) {
  try {
    // ── Resolve tenant from session (Zero Trust primary path) ──
    const tenant = await resolveTenantFromSession(req);
    const body = await req.json();
    const { raio_user_id, tenant_id: bodyTenantId } = body;

    // Determine effective tenant ID: session takes precedence, body is fallback
    const effectiveTenantId = tenant?.tenant_id ?? bodyTenantId;

    if (!raio_user_id || !effectiveTenantId) {
      return NextResponse.json(
        {
          error: 'Bad Request',
          detail: 'Both raio_user_id and tenant_id are required. Authenticate via session or provide tenant_id in body.',
        },
        { status: 400 },
      );
    }

    // If session resolved but body tenant_id differs, reject (anti-spoofing)
    if (tenant && bodyTenantId && bodyTenantId !== tenant.tenant_id) {
      return NextResponse.json(
        {
          error: 'Forbidden',
          detail: 'Session tenant does not match body tenant_id. Cross-tenant operations are prohibited.',
        },
        { status: 403 },
      );
    }

    if (tenant?.status === 'suspended') {
      return NextResponse.json(
        {
          error: 'Forbidden',
          detail: 'Tenant is suspended. RAIO check-in is blocked.',
        },
        { status: 403 },
      );
    }

    // ── Extract session context for Digital Fingerprint ──
    const userAgent = req.headers.get('user-agent') || 'unknown';
    const clientIp =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      '127.0.0.1';

    // ── Record identity-bound check-in to disk ledger ──
    const entry = recordRaioCheckin({
      raio_user_id,
      tenant_id: effectiveTenantId,
      user_agent: userAgent,
      client_ip: clientIp,
    });

    // ── Verify ledger integrity after the write ──
    const ledgerIntegrity = verifyLedgerIntegrity(effectiveTenantId);

    // ── Compute certification status ──
    const daysRemaining = Math.max(
      0,
      Math.ceil(
        (new Date(entry.authorization_window.until).getTime() - Date.now()) /
          (1000 * 60 * 60 * 24),
      ),
    );
    const certificationStatus = deriveCertificationStatus(daysRemaining, true);

    // ── Sync to Firestore governance sub-collection ──
    const certState: CertificationStateDoc = {
      certification_status: certificationStatus,
      days_until_expiry: daysRemaining,
      recertification_required: false, // Just checked in — never expired after POST
      last_audit_timestamp: entry.timestamp,
      last_certified_by: raio_user_id,
      certification_window_days: CERTIFICATION_WINDOW_DAYS,
      grace_period_days: GRACE_PERIOD_DAYS,
      authorized: true,
      updated_at: new Date().toISOString(),
    };

    await syncCertificationState(effectiveTenantId, certState);

    // ── Return superset response ──
    return NextResponse.json({
      // ── Existing fields (backward compat) ──
      status: 'authorized',
      entry_id: entry.entry_id,
      raio_user_id: entry.raio_user_id,
      digital_fingerprint: entry.digital_fingerprint,
      merkle_root_hash: entry.merkle_root_hash,
      chain_entries_at_checkin: entry.chain_entries_at_checkin,
      chain_valid_at_checkin: entry.chain_valid_at_checkin,
      authorization_window: entry.authorization_window,
      entry_hash: entry.entry_hash,
      ledger_integrity: {
        valid: ledgerIntegrity.valid,
        total_entries: ledgerIntegrity.total_entries,
      },
      timestamp: entry.timestamp,

      // ── New certification fields ──
      certification_status: certificationStatus,
      days_until_expiry: daysRemaining,
      recertification_required: false,
      last_audit_timestamp: entry.timestamp,
      certification_window_days: CERTIFICATION_WINDOW_DAYS,
      grace_period_days: GRACE_PERIOD_DAYS,
    });
  } catch (err) {
    console.error('[RAIO Check-In] Error:', err);
    return NextResponse.json(
      {
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}

// =============================================================================
// GET — Query Authorization & Certification Status
// =============================================================================

export async function GET(req: Request) {
  // ── Dual-path authentication ──
  // Primary: Session-based (Zero Trust)
  // Fallback: Query param (backward compat for useSovereignStatus, etc.)
  const tenant = await resolveTenantFromSession(req);
  const url = new URL(req.url);
  const queryTenantId = url.searchParams.get('tenant_id');

  const effectiveTenantId = tenant?.tenant_id ?? queryTenantId;

  if (!effectiveTenantId) {
    return NextResponse.json(
      {
        error: 'Bad Request',
        detail: 'Tenant could not be resolved from session. Provide tenant_id query parameter as fallback.',
      },
      { status: 400 },
    );
  }

  try {
    // ── Read from disk ledger (authoritative source) ──
    const authStatus = isRaioAuthorizationValid(effectiveTenantId);
    const ledgerIntegrity = verifyLedgerIntegrity(effectiveTenantId);

    // ── Derive certification status ──
    const certificationStatus = deriveCertificationStatus(
      authStatus.days_remaining,
      authStatus.authorized,
    );
    const daysUntilExpiry = authStatus.days_remaining;
    const recertificationRequired = certificationStatus === 'EXPIRED';
    const lastAuditTimestamp = authStatus.latest_entry?.timestamp ?? null;

    // ── Read Firestore governance sub-collection (supplementary metadata) ──
    const firestoreState = await readCertificationState(effectiveTenantId);

    // ── Sync current state back to Firestore ──
    const certState: CertificationStateDoc = {
      certification_status: certificationStatus,
      days_until_expiry: daysUntilExpiry,
      recertification_required: recertificationRequired,
      last_audit_timestamp: lastAuditTimestamp,
      last_certified_by: authStatus.latest_entry?.raio_user_id ?? null,
      certification_window_days: CERTIFICATION_WINDOW_DAYS,
      grace_period_days: GRACE_PERIOD_DAYS,
      authorized: authStatus.authorized,
      updated_at: new Date().toISOString(),
    };

    // Fire-and-forget sync — don't block the response
    syncCertificationState(effectiveTenantId, certState).catch(() => {});

    // ── Return superset response ──
    return NextResponse.json({
      // ── Existing fields (backward compat) ──
      authorized: authStatus.authorized,
      expired: authStatus.expired,
      days_remaining: authStatus.days_remaining,
      days_since_checkin: authStatus.days_since_checkin,
      verdict: authStatus.verdict,
      latest_entry: authStatus.latest_entry
        ? {
            entry_id: authStatus.latest_entry.entry_id,
            raio_user_id: authStatus.latest_entry.raio_user_id,
            timestamp: authStatus.latest_entry.timestamp,
            merkle_root_hash: authStatus.latest_entry.merkle_root_hash,
            authorization_window: authStatus.latest_entry.authorization_window,
          }
        : null,
      ledger_integrity: {
        valid: ledgerIntegrity.valid,
        total_entries: ledgerIntegrity.total_entries,
      },

      // ── New certification fields ──
      certification_status: certificationStatus,
      days_until_expiry: daysUntilExpiry,
      recertification_required: recertificationRequired,
      last_audit_timestamp: lastAuditTimestamp,
      certification_window_days: CERTIFICATION_WINDOW_DAYS,
      grace_period_days: GRACE_PERIOD_DAYS,

      // ── Firestore governance metadata (if available) ──
      governance_synced: !!firestoreState,
      governance_last_sync: firestoreState?.updated_at ?? null,
    });
  } catch (err) {
    console.error('[RAIO Status] Error:', err);
    return NextResponse.json(
      {
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
