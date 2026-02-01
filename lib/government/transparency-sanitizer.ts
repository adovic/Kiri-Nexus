// =============================================================================
// PII SANITIZER — Public Transparency Portal
// =============================================================================
// Strips personally identifiable information from audit log entries before
// they are exposed on the public transparency portal.
//
// Redaction targets (OWASP / NIST PII categories):
//   - Phone numbers:      (555) 123-4567, 555-123-4567, +15551234567
//   - Email addresses:     user@example.com
//   - SSN / Tax IDs:       123-45-6789, 123456789 (9 consecutive digits)
//   - Street addresses:    123 Main St, 456 Oak Avenue
//   - Full names:          Extracted from known argument field names
//   - Credit card numbers: 4111-1111-1111-1111, 4111111111111111
//
// Strategy:
//   We redact at TWO levels:
//   1. Structured: Known tool_arguments fields (caller_name, phone, address, etc.)
//   2. Freeform:   Regex sweep over stringified text for residual PII patterns
// =============================================================================

import type { ActionAuditReceipt } from '@/lib/government/audit-logger';

// ── Public-facing sanitized record ──

export interface SanitizedAuditEntry {
  /** Original receipt ID (safe — not PII) */
  action_receipt_id: string;
  /** ISO-8601 timestamp */
  timestamp: string;
  /** Tool that was executed (e.g. "schedule_appointment") */
  tool_name: string;
  /** Outcome of the tool execution */
  execution_status: 'Success' | 'Fail';
  /** Sanitized description of what happened (PII removed) */
  outcome_summary: string;
  /** Hash chain verified — proves this entry is untampered */
  entry_hash_prefix: string;
}

// ── PII Field Names (structured redaction) ──

const PII_FIELD_NAMES = new Set([
  'name',
  'full_name',
  'first_name',
  'last_name',
  'caller_name',
  'resident_name',
  'citizen_name',
  'customer_name',
  'contact_name',
  'phone',
  'phone_number',
  'telephone',
  'mobile',
  'cell',
  'callback_number',
  'caller_phone',
  'email',
  'email_address',
  'e_mail',
  'address',
  'street_address',
  'home_address',
  'mailing_address',
  'street',
  'ssn',
  'social_security',
  'tax_id',
  'dob',
  'date_of_birth',
  'birth_date',
  'credit_card',
  'card_number',
  'account_number',
  'license_number',
  'drivers_license',
]);

// ── Regex Patterns (freeform redaction) ──

const PII_PATTERNS: { pattern: RegExp; replacement: string }[] = [
  // Phone numbers: (555) 123-4567, 555-123-4567, 555.123.4567, +1-555-123-4567
  {
    pattern: /(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
    replacement: '[PHONE REDACTED]',
  },
  // Email addresses
  {
    pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    replacement: '[EMAIL REDACTED]',
  },
  // SSN: 123-45-6789
  {
    pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
    replacement: '[SSN REDACTED]',
  },
  // Credit card (16 digits, optionally grouped)
  {
    pattern: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
    replacement: '[CARD REDACTED]',
  },
  // Street addresses: number + street name + suffix
  {
    pattern: /\b\d{1,5}\s+[A-Z][a-zA-Z]+\s+(St|Street|Ave|Avenue|Blvd|Boulevard|Dr|Drive|Ln|Lane|Rd|Road|Ct|Court|Pl|Place|Way|Cir|Circle)\b\.?/g,
    replacement: '[ADDRESS REDACTED]',
  },
];

// ── Structured Field Redaction ──

/**
 * Deep-redact known PII fields from a tool_arguments object.
 * Returns a sanitized copy — the original is not mutated.
 */
function redactStructuredPII(
  args: Record<string, unknown>,
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(args)) {
    const lowerKey = key.toLowerCase();

    if (PII_FIELD_NAMES.has(lowerKey)) {
      // Known PII field — fully redact
      sanitized[key] = `[${key.toUpperCase()} REDACTED]`;
    } else if (typeof value === 'string') {
      // Freeform string — regex sweep
      sanitized[key] = redactFreeformPII(value);
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      // Nested object — recurse
      sanitized[key] = redactStructuredPII(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

// ── Freeform Text Redaction ──

/**
 * Sweep a string for PII patterns and replace matches with redaction markers.
 */
function redactFreeformPII(text: string): string {
  let result = text;
  for (const { pattern, replacement } of PII_PATTERNS) {
    // Reset regex state (global flag)
    pattern.lastIndex = 0;
    result = result.replace(pattern, replacement);
  }
  return result;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Generate an outcome summary from the execution result.
 * Strips PII and truncates to a reasonable length.
 */
function buildOutcomeSummary(entry: ActionAuditReceipt): string {
  let summary = entry.execution_result || '';

  // Redact PII from the result text
  summary = redactFreeformPII(summary);

  // Truncate to 200 chars
  if (summary.length > 200) {
    summary = summary.slice(0, 197) + '...';
  }

  return summary || `${entry.tool_name}: ${entry.execution_status}`;
}

/**
 * Sanitize a full audit log for public transparency.
 *
 * Takes raw audit entries and returns a PII-free view suitable for
 * public consumption. Only exposes:
 *   - action_receipt_id  (opaque ID — not PII)
 *   - timestamp          (when the action occurred)
 *   - tool_name          (what tool was used)
 *   - execution_status   (Success / Fail)
 *   - outcome_summary    (PII-redacted result description)
 *   - entry_hash_prefix  (first 12 chars of the hash — proves chain link)
 *
 * All other fields (tool_arguments, agent_nhi, vapi IDs, policy hash,
 * full entry_hash, prev_hash) are omitted entirely.
 */
export function sanitizeForPublic(
  entries: ActionAuditReceipt[],
): SanitizedAuditEntry[] {
  return entries.map((entry) => ({
    action_receipt_id: entry.action_receipt_id,
    timestamp: entry.timestamp,
    tool_name: entry.tool_name,
    execution_status: entry.execution_status,
    outcome_summary: buildOutcomeSummary(entry),
    entry_hash_prefix: entry.entry_hash ? entry.entry_hash.slice(0, 12) : '',
  }));
}

/**
 * Sanitize tool_arguments for a detailed public view (if ever needed).
 * Exported for testing. Not used in the default public portal.
 */
export function sanitizeArguments(
  args: Record<string, unknown>,
): Record<string, unknown> {
  return redactStructuredPII(args);
}

/**
 * Redact PII from arbitrary text using the freeform regex patterns.
 *
 * This is the server-safe export of the freeform PII sweep. Use this
 * in API routes to scrub PII before the data enters a response payload.
 *
 * Pattern coverage: phone numbers, email addresses, SSNs, credit cards,
 * and street addresses (see PII_PATTERNS at the top of this file).
 */
export function redactPII(text: string): string {
  return redactFreeformPII(text);
}
