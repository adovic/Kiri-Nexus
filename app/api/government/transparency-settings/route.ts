import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { resolveTenantFromSession } from '@/lib/government/tenant-resolver';

// =============================================================================
// TRANSPARENCY SETTINGS ENDPOINT (Tenant-Authenticated)
// =============================================================================
// GET  → Read the current transparency portal setting for the tenant
// POST → Toggle the transparency portal on or off
//
// When enabled, a public URL at /transparency/{slug} serves sanitized
// (PII-free) audit logs. The slug is derived from the agency name.
//
// Stored in Firestore: govTenants/{tenant_id}.transparency_enabled (boolean)
//                      govTenants/{tenant_id}.transparency_slug     (string)
// =============================================================================

const TENANTS_COLLECTION = 'govTenants';

/**
 * Derive a URL-safe slug from an agency name.
 * "City of Vallejo" → "vallejo"
 * "Springfield Township" → "springfield-township"
 */
function deriveSlug(agencyName: string): string {
  return agencyName
    .toLowerCase()
    .replace(/^(city|town|village|county|borough|township)\s+(of\s+)?/i, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'agency';
}

export async function GET(req: Request) {
  const tenant = await resolveTenantFromSession(req);
  if (!tenant) {
    return NextResponse.json(
      { error: 'Unauthorized', detail: 'No active tenant could be resolved from your session.' },
      { status: 401 },
    );
  }

  // Read current setting from Firestore
  const doc = await adminDb
    .collection(TENANTS_COLLECTION)
    .doc(tenant.tenant_id)
    .get();

  const data = doc.exists ? doc.data() : {};
  const enabled = data?.transparency_enabled === true;
  const slug = data?.transparency_slug || deriveSlug(tenant.agency_name);

  return NextResponse.json({
    tenant_id: tenant.tenant_id,
    agency_name: tenant.agency_name,
    transparency_enabled: enabled,
    transparency_slug: slug,
    public_url: enabled ? `/transparency/${slug}` : null,
  });
}

export async function POST(req: Request) {
  const tenant = await resolveTenantFromSession(req);
  if (!tenant) {
    return NextResponse.json(
      { error: 'Unauthorized', detail: 'No active tenant could be resolved from your session.' },
      { status: 401 },
    );
  }

  let body: { enabled?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Bad Request', detail: 'Invalid JSON body.' },
      { status: 400 },
    );
  }

  const enabled = body.enabled === true;
  const slug = deriveSlug(tenant.agency_name);

  // Write to Firestore
  await adminDb
    .collection(TENANTS_COLLECTION)
    .doc(tenant.tenant_id)
    .set(
      {
        transparency_enabled: enabled,
        transparency_slug: slug,
        transparency_updated_at: new Date().toISOString(),
      },
      { merge: true },
    );

  console.log(
    `[Transparency] tenant:${tenant.tenant_id} — portal ${enabled ? 'ENABLED' : 'DISABLED'} | slug:${slug}`,
  );

  return NextResponse.json({
    tenant_id: tenant.tenant_id,
    agency_name: tenant.agency_name,
    transparency_enabled: enabled,
    transparency_slug: slug,
    public_url: enabled ? `/transparency/${slug}` : null,
  });
}
