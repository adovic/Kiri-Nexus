import { NextResponse } from 'next/server';
import { generateDeletionCertificate } from '@/lib/government/audit-logger';
import { resolveTenantFromSession } from '@/lib/government/tenant-resolver';
import {
  renderDestructionCertificateHTML,
  renderDestructionCertificateText,
} from '@/lib/government/destruction-certificate';

// =============================================================================
// SOVEREIGN EXIT — PERMANENT DATA DELETION + CERTIFICATE
// =============================================================================
// Irrevocably destroys a tenant's entire audit silo and returns a
// cryptographically signed Sovereign Exit Certificate.
//
// The certificate includes:
//   - Agency identity and tenant ID
//   - Final root hash of the chain-of-custody (captured BEFORE wipe)
//   - Exact list of artifacts destroyed (files, sizes)
//   - Confirmation that tenant-specific keys were destroyed
//   - HMAC-SHA256 signature over the certificate body
//   - ISO-8601 timestamp of destruction
//
// THIS ACTION IS IRREVERSIBLE. The confirmation phrase
// "PERMANENTLY DELETE ALL DATA" is required in the request body.
//
// Payload (POST body):
//   confirmation  — must be exactly "PERMANENTLY DELETE ALL DATA"
//
// Query params:
//   ?format=json  — returns raw JSON certificate
//   ?format=text  — returns plain-text certificate (archival / PDF text layer)
//   (default: HTML — printable Certificate of Data Destruction)
//
// Response: Sovereign Exit Certificate (HTML, JSON, or plain text)
// =============================================================================

const CONFIRMATION_PHRASE = 'PERMANENTLY DELETE ALL DATA';

export async function POST(req: Request) {
  // ── Resolve tenant from session (Zero Trust) ──
  const tenant = await resolveTenantFromSession(req);

  if (!tenant) {
    return NextResponse.json(
      {
        error: 'Unauthorized',
        detail: 'No active tenant could be resolved from your session.',
      },
      { status: 401 },
    );
  }

  // ── Parse and validate confirmation ──
  let body: { confirmation?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Bad Request', detail: 'Invalid JSON body.' },
      { status: 400 },
    );
  }

  if (body.confirmation !== CONFIRMATION_PHRASE) {
    return NextResponse.json(
      {
        error: 'Confirmation Required',
        detail: `You must include { "confirmation": "${CONFIRMATION_PHRASE}" } to proceed with permanent deletion.`,
      },
      { status: 400 },
    );
  }

  // ── Execute sovereign exit: secure wipe + certificate generation ──
  const certificate = generateDeletionCertificate({
    tenant_id: tenant.tenant_id,
    agency_name: tenant.agency_name,
    jurisdiction_state: tenant.jurisdiction_state,
  });

  // ── Check requested format ──
  const url = new URL(req.url);
  const format = url.searchParams.get('format');

  const commonHeaders = {
    'X-Certificate-Id': certificate.certificate_id,
    'X-Certificate-Signature': certificate.signature,
  };

  // JSON format — return the raw certificate object
  if (format === 'json') {
    return NextResponse.json(certificate, {
      headers: {
        ...commonHeaders,
        'Content-Disposition': `attachment; filename="${tenant.tenant_id}_sovereign_exit_certificate.json"`,
      },
    });
  }

  // Plain-text format — archival / PDF text layer
  if (format === 'text') {
    const text = renderDestructionCertificateText(certificate);
    return new Response(text, {
      status: 200,
      headers: {
        ...commonHeaders,
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="${tenant.tenant_id}_sovereign_exit_certificate.txt"`,
      },
    });
  }

  // Default: HTML certificate (printable)
  const html = renderDestructionCertificateHTML(certificate);

  return new Response(html, {
    status: 200,
    headers: {
      ...commonHeaders,
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': `attachment; filename="${tenant.tenant_id}_sovereign_exit_certificate.html"`,
    },
  });
}

