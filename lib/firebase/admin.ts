import "server-only";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

import type { App, ServiceAccount } from "firebase-admin/app";

// Server-side only logging - only in development
const serverLog = (msg: string) => {
  if (process.env.NODE_ENV !== 'production') {
    console.log(msg);
  }
};

// =============================================================================
// SOVEREIGN FIREBASE ADMIN INITIALIZATION
// =============================================================================
// This module initializes Firebase Admin SDK using ONLY the environment variable.
// NO file system fallback. If SERVICE_ACCOUNT_JSON is missing or invalid, we fail
// loudly rather than triggering confusing ENOENT errors.
// =============================================================================

/**
 * Attempts to decode a string as Base64. Returns null if it's not valid Base64.
 */
function tryBase64Decode(value: string): string | null {
  // Base64 strings only contain these characters
  const base64Regex = /^[A-Za-z0-9+/=]+$/;

  // If it starts with '{', it's likely raw JSON, not Base64
  if (value.trim().startsWith("{")) {
    return null;
  }

  if (!base64Regex.test(value.trim())) {
    return null;
  }

  try {
    const decoded = Buffer.from(value, "base64").toString("utf-8");
    // Verify it produces valid JSON structure
    if (decoded.trim().startsWith("{")) {
      return decoded;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Parses the SERVICE_ACCOUNT_JSON environment variable.
 * Handles both raw JSON strings and Base64-encoded JSON.
 */
function parseServiceAccountJson(envValue: string): Record<string, unknown> {
  // First, try Base64 decode if it looks like Base64
  const base64Decoded = tryBase64Decode(envValue);
  if (base64Decoded) {
    serverLog("[Firebase Admin] Detected Base64-encoded service account.");
    return JSON.parse(base64Decoded);
  }

  // Otherwise, parse as raw JSON
  return JSON.parse(envValue);
}

/**
 * Maps raw JSON data (snake_case from Google) to ServiceAccount type (camelCase).
 * Validates that all required fields are present.
 */
function mapServiceAccount(rawData: Record<string, unknown>): ServiceAccount {
  const projectId = rawData.project_id ?? rawData.projectId;
  const clientEmail = rawData.client_email ?? rawData.clientEmail;
  const privateKey = rawData.private_key ?? rawData.privateKey;

  // Validate required fields
  if (typeof projectId !== "string" || !projectId) {
    throw new Error("Missing or invalid 'project_id' in service account JSON.");
  }
  if (typeof clientEmail !== "string" || !clientEmail) {
    throw new Error("Missing or invalid 'client_email' in service account JSON.");
  }
  if (typeof privateKey !== "string" || !privateKey) {
    throw new Error("Missing or invalid 'private_key' in service account JSON.");
  }

  // Fix escaped newlines in the private key (common when stored as env var)
  const fixedPrivateKey = privateKey.replace(/\\n/g, "\n");

  return {
    projectId,
    clientEmail,
    privateKey: fixedPrivateKey,
  };
}

/**
 * Loads and validates the service account from the environment variable.
 * Throws descriptive errors if anything is wrong.
 */
function loadServiceAccountFromEnv(): ServiceAccount {
  const envValue = process.env.SERVICE_ACCOUNT_JSON;

  if (!envValue) {
    throw new Error(
      "[Firebase Admin] SERVICE_ACCOUNT_JSON environment variable is not set.\n" +
      "Add it to your .env.local file with your Firebase service account JSON."
    );
  }

  if (envValue.trim().length === 0) {
    throw new Error(
      "[Firebase Admin] SERVICE_ACCOUNT_JSON is set but empty."
    );
  }

  try {
    const rawData = parseServiceAccountJson(envValue);
    const serviceAccount = mapServiceAccount(rawData);

    console.log(`[Firebase Admin] Loaded service account for project: ${serviceAccount.projectId}`);
    return serviceAccount;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `[Firebase Admin] Failed to parse SERVICE_ACCOUNT_JSON:\n${message}\n\n` +
      "Ensure the environment variable contains valid JSON (raw or Base64-encoded)."
    );
  }
}

/**
 * Initializes Firebase Admin SDK.
 * Uses singleton pattern - returns existing app if already initialized.
 */
function initAdmin(): App {
  // Return existing app if already initialized
  const existingApps = getApps();
  if (existingApps.length > 0) {
    return existingApps[0];
  }

  // Load from environment variable ONLY - no file fallback
  const serviceAccount = loadServiceAccountFromEnv();

  return initializeApp({
    credential: cert(serviceAccount),
  });
}

// Lazy initialization - only initialize when actually used at runtime
let _adminApp: App | null = null;

function getAdminApp(): App {
  if (_adminApp) return _adminApp;
  _adminApp = initAdmin();
  return _adminApp;
}

// Export getters that lazily initialize Firebase Admin
export const adminApp = new Proxy({} as App, {
  get(_target, prop) {
    return (getAdminApp() as unknown as Record<string, unknown>)[prop as string];
  }
});

export const adminDb = new Proxy({} as ReturnType<typeof getFirestore>, {
  get(_target, prop) {
    const db = getFirestore(getAdminApp());
    return (db as unknown as Record<string, unknown>)[prop as string];
  }
});

export const adminAuth = new Proxy({} as ReturnType<typeof getAuth>, {
  get(_target, prop) {
    const auth = getAuth(getAdminApp());
    return (auth as unknown as Record<string, unknown>)[prop as string];
  }
});
