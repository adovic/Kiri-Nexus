import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import {
  verifyLogIntegrity,
  getAuditLog,
  getChainWitness,
  type ActionAuditReceipt,
} from '@/lib/government/audit-logger';
import {
  resolveTenantFromSession,
  type GovTenantConfig,
} from '@/lib/government/tenant-resolver';
import { adminDb } from '@/lib/firebase/admin';
import { guardPublicEndpoint } from '@/lib/api/guards';

// =============================================================================
// AUDIT LOG INTEGRITY VERIFICATION — Kiri Nexus Control Plane
// =============================================================================
// RATE LIMIT: 60 requests per 5 minutes per IP (defense-in-depth)
// =============================================================================
//
// Two operational modes controlled by `?mode=` query parameter:
//
//   ?mode=witness  → LIGHTWEIGHT WITNESS (TelemetryBar polling)
//     Spot-checks the chain tail (O(1) crypto), returns:
//       chain_head, witness_count, integrity_pulse, witness_hashes
//     Optimized for high-frequency polling (≤10s intervals).
//
//   (default)      → FULL CHAIN VERIFICATION
//     Re-computes the SHA-256 hash chain across every entry (O(n) crypto).
//     Returns the complete IntegrityResult + last 5 redacted entries.
//     Used by IntegrityCertificate and deep forensic checks.
//
// Authentication: Dual-path "Sovereign Guard"
//   Path 1 — Session cookie (browser dashboard via resolveTenantFromSession)
//   Path 2 — x-api-key header  (programmatic access via Firestore lookup)
//
// If neither path resolves a tenant, the request is rejected 401.
// =============================================================================

const GOV_TENANTS_COLLECTION = 'govTenants';
const RECENT_ENTRIES_LIMIT = 5;

// ── Sovereign Guard: API Key Resolution Path ─────────────────────────────────

/**
 * Resolve a tenant from the `x-api-key` header.
 *
 * Each tenant MAY have an `api_key` field provisioned in the `govTenants`
 * Firestore document. This is a per-tenant secret distinct from `vapi_secret`
 * (different security domain — programmatic dashboard access vs. webhook auth).
 *
 * The comparison happens inside Firestore's server-side query engine,
 * so it is not vulnerable to client-observable timing attacks.
 * We still validate the key format before querying to avoid unnecessary RPCs.
 */
async function resolveTenantFromApiKey(
  apiKey: string,
): Promise<GovTenantConfig | null> {
  // Reject obviously invalid keys before hitting Firestore
  if (!apiKey || apiKey.trim().length < 16) {
    return null;
  }

  try {
    const snapshot = await adminDb
      .collection(GOV_TENANTS_COLLECTION)
      .where('api_key', '==', apiKey.trim())
      .where('status', '==', 'active')
      .limit(1)
      .get();

    if (snapshot.empty) {
      console.warn(
        `[Sovereign Guard] No active tenant matched x-api-key (prefix: ${apiKey.slice(0, 8)}...)`,
      );
      return null;
    }

    const doc = snapshot.docs[0];
    const data = doc.data() as Omit<GovTenantConfig, 'tenant_id'>;

    // Constant-time comparison as a second-factor defense:
    // Even though Firestore matched, re-verify locally to guard against
    // hypothetical Firestore operator bugs or index over-matching.
    const storedKey = (doc.data().api_key as string) || '';
    if (storedKey.length !== apiKey.trim().length) {
      return null;
    }
    const keysMatch = crypto.timingSafeEqual(
      Buffer.from(apiKey.trim(), 'utf-8'),
      Buffer.from(storedKey, 'utf-8'),
    );
    if (!keysMatch) {
      console.warn('[Sovereign Guard] Constant-time re-verification failed — possible index anomaly');
      return null;
    }

    return { tenant_id: doc.id, ...data };
  } catch (err) {
    console.error('[Sovereign Guard] Firestore lookup failed (api_key path):', err);
    return null;
  }
}

// ── Redact Audit Entry for Wire Transport ────────────────────────────────────

/**
 * Strip sensitive fields (tool arguments, execution results) from an audit
 * entry before returning it over the wire. The dashboard only needs the
 * chain-of-custody metadata — never the call content.
 */
function redactEntry(entry: ActionAuditReceipt) {
  return {
    receipt_id: entry.action_receipt_id,
    timestamp: entry.timestamp,
    tool_name: entry.tool_name,
    status: entry.execution_status,
    entry_hash: entry.entry_hash,
    prev_hash: entry.prev_hash,
  };
}

// ── GET Handler ──────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // Rate limit: 60 requests per 5 minutes per IP
  const guardResponse = guardPublicEndpoint(req, {
    maxRequests: 60,
    windowMs: 5 * 60 * 1000,
    routeName: '/api/government/audit-integrity',
  });
  if (guardResponse) return guardResponse;

  // =====================================================
  // SOVEREIGN GUARD — Dual-Path Authentication
  // =====================================================
  // Priority 1: Session cookie (dashboard browser path)
  // Priority 2: x-api-key header (programmatic path)
  // =====================================================

  let tenant: GovTenantConfig | null = null;
  let authPath: 'session' | 'api_key' | null = null;

  // Path 1: Session
  tenant = await resolveTenantFromSession(req);
  if (tenant) {
    authPath = 'session';
  }

  // Path 2: API Key (only attempted if session failed)
  if (!tenant) {
    const apiKey = req.headers.get('x-api-key');
    if (apiKey) {
      tenant = await resolveTenantFromApiKey(apiKey);
      if (tenant) {
        authPath = 'api_key';
      }
    }
  }

  // ── Reject if neither path resolved ──
  if (!tenant) {
    return NextResponse.json(
      {
        error: 'Unauthorized',
        detail:
          'Sovereign Guard: No active tenant could be resolved. ' +
          'Provide a valid session cookie or x-api-key header.',
      },
      { status: 401 },
    );
  }

  // ── Check tenant is not suspended ──
  if (tenant.status === 'suspended') {
    return NextResponse.json(
      {
        error: 'Forbidden',
        detail:
          'Tenant is suspended. All audit operations are locked. ' +
          'Contact your administrator to reactivate.',
      },
      { status: 403 },
    );
  }

  // =====================================================
  // MODE DISPATCH — Witness vs Full Verification
  // =====================================================

  const url = new URL(req.url);
  const mode = url.searchParams.get('mode');

  if (mode === 'witness') {
    // ═══════════════════════════════════════════════════
    // LIGHTWEIGHT WITNESS PATH
    // ═══════════════════════════════════════════════════
    // O(1) crypto: reads only the last 3 entries from
    // the NDJSON chain, spot-checks the tail hash and
    // linkage. Returns ~200 bytes vs ~2KB for full mode.
    //
    // Used by: TelemetryBar (10s polling interval)
    // ═══════════════════════════════════════════════════

    const witness = getChainWitness(tenant.tenant_id, 3);

    return NextResponse.json({
      chain_head: witness.chain_head,
      witness_count: witness.witness_count,
      integrity_pulse: witness.integrity_pulse,
      witness_hashes: witness.witness_hashes,
      checked_at: witness.checked_at,
      tenant_id: witness.tenant_id,
      server_timestamp: Date.now(),
      _mode: 'witness',
      _auth_path: authPath,
    });
  }

  // ═══════════════════════════════════════════════════
  // FULL CHAIN VERIFICATION (default)
  // ═══════════════════════════════════════════════════
  // O(n) crypto: walks every entry and re-computes
  // every hash. Returns complete IntegrityResult +
  // last 5 redacted entries.
  //
  // Used by: IntegrityCertificate, SearchPanel,
  //          forensic diagnostics, FOIA verification
  // ═══════════════════════════════════════════════════

  const integrity = verifyLogIntegrity(tenant.tenant_id);

  // ── Fetch last N entries (from NDJSON audit chain) ──
  let recentEntries: ReturnType<typeof redactEntry>[] = [];
  try {
    const allEntries = getAuditLog(tenant.tenant_id);
    recentEntries = allEntries
      .slice(-RECENT_ENTRIES_LIMIT)
      .map(redactEntry);
  } catch (err) {
    // Non-fatal: integrity result is still valid even if entry
    // fetch fails (e.g., decryption key missing).
    console.error(
      `[Audit Integrity] Failed to read recent entries for tenant:${tenant.tenant_id}:`,
      err,
    );
  }

  // ── Response — Superset Shape (backward-compat) ──
  return NextResponse.json({
    // ── New spec fields ──────────────────────────────
    verified: integrity.valid,
    last_hash: integrity.chain_head_hash,
    chain_height: integrity.total_entries,
    timestamp: integrity.checked_at,

    // ── Recent chain entries (redacted) ──────────────
    recent_entries: recentEntries,

    // ── Original IntegrityResult spread (dashboard) ──
    valid: integrity.valid,
    tenant_id: integrity.tenant_id,
    total_entries: integrity.total_entries,
    verified_entries: integrity.verified_entries,
    first_broken_index: integrity.first_broken_index,
    first_broken_receipt_id: integrity.first_broken_receipt_id,
    break_detail: integrity.break_detail,
    chain_head_hash: integrity.chain_head_hash,
    checked_at: integrity.checked_at,

    // ── Tenant context ───────────────────────────────
    agency_name: tenant.agency_name,

    // ── Auth telemetry (non-sensitive) ───────────────
    _auth_path: authPath,
  });
}
