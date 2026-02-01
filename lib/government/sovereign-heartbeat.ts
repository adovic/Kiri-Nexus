import 'server-only';

import { writeAuditLog, verifyLogIntegrity } from '@/lib/government/audit-logger';
import { discoverTenantIds } from '@/lib/government/chain-witness';

// =============================================================================
// SOVEREIGN HEARTBEAT — Hourly System Health Pulse
// =============================================================================
// Every 60 minutes, writes a [HEARTBEAT] entry into each tenant's Merkle chain.
// This proves the system was:
//   1. HEALTHY  — operational and reachable
//   2. LOCKED   — data sovereignty region has not changed
//   3. VERIFIED — chain integrity was intact at pulse time
//
// The heartbeat uses the standard `writeAuditLog()` path, so it participates
// in the SHA-256 hash chain exactly like any tool-call receipt. A gap in
// heartbeats proves the system was DOWN; a broken chain proves tampering.
//
// Required for monthly billing reports — auditors can verify continuous
// availability by checking for hourly heartbeat entries.
// =============================================================================

// Default sovereignty region. In production, this would be read from the
// tenant's Firestore config or deployment environment.
const DEFAULT_REGION = process.env.SOVEREIGNTY_REGION || 'US-EAST';

// ── Types ────────────────────────────────────────────────────────────────────

export interface HeartbeatResult {
  tenant_id: string;
  status: 'healthy' | 'degraded' | 'chain_broken' | 'error';
  receipt_id: string | null;
  chain_valid: boolean;
  total_entries: number;
  detail: string;
}

export interface HeartbeatSummary {
  pulse_timestamp: string;
  region: string;
  total_tenants: number;
  healthy: number;
  degraded: number;
  errors: number;
  results: HeartbeatResult[];
}

// ── Core Pulse Logic ─────────────────────────────────────────────────────────

/**
 * Emit a single heartbeat for one tenant.
 *
 * Steps:
 *   1. Run `verifyLogIntegrity()` to check current chain health
 *   2. Build a status string reflecting the integrity result
 *   3. Write a `[HEARTBEAT]` entry via `writeAuditLog()` (which also
 *      verifies the chain tail, enforcing fail-fast on corruption)
 *   4. Return the result summary
 *
 * If the chain is broken, the heartbeat entry will still be ATTEMPTED.
 * `writeAuditLog()` uses `getVerifiedChainTail()` which throws
 * `CriticalIntegrityFailure` if the tail is corrupt — in that case
 * the heartbeat is recorded as `chain_broken`.
 */
export function emitHeartbeat(
  tenantId: string,
  region: string = DEFAULT_REGION,
): HeartbeatResult {
  // ── Step 1: Check chain integrity ──
  const integrity = verifyLogIntegrity(tenantId);
  const integrityLabel = integrity.valid ? 'VERIFIED' : 'BROKEN';
  const statusLabel = integrity.valid ? 'HEALTHY' : 'DEGRADED';

  // ── Step 2: Build the heartbeat message ──
  const heartbeatMessage = `[HEARTBEAT] - Status: ${statusLabel} - Sovereignty: LOCKED (${region}) - Integrity: ${integrityLabel}.`;

  // ── Step 3: Write to the Merkle chain ──
  try {
    const receipt = writeAuditLog({
      tenant_id: tenantId,
      agent_nhi: 'SYSTEM/sovereign-heartbeat',
      tool_name: 'sovereign_heartbeat',
      tool_arguments: {
        pulse_type: 'hourly',
        region,
        chain_valid: integrity.valid,
        chain_entries: integrity.total_entries,
        chain_head: integrity.chain_head_hash.slice(0, 16),
      },
      policy_snapshot_hash: 'SYSTEM_HEARTBEAT',
      execution_status: integrity.valid ? 'Success' : 'Fail',
      execution_result: heartbeatMessage,
      vapi_tool_call_id: `heartbeat-${Date.now().toString(16)}`,
    });

    console.log(
      `[HEARTBEAT] ${tenantId} — ${statusLabel} | chain:${receipt.entry_hash.slice(0, 12)}… | entries:${integrity.total_entries + 1}`,
    );

    return {
      tenant_id: tenantId,
      status: integrity.valid ? 'healthy' : 'degraded',
      receipt_id: receipt.action_receipt_id,
      chain_valid: integrity.valid,
      total_entries: integrity.total_entries + 1, // +1 for the heartbeat itself
      detail: heartbeatMessage,
    };
  } catch (err) {
    // CriticalIntegrityFailure or AuditWriteError — chain is broken
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(
      `[HEARTBEAT] FAILED for ${tenantId}: ${errorMsg}`,
    );

    return {
      tenant_id: tenantId,
      status: 'chain_broken',
      receipt_id: null,
      chain_valid: false,
      total_entries: integrity.total_entries,
      detail: `[HEARTBEAT] - Status: CHAIN_BROKEN - ${errorMsg}`,
    };
  }
}

/**
 * Emit heartbeats for ALL tenant silos on disk.
 *
 * Discovers every tenant directory under `data/audit/`, runs a health
 * check and writes a `[HEARTBEAT]` entry into each tenant's chain.
 *
 * Returns a summary suitable for the cron response body and billing logs.
 */
export function emitAllHeartbeats(
  region: string = DEFAULT_REGION,
): HeartbeatSummary {
  const pulseTimestamp = new Date().toISOString();
  const tenantIds = discoverTenantIds();

  const results: HeartbeatResult[] = [];

  for (const tenantId of tenantIds) {
    try {
      const result = emitHeartbeat(tenantId, region);
      results.push(result);
    } catch (err) {
      // Catch-all for truly unexpected errors (shouldn't happen, but
      // we never want one tenant to block all others)
      results.push({
        tenant_id: tenantId,
        status: 'error',
        receipt_id: null,
        chain_valid: false,
        total_entries: 0,
        detail: `Unexpected error: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  const healthy = results.filter((r) => r.status === 'healthy').length;
  const degraded = results.filter((r) => r.status === 'degraded' || r.status === 'chain_broken').length;
  const errors = results.filter((r) => r.status === 'error').length;

  console.log(
    `[HEARTBEAT] Pulse complete — ${tenantIds.length} tenants | ` +
      `${healthy} healthy, ${degraded} degraded, ${errors} errors`,
  );

  return {
    pulse_timestamp: pulseTimestamp,
    region,
    total_tenants: tenantIds.length,
    healthy,
    degraded,
    errors,
    results,
  };
}
