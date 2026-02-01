// =============================================================================
// MINIMUM COMPLIANCE BASELINE — Federal M-26-04 Validator
// =============================================================================
// Defines the mandatory policy fields that every Set 1 Baseline CSV must
// include before an AI Agent may be activated. These fields derive from
// OMB Memorandum M-26-04 (Transparency and Accountability for Government AI
// Deployments) and represent the minimum compliance floor.
//
// TWO-STAGE VALIDATION:
//   Stage 1 (Header Check):  Are the required columns present in the CSV?
//   Stage 2 (Content Check): Do the cell values contain REAL policy data,
//                            not placeholder text like "N/A", "TBD", or "None"?
//
// If EITHER stage fails, ingestion is blocked and a Compliance Error modal
// is displayed to the operator.
// =============================================================================

// ── Required M-26-04 Policy Fields ──────────────────────────────────────────
//
// Each entry defines:
//   field_id       — Internal identifier (snake_case)
//   display_name   — Human-readable label shown in the Compliance Error modal
//   csv_match      — Function to match against CSV header strings (case-insensitive)
//   m26_section    — The M-26-04 section that mandates this field

export interface ComplianceField {
  field_id: string;
  display_name: string;
  csv_match: (header: string) => boolean;
  m26_section: string;
}

export const M26_04_REQUIRED_FIELDS: ComplianceField[] = [
  {
    field_id: 'privacy_policy_link',
    display_name: 'Privacy Policy Link',
    csv_match: (h) => h.includes('privacy') && (h.includes('policy') || h.includes('link')),
    m26_section: '§3.1 — Data Privacy & Citizen Rights',
  },
  {
    field_id: 'appeal_process_id',
    display_name: 'Appeal Process ID',
    csv_match: (h) => h.includes('appeal') && (h.includes('process') || h.includes('id')),
    m26_section: '§4.2 — Algorithmic Recourse & Due Process',
  },
  {
    field_id: 'appeal_email',
    display_name: 'Appeal Contact Email',
    csv_match: (h) => h.includes('appeal') && (h.includes('email') || h.includes('contact')),
    m26_section: '§4.3 — Citizen Recourse Contact',
  },
  {
    field_id: 'data_retention_policy',
    display_name: 'Data Retention Policy',
    csv_match: (h) => h.includes('retention') && (h.includes('policy') || h.includes('data')),
    m26_section: '§3.3 — Records Management & Retention',
  },
  {
    field_id: 'ada_compliance_statement',
    display_name: 'ADA Compliance Statement',
    csv_match: (h) => h.includes('ada') || (h.includes('accessibility') && h.includes('compliance')),
    m26_section: '§5.1 — Accessibility & Equal Access',
  },
  {
    field_id: 'bias_audit_date',
    display_name: 'Bias Audit Date',
    csv_match: (h) => h.includes('bias') && (h.includes('audit') || h.includes('date')),
    m26_section: '§6.2 — Algorithmic Bias Assessment',
  },
];

// ── Stage 1: Header Validation Result ────────────────────────────────────────

export interface ComplianceValidationResult {
  passed: boolean;
  total_required: number;
  total_present: number;
  missing_fields: {
    field_id: string;
    display_name: string;
    m26_section: string;
  }[];
  present_fields: string[];
}

/**
 * Stage 1: Validate that a Set 1 Baseline CSV contains all required M-26-04
 * column headers. Does NOT check cell values — that is Stage 2.
 */
export function validateComplianceBaseline(
  csvHeaders: string[],
): ComplianceValidationResult {
  const normalizedHeaders = csvHeaders.map((h) => h.toLowerCase().trim());

  const missing: ComplianceValidationResult['missing_fields'] = [];
  const present: string[] = [];

  for (const field of M26_04_REQUIRED_FIELDS) {
    const found = normalizedHeaders.some((h) => field.csv_match(h));
    if (found) {
      present.push(field.field_id);
    } else {
      missing.push({
        field_id: field.field_id,
        display_name: field.display_name,
        m26_section: field.m26_section,
      });
    }
  }

  return {
    passed: missing.length === 0,
    total_required: M26_04_REQUIRED_FIELDS.length,
    total_present: present.length,
    missing_fields: missing,
    present_fields: present,
  };
}

// =============================================================================
// STAGE 2 — Content-Aware Validation (Anti-Placeholder)
// =============================================================================
// Ensures cell values contain REAL compliance data, not mock or placeholder
// text. This prevents "mock compliance" where operators upload CSVs with
// column headers present but values set to "N/A", "TBD", or "None".
//
// Rules:
//   - Placeholder strings (N/A, TBD, None, TODO, etc.) are BANNED
//   - privacy_policy_link must match ^https://.*\.gov/.*
//   - appeal_email must match a valid email pattern
//   - Mandatory descriptions must be >= 10 characters
//   - bias_audit_date must match a recognizable date format
// =============================================================================

// ── Placeholder Ban Pattern ──────────────────────────────────────────────────
// Matches common placeholder strings that indicate mock compliance data.
// Case-insensitive, anchored to full cell value (after trimming).

const PLACEHOLDER_PATTERN = /^(n\/?a|tbd|tba|none|null|todo|placeholder|test|example|xxx+|---+|\.\.\.+|pending|undefined|unknown|blank|empty|filler|dummy|sample|lorem)$/i;

/**
 * Check whether a trimmed cell value is a banned placeholder.
 */
function isPlaceholder(value: string): boolean {
  return PLACEHOLDER_PATTERN.test(value.trim());
}

// ── Per-Field Content Validation Rules ───────────────────────────────────────

interface ContentRule {
  field_id: string;
  display_name: string;
  m26_section: string;
  validate: (value: string) => string | null; // null = valid, string = error message
}

const CONTENT_RULES: ContentRule[] = [
  {
    field_id: 'privacy_policy_link',
    display_name: 'Privacy Policy Link',
    m26_section: '§3.1 — Data Privacy & Citizen Rights',
    validate: (v) => {
      if (!v || v.trim().length === 0) return 'Cell is empty.';
      if (isPlaceholder(v)) return 'Placeholder text is not permitted.';
      if (!/^https:\/\/.*\.gov\/.*/i.test(v.trim()))
        return 'Must be a .gov URL matching pattern: https://<domain>.gov/<path>';
      return null;
    },
  },
  {
    field_id: 'appeal_process_id',
    display_name: 'Appeal Process ID',
    m26_section: '§4.2 — Algorithmic Recourse & Due Process',
    validate: (v) => {
      if (!v || v.trim().length === 0) return 'Cell is empty.';
      if (isPlaceholder(v)) return 'Placeholder text is not permitted.';
      if (v.trim().length < 3) return 'Must be a valid process identifier (min 3 characters).';
      return null;
    },
  },
  {
    field_id: 'appeal_email',
    display_name: 'Appeal Contact Email',
    m26_section: '§4.3 — Citizen Recourse Contact',
    validate: (v) => {
      if (!v || v.trim().length === 0) return 'Cell is empty.';
      if (isPlaceholder(v)) return 'Placeholder text is not permitted.';
      if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(v.trim()))
        return 'Must be a valid email address (e.g. appeals@agency.gov).';
      return null;
    },
  },
  {
    field_id: 'data_retention_policy',
    display_name: 'Data Retention Policy',
    m26_section: '§3.3 — Records Management & Retention',
    validate: (v) => {
      if (!v || v.trim().length === 0) return 'Cell is empty.';
      if (isPlaceholder(v)) return 'Placeholder text is not permitted.';
      if (v.trim().length < 10) return 'Mandatory descriptions must be at least 10 characters.';
      return null;
    },
  },
  {
    field_id: 'ada_compliance_statement',
    display_name: 'ADA Compliance Statement',
    m26_section: '§5.1 — Accessibility & Equal Access',
    validate: (v) => {
      if (!v || v.trim().length === 0) return 'Cell is empty.';
      if (isPlaceholder(v)) return 'Placeholder text is not permitted.';
      if (v.trim().length < 10) return 'Mandatory descriptions must be at least 10 characters.';
      return null;
    },
  },
  {
    field_id: 'bias_audit_date',
    display_name: 'Bias Audit Date',
    m26_section: '§6.2 — Algorithmic Bias Assessment',
    validate: (v) => {
      if (!v || v.trim().length === 0) return 'Cell is empty.';
      if (isPlaceholder(v)) return 'Placeholder text is not permitted.';
      // Accept: YYYY-MM-DD, MM/DD/YYYY, DD-Mon-YYYY, Month DD YYYY
      const datePatterns = [
        /^\d{4}-\d{2}-\d{2}$/,              // 2024-01-15
        /^\d{1,2}\/\d{1,2}\/\d{2,4}$/,      // 1/15/2024 or 01/15/24
        /^\d{1,2}-[A-Za-z]{3}-\d{2,4}$/,    // 15-Jan-2024
        /^[A-Za-z]+\s+\d{1,2},?\s+\d{4}$/,  // January 15, 2024
      ];
      const trimmed = v.trim();
      const isDate = datePatterns.some((p) => p.test(trimmed));
      if (!isDate) return 'Must be a recognizable date (e.g. 2024-06-15, 06/15/2024).';
      return null;
    },
  },
];

// ── Content Validation Result ────────────────────────────────────────────────

export interface ContentValidationFailure {
  field_id: string;
  display_name: string;
  m26_section: string;
  cell_value: string;
  error: string;
}

export interface ContentValidationResult {
  passed: boolean;
  total_validated: number;
  failures: ContentValidationFailure[];
}

/**
 * Stage 2: Validate the CONTENT of M-26-04 compliance fields in a CSV row.
 *
 * Resolves each M-26-04 field to its column index in the header row, reads
 * the corresponding cell value from the first data row, and runs the
 * field-specific content validator.
 *
 * @param csvHeaders — Array of column header strings (raw, any case)
 * @param firstDataRow — Array of cell values from the first data row
 * @returns ContentValidationResult with per-field failures
 */
export function validateComplianceContent(
  csvHeaders: string[],
  firstDataRow: string[],
): ContentValidationResult {
  const normalizedHeaders = csvHeaders.map((h) => h.toLowerCase().trim());
  const failures: ContentValidationFailure[] = [];
  let validated = 0;

  for (const rule of CONTENT_RULES) {
    // Find which M-26-04 field definition matches
    const fieldDef = M26_04_REQUIRED_FIELDS.find((f) => f.field_id === rule.field_id);
    if (!fieldDef) continue;

    // Find the column index for this field
    const colIdx = normalizedHeaders.findIndex((h) => fieldDef.csv_match(h));
    if (colIdx === -1) continue; // Header missing — already caught by Stage 1

    validated++;
    const cellValue = firstDataRow[colIdx] || '';
    const error = rule.validate(cellValue);

    if (error) {
      failures.push({
        field_id: rule.field_id,
        display_name: rule.display_name,
        m26_section: rule.m26_section,
        cell_value: cellValue.length > 50 ? cellValue.slice(0, 47) + '...' : cellValue,
        error,
      });
    }
  }

  return {
    passed: failures.length === 0,
    total_validated: validated,
    failures,
  };
}
