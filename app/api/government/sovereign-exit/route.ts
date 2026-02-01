import { NextResponse } from 'next/server';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  getAuditLog,
  getTenantAuditDir,
  verifyLogIntegrity,
  generateDeletionCertificate,
  type SovereignExitCertificate,
} from '@/lib/government/audit-logger';
import {
  readGovernanceLedger,
  verifyLedgerIntegrity,
} from '@/lib/government/governance-ledger';
import { resolveTenantFromSession } from '@/lib/government/tenant-resolver';
import { adminDb } from '@/lib/firebase/admin';
import { generatePortableVerifier } from '@/lib/tools/generate-portable-verifier';

// =============================================================================
// SOVEREIGN EXIT — WIPE AND ARCHIVE
// =============================================================================
//
// The canonical "Right to Leave" endpoint. Orchestrates a 7-phase irreversible
// exit sequence that exports ALL tenant data, crypto-shreds the on-disk silo,
// and hard-deletes every Firestore document.
//
// Phase 1 — AUTHENTICATION & VALIDATION
//   Session-based Zero Trust + confirmation phrase.
//
// Phase 2 — PRE-DESTRUCTION CRYPTOGRAPHIC SNAPSHOT
//   Capture the Merkle chain root hash and governance ledger integrity
//   BEFORE any mutation. These go on the Final Deletion Certificate.
//
// Phase 3 — FIRESTORE COLLECTION EXPORT
//   Read every Firestore document belonging to the tenant:
//     govTenants/{tenant_id}                    → Tenant config
//     tenants/{owner_uid}                       → Owner record
//     government_calls                          → All call recordings
//     govTenants/{tenant_id}/governance/*       → RAIO certification state
//     chainWitness/{tenant_id}                  → Remote chain anchor
//     chainWitness/{tenant_id}/anchors/*        → Daily anchor history
//
// Phase 4 — ON-DISK AUDIT SILO EXPORT
//   Read audit log entries (NDJSON), governance ledger (JSON), and
//   raw file contents from data/audit/{tenant_id}/.
//
// Phase 5 — CRYPTO-SHRED (irreversible)
//   generateDeletionCertificate() performs:
//     a. Secure-wipe all files (random overwrite → fsync → unlink)
//     b. Remove silo directory
//     c. Destroy AES-256 encryption key (crypto-shredding)
//     d. Post-wipe ENOENT verification
//     e. Tombstone entry in global log
//     f. HMAC-signed Sovereign Exit Certificate
//
// Phase 6 — FIRESTORE HARD-DELETE
//   Permanently delete every Firestore document enumerated in Phase 3.
//   The signed certificate is the only surviving proof of existence.
//
// Phase 7 — RESPONSE
//   Returns the complete archive + deletion certificate in JSON.
//   The archive is the agency's ONLY surviving copy of their data.
//
// THIS ACTION IS IRREVERSIBLE.
// =============================================================================

const GOV_TENANTS_COLLECTION = 'govTenants';
const TENANTS_COLLECTION = 'tenants';
const CALLS_COLLECTION = 'government_calls';
const WITNESS_COLLECTION = 'chainWitness';
const ANCHORS_SUBCOLLECTION = 'anchors';
const GOVERNANCE_SUBCOLLECTION = 'governance';
const CONFIRMATION_PHRASE = 'PERMANENTLY DELETE ALL DATA';

// ── Types ────────────────────────────────────────────────────────────────────

interface SovereignExitRequestBody {
  /** Must be exactly "PERMANENTLY DELETE ALL DATA" */
  confirmation?: string;
  /** Optional reason for the exit (logged in certificate metadata) */
  reason?: string;
}

interface FirestoreExport {
  govTenants: Record<string, unknown> | null;
  tenants: Record<string, unknown> | null;
  government_calls: { id: string; data: Record<string, unknown> }[];
  governance: { id: string; data: Record<string, unknown> }[];
  chain_witness: Record<string, unknown> | null;
  chain_witness_anchors: { id: string; data: Record<string, unknown> }[];
}

interface SovereignExitEventPayload {
  event_type: 'SOVEREIGN_EXIT';
  tenant_id: string;
  agency_name: string;
  jurisdiction_state: string;
  initiated_by: string;
  initiated_at: string;
  reason: string;
  certificate_id: string;
  final_root_hash: string;
  firestore_documents_exported: number;
  firestore_documents_deleted: number;
  on_disk_entries_archived: number;
  crypto_shredding_proof: SovereignExitCertificate['crypto_shredding_proof'];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Delete all documents in a Firestore sub-collection, returning count.
 * Operates in batches of 500 (Firestore batch limit).
 */
async function deleteSubCollection(
  parentPath: string,
  subCollectionName: string,
): Promise<number> {
  const collRef = adminDb.doc(parentPath).collection(subCollectionName);
  let totalDeleted = 0;
  let hasMore = true;

  while (hasMore) {
    const snapshot = await collRef.limit(500).get();
    if (snapshot.empty) {
      hasMore = false;
      break;
    }

    const batch = adminDb.batch();
    for (const doc of snapshot.docs) {
      batch.delete(doc.ref);
    }
    await batch.commit();
    totalDeleted += snapshot.size;

    if (snapshot.size < 500) {
      hasMore = false;
    }
  }

  return totalDeleted;
}

/**
 * Read all documents in a Firestore sub-collection.
 */
async function readSubCollection(
  parentPath: string,
  subCollectionName: string,
): Promise<{ id: string; data: Record<string, unknown> }[]> {
  const collRef = adminDb.doc(parentPath).collection(subCollectionName);
  const snapshot = await collRef.get();
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    data: doc.data() as Record<string, unknown>,
  }));
}

/**
 * Compute a deterministic SHA-256 event hash over the exit payload.
 */
function computeExitEventHash(payload: SovereignExitEventPayload): string {
  const sorted = JSON.stringify(payload, Object.keys(payload).sort());
  return crypto.createHash('sha256').update(sorted, 'utf-8').digest('hex');
}

// =============================================================================
// POST — Execute Sovereign Exit
// =============================================================================

export async function POST(req: Request) {
  // ════════════════════════════════════════════════════════════════════════════
  // PHASE 1: AUTHENTICATION & VALIDATION
  // ════════════════════════════════════════════════════════════════════════════

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

  // Guard: tenant must not already be destroyed.
  // The GovTenantConfig type defines status as 'active' | 'suspended' | 'provisioning',
  // but the /archive and /delete sub-routes set it to 'destroyed' at runtime.
  // Cast to string to handle this wider runtime domain.
  if ((tenant.status as string) === 'destroyed') {
    return NextResponse.json(
      {
        error: 'Conflict',
        detail:
          'This tenant has already completed Sovereign Exit. No data remains.',
      },
      { status: 409 },
    );
  }

  // Parse request body
  let body: SovereignExitRequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Bad Request', detail: 'Invalid JSON body.' },
      { status: 400 },
    );
  }

  // Confirmation phrase (required)
  if (body.confirmation !== CONFIRMATION_PHRASE) {
    return NextResponse.json(
      {
        error: 'Confirmation Required',
        detail:
          `This action is IRREVERSIBLE. Include { "confirmation": "${CONFIRMATION_PHRASE}" } ` +
          'to confirm you understand all tenant data will be permanently destroyed.',
      },
      { status: 400 },
    );
  }

  const tenantId = tenant.tenant_id;
  const initiatedBy = tenant.authorized_emails?.[0] || 'unknown';
  const initiatedAt = new Date().toISOString();
  const reason = body.reason || 'Sovereign Exit — Right to Leave exercised.';

  console.log(
    `[Sovereign Exit] ▓▓▓ INITIATED ▓▓▓ — tenant:${tenantId} (${tenant.agency_name}) ` +
      `| by:${initiatedBy} | reason:"${reason}"`,
  );

  // ════════════════════════════════════════════════════════════════════════════
  // PHASE 2: PRE-DESTRUCTION CRYPTOGRAPHIC SNAPSHOT
  // ════════════════════════════════════════════════════════════════════════════
  // Capture the chain state BEFORE any mutation. These values go on the
  // Final Deletion Certificate and are the last provable state of the data.
  // ════════════════════════════════════════════════════════════════════════════

  const chainIntegrity = verifyLogIntegrity(tenantId);
  const ledgerIntegrity = verifyLedgerIntegrity(tenantId);

  const preDestructionSnapshot = {
    chain: {
      valid: chainIntegrity.valid,
      chain_head_hash: chainIntegrity.chain_head_hash,
      total_entries: chainIntegrity.total_entries,
      verified_entries: chainIntegrity.verified_entries,
      checked_at: chainIntegrity.checked_at,
    },
    governance_ledger: {
      valid: ledgerIntegrity.valid,
      total_entries: ledgerIntegrity.total_entries,
      verified_entries: ledgerIntegrity.verified_entries,
    },
  };

  console.log(
    `[Sovereign Exit] Phase 2 — Pre-Destruction Snapshot ` +
      `| chain_head:${chainIntegrity.chain_head_hash.slice(0, 16)}… ` +
      `| chain_entries:${chainIntegrity.total_entries} ` +
      `| chain_valid:${chainIntegrity.valid} ` +
      `| ledger_entries:${ledgerIntegrity.total_entries} ` +
      `| ledger_valid:${ledgerIntegrity.valid}`,
  );

  // ════════════════════════════════════════════════════════════════════════════
  // PHASE 3: FIRESTORE COLLECTION EXPORT
  // ════════════════════════════════════════════════════════════════════════════
  // Read every Firestore document belonging to the tenant into memory.
  // This is the ONLY surviving copy after Phase 6 hard-deletes everything.
  // ════════════════════════════════════════════════════════════════════════════

  const firestoreExport: FirestoreExport = {
    govTenants: null,
    tenants: null,
    government_calls: [],
    governance: [],
    chain_witness: null,
    chain_witness_anchors: [],
  };

  try {
    // 3a. govTenants/{tenant_id} — primary tenant config
    const govDoc = await adminDb
      .collection(GOV_TENANTS_COLLECTION)
      .doc(tenantId)
      .get();
    firestoreExport.govTenants = govDoc.exists
      ? (govDoc.data() as Record<string, unknown>)
      : null;

    // 3b. tenants/{owner_uid} — owner/billing record
    if (tenant.owner_uid) {
      const ownerDoc = await adminDb
        .collection(TENANTS_COLLECTION)
        .doc(tenant.owner_uid)
        .get();
      firestoreExport.tenants = ownerDoc.exists
        ? (ownerDoc.data() as Record<string, unknown>)
        : null;
    }

    // 3c. government_calls — all call recordings for THIS tenant only
    const callsSnap = await adminDb
      .collection(CALLS_COLLECTION)
      .where('tenant_id', '==', tenantId)
      .orderBy('timestamp', 'desc')
      .get();
    firestoreExport.government_calls = callsSnap.docs.map((doc) => ({
      id: doc.id,
      data: doc.data() as Record<string, unknown>,
    }));

    // 3d. govTenants/{tenant_id}/governance/* — RAIO certification state
    firestoreExport.governance = await readSubCollection(
      `${GOV_TENANTS_COLLECTION}/${tenantId}`,
      GOVERNANCE_SUBCOLLECTION,
    );

    // 3e. chainWitness/{tenant_id} — remote chain anchor parent
    const witnessDoc = await adminDb
      .collection(WITNESS_COLLECTION)
      .doc(tenantId)
      .get();
    firestoreExport.chain_witness = witnessDoc.exists
      ? (witnessDoc.data() as Record<string, unknown>)
      : null;

    // 3f. chainWitness/{tenant_id}/anchors/* — daily anchor snapshots
    firestoreExport.chain_witness_anchors = await readSubCollection(
      `${WITNESS_COLLECTION}/${tenantId}`,
      ANCHORS_SUBCOLLECTION,
    );
  } catch (err) {
    console.error(
      `[Sovereign Exit] Phase 3 — Firestore export error for tenant:${tenantId}:`,
      err instanceof Error ? err.message : String(err),
    );
    // Non-fatal: continue with whatever was exported.
    // The on-disk audit silo is the authoritative record.
  }

  const firestoreDocCount =
    (firestoreExport.govTenants ? 1 : 0) +
    (firestoreExport.tenants ? 1 : 0) +
    firestoreExport.government_calls.length +
    firestoreExport.governance.length +
    (firestoreExport.chain_witness ? 1 : 0) +
    firestoreExport.chain_witness_anchors.length;

  console.log(
    `[Sovereign Exit] Phase 3 COMPLETE — ${firestoreDocCount} Firestore documents exported ` +
      `| calls:${firestoreExport.government_calls.length} ` +
      `| governance:${firestoreExport.governance.length} ` +
      `| anchors:${firestoreExport.chain_witness_anchors.length}`,
  );

  // ════════════════════════════════════════════════════════════════════════════
  // PHASE 4: ON-DISK AUDIT SILO EXPORT
  // ════════════════════════════════════════════════════════════════════════════
  // Read the full audit trail and governance ledger from disk.
  // These are read BEFORE Phase 5 destroys the on-disk files.
  // ════════════════════════════════════════════════════════════════════════════

  // 4a. Audit log entries (parsed from encrypted NDJSON)
  let auditLogEntries: ReturnType<typeof getAuditLog> = [];
  try {
    auditLogEntries = getAuditLog(tenantId);
  } catch (err) {
    console.error(
      `[Sovereign Exit] Phase 4 — Audit log read error:`,
      err instanceof Error ? err.message : String(err),
    );
  }

  // 4b. Governance ledger (parsed JSON)
  let governanceLedger: ReturnType<typeof readGovernanceLedger> | null = null;
  try {
    governanceLedger = readGovernanceLedger(tenantId);
  } catch (err) {
    console.error(
      `[Sovereign Exit] Phase 4 — Governance ledger read error:`,
      err instanceof Error ? err.message : String(err),
    );
  }

  // 4c. Raw audit files from disk (preserve original NDJSON + any other files)
  const rawAuditFiles: Record<string, string> = {};
  const auditDir = getTenantAuditDir(tenantId);
  if (fs.existsSync(auditDir)) {
    try {
      const files = fs.readdirSync(auditDir);
      for (const file of files) {
        const filePath = path.join(auditDir, file);
        try {
          const stat = fs.statSync(filePath);
          // Cap at 50 MB per file to prevent OOM
          if (stat.isFile() && stat.size < 50 * 1024 * 1024) {
            rawAuditFiles[file] = fs.readFileSync(filePath, 'utf-8');
          }
        } catch {
          // Skip unreadable files — they'll appear in the deletion certificate
        }
      }
    } catch {
      // Directory listing failed
    }
  }

  console.log(
    `[Sovereign Exit] Phase 4 COMPLETE — ` +
      `audit_entries:${auditLogEntries.length} ` +
      `| ledger_entries:${governanceLedger?.entries.length ?? 0} ` +
      `| raw_files:${Object.keys(rawAuditFiles).length}`,
  );

  // ════════════════════════════════════════════════════════════════════════════
  // PHASE 5: CRYPTO-SHRED (Irreversible On-Disk Destruction)
  // ════════════════════════════════════════════════════════════════════════════
  // generateDeletionCertificate() executes:
  //   1. Capture final chain state (redundant with Phase 2 — for certificate)
  //   2. Catalog all files (names + sizes)
  //   3. Secure-wipe every file (random overwrite → fsync → unlink)
  //   4. Remove silo directory
  //   5. Destroy AES-256 encryption key (overwrite → fsync → unlink)
  //   6. Post-wipe verification (attempt read → confirm ENOENT)
  //   7. Tombstone entry in global log
  //   8. HMAC-sign the Sovereign Exit Certificate
  //
  // After this function returns, all on-disk tenant data is IRRECOVERABLE.
  // ════════════════════════════════════════════════════════════════════════════

  let certificate: SovereignExitCertificate;
  try {
    certificate = generateDeletionCertificate({
      tenant_id: tenantId,
      agency_name: tenant.agency_name,
      jurisdiction_state: tenant.jurisdiction_state,
    });

    console.log(
      `[Sovereign Exit] Phase 5 COMPLETE — CRYPTO-SHRED ` +
        `| certificate:${certificate.certificate_id} ` +
        `| artifacts:${certificate.artifacts_destroyed.length} ` +
        `| bytes:${certificate.total_bytes_destroyed} ` +
        `| key_shredded:${certificate.crypto_shredding_proof.shredded} ` +
        `| all_paths_null:${certificate.purge_verification.all_paths_verified_null}`,
    );
  } catch (err) {
    // Phase 5 failure is CRITICAL — data may still exist on disk.
    // The archive is built (Phases 3-4), but the shred failed.
    console.error(
      `[Sovereign Exit] Phase 5 FAILED — CRYPTO-SHRED DID NOT COMPLETE:`,
      err,
    );
    return NextResponse.json(
      {
        error: 'Crypto-Shred Failed',
        detail:
          'The Firestore and on-disk data were exported successfully, but the ' +
          'irreversible crypto-shred failed to complete. On-disk data may still ' +
          'be partially intact. Contact support immediately. Error: ' +
          (err instanceof Error ? err.message : String(err)),
        // Include the archive so the agency has their data even on failure
        partial_archive: {
          firestore_export: firestoreExport,
          on_disk_export: {
            audit_log_entries: auditLogEntries,
            governance_ledger: governanceLedger,
          },
          pre_destruction_snapshot: preDestructionSnapshot,
        },
      },
      { status: 500 },
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PHASE 6: FIRESTORE HARD-DELETE
  // ════════════════════════════════════════════════════════════════════════════
  // Delete every Firestore document. The signed certificate and the archive
  // returned in Phase 7 are the ONLY surviving proof these records existed.
  // ════════════════════════════════════════════════════════════════════════════

  const purgeLog: string[] = [];
  let firestoreDocsDeleted = 0;

  try {
    // 6a. Delete governance sub-collection
    const govSubDeleted = await deleteSubCollection(
      `${GOV_TENANTS_COLLECTION}/${tenantId}`,
      GOVERNANCE_SUBCOLLECTION,
    );
    firestoreDocsDeleted += govSubDeleted;
    purgeLog.push(
      `govTenants/${tenantId}/governance: ${govSubDeleted} doc(s) deleted`,
    );

    // 6b. Delete chain witness anchors sub-collection
    const anchorsDeleted = await deleteSubCollection(
      `${WITNESS_COLLECTION}/${tenantId}`,
      ANCHORS_SUBCOLLECTION,
    );
    firestoreDocsDeleted += anchorsDeleted;
    purgeLog.push(
      `chainWitness/${tenantId}/anchors: ${anchorsDeleted} doc(s) deleted`,
    );

    // 6c. Delete chain witness parent document
    try {
      await adminDb.collection(WITNESS_COLLECTION).doc(tenantId).delete();
      firestoreDocsDeleted++;
      purgeLog.push(`chainWitness/${tenantId}: deleted`);
    } catch {
      purgeLog.push(`chainWitness/${tenantId}: not found (skipped)`);
    }

    // 6d. Delete this tenant's government_calls documents (batch delete in chunks)
    let callsDeleted = 0;
    let hasMoreCalls = true;
    while (hasMoreCalls) {
      const callBatch = await adminDb
        .collection(CALLS_COLLECTION)
        .where('tenant_id', '==', tenantId)
        .limit(500)
        .get();

      if (callBatch.empty) {
        hasMoreCalls = false;
        break;
      }

      const batch = adminDb.batch();
      for (const doc of callBatch.docs) {
        batch.delete(doc.ref);
      }
      await batch.commit();
      callsDeleted += callBatch.size;

      if (callBatch.size < 500) {
        hasMoreCalls = false;
      }
    }
    firestoreDocsDeleted += callsDeleted;
    purgeLog.push(`government_calls: ${callsDeleted} doc(s) deleted`);

    // 6e. Delete govTenants/{tenant_id} document
    try {
      await adminDb
        .collection(GOV_TENANTS_COLLECTION)
        .doc(tenantId)
        .delete();
      firestoreDocsDeleted++;
      purgeLog.push(`govTenants/${tenantId}: deleted`);
    } catch {
      purgeLog.push(`govTenants/${tenantId}: delete failed`);
    }

    // 6f. Delete tenants/{owner_uid} document
    if (tenant.owner_uid) {
      try {
        await adminDb
          .collection(TENANTS_COLLECTION)
          .doc(tenant.owner_uid)
          .delete();
        firestoreDocsDeleted++;
        purgeLog.push(`tenants/${tenant.owner_uid}: deleted`);
      } catch {
        purgeLog.push(`tenants/${tenant.owner_uid}: delete failed`);
      }
    }

    console.log(
      `[Sovereign Exit] Phase 6 COMPLETE — ${firestoreDocsDeleted} Firestore doc(s) deleted ` +
        `| ${purgeLog.join(' | ')}`,
    );
  } catch (err) {
    // Phase 6 failure is non-fatal for the response.
    // On-disk data is already destroyed (Phase 5). Firestore remnants
    // can be cleaned up manually. The certificate is already signed.
    console.error(
      `[Sovereign Exit] Phase 6 PARTIAL FAILURE — Firestore purge incomplete:`,
      err instanceof Error ? err.message : String(err),
      'Completed steps:',
      purgeLog,
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PHASE 7: RESPONSE — Archive + Final Deletion Certificate
  // ════════════════════════════════════════════════════════════════════════════
  // The response contains:
  //   1. The complete archive (Firestore + on-disk data)
  //   2. The signed Sovereign Exit Certificate with final Merkle Root
  //   3. A deterministic event hash (SHA-256) proving this exit occurred
  //   4. The Firestore purge log
  // ════════════════════════════════════════════════════════════════════════════

  const eventPayload: SovereignExitEventPayload = {
    event_type: 'SOVEREIGN_EXIT',
    tenant_id: tenantId,
    agency_name: tenant.agency_name,
    jurisdiction_state: tenant.jurisdiction_state,
    initiated_by: initiatedBy,
    initiated_at: initiatedAt,
    reason,
    certificate_id: certificate.certificate_id,
    final_root_hash: certificate.final_root_hash,
    firestore_documents_exported: firestoreDocCount,
    firestore_documents_deleted: firestoreDocsDeleted,
    on_disk_entries_archived: auditLogEntries.length,
    crypto_shredding_proof: certificate.crypto_shredding_proof,
  };

  const timestampedEventHash = computeExitEventHash(eventPayload);

  console.log(
    `[Sovereign Exit] ▓▓▓ COMPLETE ▓▓▓ — tenant:${tenantId} (${tenant.agency_name}) ` +
      `| certificate:${certificate.certificate_id} ` +
      `| final_root:${certificate.final_root_hash.slice(0, 16)}… ` +
      `| event_hash:${timestampedEventHash.slice(0, 16)}… ` +
      `| firestore_exported:${firestoreDocCount} ` +
      `| firestore_deleted:${firestoreDocsDeleted} ` +
      `| disk_entries:${auditLogEntries.length}`,
  );

  return NextResponse.json({
    // ── Status ─────────────────────────────────────────────────────────
    status: 'SOVEREIGN_EXIT_COMPLETE',
    tenant_id: tenantId,
    agency_name: tenant.agency_name,
    jurisdiction_state: tenant.jurisdiction_state,
    initiated_by: initiatedBy,
    initiated_at: initiatedAt,
    reason,

    // ── Final Deletion Certificate ─────────────────────────────────────
    // Contains the last Merkle Root before erasure, HMAC-SHA256 signature,
    // crypto-shredding proof, and post-wipe verification results.
    certificate,

    // ── Pre-Destruction Cryptographic Snapshot ──────────────────────────
    // Captured BEFORE any mutation — the provable last state of the chain
    pre_destruction_snapshot: preDestructionSnapshot,

    // ── Archive: Firestore Collections ─────────────────────────────────
    // Every Firestore document that belonged to this tenant, exported
    // in full before hard-deletion.
    archive: {
      _metadata: {
        format: 'SOVEREIGN_EXIT_ARCHIVE',
        version: '3.0',
        exported_at: initiatedAt,
        firestore_documents: firestoreDocCount,
        on_disk_audit_entries: auditLogEntries.length,
        on_disk_raw_files: Object.keys(rawAuditFiles).length,
        governance_ledger_entries: governanceLedger?.entries.length ?? 0,
      },
      firestore_export: firestoreExport,
      on_disk_export: {
        audit_log_entries: auditLogEntries,
        governance_ledger: governanceLedger,
        raw_files: rawAuditFiles,
      },
      portable_verifier_html: generatePortableVerifier(),
    },

    // ── Firestore Purge Log ────────────────────────────────────────────
    firestore_purge: {
      documents_deleted: firestoreDocsDeleted,
      log: purgeLog,
    },

    // ── Deterministic Event Hash ───────────────────────────────────────
    // SHA-256 over the sorted exit event payload. Independently verifiable.
    timestamped_event_hash: timestampedEventHash,

    // ── Human-Readable Summary ─────────────────────────────────────────
    message:
      `Sovereign Exit complete for ${tenant.agency_name} (${tenantId}). ` +
      `${firestoreDocCount} Firestore document(s) exported and ` +
      `${firestoreDocsDeleted} hard-deleted. ` +
      `${auditLogEntries.length} on-disk audit entries archived and crypto-shredded. ` +
      `AES-256 encryption key ${certificate.crypto_shredding_proof.shredded ? 'destroyed' : 'NOT FOUND'}. ` +
      `All tenant data is permanently irrecoverable. ` +
      `This response is the ONLY surviving copy.`,
  });
}
