// =============================================================================
// PRIVACY-FIRST SUPPORT VIEW — Client-Side Session & Defense-in-Depth Redaction
// =============================================================================
// Provides a time-boxed "SUPPORT_VIEW" role with client-side session management
// and PII redaction as a DEFENSE-IN-DEPTH layer.
//
// PRIMARY DEFENSE: Server-side projection in lib/government/server-redaction.ts
// enforces PII redaction BEFORE data enters the response payload. Raw PII
// never reaches the browser for SUPPORT_VIEW users.
//
// THIS MODULE provides:
//   1. localStorage session management (timer, hydration, expiry display)
//   2. Client-side PII regex sweep as a SECONDARY safety net
//   3. Session state for UI elements (banner, countdown, toggle button)
//
// The client-side redaction here is NOT the primary gate — it exists to
// catch edge cases and provide visual consistency. If this layer fails,
// the server-side projection has already stripped PII from the payload.
//
// This module is CLIENT-SAFE — no server-only imports.
// =============================================================================

// ── Constants ────────────────────────────────────────────────────────────────

/** Support view sessions expire after 2 hours (7200 seconds) */
export const SUPPORT_VIEW_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

/** localStorage key for the support view session */
const STORAGE_KEY = 'gov_support_view_session';

// ── Session Types ────────────────────────────────────────────────────────────

export interface SupportViewSession {
  /** Whether the support view is currently active */
  active: boolean;
  /** Identity of the support agent who activated it */
  activated_by: string;
  /** ISO-8601 timestamp when the session was activated */
  activated_at: string;
  /** ISO-8601 timestamp when the session will expire */
  expires_at: string;
  /** Server-side audit receipt ID (links to the AUDIT_SHIELD entry) */
  audit_receipt_id: string;
}

// ── Session Management ───────────────────────────────────────────────────────

/**
 * Activate the support view session.
 * Stores session data in localStorage with a 2-hour expiry.
 */
export function activateSupportView(
  activatedBy: string,
  auditReceiptId: string,
): SupportViewSession {
  const now = new Date();
  const session: SupportViewSession = {
    active: true,
    activated_by: activatedBy,
    activated_at: now.toISOString(),
    expires_at: new Date(now.getTime() + SUPPORT_VIEW_TTL_MS).toISOString(),
    audit_receipt_id: auditReceiptId,
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // localStorage unavailable — session is memory-only
  }

  return session;
}

/**
 * Read the current support view session.
 * Returns null if no session exists or if the session has expired.
 * Automatically clears expired sessions from storage.
 */
export function getSupportViewSession(): SupportViewSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const session: SupportViewSession = JSON.parse(raw);

    // Check expiry
    if (new Date(session.expires_at).getTime() <= Date.now()) {
      // Session expired — auto-clear
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    return session;
  } catch {
    return null;
  }
}

/**
 * Deactivate the support view session immediately.
 */
export function deactivateSupportView(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable
  }
}

/**
 * Calculate the remaining time in the support view session (in milliseconds).
 * Returns 0 if the session has expired or doesn't exist.
 */
export function getRemainingTimeMs(session: SupportViewSession | null): number {
  if (!session) return 0;
  const remaining = new Date(session.expires_at).getTime() - Date.now();
  return Math.max(0, remaining);
}

/**
 * Format remaining time as "Xh Ym" or "Ym Zs" for display.
 */
export function formatRemainingTime(ms: number): string {
  if (ms <= 0) return 'Expired';

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m ${seconds}s`;
}

// ── PII Redaction (Client-Side — Defense-in-Depth) ───────────────────────────
//
// SECONDARY SAFETY NET. The primary PII gate is server-side projection
// in lib/government/server-redaction.ts. These client-side patterns exist
// to catch any residual PII that might bypass the server layer.
//
// Patterns mirror server-redaction.ts and transparency-sanitizer.ts:
//   - Phone numbers
//   - Email addresses
//   - SSN / Tax IDs
//   - Credit card numbers
//   - Street addresses
//   - Dollar amounts / fine amounts

const PII_REDACTION_PATTERNS: { pattern: RegExp; replacement: string }[] = [
  // Phone numbers: (555) 123-4567, 555-123-4567, +1-555-123-4567
  {
    pattern: /(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
    replacement: '[REDACTED]',
  },
  // Email addresses
  {
    pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    replacement: '[REDACTED]',
  },
  // SSN: 123-45-6789
  {
    pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
    replacement: '[REDACTED]',
  },
  // Credit card (16 digits, optionally grouped)
  {
    pattern: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
    replacement: '[REDACTED]',
  },
  // Dollar amounts / fines: $1,234.56, $50, $1,000
  {
    pattern: /\$\d{1,3}(,\d{3})*(\.\d{2})?\b/g,
    replacement: '[REDACTED]',
  },
  // Street addresses: number + street name + suffix
  {
    pattern: /\b\d{1,5}\s+[A-Z][a-zA-Z]+\s+(St|Street|Ave|Avenue|Blvd|Boulevard|Dr|Drive|Ln|Lane|Rd|Road|Ct|Court|Pl|Place|Way|Cir|Circle)\b\.?/g,
    replacement: '[REDACTED]',
  },
];

/**
 * Redact all PII patterns from a text string.
 *
 * DEFENSE-IN-DEPTH: Server-side projection is the primary gate.
 * This client-side sweep catches any residual PII in edge cases.
 */
export function redactPII(text: string): string {
  let result = text;
  for (const { pattern, replacement } of PII_REDACTION_PATTERNS) {
    pattern.lastIndex = 0;
    result = result.replace(pattern, replacement);
  }
  return result;
}

/**
 * Conditionally redact text based on support view status.
 * Pass-through when support view is not active.
 *
 * DEFENSE-IN-DEPTH: The server has already redacted PII from the
 * response payload. This provides a secondary client-side sweep.
 */
export function conditionalRedact(
  text: string,
  isSupportView: boolean,
): string {
  return isSupportView ? redactPII(text) : text;
}
