// =============================================================================
// WITNESS PERSISTENCE — The Black Box
// =============================================================================
// Append-only local file-system backup of every Merkle Root produced by the
// audit chain. Acts as a tamper-evident "flight recorder" — even if the primary
// NDJSON audit log is corrupted or Firestore is unreachable, the Black Box
// preserves a cryptographic record of every chain state transition.
//
// Storage: data/audit/witness_chain.log (GLOBAL — cross-tenant)
// Format:  NDJSON, each line self-hash-linked to the previous
//
// Security properties:
//   1. Append-only (never edit/truncate — enforced by fs.appendFileSync)
//   2. Self-hash-linked (each entry contains prev_witness_hash → witness_hash)
//   3. Each entry is independently verifiable (witness_hash covers all fields)
//   4. In-memory cache for O(1) reads by TelemetryBar fallback path
//
// Exports:
//   appendWitness()       — Record a new chain state transition
//   getLatestWitness()    — Fast read of the most recent witness (in-memory + disk)
//   getWitnessLog()       — Full log for forensic analysis
//   verifyWitnessChain()  — Verify the Black Box's own integrity
// =============================================================================

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// ── Types ────────────────────────────────────────────────────────────────────

export interface WitnessEntry {
  /** Unique identifier: WIT-{epoch_hex}-{random_hex} */
  witness_id: string;
  /** ISO-8601 timestamp of the witnessed event */
  timestamp: string;
  /** Tenant that produced the audit receipt */
  tenant_id: string;
  /** The audit receipt ID (RCPT-…) that triggered this witness */
  receipt_id: string;
  /** The chain head hash (entry_hash from the audit receipt) — the Merkle Root */
  chain_head: string;
  /** Tool that was executed to produce this chain state */
  tool_name: string;
  /** SHA-256 of the previous witness entry (or WITNESS_GENESIS for first) */
  prev_witness_hash: string;
  /** SHA-256 of this witness entry (covers all fields above) */
  witness_hash: string;
}

export interface WitnessChainVerification {
  valid: boolean;
  total_entries: number;
  verified_entries: number;
  first_broken_index: number | null;
  break_detail: string | null;
}

// ── Constants ────────────────────────────────────────────────────────────────

const AUDIT_ROOT = path.join(process.cwd(), 'data', 'audit');
const WITNESS_LOG_PATH = path.join(AUDIT_ROOT, 'witness_chain.log');
const GENESIS_WITNESS = 'WITNESS_GENESIS';

// ── In-Memory Cache ──────────────────────────────────────────────────────────
// Keeps the latest witness in memory for O(1) reads.
// Initialized from disk on first access, updated on each append.

let cachedLatest: WitnessEntry | null = null;
let cacheInitialized = false;

// ── Internal Helpers ─────────────────────────────────────────────────────────

/**
 * Compute the SHA-256 witness hash over all fields except witness_hash itself.
 * The field order is fixed (alphabetical keys in the JSON payload) so that
 * the hash is deterministic regardless of object property insertion order.
 */
function computeWitnessHash(entry: Omit<WitnessEntry, 'witness_hash'>): string {
  const payload = JSON.stringify({
    chain_head: entry.chain_head,
    prev_witness_hash: entry.prev_witness_hash,
    receipt_id: entry.receipt_id,
    tenant_id: entry.tenant_id,
    timestamp: entry.timestamp,
    tool_name: entry.tool_name,
    witness_id: entry.witness_id,
  });
  return crypto.createHash('sha256').update(payload, 'utf-8').digest('hex');
}

/**
 * Generate a unique witness ID.
 * Format: WIT-{epoch_hex}-{random_hex}
 */
function generateWitnessId(): string {
  const epoch = Date.now().toString(16).toUpperCase();
  const rand = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `WIT-${epoch}-${rand}`;
}

/**
 * Ensure the witness log file and its parent directory exist.
 */
function ensureWitnessLog(): void {
  if (!fs.existsSync(AUDIT_ROOT)) {
    fs.mkdirSync(AUDIT_ROOT, { recursive: true });
  }
  if (!fs.existsSync(WITNESS_LOG_PATH)) {
    fs.writeFileSync(WITNESS_LOG_PATH, '', 'utf-8');
  }
}

/**
 * Initialize the in-memory cache from disk (only on first access).
 * Reads the last line of the witness log to hydrate the cache.
 */
function initCache(): void {
  if (cacheInitialized) return;
  cacheInitialized = true;

  try {
    ensureWitnessLog();
    const raw = fs.readFileSync(WITNESS_LOG_PATH, 'utf-8').trimEnd();
    if (!raw) return;

    const lines = raw.split('\n').filter(Boolean);
    if (lines.length === 0) return;

    const lastLine = lines[lines.length - 1];
    cachedLatest = JSON.parse(lastLine) as WitnessEntry;
  } catch {
    // Corrupt file or parse error — cache stays null, will rebuild on next append
    cachedLatest = null;
  }
}

// ── Exported Functions ───────────────────────────────────────────────────────

/**
 * Append a witness entry to the Black Box.
 *
 * Called after every successful writeAuditLog() to record the chain
 * state transition. The entry is hash-linked to the previous witness
 * for its own tamper-evidence chain.
 *
 * **Non-blocking guarantee**: If the Black Box write fails, the error
 * is logged but NOT thrown. The primary audit chain has already been
 * persisted — we do not allow a secondary persistence failure to
 * block AI tool execution.
 *
 * @param receipt — Subset of ActionAuditReceipt fields needed for witnessing
 * @returns The created WitnessEntry (even if disk write failed)
 */
export function appendWitness(receipt: {
  action_receipt_id: string;
  tenant_id: string;
  entry_hash: string;
  tool_name: string;
  timestamp: string;
}): WitnessEntry {
  initCache();
  ensureWitnessLog();

  const prevHash = cachedLatest?.witness_hash ?? GENESIS_WITNESS;

  const partial: Omit<WitnessEntry, 'witness_hash'> = {
    witness_id: generateWitnessId(),
    timestamp: receipt.timestamp,
    tenant_id: receipt.tenant_id,
    receipt_id: receipt.action_receipt_id,
    chain_head: receipt.entry_hash,
    tool_name: receipt.tool_name,
    prev_witness_hash: prevHash,
  };

  const entry: WitnessEntry = {
    ...partial,
    witness_hash: computeWitnessHash(partial),
  };

  // ── Append-only write ──
  // fs.appendFileSync uses O_APPEND semantics — the OS guarantees the
  // write is atomic at the page level, preventing partial-line corruption
  // from concurrent processes.
  try {
    fs.appendFileSync(WITNESS_LOG_PATH, JSON.stringify(entry) + '\n', 'utf-8');
  } catch (err) {
    console.error(
      `[Black Box] CRITICAL: Failed to persist witness ${entry.witness_id}:`,
      err,
    );
    // Non-fatal — primary audit chain is already on disk.
    // Return the entry so the caller can still use it, but do NOT update cache
    // (cache should only reflect confirmed-on-disk state).
    return entry;
  }

  // ── Update in-memory cache (only after confirmed disk write) ──
  cachedLatest = entry;

  console.log(
    `[Black Box → Disk] ${entry.witness_id} | tenant:${entry.tenant_id} | ` +
      `chain_head:${entry.chain_head.slice(0, 12)}… | ` +
      `witness:${entry.witness_hash.slice(0, 12)}…`,
  );

  return entry;
}

/**
 * Get the latest witness entry from the Black Box.
 *
 * Uses in-memory cache for O(1) reads — falls back to disk if the cache
 * hasn't been initialized yet. Designed as a fast fallback for TelemetryBar
 * when the Firestore/API witness path is slow or unavailable.
 *
 * @returns The most recent WitnessEntry, or null if the log is empty
 */
export function getLatestWitness(): WitnessEntry | null {
  initCache();
  return cachedLatest;
}

/**
 * Read the full witness chain log from disk.
 * Returns all entries in chronological order for forensic analysis.
 *
 * Skips malformed lines (logged to stderr) — partial corruption does
 * not prevent reading the remaining entries.
 */
export function getWitnessLog(): WitnessEntry[] {
  ensureWitnessLog();
  const raw = fs.readFileSync(WITNESS_LOG_PATH, 'utf-8').trimEnd();
  if (!raw) return [];

  const entries: WitnessEntry[] = [];
  const lines = raw.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    try {
      entries.push(JSON.parse(line) as WitnessEntry);
    } catch {
      console.error(`[Black Box] Malformed entry at line ${i + 1} — skipping`);
    }
  }

  return entries;
}

/**
 * Verify the Black Box's own hash chain integrity.
 *
 * Walks every entry and re-computes:
 *   (a) The witness_hash for content integrity
 *   (b) The prev_witness_hash linkage for chain continuity
 *
 * O(n) operation — use for forensic checks, not polling.
 */
export function verifyWitnessChain(): WitnessChainVerification {
  const entries = getWitnessLog();

  if (entries.length === 0) {
    return {
      valid: true,
      total_entries: 0,
      verified_entries: 0,
      first_broken_index: null,
      break_detail: null,
    };
  }

  let prevHash = GENESIS_WITNESS;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];

    // ── Check (a): Linkage — prev_witness_hash must match previous entry ──
    if (entry.prev_witness_hash !== prevHash) {
      return {
        valid: false,
        total_entries: entries.length,
        verified_entries: i,
        first_broken_index: i,
        break_detail:
          `Linkage break at index ${i} (${entry.witness_id}): ` +
          `expected prev=${prevHash.slice(0, 16)}…, ` +
          `got prev=${entry.prev_witness_hash.slice(0, 16)}…`,
      };
    }

    // ── Check (b): Content — re-compute witness_hash ──
    const { witness_hash, ...partial } = entry;
    const recomputed = computeWitnessHash(partial);
    if (recomputed !== witness_hash) {
      return {
        valid: false,
        total_entries: entries.length,
        verified_entries: i,
        first_broken_index: i,
        break_detail:
          `Content tamper at index ${i} (${entry.witness_id}): ` +
          `expected hash=${recomputed.slice(0, 16)}…, ` +
          `got hash=${witness_hash.slice(0, 16)}…`,
      };
    }

    prevHash = witness_hash;
  }

  return {
    valid: true,
    total_entries: entries.length,
    verified_entries: entries.length,
    first_broken_index: null,
    break_detail: null,
  };
}
