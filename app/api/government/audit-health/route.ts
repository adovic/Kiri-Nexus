import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import { getTenantLogPath, getTenantAuditDir } from '@/lib/government/audit-logger';
import { resolveTenantFromSession } from '@/lib/government/tenant-resolver';
import { guardPublicEndpoint } from '@/lib/api/guards';

// ===========================================
// AUDIT HEALTH CHECK ENDPOINT (Zero Trust)
// ===========================================
// Tenant identity is resolved server-side from
// the authenticated session — NEVER from query
// params or client-supplied headers.
// RATE LIMIT: 60 requests per 5 minutes per IP
// ===========================================

export async function GET(req: NextRequest) {
  // Rate limit: 60 requests per 5 minutes per IP
  const guardResponse = guardPublicEndpoint(req, {
    maxRequests: 60,
    windowMs: 5 * 60 * 1000,
    routeName: '/api/government/audit-health',
  });
  if (guardResponse) return guardResponse;

  // ── Resolve tenant from session ──
  const tenant = await resolveTenantFromSession(req);

  if (!tenant) {
    return NextResponse.json(
      {
        error: 'Unauthorized',
        detail: 'No active tenant could be resolved from your session. Please log in with a provisioned agency account.',
      },
      { status: 401 },
    );
  }

  try {
    // 1. Resolve tenant-specific paths (auto-creates dir)
    const auditDir = getTenantAuditDir(tenant.tenant_id);
    const logFile = getTenantLogPath(tenant.tenant_id);

    // 2. Verify file is writable by appending + removing a probe line
    const probe = JSON.stringify({
      _probe: true,
      timestamp: new Date().toISOString(),
    }) + '\n';

    fs.appendFileSync(logFile, probe, 'utf-8');

    // Remove the probe line (read, strip last line, rewrite)
    const content = fs.readFileSync(logFile, 'utf-8');
    const lines = content.split('\n').filter(Boolean);
    const cleaned = lines.filter((l) => !l.includes('"_probe":true'));
    fs.writeFileSync(logFile, cleaned.length > 0 ? cleaned.map((l) => l + '\n').join('') : '', 'utf-8');

    // 3. Report entry count
    return NextResponse.json({
      status: 'healthy',
      tenant_id: tenant.tenant_id,
      agency_name: tenant.agency_name,
      log_file: logFile,
      audit_dir: auditDir,
      entry_count: cleaned.length,
      checked_at: new Date().toISOString(),
    });
  } catch (err) {
    // Log internally but don't expose details to client
    console.error('[Audit Health] FAILURE:', err instanceof Error ? err.message : 'Unknown');

    return NextResponse.json(
      {
        status: 'failed',
        error: 'Audit health check failed',
        checked_at: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
