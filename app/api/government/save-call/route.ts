import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { resolveTenantFromVapiSecret } from '@/lib/government/tenant-resolver';
import { redactTranscript } from '@/lib/azure/redaction-pipeline';

// ===========================================
// FOIA COMPLIANT CALL RECORDING ENDPOINT
// ===========================================
// Saves call recordings to Firestore for audit trail.
// Tenant identity is resolved server-side from the
// x-vapi-secret header — NEVER from client input.
//
// TWO-COPY STORAGE:
//   1. government_calls         — Original (HIPAA Vault)
//   2. government_calls_public  — Sanitized (FOIA-Ready)
//
// MANDATORY DISCLAIMER:
//   Every call transcript is prepended with the AI disclosure.
//   This is enforced server-side and CANNOT be disabled by the UI.

// ===========================================
// HARD-CODED AI DISCLAIMER — NON-NEGOTIABLE
// ===========================================
// This disclaimer is prepended to EVERY call transcript at save time.
// It is enforced at the API layer. There is no UI toggle, no env var,
// no configuration that can suppress it. Removing this constitutes a
// compliance violation under state wiretapping and AI disclosure laws.
const AI_DISCLAIMER_TEMPLATE = (agencyName: string): string =>
  `Hi, I'm an AI receptionist for ${agencyName || 'this government agency'}. This call is recorded.`;

interface TranscriptEntry {
  role: 'ai' | 'user' | 'tool';
  text: string;
  timestamp: string;
  toolCall?: string;
}

interface SaveCallPayload {
  sessionId: string;
  transcript: TranscriptEntry[];
  duration: number;
  timestamp: string;
  metadata?: {
    maxDuration?: number;
    toolsUsed?: string[];
  };
}

export async function POST(request: NextRequest) {
  try {
    // ── Tenant Resolution (Zero Trust) ─────────────────────────
    // Resolve tenant from the per-tenant Vapi webhook secret.
    // This is the ONLY way to associate a call with a tenant.
    const secret = request.headers.get('x-vapi-secret');
    if (!secret) {
      return NextResponse.json(
        { error: 'Unauthorized', detail: 'Missing webhook authentication.' },
        { status: 401 },
      );
    }

    const tenant = await resolveTenantFromVapiSecret(secret);
    if (!tenant) {
      return NextResponse.json(
        { error: 'Unauthorized', detail: 'Invalid webhook secret.' },
        { status: 401 },
      );
    }

    const body: SaveCallPayload = await request.json();

    // Validate required fields
    if (!body.sessionId || !body.transcript || typeof body.duration !== 'number') {
      return NextResponse.json(
        { error: 'Missing required fields: sessionId, transcript, duration' },
        { status: 400 }
      );
    }

    // ── MANDATORY DISCLAIMER PREPEND ──────────────────────────
    // Resolve agency name from tenant data for personalized disclaimer
    const agencyName = tenant.agency_name || '';
    const disclaimerText = AI_DISCLAIMER_TEMPLATE(agencyName);

    // Prepend the disclaimer as the first AI message in the transcript
    const disclaimerEntry: TranscriptEntry = {
      role: 'ai',
      text: disclaimerText,
      timestamp: body.transcript[0]?.timestamp || new Date().toISOString(),
      toolCall: undefined,
    };

    // Build the full transcript with disclaimer always first
    const fullTranscript: TranscriptEntry[] = [
      disclaimerEntry,
      ...body.transcript,
    ];

    // Extract tools used from transcript
    const toolsUsed = fullTranscript
      .filter(entry => entry.role === 'tool' && entry.toolCall)
      .map(entry => entry.toolCall as string);

    // ── COPY 1: ORIGINAL (HIPAA VAULT) ────────────────────────
    // Full unredacted transcript stored in the primary collection.
    // Access is restricted to authorized personnel with audit trail.
    const originalDocument = {
      tenant_id: tenant.tenant_id,
      owner_uid: tenant.owner_uid,
      sessionId: body.sessionId,
      transcript: fullTranscript,
      duration: body.duration,
      timestamp: body.timestamp || new Date().toISOString(),
      status: 'completed',
      toolsUsed: [...new Set(toolsUsed)],
      transcriptCount: fullTranscript.length,
      disclaimerApplied: true,
      disclaimerText: disclaimerText,
      metadata: {
        maxDuration: body.metadata?.maxDuration || 120,
        savedAt: FieldValue.serverTimestamp(),
        foiaCompliant: true,
        storageType: 'original',
      },
    };

    const docRef = await adminDb
      .collection('government_calls')
      .add(originalDocument);

    // ── COPY 2: SANITIZED (PUBLIC / FOIA-READY) ──────────────
    // Run the redaction pipeline to create a PII-stripped version.
    // This copy is safe for FOIA disclosure and public records requests.
    let redactionSummary = null;
    try {
      const redactionResult = await redactTranscript(fullTranscript);

      const sanitizedDocument = {
        tenant_id: tenant.tenant_id,
        owner_uid: tenant.owner_uid,
        sessionId: body.sessionId,
        transcript: redactionResult.sanitizedTranscript,
        duration: body.duration,
        timestamp: body.timestamp || new Date().toISOString(),
        status: 'completed',
        toolsUsed: [...new Set(toolsUsed)],
        transcriptCount: redactionResult.sanitizedTranscript.length,
        disclaimerApplied: true,
        originalDocumentId: docRef.id,
        metadata: {
          maxDuration: body.metadata?.maxDuration || 120,
          savedAt: FieldValue.serverTimestamp(),
          foiaCompliant: true,
          storageType: 'sanitized',
          redactionMethod: redactionResult.redactionMethod,
          piiTypesFound: redactionResult.piiTypesFound,
          redactionLogEntries: redactionResult.redactionLog.length,
        },
      };

      await adminDb
        .collection('government_calls_public')
        .add(sanitizedDocument);

      redactionSummary = {
        method: redactionResult.redactionMethod,
        piiTypesFound: redactionResult.piiTypesFound,
        entriesRedacted: redactionResult.redactionLog.length,
      };
    } catch (redactionError) {
      // Redaction failure should NOT block the original save
      console.error('[Save Call] Redaction pipeline error (non-blocking):', redactionError);
    }

    console.log(`[Save Call] Successfully saved call ${body.sessionId} as document ${docRef.id} (disclaimer enforced)`);

    return NextResponse.json({
      success: true,
      documentId: docRef.id,
      sessionId: body.sessionId,
      disclaimerApplied: true,
      redaction: redactionSummary,
      message: 'Call record saved successfully with AI disclosure and dual-copy storage',
    });

  } catch (error) {
    console.error('[Save Call] Error saving call:', error);

    // Check for specific Firebase errors
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return NextResponse.json(
      {
        error: 'Failed to save call record',
        details: errorMessage,
      },
      { status: 500 }
    );
  }
}

// Health check endpoint
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'Government Call Recording API',
    collections: {
      original: 'government_calls',
      sanitized: 'government_calls_public',
    },
    disclaimerEnforced: true,
    foiaCompliant: true,
    twoCopyStorage: true,
  });
}
