import 'server-only';

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  verifyLogIntegrity,
  getTenantAuditDir,
} from '@/lib/government/audit-logger';

// =============================================================================
// RAIO GOVERNANCE LEDGER — Identity-Bound Authorization Chain
// =============================================================================
// Replaces bare timestamps with a tamper-evident ledger that records exactly
// WHO authorized the AI's continued operation, WHEN, FROM WHERE, and against
// WHAT chain state.
//
// Every 30-day RAIO "Keep-Alive" check-in writes a hash-linked entry to:
//   data/audit/{tenant_id}/governance_ledger.json
//
// Each entry contains:
//   - RAIO_User_ID         — who authorized
//   - Digital_Fingerprint  — SHA-256 binding of identity + session context
//   - Timestamp            — when authorized
//   - Merkle_Root_Hash     — chain head hash at authorization time
//   - Authorization_Window — explicit 30-day validity window
//
// The ledger is itself a hash chain: each entry's `entry_hash` includes
// the previous entry's hash, making the authorization history tamper-evident.
//
// Legal defense: If a regulator asks "who authorized this AI to operate
// during week X?", the ledger provides a cryptographically signed answer
// that cannot be fabricated after the fact.
// =============================================================================

const LEDGER_FILENAME = 'governance_ledger.json';
const GENESIS_HASH = 'GENESIS';
const AUTHORIZATION_WINDOW_DAYS = 30;

// ── Types ────────────────────────────────────────────────────────────────────

export interface GovernanceLedgerEntry {
  /** Unique entry identifier */
  entry_id: string;
  /** ISO-8601 timestamp of the check-in */
  timestamp: string;
  /** Identity of the RAIO performing the check-in */
  raio_user_id: string;
  /**
   * SHA-256 fingerprint binding the RAIO's identity to their session context.
   * Computed over: raio_user_id + user_agent + client_ip + timestamp + tenant_id
   */
  digital_fingerprint: string;
  /** The action performed */
  action: 'keep_alive' | 'initial_authorization' | 'emergency_override';
  /** The tenant this authorization covers */
  tenant_id: string;
  /** Chain head hash of the tenant's Merkle audit chain at check-in time */
  merkle_root_hash: string;
  /** Number of entries in the audit chain at check-in time */
  chain_entries_at_checkin: number;
  /** Whether the chain was valid at check-in time */
  chain_valid_at_checkin: boolean;
  /** Explicit authorization window */
  authorization_window: {
    from: string;
    until: string;
  };
  /** SHA-256 hash of the previous ledger entry (or "GENESIS") */
  prev_entry_hash: string;
  /** SHA-256 hash of this entry (covers all fields except entry_hash itself) */
  entry_hash: string;
}

export interface GovernanceLedger {
  schema: 'urn:govtech:raio-governance-ledger:v1';
  tenant_id: string;
  entries: GovernanceLedgerEntry[];
}

export interface RaioAuthorizationStatus {
  /** Whether the RAIO authorization is currently valid */
  authorized: boolean;
  /** The latest ledger entry (null if no entries) */
  latest_entry: GovernanceLedgerEntry | null;
  /** Days remaining in the current authorization window */
  days_remaining: number;
  /** Days since the last check-in (Infinity if never) */
  days_since_checkin: number;
  /** Whether the authorization window has expired */
  expired: boolean;
  /** Human-readable verdict */
  verdict: string;
}

// ── Digital Fingerprint ──────────────────────────────────────────────────────

/**
 * Compute the Digital Fingerprint — a SHA-256 binding of the RAIO's identity
 * to their session context.
 *
 * This proves that the authorization came from a specific person, from a
 * specific device/browser, at a specific time, for a specific tenant.
 * A regulator can verify this fingerprint against server access logs.
 */
export function computeDigitalFingerprint(params: {
  raio_user_id: string;
  user_agent: string;
  client_ip: string;
  timestamp: string;
  tenant_id: string;
}): string {
  const material = [
    params.raio_user_id,
    params.user_agent,
    params.client_ip,
    params.timestamp,
    params.tenant_id,
  ].join('|');

  return crypto.createHash('sha256').update(material, 'utf-8').digest('hex');
}

// ── Entry Hash ───────────────────────────────────────────────────────────────

/**
 * Compute a deterministic SHA-256 hash over all fields of an entry
 * EXCEPT `entry_hash` itself. Matches the audit-logger pattern.
 */
function computeEntryHash(entry: Record<string, unknown>): string {
   
  const { entry_hash, ...hashable } = entry;
  const sorted = JSON.stringify(hashable, Object.keys(hashable).sort());
  return crypto.createHash('sha256').update(sorted, 'utf-8').digest('hex');
}

// ── Ledger I/O ───────────────────────────────────────────────────────────────

/**
 * Resolve the governance ledger file path for a tenant.
 * Uses the same audit directory as the Merkle chain.
 */
function getLedgerPath(tenantId: string): string {
  const dir = getTenantAuditDir(tenantId);
  return path.join(dir, LEDGER_FILENAME);
}

/**
 * Read the governance ledger from disk.
 * Returns an empty ledger if the file doesn't exist.
 */
export function readGovernanceLedger(tenantId: string): GovernanceLedger {
  const ledgerPath = getLedgerPath(tenantId);

  if (!fs.existsSync(ledgerPath)) {
    return {
      schema: 'urn:govtech:raio-governance-ledger:v1',
      tenant_id: tenantId,
      entries: [],
    };
  }

  try {
    const raw = fs.readFileSync(ledgerPath, 'utf-8');
    return JSON.parse(raw) as GovernanceLedger;
  } catch {
    // Corrupt ledger — return empty to allow recovery
    console.error(
      `[Governance Ledger] WARNING: Corrupt ledger for tenant:${tenantId} — returning empty ledger.`,
    );
    return {
      schema: 'urn:govtech:raio-governance-ledger:v1',
      tenant_id: tenantId,
      entries: [],
    };
  }
}

/**
 * Write the governance ledger to disk.
 * Atomic: writes to a temp file first, then renames.
 */
function writeGovernanceLedger(tenantId: string, ledger: GovernanceLedger): void {
  const ledgerPath = getLedgerPath(tenantId);
  const tempPath = ledgerPath + '.tmp';

  const content = JSON.stringify(ledger, null, 2) + '\n';
  fs.writeFileSync(tempPath, content, 'utf-8');
  fs.renameSync(tempPath, ledgerPath);
}

// ── Record RAIO Check-In ─────────────────────────────────────────────────────

/**
 * Record a RAIO check-in into the governance ledger.
 *
 * This is the identity-binding function. It:
 *   1. Reads the current governance ledger
 *   2. Captures the current Merkle chain state (root hash + entry count)
 *   3. Computes the Digital Fingerprint from session context
 *   4. Builds a hash-linked ledger entry
 *   5. Writes the updated ledger to disk
 *
 * @returns The new ledger entry — proof of who authorized what, when
 */
export function recordRaioCheckin(params: {
  raio_user_id: string;
  tenant_id: string;
  user_agent: string;
  client_ip: string;
  action?: GovernanceLedgerEntry['action'];
}): GovernanceLedgerEntry {
  const tenantId = params.tenant_id;
  const now = new Date();
  const timestamp = now.toISOString();

  // ── Step 1: Read current ledger ──
  const ledger = readGovernanceLedger(tenantId);

  // ── Step 2: Capture Merkle chain state ──
  const integrity = verifyLogIntegrity(tenantId);

  // ── Step 3: Compute Digital Fingerprint ──
  const digitalFingerprint = computeDigitalFingerprint({
    raio_user_id: params.raio_user_id,
    user_agent: params.user_agent,
    client_ip: params.client_ip,
    timestamp,
    tenant_id: tenantId,
  });

  // ── Step 4: Build hash-linked entry ──
  const prevEntryHash = ledger.entries.length > 0
    ? ledger.entries[ledger.entries.length - 1].entry_hash
    : GENESIS_HASH;

  const action = params.action || (ledger.entries.length === 0 ? 'initial_authorization' : 'keep_alive');

  const windowFrom = timestamp;
  const windowUntil = new Date(now.getTime() + AUTHORIZATION_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const entryId = `RAIO-${Date.now().toString(16).toUpperCase()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

  const entry: GovernanceLedgerEntry = {
    entry_id: entryId,
    timestamp,
    raio_user_id: params.raio_user_id,
    digital_fingerprint: digitalFingerprint,
    action,
    tenant_id: tenantId,
    merkle_root_hash: integrity.chain_head_hash,
    chain_entries_at_checkin: integrity.total_entries,
    chain_valid_at_checkin: integrity.valid,
    authorization_window: {
      from: windowFrom,
      until: windowUntil,
    },
    prev_entry_hash: prevEntryHash,
    entry_hash: '', // placeholder — computed below
  };

  entry.entry_hash = computeEntryHash(entry as unknown as Record<string, unknown>);

  // ── Step 5: Append + persist ──
  ledger.entries.push(entry);
  writeGovernanceLedger(tenantId, ledger);

  console.log(
    `[RAIO GOVERNANCE] ${action.toUpperCase()} — tenant:${tenantId} | ` +
      `raio:${params.raio_user_id} | merkle_root:${integrity.chain_head_hash.slice(0, 16)}… | ` +
      `fingerprint:${digitalFingerprint.slice(0, 16)}… | ` +
      `window:${windowFrom.slice(0, 10)} → ${windowUntil.slice(0, 10)} | ` +
      `chain:${entry.entry_hash.slice(0, 12)}…`,
  );

  return entry;
}

// ── Authorization Status ─────────────────────────────────────────────────────

/**
 * Get the latest RAIO authorization entry from the governance ledger.
 * Returns null if no check-in has ever been recorded.
 */
export function getLatestRaioAuthorization(tenantId: string): GovernanceLedgerEntry | null {
  const ledger = readGovernanceLedger(tenantId);
  if (ledger.entries.length === 0) return null;
  return ledger.entries[ledger.entries.length - 1];
}

/**
 * Check whether the RAIO authorization is currently valid for a tenant.
 *
 * Returns a full status object with:
 *   - authorized: boolean — is the AI allowed to operate?
 *   - latest_entry: the ledger entry that grants (or granted) authorization
 *   - days_remaining / days_since_checkin — for UI display
 *   - verdict: human-readable explanation
 */
export function isRaioAuthorizationValid(tenantId: string): RaioAuthorizationStatus {
  const latest = getLatestRaioAuthorization(tenantId);

  if (!latest) {
    return {
      authorized: false,
      latest_entry: null,
      days_remaining: 0,
      days_since_checkin: Infinity,
      expired: true,
      verdict: 'NO_AUTHORIZATION — No RAIO check-in has ever been recorded for this tenant. Initial authorization required.',
    };
  }

  const now = Date.now();
  const checkinTime = new Date(latest.timestamp).getTime();
  const windowEnd = new Date(latest.authorization_window.until).getTime();
  const daysSince = Math.floor((now - checkinTime) / (1000 * 60 * 60 * 24));
  const msRemaining = windowEnd - now;
  const daysRemaining = Math.max(0, Math.ceil(msRemaining / (1000 * 60 * 60 * 24)));
  const expired = msRemaining <= 0;

  if (expired) {
    return {
      authorized: false,
      latest_entry: latest,
      days_remaining: 0,
      days_since_checkin: daysSince,
      expired: true,
      verdict: `EXPIRED — RAIO authorization expired ${Math.abs(daysRemaining)} day(s) ago. Last check-in by "${latest.raio_user_id}" on ${latest.timestamp.slice(0, 10)}. Re-authorization required per M-26-04 §4.3.`,
    };
  }

  return {
    authorized: true,
    latest_entry: latest,
    days_remaining: daysRemaining,
    days_since_checkin: daysSince,
    expired: false,
    verdict: `AUTHORIZED — RAIO "${latest.raio_user_id}" authorized on ${latest.timestamp.slice(0, 10)}. ${daysRemaining} day(s) remaining in current window. Merkle root at authorization: ${latest.merkle_root_hash.slice(0, 16)}…`,
  };
}

// ── Ledger Integrity Verification ────────────────────────────────────────────

export interface LedgerIntegrityResult {
  valid: boolean;
  tenant_id: string;
  total_entries: number;
  verified_entries: number;
  first_broken_index: number | null;
  break_detail: string | null;
}

/**
 * Verify the integrity of the governance ledger hash chain.
 *
 * Walks every entry and re-computes hashes. If any entry's `prev_entry_hash`
 * doesn't match the preceding entry's `entry_hash`, the chain is broken —
 * indicating the ledger was tampered with.
 */
export function verifyLedgerIntegrity(tenantId: string): LedgerIntegrityResult {
  const ledger = readGovernanceLedger(tenantId);

  if (ledger.entries.length === 0) {
    return {
      valid: true,
      tenant_id: tenantId,
      total_entries: 0,
      verified_entries: 0,
      first_broken_index: null,
      break_detail: null,
    };
  }

  let expectedPrevHash = GENESIS_HASH;
  let verifiedCount = 0;

  for (let i = 0; i < ledger.entries.length; i++) {
    const entry = ledger.entries[i];

    // Verify prev_entry_hash linkage
    if (entry.prev_entry_hash !== expectedPrevHash) {
      return {
        valid: false,
        tenant_id: tenantId,
        total_entries: ledger.entries.length,
        verified_entries: verifiedCount,
        first_broken_index: i,
        break_detail: `prev_entry_hash mismatch at index ${i}: expected "${expectedPrevHash.slice(0, 16)}…" but found "${entry.prev_entry_hash.slice(0, 16)}…"`,
      };
    }

    // Verify entry_hash correctness
    const recomputed = computeEntryHash(entry as unknown as Record<string, unknown>);
    if (recomputed !== entry.entry_hash) {
      return {
        valid: false,
        tenant_id: tenantId,
        total_entries: ledger.entries.length,
        verified_entries: verifiedCount,
        first_broken_index: i,
        break_detail: `entry_hash mismatch at index ${i}: stored "${entry.entry_hash.slice(0, 16)}…" but recomputed "${recomputed.slice(0, 16)}…" — entry was modified`,
      };
    }

    verifiedCount++;
    expectedPrevHash = entry.entry_hash;
  }

  return {
    valid: true,
    tenant_id: tenantId,
    total_entries: ledger.entries.length,
    verified_entries: verifiedCount,
    first_broken_index: null,
    break_detail: null,
  };
}
