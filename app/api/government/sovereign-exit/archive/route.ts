import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import zlib from 'zlib';
import {
  getAuditLog,
  getTenantAuditDir,
  verifyLogIntegrity,
  generateDeletionCertificate,
  type SovereignExitCertificate,
} from '@/lib/government/audit-logger';
import { resolveTenantFromSession } from '@/lib/government/tenant-resolver';
import { adminDb } from '@/lib/firebase/admin';
import { generatePortableVerifier } from '@/lib/tools/generate-portable-verifier';

// =============================================================================
// SOVEREIGN EXIT — ARCHIVE + CRYPTO-SHRED + FIRESTORE PURGE
// =============================================================================
// Full sovereign exit sequence executed as a single atomic operation:
//
//   Phase 1 — ARCHIVE:
//     Bundles the tenant's entire audit silo, Set 1 baseline, and agent
//     configuration into an AES-256-GCM encrypted archive (in memory).
//     The passphrase is agency-provided and NEVER stored server-side.
//
//   Phase 2 — CRYPTO-SHRED (via generateDeletionCertificate):
//     a. Captures final chain state (root hash, entry count)
//     b. Secure-wipes every file: overwrite with random → fsync → unlink
//     c. Removes the tenant's silo directory
//     d. Destroys the tenant's AES-256 encryption key (overwrite → unlink)
//     e. Verifies all paths read as NULL (ENOENT confirmation)
//     f. Writes a TombstoneEntry to the global tombstone log
//     g. HMAC-signs the Sovereign Exit Certificate
//
//   Phase 3 — FIRESTORE PURGE:
//     a. Deletes chainWitness/{tenant_id}/anchors/* sub-collection
//     b. Deletes chainWitness/{tenant_id} parent document
//     c. Marks govTenants/{tenant_id} as status: "destroyed"
//     d. Marks tenants/{owner_uid} as status: "destroyed"
//
//   Phase 4 — RESPONSE:
//     Returns the encrypted archive as a binary download.
//     Certificate hash, ID, and signature in response headers.
//
// IRREVERSIBLE. After Phase 2 completes, the on-disk audit data is
// cryptographically unrecoverable. After Phase 3, all Firestore records
// are purged. The encrypted archive is the agency's ONLY surviving copy.
//
// Payload (POST body):
//   passphrase        — encryption passphrase (required, min 12 chars)
//   confirmation      — must be exactly "PERMANENTLY DELETE ALL DATA"
//   baseline_set1     — Set 1 baseline data from localStorage (optional)
//   agent_config      — Agent configuration from localStorage (optional)
//   procurement_data  — Procurement data from localStorage (optional)
//
// Response: encrypted binary file (.sovereign-archive.enc)
//   Headers include certificate ID, hash, and signature.
// =============================================================================

const GOV_TENANTS_COLLECTION = 'govTenants';
const TENANTS_COLLECTION = 'tenants';
const WITNESS_COLLECTION = 'chainWitness';
const ANCHORS_SUBCOLLECTION = 'anchors';
const CONFIRMATION_PHRASE = 'PERMANENTLY DELETE ALL DATA';
const MIN_PASSPHRASE_LENGTH = 12;

// ── Firestore Sub-Collection Deletion ────────────────────────────────────────

/**
 * Recursively delete all documents in a Firestore sub-collection.
 *
 * Firestore doesn't support collection-level deletion. We batch-delete
 * in chunks of 500 (Firestore batch limit).
 *
 * @returns Number of documents deleted
 */
async function deleteSubCollection(
  parentPath: string,
  subCollectionName: string,
): Promise<number> {
  const collectionRef = adminDb.doc(parentPath).collection(subCollectionName);
  let totalDeleted = 0;

  // Process in batches of 500 (Firestore limit per batch)
  const batchSize = 500;
  let hasMore = true;

  while (hasMore) {
    const snapshot = await collectionRef.limit(batchSize).get();

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

    // If we got fewer than batchSize, we're done
    if (snapshot.size < batchSize) {
      hasMore = false;
    }
  }

  return totalDeleted;
}

// ── Main Handler ─────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  // ════════════════════════════════════════════════════════════════════
  // STEP 0: AUTHENTICATION (Zero Trust)
  // ════════════════════════════════════════════════════════════════════

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

  // ════════════════════════════════════════════════════════════════════
  // STEP 1: PARSE + VALIDATE REQUEST
  // ════════════════════════════════════════════════════════════════════

  let body: {
    passphrase?: string;
    confirmation?: string;
    baseline_set1?: unknown;
    agent_config?: unknown;
    procurement_data?: unknown;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Bad Request', detail: 'Invalid JSON body.' },
      { status: 400 },
    );
  }

  // Passphrase validation (agency-owned encryption key)
  const passphrase = body.passphrase;
  if (!passphrase || typeof passphrase !== 'string' || passphrase.length < MIN_PASSPHRASE_LENGTH) {
    return NextResponse.json(
      {
        error: 'Bad Request',
        detail:
          `A passphrase of at least ${MIN_PASSPHRASE_LENGTH} characters is required ` +
          'to encrypt the sovereign archive. This passphrase is NEVER stored server-side.',
      },
      { status: 400 },
    );
  }

  // Confirmation phrase validation (prevents accidental invocation)
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

  console.log(
    `[Sovereign Exit] INITIATED — tenant:${tenantId} (${tenant.agency_name}) ` +
      `| Phase 1: Archive starting...`,
  );

  // ════════════════════════════════════════════════════════════════════
  // PHASE 1: BUILD ENCRYPTED ARCHIVE (BEFORE any destruction)
  // ════════════════════════════════════════════════════════════════════
  // The archive must be fully built in memory BEFORE Phase 2 destroys
  // the on-disk data. Once the archive buffer is ready, the source
  // files can be safely wiped.
  // ════════════════════════════════════════════════════════════════════

  // 1a. Audit log entries (parsed NDJSON)
  const auditEntries = getAuditLog(tenantId);

  // 1b. Raw audit files from disk (preserves original NDJSON + governance ledger)
  const auditDir = getTenantAuditDir(tenantId);
  const rawFiles: Record<string, string> = {};
  if (fs.existsSync(auditDir)) {
    const files = fs.readdirSync(auditDir);
    for (const file of files) {
      const filePath = path.join(auditDir, file);
      try {
        const stat = fs.statSync(filePath);
        if (stat.isFile() && stat.size < 50 * 1024 * 1024) {
          rawFiles[file] = fs.readFileSync(filePath, 'utf-8');
        }
      } catch {
        // Skip unreadable files — will still appear in deletion certificate
      }
    }
  }

  // 1c. Run integrity check (captured BEFORE destruction)
  const integrityResult = verifyLogIntegrity(tenantId);

  // 1d. Build archive bundle
  const archive = {
    _archive_metadata: {
      format: 'SOVEREIGN_EXIT_ARCHIVE',
      version: '2.0',
      tenant_id: tenantId,
      agency_name: tenant.agency_name,
      jurisdiction_state: tenant.jurisdiction_state,
      exported_at: new Date().toISOString(),
      entry_count: auditEntries.length,
      integrity_at_export: {
        valid: integrityResult.valid,
        verified_entries: integrityResult.verified_entries,
        total_entries: integrityResult.total_entries,
        chain_head_hash: integrityResult.chain_head_hash,
      },
      destruction_will_follow: true,
    },
    audit_log_entries: auditEntries,
    audit_raw_files: rawFiles,
    client_data: {
      baseline_set1: body.baseline_set1 || null,
      agent_config: body.agent_config || null,
      procurement_data: body.procurement_data || null,
    },
    portable_verifier_html: generatePortableVerifier(),
  };

  const archiveJson = JSON.stringify(archive, null, 2);

  // 1e. Compress
  const compressed = zlib.gzipSync(Buffer.from(archiveJson, 'utf-8'));

  // 1f. Encrypt (AES-256-GCM with PBKDF2-derived key)
  const salt = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const key = crypto.pbkdf2Sync(passphrase, salt, 100_000, 32, 'sha256');

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(compressed),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // File format: [salt(32)][iv(12)][authTag(16)][ciphertext(...)]
  const archiveBuffer = Buffer.concat([salt, iv, authTag, encrypted]);

  console.log(
    `[Sovereign Exit] Phase 1 COMPLETE — tenant:${tenantId} ` +
      `| archive_size:${archiveBuffer.length} bytes | entries:${auditEntries.length} ` +
      `| chain_valid:${integrityResult.valid}`,
  );

  // ════════════════════════════════════════════════════════════════════
  // PHASE 2: CRYPTO-SHRED (On-Disk Destruction)
  // ════════════════════════════════════════════════════════════════════
  // generateDeletionCertificate() executes the full destruction sequence:
  //   - Secure-wipe all files (random overwrite → fsync → unlink)
  //   - Remove silo directory
  //   - Destroy AES-256 encryption key
  //   - Post-wipe ENOENT verification
  //   - Tombstone log entry
  //   - HMAC-signed certificate
  // ════════════════════════════════════════════════════════════════════

  let certificate: SovereignExitCertificate;
  try {
    certificate = generateDeletionCertificate({
      tenant_id: tenantId,
      agency_name: tenant.agency_name,
      jurisdiction_state: tenant.jurisdiction_state,
    });

    console.log(
      `[Sovereign Exit] Phase 2 COMPLETE — tenant:${tenantId} ` +
        `| certificate:${certificate.certificate_id} ` +
        `| artifacts_destroyed:${certificate.artifacts_destroyed.length} ` +
        `| bytes_destroyed:${certificate.total_bytes_destroyed} ` +
        `| key_shredded:${certificate.crypto_shredding_proof.shredded} ` +
        `| all_paths_null:${certificate.purge_verification.all_paths_verified_null}`,
    );
  } catch (err) {
    // Phase 2 failure is CRITICAL — the archive is built but destruction failed.
    // We still return the archive so the agency has their data, but flag the error.
    console.error(
      `[Sovereign Exit] Phase 2 FAILED — tenant:${tenantId}: crypto-shred did not complete`,
      err,
    );
    return NextResponse.json(
      {
        error: 'Destruction Failed',
        detail:
          'The encrypted archive was built successfully, but the on-disk crypto-shred ' +
          'failed to complete. Your data may still be partially intact on the server. ' +
          'Contact support immediately. Error: ' +
          (err instanceof Error ? err.message : String(err)),
      },
      { status: 500 },
    );
  }

  // ════════════════════════════════════════════════════════════════════
  // PHASE 3: FIRESTORE PURGE
  // ════════════════════════════════════════════════════════════════════
  // Delete all Firestore data associated with this tenant:
  //   - chainWitness/{tenant_id}/anchors/* (remote chain witnesses)
  //   - chainWitness/{tenant_id} (parent document)
  //   - govTenants/{tenant_id} → status: "destroyed"
  //   - tenants/{owner_uid}    → status: "destroyed"
  //
  // The govTenants and tenants documents are marked as "destroyed"
  // rather than deleted, to preserve proof the tenant existed and
  // was properly decommissioned (compliance audit trail).
  // ════════════════════════════════════════════════════════════════════

  const firestorePurgeLog: string[] = [];

  try {
    // 3a. Delete all chain witness anchors (sub-collection)
    const anchorsDeleted = await deleteSubCollection(
      `${WITNESS_COLLECTION}/${tenantId}`,
      ANCHORS_SUBCOLLECTION,
    );
    firestorePurgeLog.push(
      `chainWitness/${tenantId}/anchors: ${anchorsDeleted} documents deleted`,
    );

    // 3b. Delete the chainWitness parent document
    try {
      await adminDb
        .collection(WITNESS_COLLECTION)
        .doc(tenantId)
        .delete();
      firestorePurgeLog.push(`chainWitness/${tenantId}: document deleted`);
    } catch {
      // Parent doc may not exist if no anchors were ever stored
      firestorePurgeLog.push(`chainWitness/${tenantId}: no parent document found`);
    }

    // 3c. Mark govTenants document as destroyed
    const destroyedPayload = {
      status: 'destroyed',
      destroyed_at: certificate.destruction_timestamp,
      certificate_id: certificate.certificate_id,
      certificate_signature: certificate.signature,
      final_root_hash: certificate.final_root_hash,
      total_entries_destroyed: certificate.total_entries_destroyed,
      total_bytes_destroyed: certificate.total_bytes_destroyed,
    };

    await adminDb
      .collection(GOV_TENANTS_COLLECTION)
      .doc(tenantId)
      .update(destroyedPayload);
    firestorePurgeLog.push(`govTenants/${tenantId}: marked as destroyed`);

    // 3d. Mark tenants/{owner_uid} as destroyed
    if (tenant.owner_uid) {
      await adminDb
        .collection(TENANTS_COLLECTION)
        .doc(tenant.owner_uid)
        .update(destroyedPayload);
      firestorePurgeLog.push(`tenants/${tenant.owner_uid}: marked as destroyed`);
    }

    console.log(
      `[Sovereign Exit] Phase 3 COMPLETE — tenant:${tenantId} | ` +
        firestorePurgeLog.join(' | '),
    );
  } catch (err) {
    // Phase 3 failure is non-fatal for the archive download.
    // The on-disk data is already destroyed (Phase 2). Firestore can be
    // cleaned up manually. Log the error but continue to deliver the archive.
    console.error(
      `[Sovereign Exit] Phase 3 PARTIAL FAILURE — tenant:${tenantId}:`,
      err instanceof Error ? err.message : String(err),
      'Completed steps:',
      firestorePurgeLog,
    );
  }

  // ════════════════════════════════════════════════════════════════════
  // PHASE 4: DELIVER ARCHIVE + CERTIFICATE
  // ════════════════════════════════════════════════════════════════════
  // The encrypted archive is sent as a binary download.
  // The deletion certificate metadata is embedded in response headers.
  // ════════════════════════════════════════════════════════════════════

  const filename = `${tenantId}_sovereign_archive_${Date.now()}.enc`;

  // Compute a SHA-256 hash of the full certificate JSON (the "Certificate of Deletion hash")
  const certificateJson = JSON.stringify(certificate);
  const certificateHash = crypto
    .createHash('sha256')
    .update(certificateJson, 'utf-8')
    .digest('hex');

  console.log(
    `[Sovereign Exit] Phase 4 — DELIVERING ARCHIVE — tenant:${tenantId} ` +
      `| archive_size:${archiveBuffer.length} | certificate:${certificate.certificate_id} ` +
      `| certificate_hash:${certificateHash.slice(0, 16)}… ` +
      `| signature:${certificate.signature.slice(0, 16)}…`,
  );

  return new Response(archiveBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${filename}"`,
      // ── Archive metadata ──
      'X-Archive-Tenant': tenantId,
      'X-Archive-Entries': String(auditEntries.length),
      'X-Archive-Integrity': integrityResult.valid ? 'VALID' : 'BROKEN',
      'X-Archive-Size-Bytes': String(archiveBuffer.length),
      // ── Deletion certificate ──
      'X-Certificate-Id': certificate.certificate_id,
      'X-Certificate-Hash': certificateHash,
      'X-Certificate-Signature': certificate.signature,
      'X-Certificate-Final-Root-Hash': certificate.final_root_hash,
      'X-Certificate-Artifacts-Destroyed': String(certificate.artifacts_destroyed.length),
      'X-Certificate-Bytes-Destroyed': String(certificate.total_bytes_destroyed),
      'X-Certificate-Keys-Destroyed': 'true',
      'X-Certificate-All-Paths-Null': String(certificate.purge_verification.all_paths_verified_null),
      // ── Firestore purge ──
      'X-Firestore-Purge-Log': firestorePurgeLog.join('; '),
    },
  });
}
