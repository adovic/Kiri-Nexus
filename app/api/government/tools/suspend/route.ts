import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { adminDb } from '@/lib/firebase/admin';
import { resolveTenantFromSession } from '@/lib/government/tenant-resolver';
import {
  logAdminAccess,
  verifyLogIntegrity,
} from '@/lib/government/audit-logger';

// =============================================================================
// EMERGENCY AI SUSPEND — Glass Break Kill-Switch
// =============================================================================
//
// Five-phase suspension protocol:
//
//   Phase 1 — Authentication & Validation
//     Session-based Zero Trust via resolveTenantFromSession. Tenant ID is NEVER
//     accepted from the client as an identity claim; it is only used for
//     secondary validation if the session resolves a different tenant.
//
//   Phase 2 — Chain State Capture
//     Snapshot the Merkle chain head hash, entry count, and integrity status
//     BEFORE any mutation. This proves the exact cryptographic state of the
//     audit trail at the moment suspension was triggered.
//
//   Phase 3 — Atomic Dual-Collection Firestore Batch
//     govTenants/{tenant_id}  → status='suspended', system_status='SUSPENDED',
//                                operational_mode='OFFLINE'
//     tenants/{owner_uid}     → same payload (dashboard sync)
//     Both writes are wrapped in a Firestore batch — atomic guarantee.
//
//   Phase 4 — In-Progress Call Termination
//     Query `government_calls` for any records with status 'in-progress'.
//     Update each to status='terminated_by_admin'. This signals the dashboard
//     real-time listener. Active Vapi WebRTC calls cannot be killed from the
//     server (Vapi manages them client-side), but the next tool call from any
//     active session will hit the suspended-tenant gate and receive a 403.
//
//   Phase 5 — Audit Trail + Event Hash
//     Write an [AUDIT_SHIELD] entry to the tenant's chain-of-custody log,
//     then compute a SHA-256 `timestamped_event_hash` over the full suspend
//     event payload. This hash is deterministic and independently verifiable
//     — proof that a human triggered the kill-switch at a specific moment.
//
// Recovery: Manual reactivation required. There is no auto-resume.
// =============================================================================

const GOV_TENANTS_COLLECTION = 'govTenants';
const TENANTS_COLLECTION = 'tenants';
const CALLS_COLLECTION = 'government_calls';
const CONFIRMATION_PHRASE = 'SUSPEND ALL AI OPERATIONS';

// ── Types ────────────────────────────────────────────────────────────────────

interface SuspendRequestBody {
  /** Optional explicit tenant_id — validated against session, NOT trusted as identity */
  tenant_id?: string;
  /** Reason for the emergency suspension */
  reason?: string;
  /** Confirmation phrase (required for programmatic callers) */
  confirmation?: string;
}

interface ChainSnapshot {
  valid: boolean;
  chain_head_hash: string;
  total_entries: number;
}

interface SuspendEventPayload {
  event_type: 'EMERGENCY_SUSPEND';
  tenant_id: string;
  suspended_by: string;
  suspended_at: string;
  reason: string;
  suspend_id: string;
  chain_state_at_suspend: ChainSnapshot;
  calls_terminated: number;
}

// ── Hash Computation ─────────────────────────────────────────────────────────

/**
 * Compute a deterministic SHA-256 hash over the full suspend event.
 *
 * Uses the same algorithm as the audit chain: sort all keys alphabetically,
 * serialize to JSON, then SHA-256. The resulting hash is independently
 * verifiable by any party with the event payload.
 */
function computeTimestampedEventHash(payload: SuspendEventPayload): string {
  const sorted = JSON.stringify(payload, Object.keys(payload).sort());
  return crypto.createHash('sha256').update(sorted, 'utf-8').digest('hex');
}

// =============================================================================
// POST — Trigger Emergency Suspension
// =============================================================================

export async function POST(req: Request) {
  // ════════════════════════════════════════════════
  // PHASE 1: Authentication & Validation
  // ════════════════════════════════════════════════
  const tenant = await resolveTenantFromSession(req);

  if (!tenant) {
    return NextResponse.json(
      {
        error: 'Unauthorized',
        detail: 'No active tenant could be resolved from your session.',
      },
      { status: 401 },
    );
  }

  // ── Already suspended guard (idempotency) ──
  if (tenant.status === 'suspended') {
    return NextResponse.json(
      {
        error: 'Conflict',
        detail: `Tenant ${tenant.tenant_id} is already suspended.`,
      },
      { status: 409 },
    );
  }

  // ── Parse request body ──
  let body: SuspendRequestBody;
  try {
    body = await req.json();
  } catch {
    // Allow empty body — dashboard uses browser confirm() as the gate
    body = {};
  }

  // If a confirmation phrase was provided, it MUST match exactly.
  // If no body / empty body, allow through (dashboard path uses browser confirm()).
  if (body.confirmation !== undefined && body.confirmation !== CONFIRMATION_PHRASE) {
    return NextResponse.json(
      {
        error: 'Confirmation Required',
        detail: `Request body must include { "confirmation": "${CONFIRMATION_PHRASE}" } or be empty (dashboard path).`,
      },
      { status: 400 },
    );
  }

  // If a tenant_id was provided in the body, validate it matches session
  if (body.tenant_id && body.tenant_id !== tenant.tenant_id) {
    return NextResponse.json(
      {
        error: 'Forbidden',
        detail:
          'Body tenant_id does not match session tenant. Cross-tenant suspension is prohibited.',
      },
      { status: 403 },
    );
  }

  const suspendedAt = new Date().toISOString();
  const suspendedBy = tenant.authorized_emails?.[0] || 'unknown';
  const reason = body.reason || 'EMERGENCY_GLASS_BREAK';
  const suspendId = `SUSPEND-${Date.now().toString(16).toUpperCase()}-${crypto
    .randomBytes(4)
    .toString('hex')
    .toUpperCase()}`;

  // ════════════════════════════════════════════════
  // PHASE 2: Chain State Capture (Pre-Mutation)
  // ════════════════════════════════════════════════
  let chainSnapshot: ChainSnapshot;
  try {
    const integrity = verifyLogIntegrity(tenant.tenant_id);
    chainSnapshot = {
      valid: integrity.valid,
      chain_head_hash: integrity.chain_head_hash,
      total_entries: integrity.total_entries,
    };
  } catch {
    chainSnapshot = {
      valid: false,
      chain_head_hash: 'UNREADABLE',
      total_entries: 0,
    };
  }

  try {
    // ════════════════════════════════════════════════
    // PHASE 3: Atomic Dual-Collection Firestore Batch
    // ════════════════════════════════════════════════
    const batch = adminDb.batch();

    const suspensionPayload = {
      status: 'suspended',
      system_status: 'SUSPENDED',
      operational_mode: 'OFFLINE',
      suspended_at: suspendedAt,
      suspended_by: suspendedBy,
      suspension_reason: reason,
      suspend_id: suspendId,
      chain_state_at_suspend: chainSnapshot,
    };

    // Write 1: govTenants — gates Vapi webhook tool execution
    const govRef = adminDb
      .collection(GOV_TENANTS_COLLECTION)
      .doc(tenant.tenant_id);
    batch.update(govRef, suspensionPayload);

    // Write 2: tenants/{owner_uid} — gates dashboard display
    if (tenant.owner_uid) {
      const tenantRef = adminDb
        .collection(TENANTS_COLLECTION)
        .doc(tenant.owner_uid);
      batch.update(tenantRef, suspensionPayload);
    }

    await batch.commit();

    const collectionsUpdated = [
      `${GOV_TENANTS_COLLECTION}/${tenant.tenant_id}`,
      tenant.owner_uid
        ? `${TENANTS_COLLECTION}/${tenant.owner_uid}`
        : null,
    ].filter(Boolean) as string[];

    console.log(
      `[EMERGENCY SUSPEND] ${suspendId} | tenant:${tenant.tenant_id} (${tenant.agency_name}) ` +
        `| by:${suspendedBy} | reason:"${reason}" ` +
        `| chain_head:${chainSnapshot.chain_head_hash.slice(0, 16)}… ` +
        `| ${collectionsUpdated.join(', ')}`,
    );

    // ════════════════════════════════════════════════
    // PHASE 4: In-Progress Call Termination
    // ════════════════════════════════════════════════
    // Query Firestore for any calls marked 'in-progress' and terminate them.
    // Active Vapi WebRTC connections cannot be killed from the server — Vapi
    // manages them client-side. However:
    //   (a) Updating the call status in Firestore triggers the dashboard's
    //       real-time onSnapshot listener, signaling the UI to act.
    //   (b) The next tool call from any active session will hit the
    //       suspended-tenant gate in /api/government/tools and receive 403.
    //   (c) Without tool access, the AI agent degrades to audio-only mode
    //       and Vapi will end the call when no tool response arrives.
    let callsTerminated = 0;
    const terminatedCallIds: string[] = [];

    try {
      const inProgressSnap = await adminDb
        .collection(CALLS_COLLECTION)
        .where('status', '==', 'in-progress')
        .get();

      if (!inProgressSnap.empty) {
        const terminationBatch = adminDb.batch();

        for (const doc of inProgressSnap.docs) {
          terminationBatch.update(doc.ref, {
            status: 'terminated_by_admin',
            terminated_at: suspendedAt,
            terminated_by: suspendedBy,
            termination_reason: `Emergency suspend: ${reason}`,
            suspend_id: suspendId,
          });
          terminatedCallIds.push(doc.id);
        }

        await terminationBatch.commit();
        callsTerminated = terminatedCallIds.length;

        console.log(
          `[EMERGENCY SUSPEND] Terminated ${callsTerminated} in-progress call(s): [${terminatedCallIds.join(', ')}]`,
        );
      }
    } catch (callErr) {
      // Non-fatal: suspension succeeds even if call termination fails
      console.error(
        `[EMERGENCY SUSPEND] Call termination query/update failed (non-blocking):`,
        callErr instanceof Error ? callErr.message : String(callErr),
      );
    }

    // ════════════════════════════════════════════════
    // PHASE 5: Audit Trail + Timestamped Event Hash
    // ════════════════════════════════════════════════

    // ── 5a: Write [AUDIT_SHIELD] entry to chain-of-custody log ──
    let auditResult: ReturnType<typeof logAdminAccess> | null = null;
    try {
      auditResult = logAdminAccess(suspendedBy, tenant.tenant_id, {
        action: 'export', // closest action type — admin action modifying state
        purpose:
          `EMERGENCY_GLASS_BREAK — AI operations suspended. ` +
          `Reason: "${reason}". Suspend ID: ${suspendId}. ` +
          `Calls terminated: ${callsTerminated}.`,
        admin_name: suspendedBy,
      });
    } catch (auditErr) {
      console.error(
        `[EMERGENCY SUSPEND] Audit log write failed (non-blocking) — suspend:${suspendId}:`,
        auditErr instanceof Error ? auditErr.message : String(auditErr),
      );
    }

    // ── 5b: Compute deterministic event hash ──
    const eventPayload: SuspendEventPayload = {
      event_type: 'EMERGENCY_SUSPEND',
      tenant_id: tenant.tenant_id,
      suspended_by: suspendedBy,
      suspended_at: suspendedAt,
      reason,
      suspend_id: suspendId,
      chain_state_at_suspend: chainSnapshot,
      calls_terminated: callsTerminated,
    };

    const timestampedEventHash = computeTimestampedEventHash(eventPayload);

    // ── Response ──
    return NextResponse.json({
      status: 'suspended',
      suspend_id: suspendId,
      tenant_id: tenant.tenant_id,
      agency_name: tenant.agency_name,
      suspended_at: suspendedAt,
      suspended_by: suspendedBy,
      reason,
      system_status: 'SUSPENDED',
      operational_mode: 'OFFLINE',
      chain_state_at_suspend: chainSnapshot,
      calls_terminated: callsTerminated,
      terminated_call_ids: terminatedCallIds,
      collections_updated: collectionsUpdated,
      timestamped_event_hash: timestampedEventHash,
      audit_entry: auditResult
        ? {
            receipt_id: auditResult.shield.admin_access_receipt_id,
            entry_hash: auditResult.shield.entry_hash,
          }
        : null,
      message:
        'All AI operations have been immediately suspended across all service gates. ' +
        `${callsTerminated} in-progress call(s) terminated. ` +
        'The Vapi webhook will reject all tool calls (HTTP 403). ' +
        'Dashboard reflects OFFLINE status. Manual reactivation required.',
    });
  } catch (err) {
    console.error(
      `[EMERGENCY SUSPEND] Batch commit failed for tenant:${tenant.tenant_id}:`,
      err,
    );
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        detail:
          'Failed to apply suspension across Firestore collections. ' +
          (err instanceof Error ? err.message : String(err)),
      },
      { status: 500 },
    );
  }
}

// =============================================================================
// GET — Query Current Suspension Status
// =============================================================================

export async function GET(req: Request) {
  const tenant = await resolveTenantFromSession(req);

  if (!tenant) {
    return NextResponse.json(
      {
        error: 'Unauthorized',
        detail: 'No active tenant could be resolved from your session.',
      },
      { status: 401 },
    );
  }

  try {
    const doc = await adminDb
      .collection(GOV_TENANTS_COLLECTION)
      .doc(tenant.tenant_id)
      .get();
    const data = doc.data() ?? {};

    return NextResponse.json({
      tenant_id: tenant.tenant_id,
      status: data.status ?? 'unknown',
      system_status: data.system_status ?? null,
      operational_mode: data.operational_mode ?? null,
      suspended: data.status === 'suspended',
      suspended_at: data.suspended_at ?? null,
      suspended_by: data.suspended_by ?? null,
      suspension_reason: data.suspension_reason ?? null,
      suspend_id: data.suspend_id ?? null,
      chain_state_at_suspend: data.chain_state_at_suspend ?? null,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
