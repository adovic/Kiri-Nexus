import { NextRequest, NextResponse } from 'next/server';
import { getTenantAccessHistory } from '@/lib/government/audit-logger';
import { resolveTenantFromSession } from '@/lib/government/tenant-resolver';
import {
  isSupportViewFromRequest,
  projectAccessHistory,
} from '@/lib/government/server-redaction';
import { guardPublicEndpoint } from '@/lib/api/guards';

// =============================================================================
// ADMIN ACCESS HISTORY ENDPOINT (Tenant Visibility)
// =============================================================================
// RATE LIMIT: 60 requests per 5 minutes per IP (defense-in-depth)
// =============================================================================
// Returns the list of [AUDIT_SHIELD] entries from the tenant's own audit log,
// allowing the agency to see exactly when a SUPER_ADMIN accessed their data,
// what action was performed, and for what declared purpose.
//
// Auth: Tenant identity is resolved server-side from the authenticated session.
// No client-supplied tenant IDs are trusted.
//
// ZERO-LEAK GUARANTEE: If SUPPORT_VIEW is active, admin_id (email) and
// purpose fields are redacted BEFORE entering the response payload.
// =============================================================================

export async function GET(req: NextRequest) {
  // Rate limit: 60 requests per 5 minutes per IP
  const guardResponse = guardPublicEndpoint(req, {
    maxRequests: 60,
    windowMs: 5 * 60 * 1000,
    routeName: '/api/government/admin-access-history',
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

  // ── Read [AUDIT_SHIELD] entries from the tenant's own log ──
  const accessHistory = getTenantAccessHistory(tenant.tenant_id);

  // Sort newest first
  accessHistory.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  // ── Server-Side PII Projection ──
  // Check the httpOnly cookie. If SUPPORT_VIEW is active, redact PII
  // (admin emails, purpose text) BEFORE the data enters res.json().
  const isSupportView = isSupportViewFromRequest(req);

  const rawEntries = accessHistory.map((entry) => ({
    receipt_id: entry.admin_access_receipt_id,
    timestamp: entry.timestamp,
    admin_id: entry.admin_id,
    action: entry.action,
    purpose: entry.purpose,
  }));

  const projectedEntries = projectAccessHistory(rawEntries, isSupportView);

  return NextResponse.json({
    tenant_id: tenant.tenant_id,
    agency_name: tenant.agency_name,
    total_accesses: accessHistory.length,
    entries: projectedEntries,
  });
}
