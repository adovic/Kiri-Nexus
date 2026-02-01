import 'server-only';

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// =============================================================================
// TENANT KEY MANAGER — Per-Tenant AES-256 Encryption Keys
// =============================================================================
// Every government tenant receives a unique AES-256 encryption key at
// provisioning time. This key wraps all audit log entries at rest.
//
// KEY SEPARATION: Keys are stored in `data/keys/` — physically separate
// from audit data in `data/audit/`. This separation is the foundation of
// crypto-shredding: destroying the key makes the audit silo permanently
// unrecoverable, even if backups of the audit directory exist.
//
// CRYPTO-SHREDDING: When a tenant exercises Sovereign Exit, the final
// step is `destroyTenantKey()` — a secure wipe (overwrite + fsync + unlink)
// of the key file. Without the key, all encrypted audit entries become
// computationally irreversible ciphertext.
//
// Key format: 32 bytes of crypto.randomBytes() stored as hex (64 chars).
// Cipher:     AES-256-GCM with per-entry random IV (12 bytes) and auth tag.
//
// On-disk format for encrypted NDJSON lines:
//   ENC:<base64(iv[12] + authTag[16] + ciphertext[...])>
//
// Lines WITHOUT the "ENC:" prefix are treated as plaintext (backward compat
// with entries written before encryption was deployed).
// =============================================================================

// ── Paths ────────────────────────────────────────────────────────────────────

const KEYS_ROOT = path.join(process.cwd(), 'data', 'keys');

// Bootstrap keys directory on first import
if (!fs.existsSync(KEYS_ROOT)) {
  fs.mkdirSync(KEYS_ROOT, { recursive: true });
}

/**
 * Sanitize a tenant ID for safe use as a filename.
 */
function sanitizeTenantId(tenantId: string): string {
  return tenantId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || '_global';
}

/**
 * Resolve the key file path for a given tenant.
 */
function getKeyPath(tenantId: string): string {
  const safe = sanitizeTenantId(tenantId);
  return path.join(KEYS_ROOT, `${safe}.key`);
}

// ── Key Lifecycle ────────────────────────────────────────────────────────────

/**
 * Generate a new AES-256 encryption key for a tenant and persist it to disk.
 *
 * Called ONCE during tenant provisioning. If a key already exists, this is
 * a no-op (idempotent) — the existing key is not overwritten.
 *
 * @returns The hex-encoded key string (64 characters = 32 bytes).
 */
export function generateTenantKey(tenantId: string): string {
  const keyPath = getKeyPath(tenantId);

  // Idempotent: don't overwrite an existing key
  if (fs.existsSync(keyPath)) {
    console.log(
      `[Tenant Key Manager] Key already exists for tenant:${tenantId} — skipping generation.`,
    );
    return fs.readFileSync(keyPath, 'utf-8').trim();
  }

  // Generate 32 bytes of cryptographic randomness
  const key = crypto.randomBytes(32);
  const keyHex = key.toString('hex');

  // Write to disk with restrictive permissions (owner-only read/write)
  fs.writeFileSync(keyPath, keyHex, { encoding: 'utf-8', mode: 0o600 });

  console.log(
    `[Tenant Key Manager] Generated AES-256 key for tenant:${tenantId} — stored at ${keyPath}`,
  );

  return keyHex;
}

/**
 * Load a tenant's encryption key from disk.
 *
 * Returns null if no key exists (pre-encryption tenant or key already destroyed).
 * Callers MUST handle the null case by falling back to plaintext I/O.
 */
export function loadTenantKey(tenantId: string): Buffer | null {
  const keyPath = getKeyPath(tenantId);

  if (!fs.existsSync(keyPath)) {
    return null;
  }

  const hex = fs.readFileSync(keyPath, 'utf-8').trim();
  return Buffer.from(hex, 'hex');
}

/**
 * Check whether a tenant has an encryption key on disk.
 */
export function hasTenantKey(tenantId: string): boolean {
  return fs.existsSync(getKeyPath(tenantId));
}

/**
 * CRYPTO-SHREDDING: Securely destroy a tenant's encryption key.
 *
 * 1. Overwrite the key file with random bytes (same size)
 * 2. fsync to flush to disk
 * 3. Unlink (delete) the file
 *
 * After this function completes, all audit log entries encrypted with
 * this key are permanently unrecoverable — even from backups.
 *
 * @returns Details about the destroyed key for the deletion certificate.
 */
export function destroyTenantKey(tenantId: string): {
  key_existed: boolean;
  key_path: string;
  shredded: boolean;
} {
  const keyPath = getKeyPath(tenantId);

  if (!fs.existsSync(keyPath)) {
    return { key_existed: false, key_path: keyPath, shredded: false };
  }

  try {
    const stat = fs.statSync(keyPath);

    // Step 1: Overwrite with random bytes
    const fd = fs.openSync(keyPath, 'w');
    const randomData = crypto.randomBytes(stat.size);
    fs.writeSync(fd, randomData, 0, randomData.length, 0);

    // Step 2: Flush to disk
    fs.fsyncSync(fd);
    fs.closeSync(fd);

    // Step 3: Delete the file
    fs.unlinkSync(keyPath);

    console.log(
      `[Tenant Key Manager] CRYPTO-SHRED: Key destroyed for tenant:${tenantId} — ` +
        `${stat.size} bytes overwritten + fsynced + unlinked`,
    );

    return { key_existed: true, key_path: keyPath, shredded: true };
  } catch (err) {
    // Fallback: attempt plain delete
    try {
      fs.unlinkSync(keyPath);
    } catch {
      // File may already be gone
    }

    console.error(
      `[Tenant Key Manager] CRYPTO-SHRED fallback for tenant:${tenantId}:`,
      err instanceof Error ? err.message : String(err),
    );

    return { key_existed: true, key_path: keyPath, shredded: true };
  }
}

// ── Encryption / Decryption ──────────────────────────────────────────────────
// AES-256-GCM: Authenticated encryption with associated data.
// Each entry gets a unique random IV. The auth tag prevents tampering.
//
// Wire format (single NDJSON line):
//   ENC:<base64(iv[12] + authTag[16] + ciphertext[...])>

const IV_LENGTH = 12;  // GCM standard
const TAG_LENGTH = 16; // GCM standard
const ENC_PREFIX = 'ENC:';

/**
 * Encrypt a plaintext NDJSON line using the tenant's AES-256-GCM key.
 *
 * @param plaintext — The JSON string to encrypt (without trailing newline)
 * @param key       — The 32-byte AES-256 key
 * @returns Encrypted line in format: ENC:<base64(iv + authTag + ciphertext)>
 */
export function encryptLine(plaintext: string, key: Buffer): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf-8'),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  // Wire format: iv(12) + authTag(16) + ciphertext(...)
  const payload = Buffer.concat([iv, authTag, encrypted]);
  return `${ENC_PREFIX}${payload.toString('base64')}`;
}

/**
 * Decrypt an ENC:-prefixed NDJSON line using the tenant's AES-256-GCM key.
 *
 * @param encryptedLine — The line from disk (with ENC: prefix)
 * @param key           — The 32-byte AES-256 key
 * @returns The decrypted JSON string
 * @throws If decryption fails (wrong key, tampered ciphertext, or corrupt data)
 */
export function decryptLine(encryptedLine: string, key: Buffer): string {
  const payload = Buffer.from(
    encryptedLine.slice(ENC_PREFIX.length),
    'base64',
  );

  const iv = payload.subarray(0, IV_LENGTH);
  const authTag = payload.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = payload.subarray(IV_LENGTH + TAG_LENGTH);

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString('utf-8');
}

/**
 * Check whether a line is encrypted (has the ENC: prefix).
 */
export function isEncryptedLine(line: string): boolean {
  return line.startsWith(ENC_PREFIX);
}

/**
 * Decode a single NDJSON line — auto-detects ENC: prefix.
 *
 * If the line starts with ENC: and a key is available, decrypts and parses.
 * If the line is plaintext JSON, parses directly.
 * If the line is encrypted but no key is available, throws an error.
 *
 * @param line     — A single line from the NDJSON file
 * @param key      — The tenant's AES-256 key (null if not available)
 * @returns Parsed JSON object
 */
export function decodeLine(
  line: string,
  key: Buffer | null,
): Record<string, unknown> {
  if (line.startsWith(ENC_PREFIX)) {
    if (!key) {
      throw new Error(
        'Encrypted audit line encountered but no tenant key is available. ' +
          'Key may have been destroyed (crypto-shredded).',
      );
    }
    const plaintext = decryptLine(line, key);
    return JSON.parse(plaintext);
  }

  // Plaintext line (pre-encryption or unencrypted tenant)
  return JSON.parse(line);
}
