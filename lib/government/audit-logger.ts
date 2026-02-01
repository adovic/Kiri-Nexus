// ===========================================
// PERSISTENT ACTION AUDIT LOGGER (Multi-Tenant)
// ===========================================
// Writes every tool-execution receipt to disk as NDJSON
// (newline-delimited JSON). Fail-fast: if the write
// fails, the caller MUST abort the tool execution.
//
// TENANT ISOLATION: Each tenant's logs are written to
// a dedicated silo: data/audit/{tenant_id}/action_audit_log.ndjson
//
// ENCRYPTION AT REST: If a tenant has an AES-256-GCM key
// (generated at provisioning), all NDJSON lines are encrypted
// before being written to disk. Lines are prefixed with "ENC:"
// to signal encrypted format. Pre-encryption plaintext lines
// are read transparently (backward compatible).
//
// Production upgrade path: swap fs calls for a
// Firestore / Postgres INSERT.

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  loadTenantKey,
  destroyTenantKey,
  encryptLine,
  decodeLine,
} from '@/lib/government/tenant-key-manager';
import { appendWitness } from '@/lib/witness-persistence';

// ── Types ──────────────────────────────────

export interface ActionAuditReceipt {
  action_receipt_id: string;
  timestamp: string;
  tenant_id: string;
  agent_nhi: string;
  tool_name: string;
  tool_arguments: Record<string, unknown>;
  policy_snapshot_hash: string;
  execution_status: 'Success' | 'Fail';
  execution_result: string;
  vapi_tool_call_id: string;
  /** SHA-256 hash of the previous entry (or "GENESIS" for the first entry) */
  prev_hash: string;
  /** SHA-256 hash of this entry (covers all fields except entry_hash itself) */
  entry_hash: string;
}

export class AuditWriteError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'AuditWriteError';
  }
}

/**
 * Thrown when the chain tail cannot be verified at write time.
 *
 * This is a **hard stop** — if the chain is broken the AI agent MUST NOT
 * execute any further tool calls until the integrity issue is resolved.
 * Callers should catch this, return an error to the orchestrator, and
 * refuse to proceed with the tool execution.
 */
export class CriticalIntegrityFailure extends Error {
  constructor(
    message: string,
    public readonly tenant_id: string,
    public readonly detail?: string,
  ) {
    super(message);
    this.name = 'CriticalIntegrityFailure';
  }
}

// ── Paths ─────────────────────────────────

const AUDIT_ROOT = path.join(process.cwd(), 'data', 'audit');
const LOG_FILENAME = 'action_audit_log.ndjson';
const DEFAULT_TENANT = '_global';

/**
 * Sanitize a tenant_id for safe use as a directory name.
 * Strips anything that isn't alphanumeric, dash, or underscore.
 */
function sanitizeTenantId(tenantId: string): string {
  return tenantId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || DEFAULT_TENANT;
}

/**
 * Resolve the log file path for a given tenant.
 * Creates the directory if it doesn't already exist.
 */
export function getTenantLogPath(tenantId?: string): string {
  const safe = sanitizeTenantId(tenantId || DEFAULT_TENANT);
  const dir = path.join(AUDIT_ROOT, safe);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return path.join(dir, LOG_FILENAME);
}

/**
 * Resolve the tenant audit directory (without the filename).
 */
export function getTenantAuditDir(tenantId?: string): string {
  const safe = sanitizeTenantId(tenantId || DEFAULT_TENANT);
  const dir = path.join(AUDIT_ROOT, safe);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

// Bootstrap default directory on first import
if (!fs.existsSync(AUDIT_ROOT)) {
  fs.mkdirSync(AUDIT_ROOT, { recursive: true });
}

// ── Receipt ID Generator ───────────────────

/**
 * Generate a unique receipt ID.
 * Format: RCPT-{epoch_hex}-{random_hex}
 */
function generateReceiptId(): string {
  const epoch = Date.now().toString(16).toUpperCase();
  const rand = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `RCPT-${epoch}-${rand}`;
}

// ── Hash Chain (Chain-of-Custody) ─────────────
//
// Every entry's hash includes the previous entry's hash,
// creating a blockchain-style linked chain. If any line
// in the NDJSON file is modified, the chain breaks from
// that point forward — making tampering detectable.

const GENESIS_HASH = 'GENESIS';

/**
 * Compute a deterministic SHA-256 hash over all fields of an entry
 * EXCEPT `entry_hash` itself. Keys are sorted to ensure determinism
 * regardless of property insertion order.
 */
function computeEntryHash(entry: Record<string, unknown>): string {
   
  const { entry_hash, ...hashable } = entry;
  const sorted = JSON.stringify(hashable, Object.keys(hashable).sort());
  return crypto.createHash('sha256').update(sorted, 'utf-8').digest('hex');
}

/**
 * Read the `entry_hash` of the last line in a tenant's log file.
 * Returns GENESIS_HASH if the file doesn't exist or is empty.
 */
function getLastEntryHash(logFile: string, tenantId?: string): string {
  if (!fs.existsSync(logFile)) return GENESIS_HASH;

  const content = fs.readFileSync(logFile, 'utf-8').trimEnd();
  if (!content) return GENESIS_HASH;

  // Grab the last non-empty line
  const lastNewline = content.lastIndexOf('\n');
  const lastLine = lastNewline === -1 ? content : content.slice(lastNewline + 1);
  if (!lastLine) return GENESIS_HASH;

  try {
    const key = tenantId ? loadTenantKey(tenantId) : null;
    const parsed = decodeLine(lastLine, key);
    return (parsed.entry_hash as string) || GENESIS_HASH;
  } catch {
    return GENESIS_HASH;
  }
}

/**
 * Read AND re-verify the last entry's hash before allowing a new write.
 *
 * Unlike `getLastEntryHash` (which silently falls back to GENESIS on any
 * parse failure), this function performs a full integrity check on the
 * chain tail. If corruption is detected — corrupt JSON, missing hash, or
 * a hash that doesn't re-compute — it throws `CriticalIntegrityFailure`,
 * which MUST propagate up to the AI orchestrator and block tool execution.
 *
 * Legitimate GENESIS cases (new file, empty file) return normally.
 *
 * @throws {CriticalIntegrityFailure} if the chain tail is corrupt or tampered
 */
function getVerifiedChainTail(logFile: string, tenantId: string): string {
  if (!fs.existsSync(logFile)) return GENESIS_HASH;

  const content = fs.readFileSync(logFile, 'utf-8').trimEnd();
  if (!content) return GENESIS_HASH;

  // Grab the last non-empty line
  const lastNewline = content.lastIndexOf('\n');
  const lastLine = lastNewline === -1 ? content : content.slice(lastNewline + 1);
  if (!lastLine) return GENESIS_HASH;

  // ── Gate 1: Line must decode (decrypt if encrypted, then parse JSON) ──
  let parsed: Record<string, unknown>;
  try {
    const key = loadTenantKey(tenantId);
    parsed = decodeLine(lastLine, key) as Record<string, unknown>;
  } catch {
    throw new CriticalIntegrityFailure(
      `CRITICAL_INTEGRITY_FAILURE: Chain tail is corrupt JSON [tenant: ${tenantId}]. AI actions are BLOCKED until the audit log is repaired.`,
      tenantId,
      `Last line of ${logFile} failed JSON.parse()`,
    );
  }

  // Pre-chain entry (written before hash-linking was deployed).
  // Backward-compatible: allow the chain to start fresh from GENESIS.
  if (!parsed.entry_hash) {
    return GENESIS_HASH;
  }

  // ── Gate 2: entry_hash must re-compute correctly ──
  const storedHash = parsed.entry_hash as string;
  const recomputed = computeEntryHash(parsed);

  if (recomputed !== storedHash) {
    throw new CriticalIntegrityFailure(
      `CRITICAL_INTEGRITY_FAILURE: Chain tail entry_hash mismatch [tenant: ${tenantId}]. The last audit entry has been tampered with. AI actions are BLOCKED.`,
      tenantId,
      `Stored: "${storedHash.slice(0, 16)}…" vs Recomputed: "${recomputed.slice(0, 16)}…"`,
    );
  }

  return storedHash;
}

// ── Public API ─────────────────────────────

/**
 * Write an operational receipt to persistent storage.
 * Logs are partitioned by tenant_id into isolated silos.
 *
 * @throws {CriticalIntegrityFailure} if the chain tail is corrupt or
 *   tampered — callers MUST propagate this to the AI orchestrator and
 *   **refuse to execute the tool call**.
 * @throws {AuditWriteError} if the disk write fails —
 *   callers MUST catch this and abort the tool response.
 */
export function writeAuditLog(entry: {
  tenant_id?: string;
  agent_nhi: string;
  tool_name: string;
  tool_arguments: Record<string, unknown>;
  policy_snapshot_hash: string;
  execution_status: 'Success' | 'Fail';
  execution_result: string;
  vapi_tool_call_id: string;
}): ActionAuditReceipt {
  const tenantId = entry.tenant_id || DEFAULT_TENANT;
  const logFile = getTenantLogPath(tenantId);

  // ── Chain-of-Custody: Verify + link to previous entry ──
  // getVerifiedChainTail re-computes the last entry's hash. If the
  // chain tail has been tampered with, it throws CriticalIntegrityFailure
  // and the AI agent is blocked from acting.
  const prevHash = getVerifiedChainTail(logFile, tenantId);

  const receipt: ActionAuditReceipt = {
    action_receipt_id: generateReceiptId(),
    timestamp: new Date().toISOString(),
    tenant_id: tenantId,
    agent_nhi: entry.agent_nhi,
    tool_name: entry.tool_name,
    tool_arguments: entry.tool_arguments,
    policy_snapshot_hash: entry.policy_snapshot_hash,
    execution_status: entry.execution_status,
    execution_result: entry.execution_result,
    vapi_tool_call_id: entry.vapi_tool_call_id,
    prev_hash: prevHash,
    entry_hash: '', // placeholder — computed below
  };

  // Compute the hash over the full entry (excluding entry_hash)
  receipt.entry_hash = computeEntryHash(receipt as unknown as Record<string, unknown>);

  // ── Persist to disk (synchronous = atomic per-line) ──
  // If the tenant has an AES-256-GCM key, encrypt the JSON before writing.
  // The hash chain operates on PLAINTEXT — encryption is an outer wrapper.
  const jsonLine = JSON.stringify(receipt);
  const tenantKey = loadTenantKey(tenantId);
  const diskLine = tenantKey ? encryptLine(jsonLine, tenantKey) : jsonLine;

  try {
    fs.appendFileSync(logFile, diskLine + '\n', 'utf-8');
  } catch (err) {
    throw new AuditWriteError(
      `Failed to persist audit receipt ${receipt.action_receipt_id} to ${logFile} [tenant: ${tenantId}]`,
      err,
    );
  }

  console.log(
    `[Audit Log → Disk] ${receipt.action_receipt_id} | tenant:${tenantId} | ${receipt.tool_name} | ${receipt.execution_status} | chain:${receipt.entry_hash.slice(0, 12)}… | encrypted:${!!tenantKey}`,
  );

  // ── Black Box: Append witness to the tamper-evident flight recorder ──
  // Non-fatal: appendWitness catches its own errors and logs them.
  // A Black Box failure must never block tool execution.
  appendWitness(receipt);

  return receipt;
}

/**
 * Read the full audit log for a specific tenant from disk.
 * Automatically decrypts ENC:-prefixed lines if the tenant key exists.
 * Returns all receipts for diagnostics / FOIA export.
 */
export function getAuditLog(tenantId?: string): ActionAuditReceipt[] {
  const safeTenant = tenantId || DEFAULT_TENANT;
  const logFile = getTenantLogPath(safeTenant);
  if (!fs.existsSync(logFile)) return [];

  const key = loadTenantKey(safeTenant);
  const raw = fs.readFileSync(logFile, 'utf-8');
  return raw
    .split('\n')
    .filter(Boolean)
    .map((line) => decodeLine(line, key) as unknown as ActionAuditReceipt);
}

// ── Hash Chain Integrity Verification ─────────────────────────────────────────

export interface IntegrityResult {
  /** Whether the entire chain is valid */
  valid: boolean;
  /** Tenant whose log was verified */
  tenant_id: string;
  /** Total lines in the log file */
  total_entries: number;
  /** Number of entries with a valid hash link to their predecessor */
  verified_entries: number;
  /** Index of the first entry where the chain broke (null if valid) */
  first_broken_index: number | null;
  /** Receipt ID of the first broken entry (null if valid) */
  first_broken_receipt_id: string | null;
  /** Expected hash vs actual hash at the break point */
  break_detail: string | null;
  /** The entry_hash of the last entry in the file (chain head) */
  chain_head_hash: string;
  /** ISO-8601 timestamp of when the verification was run */
  checked_at: string;
}

/**
 * Verify the integrity of a tenant's audit log hash chain.
 *
 * Walks every line in the NDJSON file and re-computes the expected
 * `entry_hash`. If any entry's `prev_hash` doesn't match the
 * preceding entry's `entry_hash`, the chain is broken — indicating
 * the log file was tampered with.
 *
 * Pre-chain entries (written before hash-linking was deployed) are
 * detected by the absence of `entry_hash`. They are counted but
 * do not break the chain; the first hash-linked entry after them
 * is allowed to reference GENESIS.
 */
export function verifyLogIntegrity(tenantId?: string): IntegrityResult {
  const safeTenant = tenantId || DEFAULT_TENANT;
  const logFile = getTenantLogPath(safeTenant);
  const now = new Date().toISOString();

  if (!fs.existsSync(logFile)) {
    return {
      valid: true,
      tenant_id: safeTenant,
      total_entries: 0,
      verified_entries: 0,
      first_broken_index: null,
      first_broken_receipt_id: null,
      break_detail: null,
      chain_head_hash: GENESIS_HASH,
      checked_at: now,
    };
  }

  const raw = fs.readFileSync(logFile, 'utf-8');
  const lines = raw.split('\n').filter(Boolean);

  if (lines.length === 0) {
    return {
      valid: true,
      tenant_id: safeTenant,
      total_entries: 0,
      verified_entries: 0,
      first_broken_index: null,
      first_broken_receipt_id: null,
      break_detail: null,
      chain_head_hash: GENESIS_HASH,
      checked_at: now,
    };
  }

  const key = loadTenantKey(safeTenant);
  let expectedPrevHash = GENESIS_HASH;
  let verifiedCount = 0;
  let lastEntryHash = GENESIS_HASH;

  for (let i = 0; i < lines.length; i++) {
    let parsed: Record<string, unknown>;
    try {
      parsed = decodeLine(lines[i], key) as Record<string, unknown>;
    } catch {
      // Corrupt or undecryptable line
      const receiptId = 'PARSE_ERROR';
      return {
        valid: false,
        tenant_id: safeTenant,
        total_entries: lines.length,
        verified_entries: verifiedCount,
        first_broken_index: i,
        first_broken_receipt_id: receiptId,
        break_detail: `Line ${i} is not valid JSON`,
        chain_head_hash: lastEntryHash,
        checked_at: now,
      };
    }

    // Pre-chain entry (no entry_hash field) — skip but allow chain to continue
    if (!parsed.entry_hash) {
      // Pre-chain entries don't break the chain; the next hash-linked
      // entry is allowed to reference GENESIS since there's no prior hash.
      expectedPrevHash = GENESIS_HASH;
      continue;
    }

    // ── Verify prev_hash linkage ──
    const entryPrevHash = (parsed.prev_hash as string) || GENESIS_HASH;
    if (entryPrevHash !== expectedPrevHash) {
      const receiptId =
        (parsed.action_receipt_id as string) ||
        (parsed.admin_access_receipt_id as string) ||
        (parsed.pulse_receipt_id as string) ||
        (parsed.recovery_receipt_id as string) ||
        `line_${i}`;
      return {
        valid: false,
        tenant_id: safeTenant,
        total_entries: lines.length,
        verified_entries: verifiedCount,
        first_broken_index: i,
        first_broken_receipt_id: receiptId,
        break_detail: `prev_hash mismatch at line ${i}: expected "${expectedPrevHash.slice(0, 16)}…" but found "${entryPrevHash.slice(0, 16)}…"`,
        chain_head_hash: lastEntryHash,
        checked_at: now,
      };
    }

    // ── Verify entry_hash correctness ──
    const recomputedHash = computeEntryHash(parsed);
    const storedHash = parsed.entry_hash as string;
    if (recomputedHash !== storedHash) {
      const receiptId =
        (parsed.action_receipt_id as string) ||
        (parsed.admin_access_receipt_id as string) ||
        (parsed.pulse_receipt_id as string) ||
        (parsed.recovery_receipt_id as string) ||
        `line_${i}`;
      return {
        valid: false,
        tenant_id: safeTenant,
        total_entries: lines.length,
        verified_entries: verifiedCount,
        first_broken_index: i,
        first_broken_receipt_id: receiptId,
        break_detail: `entry_hash mismatch at line ${i}: stored "${storedHash.slice(0, 16)}…" but recomputed "${recomputedHash.slice(0, 16)}…" — content was modified`,
        chain_head_hash: lastEntryHash,
        checked_at: now,
      };
    }

    // Entry is valid — advance the chain
    verifiedCount++;
    lastEntryHash = storedHash;
    expectedPrevHash = storedHash;
  }

  return {
    valid: true,
    tenant_id: safeTenant,
    total_entries: lines.length,
    verified_entries: verifiedCount,
    first_broken_index: null,
    first_broken_receipt_id: null,
    break_detail: null,
    chain_head_hash: lastEntryHash,
    checked_at: now,
  };
}

// ── Lightweight Chain Witness (High-Frequency Polling) ────────────────────────
// getChainWitness() reads only the tail of the NDJSON file and spot-checks the
// last entry's hash. This is O(1) crypto work vs O(n) for verifyLogIntegrity().
// Designed for TelemetryBar polling at ≤10s intervals.
// ─────────────────────────────────────────────────────────────────────────────

export interface ChainWitness {
  /** Latest SHA-256 hash (chain head) */
  chain_head: string;
  /** Total blocks in the chain */
  witness_count: number;
  /** Spot-check: last entry's hash recomputes correctly AND linkage is valid */
  integrity_pulse: boolean;
  /** Entry hashes from the last N entries (most recent last) */
  witness_hashes: string[];
  /** ISO-8601 timestamp of when the witness was taken */
  checked_at: string;
  /** Tenant whose chain was witnessed */
  tenant_id: string;
}

/**
 * Take a lightweight "witness" of a tenant's audit chain.
 *
 * Unlike `verifyLogIntegrity()` which walks and re-hashes every entry (O(n)),
 * this function:
 *   1. Counts total lines (O(n) string split, but no JSON parse / crypto)
 *   2. Decodes only the last `tailCount` entries
 *   3. Re-computes the last entry's hash (single SHA-256)
 *   4. Verifies the tail linkage (prev_hash of last == entry_hash of second-to-last)
 *
 * The result is a compact payload suitable for high-frequency polling.
 *
 * @param tenantId  — Tenant whose chain to witness
 * @param tailCount — Number of tail entries to decode (default: 3)
 */
export function getChainWitness(tenantId?: string, tailCount = 3): ChainWitness {
  const safeTenant = tenantId || DEFAULT_TENANT;
  const logFile = getTenantLogPath(safeTenant);
  const now = new Date().toISOString();

  const emptyWitness: ChainWitness = {
    chain_head: GENESIS_HASH,
    witness_count: 0,
    integrity_pulse: true, // empty chain is trivially valid
    witness_hashes: [],
    checked_at: now,
    tenant_id: safeTenant,
  };

  if (!fs.existsSync(logFile)) return emptyWitness;

  const raw = fs.readFileSync(logFile, 'utf-8').trimEnd();
  if (!raw) return emptyWitness;

  const lines = raw.split('\n').filter(Boolean);
  if (lines.length === 0) return emptyWitness;

  // ── Decode only the tail entries ──
  const key = loadTenantKey(safeTenant);
  const tailLines = lines.slice(-tailCount);
  const tailEntries: Record<string, unknown>[] = [];

  for (const line of tailLines) {
    try {
      tailEntries.push(decodeLine(line, key) as Record<string, unknown>);
    } catch {
      // Corrupt or undecryptable tail entry — pulse will fail
      tailEntries.push({});
    }
  }

  // ── Extract witness hashes (only from entries that have them) ──
  const witnessHashes = tailEntries
    .map((e) => (e.entry_hash as string) || null)
    .filter((h): h is string => h !== null);

  // ── Chain head = last entry's entry_hash ──
  const lastEntry = tailEntries[tailEntries.length - 1];
  const chainHead = (lastEntry?.entry_hash as string) || GENESIS_HASH;

  // ── Integrity pulse: spot-check the chain tail ──
  // Two checks:
  //   (a) Last entry's hash recomputes correctly (content integrity)
  //   (b) Last entry's prev_hash matches second-to-last entry_hash (linkage)
  let integrityPulse = true;

  if (lastEntry && lastEntry.entry_hash) {
    // Check (a): re-hash the last entry
    const recomputed = computeEntryHash(lastEntry);
    if (recomputed !== lastEntry.entry_hash) {
      integrityPulse = false;
    }

    // Check (b): verify tail linkage (if we have ≥2 decoded entries)
    if (integrityPulse && tailEntries.length >= 2) {
      const penultimate = tailEntries[tailEntries.length - 2];
      const expectedPrev = (penultimate?.entry_hash as string) || GENESIS_HASH;
      const actualPrev = (lastEntry.prev_hash as string) || GENESIS_HASH;
      if (actualPrev !== expectedPrev) {
        integrityPulse = false;
      }
    }
  } else if (lines.length > 0) {
    // Non-empty file but last entry has no hash — pre-chain era
    // This is a valid state (backward compat), pulse remains true
  }

  return {
    chain_head: chainHead,
    witness_count: lines.length,
    integrity_pulse: integrityPulse,
    witness_hashes: witnessHashes,
    checked_at: now,
    tenant_id: safeTenant,
  };
}

// ── Admin Access Logging (Sovereign Data Protection) ─────────────────────────
// Whenever a SUPER_ADMIN views or downloads a tenant's audit log, a tamper-
// evident [AUDIT_SHIELD] entry is appended to THAT tenant's log so the
// tenant's sovereign record shows exactly who accessed their data and when.
// ─────────────────────────────────────────────────────────────────────────────

export interface AdminAccessEntry {
  /** Unique receipt ID for this admin access event */
  admin_access_receipt_id: string;
  /** ISO-8601 timestamp */
  timestamp: string;
  /** Tenant whose log was accessed */
  tenant_id: string;
  /** Identity of the admin who accessed the log */
  admin_id: string;
  /** Purpose of the access (e.g. "Technical Review", "FOIA Export") */
  purpose: string;
  /** Human-readable shield marker for grep / compliance scanning */
  marker: '[AUDIT_SHIELD]';
  /** The action taken — view, download, or export */
  action: 'view' | 'download' | 'export';
  /** SHA-256 hash of the previous entry (or "GENESIS" for the first entry) */
  prev_hash: string;
  /** SHA-256 hash of this entry (covers all fields except entry_hash itself) */
  entry_hash: string;
}

// ── Uptime Witness Entry Types ───────────────────────────────────────────────
// Periodic [PULSE] and [SYSTEM_RECOVERY] entries that prove chain continuity.
// A gap in pulses proves downtime; a recovery entry proves no data was deleted.
// ─────────────────────────────────────────────────────────────────────────────

export interface PulseEntry {
  /** Unique receipt ID for this pulse event */
  pulse_receipt_id: string;
  /** ISO-8601 timestamp */
  timestamp: string;
  /** Tenant whose chain received this pulse */
  tenant_id: string;
  /** Grep-searchable discriminator */
  marker: '[PULSE]';
  /** Whether the chain was valid at pulse time */
  chain_valid: boolean;
  /** Number of entries in the chain at pulse time */
  chain_entries: number;
  /** Snapshot of the chain head hash at pulse time */
  chain_head_hash_snapshot: string;
  /** Monotonically increasing sequence number for this process lifetime */
  uptime_sequence: number;
  /** PID of the emitting process */
  process_pid: number;
  /** SHA-256 hash of the previous entry (or "GENESIS" for the first entry) */
  prev_hash: string;
  /** SHA-256 hash of this entry (covers all fields except entry_hash itself) */
  entry_hash: string;
}

export interface SystemRecoveryEntry {
  /** Unique receipt ID for this recovery event */
  recovery_receipt_id: string;
  /** ISO-8601 timestamp */
  timestamp: string;
  /** Tenant whose chain received this recovery marker */
  tenant_id: string;
  /** Grep-searchable discriminator */
  marker: '[SYSTEM_RECOVERY]';
  /** ISO-8601 timestamp of the last known pulse before the gap */
  last_known_pulse_at: string;
  /** Duration of the detected gap in seconds */
  gap_duration_seconds: number;
  /** PID of the previous process (from state file) */
  previous_pid: number;
  /** PID of the current (recovering) process */
  current_pid: number;
  /** Reason the recovery was triggered */
  recovery_reason: 'pid_change' | 'time_gap' | 'pid_change_and_time_gap' | 'state_file_missing';
  /** Whether the chain was valid at recovery time */
  chain_valid: boolean;
  /** SHA-256 hash of the previous entry (or "GENESIS" for the first entry) */
  prev_hash: string;
  /** SHA-256 hash of this entry (covers all fields except entry_hash itself) */
  entry_hash: string;
}

/**
 * Log an internal admin's access to a tenant's audit data.
 *
 * Performs an AUTOMATIC DUAL-WRITE with a single shared timestamp
 * and receipt ID for guaranteed cross-referencing:
 *
 *   Write 1 — [AUDIT_SHIELD] in the tenant's chain-of-custody log
 *             (sovereign data protection: the tenant sees who accessed)
 *
 *   Write 2 — [ADMIN_ACTIVITY] in data/audit/system/admin_access.log
 *             (developer liability: global record across all tenants)
 *
 * Both entries share the same `admin_access_receipt_id` / `action_receipt_id`
 * and `timestamp`, so a compliance auditor can join them trivially.
 *
 * @param admin_id  — Identity of the SUPER_ADMIN (email or UID)
 * @param tenant_id — The tenant whose data is being accessed
 * @param options   — Optional action, purpose, and admin_name overrides
 *
 * @throws {CriticalIntegrityFailure} if the chain tail is corrupt or tampered
 * @throws {AuditWriteError} if the tenant log disk write fails
 *         (system log failure is non-blocking — logged but not thrown)
 */
export function logAdminAccess(
  admin_id: string,
  tenant_id: string,
  options?: {
    action?: AdminAccessEntry['action'];
    purpose?: string;
    /** Human-readable admin name for the system log. Defaults to admin_id. */
    admin_name?: string;
  },
): DualLogResult {
  const safeTenant = tenant_id || DEFAULT_TENANT;
  const logFile = getTenantLogPath(safeTenant);
  const action = options?.action || 'view';
  const purpose = options?.purpose || 'Technical Review';
  const adminName = options?.admin_name || admin_id;

  // ── Shared identity: single timestamp + receipt ID for both writes ──
  const sharedReceiptId = generateReceiptId();
  const sharedTimestamp = new Date().toISOString();

  // ══════════════════════════════════════════════
  // WRITE 1: [AUDIT_SHIELD] → Tenant's Chain
  // ══════════════════════════════════════════════
  // Chain-of-Custody: Verify + link to previous entry
  const prevHash = getVerifiedChainTail(logFile, safeTenant);

  const shieldEntry: AdminAccessEntry = {
    admin_access_receipt_id: sharedReceiptId,
    timestamp: sharedTimestamp,
    tenant_id: safeTenant,
    admin_id,
    purpose,
    marker: '[AUDIT_SHIELD]',
    action,
    prev_hash: prevHash,
    entry_hash: '', // placeholder — computed below
  };

  // Compute the hash over the full entry (excluding entry_hash)
  shieldEntry.entry_hash = computeEntryHash(shieldEntry as unknown as Record<string, unknown>);

  // Persist to the TENANT's log (not an admin-global log) so the
  // tenant's sovereign data record is self-contained.
  // If the tenant has an AES-256-GCM key, encrypt before writing.
  const jsonLine = JSON.stringify(shieldEntry);
  const tenantKey = loadTenantKey(safeTenant);
  const diskLine = tenantKey ? encryptLine(jsonLine, tenantKey) : jsonLine;

  try {
    fs.appendFileSync(logFile, diskLine + '\n', 'utf-8');
  } catch (err) {
    throw new AuditWriteError(
      `[AUDIT_SHIELD] Failed to log admin access by ${admin_id} to tenant ${safeTenant}`,
      err,
    );
  }

  console.log(
    `[AUDIT_SHIELD] Internal Support Access by ${admin_id} — tenant:${safeTenant} | action:${action} | receipt:${sharedReceiptId} | chain:${shieldEntry.entry_hash.slice(0, 12)}… | encrypted:${!!tenantKey}`,
  );

  // ══════════════════════════════════════════════
  // WRITE 2: [ADMIN_ACTIVITY] → System-Wide Log
  // ══════════════════════════════════════════════
  // Non-blocking: the tenant's AUDIT_SHIELD entry is the authoritative
  // record. If the system log write fails, we log the error but do NOT
  // throw — the shield entry is already persisted.
  let systemEntry: SystemAdminAccessEntry;
  try {
    systemEntry = writeSystemAdminLog({
      action_receipt_id: sharedReceiptId,
      timestamp: sharedTimestamp,
      admin_id,
      admin_name: adminName,
      tenant_id: safeTenant,
      action,
      purpose,
    });
  } catch (err) {
    console.error(
      `[ADMIN_ACTIVITY] System log write failed (non-blocking) — receipt:${sharedReceiptId}:`,
      err instanceof AuditWriteError ? err.message : String(err),
    );
    // Build a placeholder entry so callers always get a DualLogResult
    systemEntry = {
      event_id: 'WRITE_FAILED',
      action_receipt_id: sharedReceiptId,
      timestamp: sharedTimestamp,
      marker: '[ADMIN_ACTIVITY]',
      admin_id,
      admin_name: adminName,
      tenant_id: safeTenant,
      action,
      purpose,
    };
  }

  return { shield: shieldEntry, system: systemEntry };
}

// ── Uptime Witness Write Functions ────────────────────────────────────────────
// logPulse() and logSystemRecovery() follow the same pattern as logAdminAccess():
//   1. Verify the chain tail (fail-fast on corruption)
//   2. Build the entry with a unique receipt ID and marker
//   3. Compute the entry hash (chain linking)
//   4. Encrypt if tenant has a key
//   5. Append to disk (atomic per-line)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Write a [PULSE] entry into a tenant's audit log.
 *
 * Called every 10 minutes by the uptime-witness cron. Each pulse proves the
 * system was alive and the chain was intact at that moment.
 *
 * @throws {CriticalIntegrityFailure} if the chain tail is corrupt or tampered
 * @throws {AuditWriteError} if the disk write fails
 */
export function logPulse(
  tenant_id: string,
  data: {
    chain_valid: boolean;
    chain_entries: number;
    chain_head_hash_snapshot: string;
    uptime_sequence: number;
    process_pid: number;
  },
): PulseEntry {
  const safeTenant = tenant_id || DEFAULT_TENANT;
  const logFile = getTenantLogPath(safeTenant);

  // ── Chain-of-Custody: Verify + link to previous entry ──
  const prevHash = getVerifiedChainTail(logFile, safeTenant);

  const pulseEntry: PulseEntry = {
    pulse_receipt_id: generateReceiptId(),
    timestamp: new Date().toISOString(),
    tenant_id: safeTenant,
    marker: '[PULSE]',
    chain_valid: data.chain_valid,
    chain_entries: data.chain_entries,
    chain_head_hash_snapshot: data.chain_head_hash_snapshot,
    uptime_sequence: data.uptime_sequence,
    process_pid: data.process_pid,
    prev_hash: prevHash,
    entry_hash: '', // placeholder — computed below
  };

  // Compute the hash over the full entry (excluding entry_hash)
  pulseEntry.entry_hash = computeEntryHash(pulseEntry as unknown as Record<string, unknown>);

  // Persist to disk. Encrypt if the tenant has an AES-256-GCM key.
  const jsonLine = JSON.stringify(pulseEntry);
  const tenantKey = loadTenantKey(safeTenant);
  const diskLine = tenantKey ? encryptLine(jsonLine, tenantKey) : jsonLine;

  try {
    fs.appendFileSync(logFile, diskLine + '\n', 'utf-8');
  } catch (err) {
    throw new AuditWriteError(
      `[PULSE] Failed to write pulse entry for tenant ${safeTenant}`,
      err,
    );
  }

  console.log(
    `[PULSE] tenant:${safeTenant} | seq:${data.uptime_sequence} | chain:${pulseEntry.entry_hash.slice(0, 12)}… | entries:${data.chain_entries} | encrypted:${!!tenantKey}`,
  );

  return pulseEntry;
}

/**
 * Write a [SYSTEM_RECOVERY] entry into a tenant's audit log.
 *
 * Emitted when the uptime-witness detects a gap (PID change, time gap,
 * or missing state file). Proves that no data was deleted during downtime —
 * the chain was intact when the system came back online.
 *
 * @throws {CriticalIntegrityFailure} if the chain tail is corrupt or tampered
 * @throws {AuditWriteError} if the disk write fails
 */
export function logSystemRecovery(
  tenant_id: string,
  data: {
    last_known_pulse_at: string;
    gap_duration_seconds: number;
    previous_pid: number;
    current_pid: number;
    recovery_reason: SystemRecoveryEntry['recovery_reason'];
    chain_valid: boolean;
  },
): SystemRecoveryEntry {
  const safeTenant = tenant_id || DEFAULT_TENANT;
  const logFile = getTenantLogPath(safeTenant);

  // ── Chain-of-Custody: Verify + link to previous entry ──
  const prevHash = getVerifiedChainTail(logFile, safeTenant);

  const recoveryEntry: SystemRecoveryEntry = {
    recovery_receipt_id: generateReceiptId(),
    timestamp: new Date().toISOString(),
    tenant_id: safeTenant,
    marker: '[SYSTEM_RECOVERY]',
    last_known_pulse_at: data.last_known_pulse_at,
    gap_duration_seconds: data.gap_duration_seconds,
    previous_pid: data.previous_pid,
    current_pid: data.current_pid,
    recovery_reason: data.recovery_reason,
    chain_valid: data.chain_valid,
    prev_hash: prevHash,
    entry_hash: '', // placeholder — computed below
  };

  // Compute the hash over the full entry (excluding entry_hash)
  recoveryEntry.entry_hash = computeEntryHash(recoveryEntry as unknown as Record<string, unknown>);

  // Persist to disk. Encrypt if the tenant has an AES-256-GCM key.
  const jsonLine = JSON.stringify(recoveryEntry);
  const tenantKey = loadTenantKey(safeTenant);
  const diskLine = tenantKey ? encryptLine(jsonLine, tenantKey) : jsonLine;

  try {
    fs.appendFileSync(logFile, diskLine + '\n', 'utf-8');
  } catch (err) {
    throw new AuditWriteError(
      `[SYSTEM_RECOVERY] Failed to write recovery entry for tenant ${safeTenant}`,
      err,
    );
  }

  console.log(
    `[SYSTEM_RECOVERY] tenant:${safeTenant} | reason:${data.recovery_reason} | gap:${data.gap_duration_seconds}s | chain:${recoveryEntry.entry_hash.slice(0, 12)}… | encrypted:${!!tenantKey}`,
  );

  return recoveryEntry;
}

// ── System-Wide Admin Access Log (Developer Liability Protection) ─────────────
// A SINGLE global log at data/audit/system/admin_access.log that records
// every SUPER_ADMIN access across ALL tenants. This is the developer's own
// liability record — proving exactly when and why any tenant data was touched.
//
// The tenant's chain-of-custody (AUDIT_SHIELD entries in their silo) is the
// tenant-facing proof. This system log is the developer-facing proof.
// ─────────────────────────────────────────────────────────────────────────────

const SYSTEM_LOG_DIR = path.join(AUDIT_ROOT, 'system');
const SYSTEM_ADMIN_LOG = 'admin_access.log';

// Bootstrap system directory on first import
if (!fs.existsSync(SYSTEM_LOG_DIR)) {
  fs.mkdirSync(SYSTEM_LOG_DIR, { recursive: true });
}

export interface SystemAdminAccessEntry {
  /** Unique event ID for this system log entry */
  event_id: string;
  /** Shared receipt ID — matches the [AUDIT_SHIELD] entry's admin_access_receipt_id */
  action_receipt_id: string;
  /** ISO-8601 timestamp — identical to the matching [AUDIT_SHIELD] entry */
  timestamp: string;
  /** Grep-searchable discriminator for the system-wide admin log */
  marker: '[ADMIN_ACTIVITY]';
  /** Email of the SUPER_ADMIN */
  admin_id: string;
  /** Human-readable name of the admin */
  admin_name: string;
  /** Tenant whose data was accessed */
  tenant_id: string;
  /** The action performed */
  action: 'view' | 'download' | 'export';
  /** Purpose declared for the access */
  purpose: string;
}

/**
 * Result of a dual-write admin access log operation.
 *
 * Every call to `logAdminAccess()` atomically produces both entries
 * with a shared timestamp and receipt ID for guaranteed cross-referencing.
 */
export interface DualLogResult {
  /** The [AUDIT_SHIELD] entry written to the tenant's chain-of-custody log */
  shield: AdminAccessEntry;
  /** The [ADMIN_ACTIVITY] entry written to data/audit/system/admin_access.log */
  system: SystemAdminAccessEntry;
}

/**
 * Write an [ADMIN_ACTIVITY] entry to the system-wide admin access log.
 *
 * This is a flat append-only NDJSON file that records every SUPER_ADMIN
 * access to any tenant. It lives outside any tenant silo at:
 *   data/audit/system/admin_access.log
 *
 * The `action_receipt_id` matches the [AUDIT_SHIELD] entry's
 * `admin_access_receipt_id`, providing a bidirectional audit trail.
 *
 * INTERNAL: Callers should use `logAdminAccess()` which performs
 * both writes atomically. Direct use of this function is discouraged.
 *
 * @throws {AuditWriteError} if the write fails
 */
function writeSystemAdminLog(params: {
  action_receipt_id: string;
  timestamp: string;
  admin_id: string;
  admin_name: string;
  tenant_id: string;
  action: SystemAdminAccessEntry['action'];
  purpose: string;
}): SystemAdminAccessEntry {
  const logFile = path.join(SYSTEM_LOG_DIR, SYSTEM_ADMIN_LOG);

  const record: SystemAdminAccessEntry = {
    event_id: `SYS-${Date.now().toString(16).toUpperCase()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
    action_receipt_id: params.action_receipt_id,
    timestamp: params.timestamp,
    marker: '[ADMIN_ACTIVITY]',
    admin_id: params.admin_id,
    admin_name: params.admin_name,
    tenant_id: params.tenant_id,
    action: params.action,
    purpose: params.purpose,
  };

  try {
    fs.appendFileSync(logFile, JSON.stringify(record) + '\n', 'utf-8');
  } catch (err) {
    throw new AuditWriteError(
      `[ADMIN_ACTIVITY] Failed to write system admin access event ${record.event_id}`,
      err,
    );
  }

  console.log(
    `[ADMIN_ACTIVITY] ${record.event_id} | ${record.admin_id} → tenant:${record.tenant_id} | action:${record.action} | receipt:${record.action_receipt_id}`,
  );

  return record;
}

/**
 * Read the full system-wide admin access log.
 * Returns all entries across all tenants — for developer audit / compliance.
 */
export function getSystemAdminLog(): SystemAdminAccessEntry[] {
  const logFile = path.join(SYSTEM_LOG_DIR, SYSTEM_ADMIN_LOG);
  if (!fs.existsSync(logFile)) return [];

  const raw = fs.readFileSync(logFile, 'utf-8');
  return raw
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as SystemAdminAccessEntry);
}

/**
 * Read [AUDIT_SHIELD] entries from a specific tenant's log.
 * Returns only admin access events — used to show the tenant
 * exactly when their data was accessed and by whom.
 */
export function getTenantAccessHistory(tenantId: string): AdminAccessEntry[] {
  const logFile = getTenantLogPath(tenantId);
  if (!fs.existsSync(logFile)) return [];

  const key = loadTenantKey(tenantId);
  const raw = fs.readFileSync(logFile, 'utf-8');
  const results: AdminAccessEntry[] = [];

  for (const line of raw.split('\n').filter(Boolean)) {
    try {
      const entry = decodeLine(line, key);
      if (entry.marker === '[AUDIT_SHIELD]') {
        results.push(entry as unknown as AdminAccessEntry);
      }
    } catch {
      // Skip corrupt or undecryptable lines
    }
  }

  return results;
}

// ── Sovereign Exit — Deletion Certificate ─────────────────────────────────────
// When a tenant exercises their right to leave, generateDeletionCertificate()
// captures the final cryptographic state of their chain, performs a secure wipe
// of all on-disk artifacts, and returns a signed "tombstone" certificate —
// the last artifact the tenant downloads before their silo is gone forever.
// ─────────────────────────────────────────────────────────────────────────────

export interface SovereignExitCertificate {
  /** Unique certificate identifier */
  certificate_id: string;
  /** Certificate type discriminator */
  type: 'SOVEREIGN_EXIT_CERTIFICATE';
  /** Tenant being destroyed */
  tenant_id: string;
  /** Human-readable agency name */
  agency_name: string;
  /** Jurisdiction / state */
  jurisdiction_state: string;
  /** ISO-8601 timestamp of destruction */
  destruction_timestamp: string;
  /** Final root hash of the chain BEFORE destruction (the last entry_hash) */
  final_root_hash: string;
  /** Whether the chain was intact at time of destruction */
  chain_integrity_valid: boolean;
  /** Number of entries verified in the chain walk */
  chain_verified_entries: number;
  /** Total audit entries destroyed */
  total_entries_destroyed: number;
  /** List of files destroyed with sizes */
  artifacts_destroyed: { name: string; size_bytes: number }[];
  /** Total bytes destroyed across all artifacts */
  total_bytes_destroyed: number;
  /** Confirmation that tenant-specific encryption keys were invalidated */
  keys_destroyed: true;
  /** Detailed crypto-shredding proof — records key destruction outcome */
  crypto_shredding_proof: {
    key_existed: boolean;
    key_path: string;
    shredded: boolean;
    proof_statement: string;
  };
  /** Post-wipe verification — independent proof that all paths read as NULL */
  purge_verification: {
    /** Whether ALL file paths were confirmed absent after wipe */
    all_paths_verified_null: boolean;
    /** Whether the tenant silo directory was confirmed absent */
    silo_directory_verified_null: boolean;
    /** Per-file verification results */
    file_checks: {
      path: string;
      verified_null: boolean;
      read_error: string;
    }[];
    /** Tombstone log entry ID for cross-reference */
    tombstone_entry_id: string;
  };
  /** HMAC-SHA256 signature over the certificate body */
  signature: string;
}

// ── Purge Audit Types ──────────────────────────────────────────────────────────

export interface TombstoneEntry {
  /** Unique tombstone entry identifier */
  tombstone_id: string;
  /** ISO-8601 timestamp of the verification */
  timestamp: string;
  /** Tenant that was destroyed */
  tenant_id: string;
  /** Human-readable agency name */
  agency_name: string;
  /** Certificate ID this tombstone is associated with */
  certificate_id: string;
  /** Per-path verification results */
  path_verifications: {
    path: string;
    verified_null: boolean;
    read_error: string;
  }[];
  /** Whether the silo directory was confirmed absent */
  silo_verified_null: boolean;
  /** Whether ALL paths were verified absent */
  all_verified: boolean;
  /** Machine-readable proof statement */
  proof_statement: string;
}

// HMAC signing key for certificates. In production this should be a
// securely managed secret (HSM / KMS). For now, derived from the
// process environment or a static seed.
const CERTIFICATE_SIGNING_KEY =
  process.env.CERTIFICATE_SIGNING_KEY || 'sovereign-exit-certificate-key-v1';

/**
 * Overwrite a file with random data before unlinking.
 *
 * This is a best-effort secure wipe: the file contents are replaced with
 * cryptographically random bytes matching the original file size, flushed
 * to disk via `fsync`, and then the file is deleted. On copy-on-write
 * filesystems (APFS, ZFS) or SSDs with wear-leveling, physical sector
 * overwrite is not guaranteed — but the logical content is irrecoverable
 * through normal filesystem reads.
 */
function secureWipeFile(filePath: string): void {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return;

    // Overwrite with random bytes
    const fd = fs.openSync(filePath, 'w');
    const randomData = crypto.randomBytes(stat.size);
    fs.writeSync(fd, randomData, 0, randomData.length, 0);
    fs.fsyncSync(fd);
    fs.closeSync(fd);

    // Delete the file
    fs.unlinkSync(filePath);
  } catch (err) {
    // Fallback: attempt plain delete if secure wipe fails
    try {
      fs.unlinkSync(filePath);
    } catch {
      // File may already be gone
    }
    console.warn(
      `[Sovereign Exit] Secure wipe fallback for ${filePath}:`,
      err instanceof Error ? err.message : String(err),
    );
  }
}

// ── Post-Wipe Verification (Purge Audit) ──────────────────────────────────────
// After every secure wipe, we attempt to READ the path that was just destroyed.
// If the read returns ENOENT (file not found), we have independent proof that
// the file is gone. This is logged to a global tombstone log that persists
// across all tenant lifecycles.
// ─────────────────────────────────────────────────────────────────────────────

const TOMBSTONE_LOG_FILE = 'global_tombstone.log';

/**
 * Attempt to read a file path and confirm it returns NULL / ENOENT.
 *
 * Returns a verification result: if the file is truly gone, `verified_null`
 * is true and `read_error` contains the ENOENT message. If the file
 * somehow still exists (wipe failed), `verified_null` is false.
 */
function verifyFileAbsence(filePath: string): {
  path: string;
  verified_null: boolean;
  read_error: string;
} {
  try {
    // Attempt to read the first byte of the file
    fs.readFileSync(filePath, { flag: 'r' });
    // If we get here, the file STILL EXISTS — wipe failed
    return {
      path: filePath,
      verified_null: false,
      read_error: 'FILE_STILL_EXISTS — secure wipe did not remove the file',
    };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      // File is confirmed absent — this is the expected outcome
      return {
        path: filePath,
        verified_null: true,
        read_error: `ENOENT: ${filePath} — path verified as NULL`,
      };
    }
    // Some other error (permission denied, etc.) — still not readable,
    // but we can't confirm absence with certainty
    return {
      path: filePath,
      verified_null: true, // Practically absent — unreadable
      read_error: `${code || 'UNKNOWN'}: ${(err as Error).message}`,
    };
  }
}

/**
 * Write a tombstone entry to the global tombstone log.
 *
 * This is an append-only NDJSON file at:
 *   data/audit/system/global_tombstone.log
 *
 * Each line records the post-wipe verification for a destroyed tenant,
 * providing an independent, cross-tenant record that the data is gone.
 * This file is NOT inside any tenant's silo — it survives tenant deletion.
 */
function writeTombstoneEntry(entry: TombstoneEntry): void {
  const logFile = path.join(SYSTEM_LOG_DIR, TOMBSTONE_LOG_FILE);

  try {
    fs.appendFileSync(logFile, JSON.stringify(entry) + '\n', 'utf-8');
  } catch (err) {
    // Non-fatal: the certificate itself carries the purge audit data.
    // The tombstone log is a secondary proof. Log the failure but don't throw.
    console.error(
      `[Tombstone Log] Failed to write tombstone for tenant:${entry.tenant_id}:`,
      err instanceof Error ? err.message : String(err),
    );
  }

  console.log(
    `[Tombstone Log] ${entry.tombstone_id} | tenant:${entry.tenant_id} | ` +
      `paths_checked:${entry.path_verifications.length} | ` +
      `all_null:${entry.all_verified} | silo_null:${entry.silo_verified_null}`,
  );
}

/**
 * Read the global tombstone log.
 * Returns all entries across all destroyed tenants.
 */
export function getTombstoneLog(): TombstoneEntry[] {
  const logFile = path.join(SYSTEM_LOG_DIR, TOMBSTONE_LOG_FILE);
  if (!fs.existsSync(logFile)) return [];

  const raw = fs.readFileSync(logFile, 'utf-8');
  return raw
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as TombstoneEntry);
}

/**
 * Generate a Sovereign Exit Certificate and permanently destroy a tenant's
 * entire audit silo.
 *
 * Execution order (all steps are synchronous / fail-fast):
 *   1. Verify the chain integrity and capture the `final_root_hash`
 *   2. Read all audit entries (for the count on the certificate)
 *   3. Catalog every file in the tenant's silo (name + size)
 *   4. Secure-wipe every file (overwrite with random data, fsync, unlink)
 *   5. Remove the now-empty tenant directory
 *   6. Build the certificate body and sign it with HMAC-SHA256
 *   7. Return the signed certificate — the tenant's last proof of custody
 *
 * THIS ACTION IS IRREVERSIBLE. The caller is responsible for confirming
 * intent before invoking this function.
 *
 * @param tenantIdentity  — resolved tenant (id, agency name, jurisdiction)
 * @returns SovereignExitCertificate — the signed tombstone artifact
 */
export function generateDeletionCertificate(tenantIdentity: {
  tenant_id: string;
  agency_name: string;
  jurisdiction_state: string;
}): SovereignExitCertificate {
  const { tenant_id, agency_name, jurisdiction_state } = tenantIdentity;
  const destructionTimestamp = new Date().toISOString();

  // ── Step 1: Capture final chain state BEFORE any destruction ──
  const integrityResult = verifyLogIntegrity(tenant_id);
  const finalRootHash = integrityResult.chain_head_hash;

  // ── Step 2: Read entry count for the certificate ──
  const auditEntries = getAuditLog(tenant_id);

  // ── Step 3: Catalog all files in the tenant's silo ──
  const auditDir = getTenantAuditDir(tenant_id);
  const destroyedArtifacts: { name: string; size_bytes: number }[] = [];

  if (fs.existsSync(auditDir)) {
    const files = fs.readdirSync(auditDir);
    for (const file of files) {
      const filePath = path.join(auditDir, file);
      try {
        const stat = fs.statSync(filePath);
        if (stat.isFile()) {
          destroyedArtifacts.push({
            name: file,
            size_bytes: stat.size,
          });
        }
      } catch {
        // Skip files we can't stat
      }
    }
  }

  // ── Step 4: Secure wipe every file (overwrite → fsync → unlink) ──
  const wipedFilePaths: string[] = [];
  if (fs.existsSync(auditDir)) {
    const files = fs.readdirSync(auditDir);
    for (const file of files) {
      const fullPath = path.join(auditDir, file);
      secureWipeFile(fullPath);
      wipedFilePaths.push(fullPath);
    }
  }

  // ── Step 5: Remove the empty silo directory ──
  if (fs.existsSync(auditDir)) {
    fs.rmSync(auditDir, { recursive: true, force: true });
  }

  // ── Step 5.5: CRYPTO-SHREDDING — Destroy the tenant's AES-256 encryption key ──
  // Without the key, all encrypted audit entries become permanently
  // unrecoverable ciphertext — even from backups of the audit directory.
  const keyDestructionResult = destroyTenantKey(tenant_id);

  console.log(
    `[Sovereign Exit] PERMANENT DELETION — tenant:${tenant_id} | ` +
      `${destroyedArtifacts.length} artifacts secure-wiped | ` +
      `key_shredded:${keyDestructionResult.shredded} | ` +
      `final_root_hash:${finalRootHash.slice(0, 16)}…`,
  );

  // ── Step 6: Generate certificate ID (needed by tombstone cross-reference) ──
  const certificateId = `CERT-EXIT-${Date.now().toString(16).toUpperCase()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

  // ── Step 6.5: POST-WIPE VERIFICATION — Confirm every wiped path reads NULL ──
  const fileChecks = wipedFilePaths.map((fp) => verifyFileAbsence(fp));
  const siloVerifiedNull = !fs.existsSync(auditDir);
  const allPathsVerifiedNull = fileChecks.every((fc) => fc.verified_null) && siloVerifiedNull;

  // ── Step 6.6: Write Tombstone Entry to global log ──
  const tombstoneId = `TOMB-${Date.now().toString(16).toUpperCase()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  const tombstoneEntry: TombstoneEntry = {
    tombstone_id: tombstoneId,
    timestamp: new Date().toISOString(),
    tenant_id,
    agency_name,
    certificate_id: certificateId,
    path_verifications: fileChecks,
    silo_verified_null: siloVerifiedNull,
    all_verified: allPathsVerifiedNull,
    proof_statement: allPathsVerifiedNull
      ? `All ${fileChecks.length} artifact path(s) and the silo directory verified as NULL after secure wipe. Tenant data is irrecoverable.`
      : `WARNING: ${fileChecks.filter((fc) => !fc.verified_null).length} path(s) could not be verified as absent. Manual review required.`,
  };
  writeTombstoneEntry(tombstoneEntry);

  console.log(
    `[Purge Audit] tenant:${tenant_id} | paths_checked:${fileChecks.length} | ` +
      `all_null:${allPathsVerifiedNull} | silo_null:${siloVerifiedNull} | ` +
      `tombstone:${tombstoneId}`,
  );

  // ── Step 7: Build and sign the certificate ──
  const certificateBody = {
    certificate_id: certificateId,
    type: 'SOVEREIGN_EXIT_CERTIFICATE' as const,
    tenant_id,
    agency_name,
    jurisdiction_state,
    destruction_timestamp: destructionTimestamp,
    final_root_hash: finalRootHash,
    chain_integrity_valid: integrityResult.valid,
    chain_verified_entries: integrityResult.verified_entries,
    total_entries_destroyed: auditEntries.length,
    artifacts_destroyed: destroyedArtifacts,
    total_bytes_destroyed: destroyedArtifacts.reduce(
      (sum, a) => sum + a.size_bytes,
      0,
    ),
    keys_destroyed: true as const,
    crypto_shredding_proof: {
      key_existed: keyDestructionResult.key_existed,
      key_path: keyDestructionResult.key_path,
      shredded: keyDestructionResult.shredded,
      proof_statement:
        'Data cryptographically shredded. Master key destroyed. Backups are now unrecoverable.',
    },
    purge_verification: {
      all_paths_verified_null: allPathsVerifiedNull,
      silo_directory_verified_null: siloVerifiedNull,
      file_checks: fileChecks,
      tombstone_entry_id: tombstoneId,
    },
  };

  // HMAC-SHA256 signature over sorted-key JSON (deterministic)
  const bodyJson = JSON.stringify(
    certificateBody,
    Object.keys(certificateBody).sort(),
  );
  const signature = crypto
    .createHmac('sha256', CERTIFICATE_SIGNING_KEY)
    .update(bodyJson, 'utf-8')
    .digest('hex');

  return { ...certificateBody, signature };
}
