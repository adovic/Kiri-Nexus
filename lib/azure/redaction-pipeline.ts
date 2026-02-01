// =============================================================================
// REDACTION PIPELINE — Two-Copy Storage System
// =============================================================================
// Implements a "Two-Copy" architecture for government call transcripts:
//
//   1. SANITIZED COPY (Public / FOIA-Ready)
//      - All PII redacted using pattern-based detection + Azure AI Language
//      - Safe for FOIA disclosure, public records requests
//      - Stored in `government_calls_public` collection
//
//   2. ORIGINAL COPY (HIPAA Vault)
//      - Full unredacted transcript
//      - Access restricted to authorized personnel with audit trail
//      - Stored in `government_calls` collection (existing)
//
// Integration Points:
//   - Microsoft Presidio (self-hosted) for pattern-based PII detection
//   - Azure AI Language (PII detection endpoint) for ML-based detection
//   - Falls back to regex-based redaction if external services unavailable
//
// Environment Variables:
//   AZURE_LANGUAGE_ENDPOINT    — Azure AI Language endpoint
//   AZURE_LANGUAGE_KEY         — Azure AI Language API key
//   PRESIDIO_ANALYZER_URL      — Presidio Analyzer service URL (optional)
//   PRESIDIO_ANONYMIZER_URL    — Presidio Anonymizer service URL (optional)
// =============================================================================

// ── Types ────────────────────────────────────────────────────────────────────

export interface TranscriptEntry {
  role: 'ai' | 'user' | 'tool';
  text: string;
  timestamp: string;
  toolCall?: string;
}

export interface RedactionResult {
  sanitizedTranscript: TranscriptEntry[];
  redactionLog: RedactionLogEntry[];
  piiTypesFound: string[];
  redactionMethod: 'azure' | 'presidio' | 'regex-fallback';
}

export interface RedactionLogEntry {
  entryIndex: number;
  originalLength: number;
  redactedLength: number;
  piiTypes: string[];
  timestamp: string;
}

// ── PII Patterns (Regex Fallback) ────────────────────────────────────────────
// These patterns provide baseline PII detection when external services are
// unavailable. They are intentionally broad to err on the side of redaction.

const PII_PATTERNS: { type: string; pattern: RegExp; replacement: string }[] = [
  // SSN: 123-45-6789 or 123456789
  {
    type: 'SSN',
    pattern: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g,
    replacement: '[SSN REDACTED]',
  },
  // Phone numbers: various US formats
  {
    type: 'PHONE',
    pattern: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    replacement: '[PHONE REDACTED]',
  },
  // Email addresses
  {
    type: 'EMAIL',
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    replacement: '[EMAIL REDACTED]',
  },
  // Credit card numbers (basic: 16 digits with optional separators)
  {
    type: 'CREDIT_CARD',
    pattern: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
    replacement: '[CARD REDACTED]',
  },
  // Date of birth patterns (MM/DD/YYYY, MM-DD-YYYY)
  {
    type: 'DOB',
    pattern: /\b(?:0[1-9]|1[0-2])[-/](?:0[1-9]|[12]\d|3[01])[-/](?:19|20)\d{2}\b/g,
    replacement: '[DOB REDACTED]',
  },
  // Street addresses (basic: number + street name)
  {
    type: 'ADDRESS',
    pattern: /\b\d{1,5}\s+(?:[A-Z][a-z]+\s){1,3}(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Boulevard|Blvd|Lane|Ln|Court|Ct|Way|Place|Pl)\b\.?/gi,
    replacement: '[ADDRESS REDACTED]',
  },
  // Driver's license (state-specific patterns are complex; this catches common formats)
  {
    type: 'DL_NUMBER',
    pattern: /\b[A-Z]\d{7,12}\b/g,
    replacement: '[DL REDACTED]',
  },
  // Medical record numbers (MRN patterns)
  {
    type: 'MRN',
    pattern: /\bMRN[:\s]*\d{6,10}\b/gi,
    replacement: '[MRN REDACTED]',
  },
];

// ── Azure AI Language PII Detection ──────────────────────────────────────────

interface AzurePIIEntity {
  text: string;
  category: string;
  subcategory?: string;
  offset: number;
  length: number;
  confidenceScore: number;
}

async function azureDetectPII(text: string): Promise<AzurePIIEntity[] | null> {
  const endpoint = process.env.AZURE_LANGUAGE_ENDPOINT;
  const apiKey = process.env.AZURE_LANGUAGE_KEY;

  if (!endpoint || !apiKey) return null;

  try {
    const url = `${endpoint}/language/:analyze-text/jobs?api-version=2023-04-01`;
    const response = await fetch(`${endpoint}/text/analytics/v3.1/entities/recognition/pii`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Ocp-Apim-Subscription-Key': apiKey,
      },
      body: JSON.stringify({
        documents: [{ id: '1', language: 'en', text }],
      }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    const doc = data.documents?.[0];
    if (!doc) return null;

    return doc.entities as AzurePIIEntity[];
  } catch {
    return null;
  }
}

// ── Presidio Integration ─────────────────────────────────────────────────────

interface PresidioResult {
  start: number;
  end: number;
  entity_type: string;
  score: number;
}

async function presidioAnalyze(text: string): Promise<PresidioResult[] | null> {
  const analyzerUrl = process.env.PRESIDIO_ANALYZER_URL;
  if (!analyzerUrl) return null;

  try {
    const response = await fetch(`${analyzerUrl}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        language: 'en',
        entities: [
          'PERSON', 'PHONE_NUMBER', 'EMAIL_ADDRESS', 'CREDIT_CARD',
          'US_SSN', 'US_DRIVER_LICENSE', 'LOCATION', 'DATE_TIME',
          'MEDICAL_LICENSE', 'IP_ADDRESS',
        ],
        score_threshold: 0.5,
      }),
    });

    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

async function presidioAnonymize(
  text: string,
  analyzerResults: PresidioResult[]
): Promise<string | null> {
  const anonymizerUrl = process.env.PRESIDIO_ANONYMIZER_URL;
  if (!anonymizerUrl) return null;

  try {
    const response = await fetch(`${anonymizerUrl}/anonymize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        analyzer_results: analyzerResults,
        anonymizers: {
          DEFAULT: { type: 'replace', new_value: '[PII REDACTED]' },
          PHONE_NUMBER: { type: 'replace', new_value: '[PHONE REDACTED]' },
          EMAIL_ADDRESS: { type: 'replace', new_value: '[EMAIL REDACTED]' },
          US_SSN: { type: 'replace', new_value: '[SSN REDACTED]' },
          CREDIT_CARD: { type: 'replace', new_value: '[CARD REDACTED]' },
          PERSON: { type: 'replace', new_value: '[NAME REDACTED]' },
          LOCATION: { type: 'replace', new_value: '[LOCATION REDACTED]' },
        },
      }),
    });

    if (!response.ok) return null;
    const data = await response.json();
    return data.text || null;
  } catch {
    return null;
  }
}

// ── Regex Fallback Redaction ─────────────────────────────────────────────────

function regexRedact(text: string): { redacted: string; piiTypes: string[] } {
  let redacted = text;
  const piiTypes: string[] = [];

  for (const { type, pattern, replacement } of PII_PATTERNS) {
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;
    if (pattern.test(redacted)) {
      piiTypes.push(type);
      pattern.lastIndex = 0;
      redacted = redacted.replace(pattern, replacement);
    }
  }

  return { redacted, piiTypes };
}

// ── Main Redaction Pipeline ──────────────────────────────────────────────────

/**
 * Redact PII from a call transcript using the best available method.
 *
 * Priority:
 *   1. Azure AI Language (if configured)
 *   2. Microsoft Presidio (if configured)
 *   3. Regex-based fallback (always available)
 *
 * Returns both the sanitized transcript and a redaction audit log.
 */
export async function redactTranscript(
  transcript: TranscriptEntry[]
): Promise<RedactionResult> {
  const sanitizedTranscript: TranscriptEntry[] = [];
  const redactionLog: RedactionLogEntry[] = [];
  const allPiiTypes = new Set<string>();
  let method: RedactionResult['redactionMethod'] = 'regex-fallback';

  for (let i = 0; i < transcript.length; i++) {
    const entry = transcript[i];

    // Only redact user and AI text (not tool calls)
    if (entry.role === 'tool') {
      sanitizedTranscript.push({ ...entry });
      continue;
    }

    const originalText = entry.text;
    let redactedText = originalText;
    const entryPiiTypes: string[] = [];

    // Try Azure AI Language first
    const azureEntities = await azureDetectPII(originalText);
    if (azureEntities && azureEntities.length > 0) {
      method = 'azure';
      // Apply redactions in reverse offset order to preserve positions
      const sorted = [...azureEntities].sort((a, b) => b.offset - a.offset);
      for (const entity of sorted) {
        const replacement = `[${entity.category.toUpperCase()} REDACTED]`;
        redactedText =
          redactedText.slice(0, entity.offset) +
          replacement +
          redactedText.slice(entity.offset + entity.length);
        entryPiiTypes.push(entity.category);
        allPiiTypes.add(entity.category);
      }
    } else {
      // Try Presidio
      const presidioResults = await presidioAnalyze(originalText);
      if (presidioResults && presidioResults.length > 0) {
        method = 'presidio';
        const anonymized = await presidioAnonymize(originalText, presidioResults);
        if (anonymized) {
          redactedText = anonymized;
          for (const result of presidioResults) {
            entryPiiTypes.push(result.entity_type);
            allPiiTypes.add(result.entity_type);
          }
        }
      }

      // Always run regex as additional pass (catches patterns ML might miss)
      const { redacted, piiTypes } = regexRedact(redactedText);
      if (piiTypes.length > 0) {
        redactedText = redacted;
        if (method === 'regex-fallback') {
          for (const t of piiTypes) {
            entryPiiTypes.push(t);
            allPiiTypes.add(t);
          }
        }
      }
    }

    sanitizedTranscript.push({
      ...entry,
      text: redactedText,
    });

    if (entryPiiTypes.length > 0) {
      redactionLog.push({
        entryIndex: i,
        originalLength: originalText.length,
        redactedLength: redactedText.length,
        piiTypes: entryPiiTypes,
        timestamp: new Date().toISOString(),
      });
    }
  }

  return {
    sanitizedTranscript,
    redactionLog,
    piiTypesFound: Array.from(allPiiTypes),
    redactionMethod: method,
  };
}
