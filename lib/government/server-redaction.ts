import 'server-only';

// =============================================================================
// SERVER-SIDE PII PROJECTION — Zero-Leak Guarantee
// =============================================================================
// Applies PII redaction BEFORE data leaves the server. This is the PRIMARY
// defense against the "Privacy Theater" vulnerability where client-side
// redaction can be bypassed via network inspection or JS manipulation.
//
// When SUPPORT_VIEW is active (detected via httpOnly cookie), all PII fields
// are replaced with [REDACTED] before entering the response payload.
//
// Client-side redaction in support-view.ts is RETAINED as defense-in-depth
// but is no longer the primary gate.
//
// PII patterns mirror transparency-sanitizer.ts (public portal) and
// support-view.ts (client-side). Any update to patterns should be applied
// to all three files.
// =============================================================================

// ── Support View Cookie ──────────────────────────────────────────────────────

/** Cookie name set by the /api/government/support-session endpoint */
export const SUPPORT_VIEW_COOKIE = 'gov-support-view';

/**
 * Parsed support-view cookie payload.
 * Set as httpOnly by the support-session API route.
 */
interface SupportViewCookiePayload {
  expires_at: string;
  activated_by: string;
}

/**
 * Check whether SUPPORT_VIEW is active from a raw Request object.
 * Used in API routes that receive a Request parameter.
 */
export function isSupportViewFromRequest(req: Request): boolean {
  const cookie = req.headers.get('cookie') || '';
  const match = cookie.match(/gov-support-view=([^;]+)/);
  if (!match) return false;

  try {
    const payload: SupportViewCookiePayload = JSON.parse(
      decodeURIComponent(match[1]),
    );
    return new Date(payload.expires_at).getTime() > Date.now();
  } catch {
    return false;
  }
}

/**
 * Check whether SUPPORT_VIEW is active from a Next.js cookie store.
 * Used in server components via `await cookies()`.
 *
 * @param cookieStore - The ReadonlyRequestCookies from `next/headers`
 */
export function isSupportViewFromCookieStore(
  cookieStore: { get(name: string): { value: string } | undefined },
): boolean {
  const raw = cookieStore.get(SUPPORT_VIEW_COOKIE);
  if (!raw) return false;

  try {
    const payload: SupportViewCookiePayload = JSON.parse(raw.value);
    return new Date(payload.expires_at).getTime() > Date.now();
  } catch {
    return false;
  }
}

// ── PII Redaction Patterns ───────────────────────────────────────────────────
// These mirror the patterns in transparency-sanitizer.ts and support-view.ts.

const PII_PATTERNS: { pattern: RegExp; replacement: string }[] = [
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
    pattern:
      /\b\d{1,5}\s+[A-Z][a-zA-Z]+\s+(St|Street|Ave|Avenue|Blvd|Boulevard|Dr|Drive|Ln|Lane|Rd|Road|Ct|Court|Pl|Place|Way|Cir|Circle)\b\.?/g,
    replacement: '[REDACTED]',
  },
];

/**
 * Sweep a string for PII patterns and replace matches with [REDACTED].
 */
function redactFreeformPII(text: string): string {
  let result = text;
  for (const { pattern, replacement } of PII_PATTERNS) {
    pattern.lastIndex = 0;
    result = result.replace(pattern, replacement);
  }
  return result;
}

// ── Call Record Projection ───────────────────────────────────────────────────

interface TranscriptEntry {
  role: 'ai' | 'user' | 'tool';
  text: string;
  timestamp: string;
  toolCall?: string;
}

interface CallRecord {
  id: string;
  sessionId: string;
  transcript: TranscriptEntry[];
  duration: number;
  timestamp: string;
  status: string;
  toolsUsed: string[];
  transcriptCount: number;
}

/**
 * Project (redact) PII from an array of call records.
 *
 * When SUPPORT_VIEW is active, every transcript entry's `text` field is
 * swept for PII patterns. The original objects are NOT mutated — new
 * copies are returned.
 *
 * ZERO-LEAK GUARANTEE: The raw unredacted data never enters res.json()
 * for SUPPORT_VIEW users because this function runs BEFORE serialization.
 */
export function projectCallRecords(
  calls: CallRecord[],
  isSupportView: boolean,
): CallRecord[] {
  if (!isSupportView) return calls;

  return calls.map((call) => ({
    ...call,
    transcript: call.transcript.map((entry) => ({
      ...entry,
      text: redactFreeformPII(entry.text),
      toolCall: entry.toolCall ? redactFreeformPII(entry.toolCall) : entry.toolCall,
    })),
  }));
}

// ── Access History Projection ────────────────────────────────────────────────

interface AccessHistoryEntry {
  receipt_id: string;
  timestamp: string;
  admin_id: string;
  action: string;
  purpose: string;
}

/**
 * Project (redact) PII from access history entries.
 *
 * Redacts `admin_id` (email) and sweeps `purpose` for residual PII.
 */
export function projectAccessHistory(
  entries: AccessHistoryEntry[],
  isSupportView: boolean,
): AccessHistoryEntry[] {
  if (!isSupportView) return entries;

  return entries.map((entry) => ({
    ...entry,
    admin_id: redactFreeformPII(entry.admin_id),
    purpose: redactFreeformPII(entry.purpose),
  }));
}
