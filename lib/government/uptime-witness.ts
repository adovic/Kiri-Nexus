import 'server-only';

import fs from 'fs';
import path from 'path';
import {
  verifyLogIntegrity,
  logPulse,
  logSystemRecovery,
  type PulseEntry,
  type SystemRecoveryEntry,
} from '@/lib/government/audit-logger';
import { discoverTenantIds } from '@/lib/government/chain-witness';

// =============================================================================
// UPTIME WITNESS — 10-Minute Pulse + Gap-Recovery System
// =============================================================================
// Every 10 minutes, writes a [PULSE] entry into every tenant's Merkle chain.
// On server reboot (or any detected gap), writes [SYSTEM_RECOVERY] entries
// BEFORE the first pulse — proving that no data was deleted during downtime.
//
// State file: data/pulse_state.json
//   Tracks the last pulse timestamp, process PID, and uptime sequence number.
//   If the state file is missing or stale, gap detection kicks in.
//
// Gap Detection Algorithm:
//   - Threshold: 12 minutes (10min interval + 2min buffer)
//   - Detects: PID change, time gap, both, or missing state file
//   - If gap detected: emit [SYSTEM_RECOVERY] for ALL tenants BEFORE any pulse
//
// Execution Order (crash-safe):
//   1. Read pulse state from disk
//   2. Detect gap (compare PID + timestamp)
//   3. If gap: emit [SYSTEM_RECOVERY] for every tenant first
//   4. Emit [PULSE] for every tenant
//   5. Write updated state file LAST (if process dies mid-run, next run re-detects)
// =============================================================================

// ── State File ───────────────────────────────────────────────────────────────

const DATA_ROOT = path.join(process.cwd(), 'data');
const STATE_FILE = path.join(DATA_ROOT, 'pulse_state.json');

/** Gap detection threshold: 12 minutes (10min interval + 2min buffer) */
const GAP_THRESHOLD_MS = 12 * 60 * 1000;

export interface PulseState {
  last_pulse_at: string;
  process_pid: number;
  uptime_sequence: number;
  version: 1;
}

export interface GapInfo {
  last_known_pulse_at: string;
  gap_duration_seconds: number;
  previous_pid: number;
  current_pid: number;
  recovery_reason: 'pid_change' | 'time_gap' | 'pid_change_and_time_gap' | 'state_file_missing';
}

// ── Pulse Result Types ───────────────────────────────────────────────────────

export interface TenantPulseResult {
  tenant_id: string;
  status: 'pulsed' | 'recovered_and_pulsed' | 'error';
  pulse_receipt_id: string | null;
  recovery_receipt_id: string | null;
  error?: string;
}

export interface PulseRunSummary {
  started_at: string;
  completed_at: string;
  gap_detected: boolean;
  gap_info: GapInfo | null;
  uptime_sequence: number;
  total_tenants: number;
  pulsed: number;
  recovered: number;
  errors: number;
  results: TenantPulseResult[];
}

// ── State File I/O ───────────────────────────────────────────────────────────

/**
 * Read the pulse state from disk.
 * Returns null if the state file doesn't exist or is corrupt.
 */
export function readPulseState(): PulseState | null {
  try {
    if (!fs.existsSync(STATE_FILE)) return null;
    const raw = fs.readFileSync(STATE_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as PulseState;
    if (!parsed.last_pulse_at || !parsed.process_pid || parsed.version !== 1) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Write the pulse state to disk.
 * Creates the data directory if it doesn't exist.
 */
export function writePulseState(state: PulseState): void {
  if (!fs.existsSync(DATA_ROOT)) {
    fs.mkdirSync(DATA_ROOT, { recursive: true });
  }
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n', 'utf-8');
}

// ── Gap Detection ────────────────────────────────────────────────────────────

/**
 * Detect whether a gap occurred since the last pulse.
 *
 * Returns GapInfo if a gap is detected, null otherwise.
 * Detection criteria:
 *   - State file missing → state_file_missing
 *   - PID changed AND time gap → pid_change_and_time_gap
 *   - PID changed only → pid_change
 *   - Time gap only → time_gap
 */
export function detectGap(currentState: PulseState | null): GapInfo | null {
  const currentPid = process.pid;
  const now = Date.now();

  // No state file at all — first run or state was lost
  if (!currentState) {
    return {
      last_known_pulse_at: 'unknown',
      gap_duration_seconds: 0,
      previous_pid: 0,
      current_pid: currentPid,
      recovery_reason: 'state_file_missing',
    };
  }

  const lastPulseTime = new Date(currentState.last_pulse_at).getTime();
  const elapsed = now - lastPulseTime;
  const pidChanged = currentState.process_pid !== currentPid;
  const timeGap = elapsed > GAP_THRESHOLD_MS;

  if (!pidChanged && !timeGap) {
    return null; // No gap detected
  }

  let reason: GapInfo['recovery_reason'];
  if (pidChanged && timeGap) {
    reason = 'pid_change_and_time_gap';
  } else if (pidChanged) {
    reason = 'pid_change';
  } else {
    reason = 'time_gap';
  }

  return {
    last_known_pulse_at: currentState.last_pulse_at,
    gap_duration_seconds: Math.round(elapsed / 1000),
    previous_pid: currentState.process_pid,
    current_pid: currentPid,
    recovery_reason: reason,
  };
}

// ── Pulse + Recovery Emission ────────────────────────────────────────────────

/**
 * Emit a [PULSE] entry for a single tenant.
 *
 * Runs verifyLogIntegrity() first to capture chain state, then logPulse().
 */
export function emitPulse(
  tenantId: string,
  sequence: number,
): PulseEntry {
  const integrity = verifyLogIntegrity(tenantId);

  return logPulse(tenantId, {
    chain_valid: integrity.valid,
    chain_entries: integrity.total_entries,
    chain_head_hash_snapshot: integrity.chain_head_hash,
    uptime_sequence: sequence,
    process_pid: process.pid,
  });
}

/**
 * Emit a [SYSTEM_RECOVERY] entry for a single tenant.
 *
 * Runs verifyLogIntegrity() first to capture chain state, then logSystemRecovery().
 */
export function emitRecoveryEntry(
  tenantId: string,
  gapInfo: GapInfo,
): SystemRecoveryEntry {
  const integrity = verifyLogIntegrity(tenantId);

  return logSystemRecovery(tenantId, {
    last_known_pulse_at: gapInfo.last_known_pulse_at,
    gap_duration_seconds: gapInfo.gap_duration_seconds,
    previous_pid: gapInfo.previous_pid,
    current_pid: gapInfo.current_pid,
    recovery_reason: gapInfo.recovery_reason,
    chain_valid: integrity.valid,
  });
}

// ── Orchestrator ─────────────────────────────────────────────────────────────

/**
 * Emit pulses (and recovery entries if needed) for ALL tenants on disk.
 *
 * Execution order (crash-safe):
 *   1. Read pulse state from disk
 *   2. Detect gap (compare PID + timestamp)
 *   3. If gap: emit [SYSTEM_RECOVERY] for every tenant FIRST
 *   4. Emit [PULSE] for every tenant
 *   5. Write updated state file LAST
 *      (if process dies mid-run, next run re-detects the gap)
 */
export function emitPulseForAllTenants(): PulseRunSummary {
  const startedAt = new Date().toISOString();
  const tenantIds = discoverTenantIds();

  // ── Step 1: Read state ──
  const previousState = readPulseState();

  // ── Step 2: Detect gap ──
  const gapInfo = detectGap(previousState);
  const gapDetected = gapInfo !== null;

  // Determine sequence number
  const sequence = previousState
    ? previousState.uptime_sequence + 1
    : 1;

  const results: TenantPulseResult[] = [];
  let recoveredCount = 0;

  // ── Step 3: If gap, emit [SYSTEM_RECOVERY] for all tenants FIRST ──
  if (gapDetected && gapInfo) {
    console.log(
      `[Uptime Witness] Gap detected — reason:${gapInfo.recovery_reason} | ` +
        `gap:${gapInfo.gap_duration_seconds}s | prev_pid:${gapInfo.previous_pid} → pid:${gapInfo.current_pid}`,
    );

    for (const tenantId of tenantIds) {
      try {
        emitRecoveryEntry(tenantId, gapInfo);
        recoveredCount++;
      } catch (err) {
        console.error(
          `[Uptime Witness] Recovery entry FAILED for ${tenantId}:`,
          err instanceof Error ? err.message : String(err),
        );
        // Continue to next tenant — don't let one failure block all
      }
    }
  }

  // ── Step 4: Emit [PULSE] for every tenant ──
  for (const tenantId of tenantIds) {
    try {
      const pulse = emitPulse(tenantId, sequence);
      const recoveryId = gapDetected ? 'emitted' : null;

      results.push({
        tenant_id: tenantId,
        status: gapDetected ? 'recovered_and_pulsed' : 'pulsed',
        pulse_receipt_id: pulse.pulse_receipt_id,
        recovery_receipt_id: recoveryId,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(
        `[Uptime Witness] Pulse FAILED for ${tenantId}: ${errorMsg}`,
      );

      results.push({
        tenant_id: tenantId,
        status: 'error',
        pulse_receipt_id: null,
        recovery_receipt_id: null,
        error: errorMsg,
      });
    }
  }

  // ── Step 5: Write updated state file LAST (crash-safe) ──
  const newState: PulseState = {
    last_pulse_at: new Date().toISOString(),
    process_pid: process.pid,
    uptime_sequence: sequence,
    version: 1,
  };
  writePulseState(newState);

  const pulsed = results.filter((r) => r.status !== 'error').length;
  const errors = results.filter((r) => r.status === 'error').length;

  console.log(
    `[Uptime Witness] Pulse run complete — seq:${sequence} | ` +
      `tenants:${tenantIds.length} | pulsed:${pulsed} | ` +
      `recovered:${recoveredCount} | errors:${errors} | ` +
      `gap:${gapDetected}`,
  );

  return {
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    gap_detected: gapDetected,
    gap_info: gapInfo,
    uptime_sequence: sequence,
    total_tenants: tenantIds.length,
    pulsed,
    recovered: recoveredCount,
    errors,
    results,
  };
}
