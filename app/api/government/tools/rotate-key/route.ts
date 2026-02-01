import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { adminDb } from '@/lib/firebase/admin';
import { resolveTenantFromSession } from '@/lib/government/tenant-resolver';
import { getTenantLogPath } from '@/lib/government/audit-logger';
import {
  loadTenantKey,
  hasTenantKey,
  encryptLine,
  decryptLine,
  isEncryptedLine,
} from '@/lib/government/tenant-key-manager';

// =============================================================================
// AES-256-GCM KEY ROTATION — Re-Key Pipeline
// =============================================================================
// Generates a new AES-256 key for the tenant, re-encrypts every NDJSON line
// in the audit log with the new key, and atomically swaps both the log file
// and the key file on disk.
//
// Sequence:
//   1. Load current key + read raw NDJSON lines
//   2. Decrypt all ENC: lines → plaintext JSON strings
//   3. Generate new 32-byte AES-256 key
//   4. Re-encrypt every plaintext line with the new key
//   5. Atomic write: NDJSON file (.tmp → rename)
//   6. Atomic write: key file (.tmp → rename)
//   7. Record rotation timestamp in Firestore (govTenants)
//   8. Audit trail entry
//
// Authentication: Session-based via resolveTenantFromSession (Zero Trust).
// =============================================================================

const GOV_TENANTS_COLLECTION = 'govTenants';
const KEYS_ROOT = path.join(process.cwd(), 'data', 'keys');

export async function POST(req: Request) {
  // ── Resolve tenant from session ──
  const tenant = await resolveTenantFromSession(req);

  if (!tenant) {
    return NextResponse.json(
      { error: 'Unauthorized', detail: 'No active tenant resolved from session.' },
      { status: 401 },
    );
  }

  if (tenant.status === 'suspended') {
    return NextResponse.json(
      { error: 'Forbidden', detail: 'Tenant is suspended. Key rotation is blocked.' },
      { status: 403 },
    );
  }

  // ── Validate current key exists ──
  if (!hasTenantKey(tenant.tenant_id)) {
    return NextResponse.json(
      {
        error: 'Precondition Failed',
        detail: 'No encryption key exists for this tenant. Key may have been crypto-shredded.',
      },
      { status: 412 },
    );
  }

  const oldKey = loadTenantKey(tenant.tenant_id);
  if (!oldKey) {
    return NextResponse.json(
      { error: 'Internal Server Error', detail: 'Key file exists but could not be loaded.' },
      { status: 500 },
    );
  }

  // ── Read raw NDJSON lines ──
  const logPath = getTenantLogPath(tenant.tenant_id);
  let rawLines: string[] = [];

  if (fs.existsSync(logPath)) {
    const content = fs.readFileSync(logPath, 'utf-8');
    rawLines = content.split('\n').filter(Boolean);
  }

  // ── Decrypt all lines → plaintext ──
  const plaintextLines: string[] = [];
  try {
    for (const line of rawLines) {
      if (isEncryptedLine(line)) {
        plaintextLines.push(decryptLine(line, oldKey));
      } else {
        // Plaintext line (pre-encryption) — keep as-is for re-encryption
        plaintextLines.push(line);
      }
    }
  } catch (err) {
    return NextResponse.json(
      {
        error: 'Decryption Failed',
        detail:
          'Could not decrypt one or more audit entries with the current key. ' +
          (err instanceof Error ? err.message : String(err)),
      },
      { status: 500 },
    );
  }

  // ── Generate new AES-256 key ──
  const newKeyBytes = crypto.randomBytes(32);
  const newKeyHex = newKeyBytes.toString('hex');

  // ── Re-encrypt all lines with new key ──
  const reEncryptedLines: string[] = [];
  for (const pt of plaintextLines) {
    reEncryptedLines.push(encryptLine(pt, newKeyBytes));
  }

  // ── Atomic write: NDJSON file ──
  const logTmpPath = logPath + '.rotate.tmp';
  try {
    fs.writeFileSync(logTmpPath, reEncryptedLines.join('\n') + (reEncryptedLines.length ? '\n' : ''), 'utf-8');
    fs.renameSync(logTmpPath, logPath);
  } catch (err) {
    // Cleanup tmp file on failure
    try { fs.unlinkSync(logTmpPath); } catch { /* ignore */ }
    return NextResponse.json(
      {
        error: 'Write Failed',
        detail: 'Failed to write re-encrypted audit log. Original data is intact. ' +
          (err instanceof Error ? err.message : String(err)),
      },
      { status: 500 },
    );
  }

  // ── Atomic write: key file ──
  const safeId = tenant.tenant_id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || '_global';
  const keyPath = path.join(KEYS_ROOT, `${safeId}.key`);
  const keyTmpPath = keyPath + '.rotate.tmp';
  try {
    fs.writeFileSync(keyTmpPath, newKeyHex, { encoding: 'utf-8', mode: 0o600 });
    fs.renameSync(keyTmpPath, keyPath);
  } catch (err) {
    // Key write failed but audit log is already re-encrypted with new key.
    // Write the new key directly as a fallback to prevent data loss.
    try {
      fs.writeFileSync(keyPath, newKeyHex, { encoding: 'utf-8', mode: 0o600 });
    } catch {
      return NextResponse.json(
        {
          error: 'Critical: Key Write Failed',
          detail:
            'Audit log was re-encrypted with a new key, but the key could not be persisted. ' +
            'CONTACT SUPPORT IMMEDIATELY. New key (hex): ' + newKeyHex,
        },
        { status: 500 },
      );
    }
  }

  // ── Update Firestore with rotation timestamp ──
  const rotatedAt = new Date().toISOString();
  const rotatedBy = tenant.authorized_emails?.[0] || 'unknown';

  try {
    await adminDb.collection(GOV_TENANTS_COLLECTION).doc(tenant.tenant_id).update({
      last_key_rotation: rotatedAt,
      last_key_rotated_by: rotatedBy,
    });
  } catch (err) {
    // Non-fatal: rotation succeeded on disk even if Firestore update fails
    console.error(
      `[Key Rotation] Firestore timestamp update failed for tenant:${tenant.tenant_id}:`,
      err instanceof Error ? err.message : String(err),
    );
  }

  console.log(
    `[Key Rotation] tenant:${tenant.tenant_id} | entries:${rawLines.length} re-encrypted | by:${rotatedBy}`,
  );

  return NextResponse.json({
    status: 'rotated',
    tenant_id: tenant.tenant_id,
    entries_re_encrypted: rawLines.length,
    rotated_at: rotatedAt,
    rotated_by: rotatedBy,
    message: 'AES-256-GCM key rotation complete. All audit entries re-encrypted with new key.',
  });
}

// ── GET: Fetch rotation metadata ──
export async function GET(req: Request) {
  const tenant = await resolveTenantFromSession(req);

  if (!tenant) {
    return NextResponse.json(
      { error: 'Unauthorized', detail: 'No active tenant resolved from session.' },
      { status: 401 },
    );
  }

  try {
    const doc = await adminDb.collection(GOV_TENANTS_COLLECTION).doc(tenant.tenant_id).get();
    const data = doc.data();

    return NextResponse.json({
      tenant_id: tenant.tenant_id,
      has_key: hasTenantKey(tenant.tenant_id),
      last_key_rotation: data?.last_key_rotation || null,
      last_key_rotated_by: data?.last_key_rotated_by || null,
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
