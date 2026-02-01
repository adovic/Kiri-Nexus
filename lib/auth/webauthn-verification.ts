// =============================================================================
// WEBAUTHN (FIDO2) HARDWARE KEY VERIFICATION — Sovereign Guard
// =============================================================================
//
// Client-side utility for WebAuthn hardware key registration and user presence
// verification. Used to gate high-stakes operational controls (Sovereign Exit,
// Key Rotation) with a physical "tap" from a FIDO2 security key.
//
// Security model:
//   Layer 1 — Session auth (server-side, cookie-based identity)
//   Layer 2 — WebAuthn (client-side, hardware possession + presence)
//
// The session cookie proves IDENTITY ("who are you?").
// The hardware key proves POSSESSION + PRESENCE ("are you physically here?").
//
// This utility uses the native Web Authentication API (navigator.credentials).
// No third-party libraries required — TypeScript DOM lib provides full types.
//
// Credential storage: localStorage (keyed per origin). The credential ID is
// a public identifier — the private key never leaves the hardware authenticator.
//
// Exports:
//   isWebAuthnSupported()     — Feature detection
//   registerHardwareKey()     — FIDO2 credential creation ceremony
//   verifyHardwarePresence()  — User presence assertion ceremony
//   hasRegisteredKey()        — Check if a credential is stored
//   getRegistration()         — Read stored credential metadata
//   clearRegistration()       — Remove stored credential
// =============================================================================

// ── Types ────────────────────────────────────────────────────────────────────

export interface WebAuthnRegistration {
  credentialId: string;      // base64url-encoded credential ID
  publicKey: string;         // base64url-encoded public key (SPKI)
  transports: string[];      // e.g. ["usb", "nfc", "ble", "internal"]
  registeredAt: string;      // ISO-8601
  userId: string;            // The user identity used during registration
  displayName: string;       // Human-readable display name
}

export interface WebAuthnAssertion {
  credentialId: string;      // base64url credential that signed the challenge
  authenticatorData: string; // base64url authenticator data
  signature: string;         // base64url signature
  clientDataJSON: string;    // base64url client data
  userPresent: boolean;      // UP flag from authenticator data
  userVerified: boolean;     // UV flag from authenticator data
  timestamp: string;         // ISO-8601 when assertion was captured
}

export class WebAuthnError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'NOT_SUPPORTED'
      | 'NO_CREDENTIAL'
      | 'CEREMONY_ABORTED'
      | 'PRESENCE_FAILED'
      | 'REGISTRATION_FAILED'
      | 'INVALID_RESPONSE',
  ) {
    super(message);
    this.name = 'WebAuthnError';
  }
}

// ── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'kiri_nexus_webauthn_credential';

const RELYING_PARTY = {
  name: 'Kiri Nexus Sovereign Guard',
};

/**
 * Supported public key algorithms (in order of preference):
 *   -7  = ES256 (ECDSA w/ SHA-256) — preferred for hardware keys
 *   -257 = RS256 (RSASSA-PKCS1-v1_5 w/ SHA-256) — wide compatibility
 */
const PUB_KEY_CRED_PARAMS: PublicKeyCredentialParameters[] = [
  { type: 'public-key', alg: -7 },
  { type: 'public-key', alg: -257 },
];

const CEREMONY_TIMEOUT = 120_000; // 2 minutes for hardware key tap

// ── ArrayBuffer ↔ Base64URL Encoding ─────────────────────────────────────────

function bufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlToBuffer(base64url: string): ArrayBuffer {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// ── Authenticator Data Flag Parsing ──────────────────────────────────────────
// https://www.w3.org/TR/webauthn-2/#sctn-authenticator-data
// Byte 32 (index 32) of authenticator data is the flags byte:
//   Bit 0 (0x01) = User Present (UP)
//   Bit 2 (0x04) = User Verified (UV)

function parseAuthFlags(authData: ArrayBuffer): { up: boolean; uv: boolean } {
  const view = new Uint8Array(authData);
  if (view.length < 33) {
    return { up: false, uv: false };
  }
  const flags = view[32];
  return {
    up: (flags & 0x01) !== 0,
    uv: (flags & 0x04) !== 0,
  };
}

// ── Feature Detection ────────────────────────────────────────────────────────

/**
 * Check if the current browser supports WebAuthn.
 * Returns false in SSR (no window) or legacy browsers.
 */
export function isWebAuthnSupported(): boolean {
  if (typeof window === 'undefined') return false;
  if (!window.PublicKeyCredential) return false;
  if (!navigator.credentials) return false;
  return typeof navigator.credentials.create === 'function' &&
    typeof navigator.credentials.get === 'function';
}

// ── Credential Storage (localStorage) ────────────────────────────────────────

/**
 * Check if a hardware key credential is registered in this browser.
 */
export function hasRegisteredKey(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw !== null;
  } catch {
    return false;
  }
}

/**
 * Retrieve the stored credential registration metadata.
 * Returns null if no credential is registered.
 */
export function getRegistration(): WebAuthnRegistration | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as WebAuthnRegistration;
  } catch {
    return null;
  }
}

/**
 * Remove the stored credential from this browser.
 * The credential on the hardware key is NOT affected — only the
 * local reference is removed. Re-registration is required to use
 * the key again.
 */
export function clearRegistration(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Swallow — localStorage may be unavailable in private mode
  }
}

// ── Registration Ceremony ────────────────────────────────────────────────────

/**
 * Register a FIDO2 hardware key credential.
 *
 * Invokes `navigator.credentials.create()` with the relying party set to
 * the current origin. The user must physically interact with their security
 * key (USB tap, NFC tap, or biometric) to complete the ceremony.
 *
 * The credential ID and public key are stored in localStorage for future
 * verification ceremonies. The private key never leaves the authenticator.
 *
 * @param userId    — Unique user identifier (e.g. Firebase UID)
 * @param displayName — Human-readable name (e.g. email address)
 * @throws WebAuthnError if the ceremony fails or is aborted
 */
export async function registerHardwareKey(
  userId: string,
  displayName: string,
): Promise<WebAuthnRegistration> {
  if (!isWebAuthnSupported()) {
    throw new WebAuthnError(
      'WebAuthn is not supported in this browser. ' +
        'Use Chrome, Edge, Firefox, or Safari with a FIDO2 security key.',
      'NOT_SUPPORTED',
    );
  }

  // Generate a random challenge (32 bytes)
  const challenge = new Uint8Array(32);
  crypto.getRandomValues(challenge);

  // Encode userId as bytes
  const userIdBytes = new TextEncoder().encode(userId);

  // Exclude already-registered credentials to prevent duplicates
  const existingReg = getRegistration();
  const excludeCredentials: PublicKeyCredentialDescriptor[] = existingReg
    ? [
        {
          type: 'public-key',
          id: base64urlToBuffer(existingReg.credentialId),
        },
      ]
    : [];

  const createOptions: PublicKeyCredentialCreationOptions = {
    rp: {
      name: RELYING_PARTY.name,
      id: window.location.hostname,
    },
    user: {
      id: userIdBytes,
      name: displayName,
      displayName,
    },
    challenge: challenge.buffer,
    pubKeyCredParams: PUB_KEY_CRED_PARAMS,
    timeout: CEREMONY_TIMEOUT,
    authenticatorSelection: {
      // 'cross-platform' prefers external hardware keys (USB/NFC/BLE)
      // but does not exclude platform authenticators (Touch ID, Windows Hello)
      authenticatorAttachment: 'cross-platform',
      userVerification: 'preferred',
      residentKey: 'discouraged',
    },
    attestation: 'none', // We don't need attestation verification
    excludeCredentials,
  };

  let credential: PublicKeyCredential;
  try {
    const result = await navigator.credentials.create({
      publicKey: createOptions,
    });

    if (!result || !(result instanceof PublicKeyCredential)) {
      throw new WebAuthnError(
        'Hardware key registration returned an invalid response.',
        'INVALID_RESPONSE',
      );
    }

    credential = result;
  } catch (err) {
    if (err instanceof WebAuthnError) throw err;

    // DOMException name="NotAllowedError" = user cancelled/timed out
    if (err instanceof DOMException && err.name === 'NotAllowedError') {
      throw new WebAuthnError(
        'Hardware key registration was cancelled or timed out. ' +
          'Please try again and tap your security key when prompted.',
        'CEREMONY_ABORTED',
      );
    }

    throw new WebAuthnError(
      `Hardware key registration failed: ${err instanceof Error ? err.message : String(err)}`,
      'REGISTRATION_FAILED',
    );
  }

  // Extract the attestation response
  const attestation = credential.response as AuthenticatorAttestationResponse;

  // Get transport hints (if available)
  const transports: string[] =
    typeof attestation.getTransports === 'function'
      ? attestation.getTransports()
      : [];

  // Get the public key (SPKI format, if available)
  let publicKeyB64 = '';
  if (typeof attestation.getPublicKey === 'function') {
    const pubKeyBuffer = attestation.getPublicKey();
    if (pubKeyBuffer) {
      publicKeyB64 = bufferToBase64url(pubKeyBuffer);
    }
  }

  const registration: WebAuthnRegistration = {
    credentialId: bufferToBase64url(credential.rawId),
    publicKey: publicKeyB64,
    transports,
    registeredAt: new Date().toISOString(),
    userId,
    displayName,
  };

  // Persist to localStorage
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(registration));
  } catch (err) {
    console.error('[WebAuthn] Failed to persist credential to localStorage:', err);
    // Non-fatal — the registration object is still returned
  }

  console.log(
    `[WebAuthn] Hardware key registered: ${registration.credentialId.slice(0, 16)}… ` +
      `| transports: [${transports.join(', ')}] | user: ${displayName}`,
  );

  return registration;
}

// ── User Presence Verification Ceremony ──────────────────────────────────────

/**
 * Verify hardware key user presence.
 *
 * Invokes `navigator.credentials.get()` with a random challenge. The user
 * must physically tap their security key to produce a signed assertion.
 *
 * This is the gate function — call it BEFORE executing any high-stakes
 * API call. If the returned assertion has `userPresent === true`, the
 * operator has physically confirmed the action with their hardware key.
 *
 * @param operationLabel — Human-readable label for audit logging
 *   (e.g. "sovereign-exit", "rotate-keys")
 * @throws WebAuthnError if no credential is registered, the ceremony fails,
 *   or the user presence flag is not set
 */
export async function verifyHardwarePresence(
  operationLabel: string,
): Promise<WebAuthnAssertion> {
  if (!isWebAuthnSupported()) {
    throw new WebAuthnError(
      'WebAuthn is not supported in this browser.',
      'NOT_SUPPORTED',
    );
  }

  const registration = getRegistration();
  if (!registration) {
    throw new WebAuthnError(
      'No hardware key is registered. Register a FIDO2 security key first.',
      'NO_CREDENTIAL',
    );
  }

  // Generate a random challenge (32 bytes)
  const challenge = new Uint8Array(32);
  crypto.getRandomValues(challenge);

  const getOptions: PublicKeyCredentialRequestOptions = {
    challenge: challenge.buffer,
    timeout: CEREMONY_TIMEOUT,
    rpId: window.location.hostname,
    allowCredentials: [
      {
        type: 'public-key',
        id: base64urlToBuffer(registration.credentialId),
        transports: registration.transports as AuthenticatorTransport[],
      },
    ],
    userVerification: 'preferred',
  };

  let credential: PublicKeyCredential;
  try {
    const result = await navigator.credentials.get({
      publicKey: getOptions,
    });

    if (!result || !(result instanceof PublicKeyCredential)) {
      throw new WebAuthnError(
        'Hardware key verification returned an invalid response.',
        'INVALID_RESPONSE',
      );
    }

    credential = result;
  } catch (err) {
    if (err instanceof WebAuthnError) throw err;

    if (err instanceof DOMException && err.name === 'NotAllowedError') {
      throw new WebAuthnError(
        'Hardware key verification was cancelled or timed out. ' +
          'Please try again and tap your security key when prompted.',
        'CEREMONY_ABORTED',
      );
    }

    throw new WebAuthnError(
      `Hardware key verification failed: ${err instanceof Error ? err.message : String(err)}`,
      'PRESENCE_FAILED',
    );
  }

  const assertion = credential.response as AuthenticatorAssertionResponse;

  // Parse authenticator data flags
  const flags = parseAuthFlags(assertion.authenticatorData);

  // Build the assertion result
  const result: WebAuthnAssertion = {
    credentialId: bufferToBase64url(credential.rawId),
    authenticatorData: bufferToBase64url(assertion.authenticatorData),
    signature: bufferToBase64url(assertion.signature),
    clientDataJSON: bufferToBase64url(assertion.clientDataJSON),
    userPresent: flags.up,
    userVerified: flags.uv,
    timestamp: new Date().toISOString(),
  };

  // Enforce user presence — the hardware key MUST confirm physical tap
  if (!result.userPresent) {
    throw new WebAuthnError(
      'Hardware key did not confirm user presence. ' +
        'The security key must be physically tapped to authorize this operation.',
      'PRESENCE_FAILED',
    );
  }

  console.log(
    `[WebAuthn] User presence verified for "${operationLabel}" ` +
      `| credential: ${result.credentialId.slice(0, 16)}… ` +
      `| UP:${result.userPresent} UV:${result.userVerified} ` +
      `| at: ${result.timestamp}`,
  );

  return result;
}
