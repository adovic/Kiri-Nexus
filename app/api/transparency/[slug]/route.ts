import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { getAuditLog, verifyLogIntegrity } from '@/lib/government/audit-logger';
import { sanitizeForPublic } from '@/lib/government/transparency-sanitizer';

// =============================================================================
// PUBLIC TRANSPARENCY DATA ENDPOINT (No Auth Required)
// =============================================================================
// Serves PII-sanitized audit log entries for a tenant whose transparency
// portal is enabled. Accessible by any citizen without authentication.
//
// GET /api/transparency/{slug}
//
// The slug maps to a tenant in Firestore via the `transparency_slug` field.
// If the tenant hasn't enabled transparency, returns 404.
//
// Response includes:
//   - Sanitized audit entries (receipt ID, timestamp, tool, status, outcome)
//   - Chain integrity status (valid/broken, entry count)
//   - Agency name and jurisdiction
//
// NO PII is ever exposed. See transparency-sanitizer.ts for redaction rules.
// =============================================================================

const TENANTS_COLLECTION = 'govTenants';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  if (!slug || slug.length > 48) {
    return NextResponse.json(
      { error: 'Not Found', detail: 'Invalid transparency portal slug.' },
      { status: 404 },
    );
  }

  // ── Look up tenant by transparency_slug ──
  const snapshot = await adminDb
    .collection(TENANTS_COLLECTION)
    .where('transparency_slug', '==', slug.toLowerCase())
    .where('transparency_enabled', '==', true)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return NextResponse.json(
      {
        error: 'Not Found',
        detail: 'No transparency portal exists at this URL. The agency may not have enabled public transparency.',
      },
      { status: 404 },
    );
  }

  const tenantDoc = snapshot.docs[0];
  const tenantData = tenantDoc.data();
  const tenantId = tenantData.tenant_id || tenantDoc.id;

  // ── Read audit log and verify integrity ──
  const rawEntries = getAuditLog(tenantId);
  const integrity = verifyLogIntegrity(tenantId);

  // ── Sanitize for public consumption ──
  const sanitizedEntries = sanitizeForPublic(rawEntries);

  // Sort newest first
  sanitizedEntries.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  return NextResponse.json({
    agency_name: tenantData.agency_name || 'Government Agency',
    jurisdiction_state: tenantData.jurisdiction_state || '',
    transparency_slug: slug,
    chain_integrity: {
      valid: integrity.valid,
      total_entries: integrity.total_entries,
      verified_entries: integrity.verified_entries,
      checked_at: integrity.checked_at,
    },
    total_public_entries: sanitizedEntries.length,
    entries: sanitizedEntries,
  });
}
