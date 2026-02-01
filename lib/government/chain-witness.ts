import 'server-only';

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { adminDb } from '@/lib/firebase/admin';
import { verifyLogIntegrity } from '@/lib/government/audit-logger';

// =============================================================================
// REMOTE CHAIN WITNESS — "Daily Anchor" System
// =============================================================================
// Even if an attacker gains disk access and deletes or modifies the entire
// .ndjson file, a separately stored "anchor" proves what the chain state
// WAS at a specific point in time.
//
// Architecture:
//   1. captureChainAnchor()  — reads the local chain head for a single tenant
//   2. anchorAllTenants()    — discovers every tenant silo and captures anchors
//   3. storeAnchorRemote()   — writes the anchor to Firestore (separate DB)
//   4. getLatestAnchor()     — reads the most recent anchor from Firestore
//   5. verifyRemoteWitness() — compares local chain state against the anchor
//
// Firestore layout:
//   chainWitness/{tenant_id}/anchors/{anchor_id}
//
// The anchor's HMAC signature covers the entire payload, so the Firestore
// document itself is tamper-evident — if someone modifies the anchor in
// Firestore, the signature won't verify.
// =============================================================================

const WITNESS_COLLECTION = 'chainWitness';
const ANCHORS_SUBCOLLECTION = 'anchors';

// Signing key for anchor HMAC. In production, use a KMS-managed key
// that is NOT co-located with the audit data or the Firestore project.
const ANCHOR_SIGNING_KEY =
  process.env.ANCHOR_SIGNING_KEY || 'chain-witness-anchor-key-v1';

// Cron secret for authenticating the daily anchor endpoint.
// Set via CRON_SECRET environment variable (e.g. Vercel Cron).
export const CRON_SECRET = process.env.CRON_SECRET || '';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ChainAnchor {
  /** Unique anchor identifier */
  anchor_id: string;
  /** Tenant whose chain was witnessed */
  tenant_id: string;
  /** ISO-8601 date string (YYYY-MM-DD) for the anchor day */
  anchor_date: string;
  /** ISO-8601 timestamp of when the anchor was captured */
  anchored_at: string;
  /** The chain head hash (entry_hash of the last entry) at anchor time */
  chain_head_hash: string;
  /** Whether the chain was valid at anchor time */
  chain_valid: boolean;
  /** Number of hash-linked entries verified during the anchor capture */
  verified_entries: number;
  /** Total entries in the log at anchor time */
  total_entries: number;
  /** HMAC-SHA256 signature over the anchor body (tamper-evident) */
  signature: string;
}

export interface AnchorResult {
  tenant_id: string;
  status: 'anchored' | 'skipped' | 'error';
  anchor_id?: string;
  chain_head_hash?: string;
  error?: string;
}

export interface WitnessVerification {
  tenant_id: string;
  /** Whether local chain matches the remote anchor */
  witness_match: boolean;
  /** Current local chain head hash */
  local_chain_head: string;
  /** Anchored chain head hash from Firestore */
  remote_chain_head: string;
  /** The anchor record used for comparison */
  anchor: ChainAnchor | null;
  /** When the anchor was captured */
  anchor_date: string | null;
  /** Whether the local chain is currently intact */
  local_integrity_valid: boolean;
  /** Human-readable verdict */
  verdict: string;
}

// ── Anchor Capture ───────────────────────────────────────────────────────────

/**
 * Capture a chain anchor for a single tenant.
 *
 * Reads the local .ndjson chain, runs a full integrity verification, and
 * returns a signed anchor record. Does NOT store it — call storeAnchorRemote()
 * to persist to Firestore.
 */
export function captureChainAnchor(tenantId: string): ChainAnchor {
  const now = new Date();
  const anchorDate = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const integrityResult = verifyLogIntegrity(tenantId);

  const anchorBody = {
    anchor_id: `ANCHOR-${Date.now().toString(16).toUpperCase()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
    tenant_id: tenantId,
    anchor_date: anchorDate,
    anchored_at: now.toISOString(),
    chain_head_hash: integrityResult.chain_head_hash,
    chain_valid: integrityResult.valid,
    verified_entries: integrityResult.verified_entries,
    total_entries: integrityResult.total_entries,
  };

  // HMAC signature over sorted-key JSON (deterministic)
  const bodyJson = JSON.stringify(
    anchorBody,
    Object.keys(anchorBody).sort(),
  );
  const signature = crypto
    .createHmac('sha256', ANCHOR_SIGNING_KEY)
    .update(bodyJson, 'utf-8')
    .digest('hex');

  return { ...anchorBody, signature };
}

/**
 * Discover all tenant silos on disk and capture an anchor for each.
 *
 * Skips the `system` directory (admin logs) and the `archives` directory.
 * Returns an anchor for every tenant that has at least one log entry.
 */
export function discoverTenantIds(): string[] {
  const auditRoot = path.join(process.cwd(), 'data', 'audit');
  if (!fs.existsSync(auditRoot)) return [];

  const SKIP_DIRS = new Set(['system', 'archives']);

  return fs
    .readdirSync(auditRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !SKIP_DIRS.has(d.name))
    .map((d) => d.name);
}

/**
 * Capture chain anchors for ALL tenant silos on disk.
 */
export function captureAllAnchors(): ChainAnchor[] {
  const tenantIds = discoverTenantIds();
  return tenantIds.map((id) => captureChainAnchor(id));
}

// ── Remote Storage (Firestore) ───────────────────────────────────────────────

/**
 * Store a chain anchor in Firestore.
 *
 * Writes to: chainWitness/{tenant_id}/anchors/{anchor_id}
 *
 * This is intentionally a SEPARATE database from the .ndjson files on disk,
 * so an attacker who gains filesystem access cannot also erase the witness
 * records without separate Firestore credentials.
 */
export async function storeAnchorRemote(anchor: ChainAnchor): Promise<void> {
  await adminDb
    .collection(WITNESS_COLLECTION)
    .doc(anchor.tenant_id)
    .collection(ANCHORS_SUBCOLLECTION)
    .doc(anchor.anchor_id)
    .set({
      ...anchor,
      _written_at: new Date().toISOString(),
    });

  console.log(
    `[Chain Witness] Anchor stored → tenant:${anchor.tenant_id} | ` +
      `anchor:${anchor.anchor_id} | head:${anchor.chain_head_hash.slice(0, 16)}…`,
  );
}

/**
 * Anchor all tenants and store each anchor remotely.
 * Returns a summary of results per tenant.
 */
export async function anchorAllTenantsRemote(): Promise<AnchorResult[]> {
  const anchors = captureAllAnchors();
  const results: AnchorResult[] = [];

  for (const anchor of anchors) {
    try {
      await storeAnchorRemote(anchor);
      results.push({
        tenant_id: anchor.tenant_id,
        status: 'anchored',
        anchor_id: anchor.anchor_id,
        chain_head_hash: anchor.chain_head_hash,
      });
    } catch (err) {
      console.error(
        `[Chain Witness] Failed to store anchor for tenant:${anchor.tenant_id}:`,
        err instanceof Error ? err.message : String(err),
      );
      results.push({
        tenant_id: anchor.tenant_id,
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Tenants with no entries are already included via captureAllAnchors
  // (they'll have chain_head_hash = "GENESIS", total_entries = 0)
  return results;
}

// ── Remote Anchor Retrieval ──────────────────────────────────────────────────

/**
 * Read the most recent anchor for a tenant from Firestore.
 * Returns null if no anchor has ever been stored.
 */
export async function getLatestAnchor(
  tenantId: string,
): Promise<ChainAnchor | null> {
  const snapshot = await adminDb
    .collection(WITNESS_COLLECTION)
    .doc(tenantId)
    .collection(ANCHORS_SUBCOLLECTION)
    .orderBy('anchored_at', 'desc')
    .limit(1)
    .get();

  if (snapshot.empty) return null;

  const doc = snapshot.docs[0];
  const data = doc.data();

  return {
    anchor_id: data.anchor_id,
    tenant_id: data.tenant_id,
    anchor_date: data.anchor_date,
    anchored_at: data.anchored_at,
    chain_head_hash: data.chain_head_hash,
    chain_valid: data.chain_valid,
    verified_entries: data.verified_entries,
    total_entries: data.total_entries,
    signature: data.signature,
  };
}

/**
 * Read all anchors for a tenant from Firestore, newest first.
 */
export async function getAnchorHistory(
  tenantId: string,
): Promise<ChainAnchor[]> {
  const snapshot = await adminDb
    .collection(WITNESS_COLLECTION)
    .doc(tenantId)
    .collection(ANCHORS_SUBCOLLECTION)
    .orderBy('anchored_at', 'desc')
    .get();

  return snapshot.docs.map((doc) => {
    const d = doc.data();
    return {
      anchor_id: d.anchor_id,
      tenant_id: d.tenant_id,
      anchor_date: d.anchor_date,
      anchored_at: d.anchored_at,
      chain_head_hash: d.chain_head_hash,
      chain_valid: d.chain_valid,
      verified_entries: d.verified_entries,
      total_entries: d.total_entries,
      signature: d.signature,
    };
  });
}

// ── Anchor Signature Verification ────────────────────────────────────────────

/**
 * Verify that an anchor's HMAC signature is intact.
 *
 * If this returns false, the anchor record in Firestore has been tampered
 * with — someone modified the document after it was originally signed.
 */
export function verifyAnchorSignature(anchor: ChainAnchor): boolean {
  const { signature, ...body } = anchor;
  const bodyJson = JSON.stringify(body, Object.keys(body).sort());
  const expected = crypto
    .createHmac('sha256', ANCHOR_SIGNING_KEY)
    .update(bodyJson, 'utf-8')
    .digest('hex');

  return expected === signature;
}

// ── Remote Witness Verification ──────────────────────────────────────────────

/**
 * Verify a tenant's local chain against the most recent remote anchor.
 *
 * This is the core "proof" function. It answers:
 *   "Does the local chain's current state match what we witnessed remotely?"
 *
 * Possible verdicts:
 *   - MATCH:             Local chain head === remote anchor. Chain is intact.
 *   - CHAIN_EXTENDED:    Local chain has grown since the anchor (new entries
 *                        were appended). This is normal for active tenants.
 *   - TAMPER_DETECTED:   Local chain head differs from the anchor AND the
 *                        chain has NOT simply grown — entries were modified
 *                        or deleted.
 *   - ANCHOR_TAMPERED:   The anchor's HMAC signature is invalid — the
 *                        Firestore record itself was modified.
 *   - NO_ANCHOR:         No remote anchor exists for this tenant yet.
 *   - LOCAL_CHAIN_BROKEN: The local chain integrity check itself fails.
 */
export async function verifyRemoteWitness(
  tenantId: string,
): Promise<WitnessVerification> {
  // ── Step 1: Read the latest remote anchor ──
  const anchor = await getLatestAnchor(tenantId);

  if (!anchor) {
    const local = verifyLogIntegrity(tenantId);
    return {
      tenant_id: tenantId,
      witness_match: false,
      local_chain_head: local.chain_head_hash,
      remote_chain_head: 'NONE',
      anchor: null,
      anchor_date: null,
      local_integrity_valid: local.valid,
      verdict: 'NO_ANCHOR — No remote witness exists for this tenant. Run the daily anchor first.',
    };
  }

  // ── Step 2: Verify the anchor's own signature ──
  if (!verifyAnchorSignature(anchor)) {
    const local = verifyLogIntegrity(tenantId);
    return {
      tenant_id: tenantId,
      witness_match: false,
      local_chain_head: local.chain_head_hash,
      remote_chain_head: anchor.chain_head_hash,
      anchor,
      anchor_date: anchor.anchor_date,
      local_integrity_valid: local.valid,
      verdict: 'ANCHOR_TAMPERED — The remote anchor signature is invalid. The Firestore witness record was modified.',
    };
  }

  // ── Step 3: Run local integrity check ──
  const local = verifyLogIntegrity(tenantId);

  if (!local.valid) {
    return {
      tenant_id: tenantId,
      witness_match: false,
      local_chain_head: local.chain_head_hash,
      remote_chain_head: anchor.chain_head_hash,
      anchor,
      anchor_date: anchor.anchor_date,
      local_integrity_valid: false,
      verdict: `LOCAL_CHAIN_BROKEN — Local chain integrity failed at line ${local.first_broken_index}. ${local.break_detail}`,
    };
  }

  // ── Step 4: Compare chain heads ──
  if (local.chain_head_hash === anchor.chain_head_hash) {
    return {
      tenant_id: tenantId,
      witness_match: true,
      local_chain_head: local.chain_head_hash,
      remote_chain_head: anchor.chain_head_hash,
      anchor,
      anchor_date: anchor.anchor_date,
      local_integrity_valid: true,
      verdict: 'MATCH — Local chain head matches the remote witness. Chain of custody is intact.',
    };
  }

  // Heads differ — is this normal growth or tampering?
  // If local has MORE verified entries than the anchor recorded, the chain
  // has simply grown (new entries appended since the anchor was taken).
  if (local.total_entries > anchor.total_entries) {
    return {
      tenant_id: tenantId,
      witness_match: true,
      local_chain_head: local.chain_head_hash,
      remote_chain_head: anchor.chain_head_hash,
      anchor,
      anchor_date: anchor.anchor_date,
      local_integrity_valid: true,
      verdict: `CHAIN_EXTENDED — Chain has grown from ${anchor.total_entries} to ${local.total_entries} entries since the last anchor. This is normal for active tenants. Chain integrity is intact.`,
    };
  }

  // Entry count is equal or FEWER than the anchor — something was deleted
  // or modified. This is tamper evidence.
  return {
    tenant_id: tenantId,
    witness_match: false,
    local_chain_head: local.chain_head_hash,
    remote_chain_head: anchor.chain_head_hash,
    anchor,
    anchor_date: anchor.anchor_date,
    local_integrity_valid: local.valid,
    verdict: `TAMPER_DETECTED — Local chain head does not match the remote witness. Anchor recorded ${anchor.total_entries} entries with head "${anchor.chain_head_hash.slice(0, 16)}…", but local shows ${local.total_entries} entries with head "${local.chain_head_hash.slice(0, 16)}…". Data may have been deleted or rewritten.`,
  };
}
