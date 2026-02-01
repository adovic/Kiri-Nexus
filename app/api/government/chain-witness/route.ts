import { NextRequest, NextResponse } from 'next/server';
import {
  verifyRemoteWitness,
  getLatestAnchor,
  getAnchorHistory,
} from '@/lib/government/chain-witness';
import { resolveTenantFromSession } from '@/lib/government/tenant-resolver';
import { guardPublicEndpoint } from '@/lib/api/guards';

// =============================================================================
// CHAIN WITNESS VERIFICATION ENDPOINT (Tenant-Facing)
// =============================================================================
// RATE LIMIT: 60 requests per 5 minutes per IP (defense-in-depth)
// =============================================================================
// Allows a tenant to verify their local audit chain against the most recent
// remotely witnessed anchor stored in Firestore.
//
// This is the tenant's proof that their logs haven't been tampered with —
// even if someone gained disk access and rewrote the .ndjson file, the
// remote anchor proves what the chain state SHOULD be.
//
// GET /api/government/chain-witness
//   → Returns the full witness verification result
//
// GET /api/government/chain-witness?history=true
//   → Returns the full anchor history for the tenant
//
// Auth: Tenant identity resolved server-side from session (Zero Trust).
// =============================================================================

export async function GET(req: NextRequest) {
  // Rate limit: 60 requests per 5 minutes per IP
  const guardResponse = guardPublicEndpoint(req, {
    maxRequests: 60,
    windowMs: 5 * 60 * 1000,
    routeName: '/api/government/chain-witness',
  });
  if (guardResponse) return guardResponse;

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

  const url = new URL(req.url);
  const showHistory = url.searchParams.get('history') === 'true';

  // ── Anchor history mode ──
  if (showHistory) {
    const anchors = await getAnchorHistory(tenant.tenant_id);
    return NextResponse.json({
      tenant_id: tenant.tenant_id,
      agency_name: tenant.agency_name,
      total_anchors: anchors.length,
      anchors,
    });
  }

  // ── Default: Verify against latest anchor ──
  const verification = await verifyRemoteWitness(tenant.tenant_id);
  const latestAnchor = await getLatestAnchor(tenant.tenant_id);

  return NextResponse.json({
    tenant_id: tenant.tenant_id,
    agency_name: tenant.agency_name,
    verification,
    latest_anchor: latestAnchor,
  });
}
