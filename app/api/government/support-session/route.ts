import { NextResponse } from 'next/server';
import { resolveTenantFromSession } from '@/lib/government/tenant-resolver';
import { logAdminAccess } from '@/lib/government/audit-logger';
import { SUPPORT_VIEW_COOKIE } from '@/lib/government/server-redaction';

// =============================================================================
// SUPPORT VIEW SESSION — Privacy-First Access Control
// =============================================================================
// POST → Activate a SUPPORT_VIEW session (2-hour window, PII auto-redacted)
// DELETE → Deactivate a SUPPORT_VIEW session early
//
// When activated:
//   1. An [AUDIT_SHIELD] entry is written to the tenant's chain
//   2. An httpOnly cookie is set so the SERVER can detect the role and
//      apply PII projection BEFORE data enters the response payload
//   3. Client-side redaction is retained as defense-in-depth only
//
// ZERO-LEAK GUARANTEE: Server-side projection is the PRIMARY gate.
// =============================================================================

export async function POST(req: Request) {
  const tenant = await resolveTenantFromSession(req);
  if (!tenant) {
    return NextResponse.json(
      { error: 'Unauthorized', detail: 'No active tenant could be resolved from your session.' },
      { status: 401 },
    );
  }

  let body: { support_agent_id?: string; reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Bad Request', detail: 'Invalid JSON body.' },
      { status: 400 },
    );
  }

  const supportAgentId = body.support_agent_id || 'SUPPORT_AGENT';
  const reason = body.reason || 'Privacy-First Support View — PII Redacted';

  // ── Dual-write: [AUDIT_SHIELD] + [ADMIN_ACTIVITY] ──
  // logAdminAccess() atomically writes to both the tenant's chain
  // and the system-wide admin log with a shared timestamp + receipt ID.
  const { shield: shieldEntry } = logAdminAccess(
    `SUPPORT_VIEW:${supportAgentId}`,
    tenant.tenant_id,
    {
      action: 'view',
      purpose: `[SUPPORT_VIEW ACTIVATED] ${reason} — PII auto-redaction enabled, 2hr TTL`,
      admin_name: supportAgentId,
    },
  );

  const activatedAt = new Date();
  const expiresAt = new Date(activatedAt.getTime() + 2 * 60 * 60 * 1000); // 2 hours

  console.log(
    `[SUPPORT_VIEW] Activated for tenant:${tenant.tenant_id} by ${supportAgentId} — expires ${expiresAt.toISOString()}`,
  );

  // ── Set httpOnly cookie for SERVER-SIDE projection ──
  // This cookie is the primary signal that triggers PII redaction in
  // page.tsx and API routes. It cannot be tampered with from JS.
  const cookiePayload = JSON.stringify({
    expires_at: expiresAt.toISOString(),
    activated_by: supportAgentId,
  });

  const response = NextResponse.json({
    status: 'activated',
    tenant_id: tenant.tenant_id,
    agency_name: tenant.agency_name,
    support_agent_id: supportAgentId,
    activated_at: activatedAt.toISOString(),
    expires_at: expiresAt.toISOString(),
    ttl_seconds: 2 * 60 * 60,
    audit_receipt_id: shieldEntry.admin_access_receipt_id,
    pii_redaction: 'SERVER_ENFORCED',
  });

  response.cookies.set(SUPPORT_VIEW_COOKIE, cookiePayload, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 2 * 60 * 60, // 2 hours — matches session TTL
  });

  return response;
}

export async function DELETE(req: Request) {
  const tenant = await resolveTenantFromSession(req);
  if (!tenant) {
    return NextResponse.json(
      { error: 'Unauthorized', detail: 'No active tenant could be resolved from your session.' },
      { status: 401 },
    );
  }

  // ── Dual-write deactivation: [AUDIT_SHIELD] + [ADMIN_ACTIVITY] ──
  logAdminAccess(
    'SUPPORT_VIEW:DEACTIVATED',
    tenant.tenant_id,
    {
      action: 'view',
      purpose: '[SUPPORT_VIEW DEACTIVATED] Session ended early by operator',
      admin_name: 'SUPPORT_VIEW:DEACTIVATED',
    },
  );

  console.log(
    `[SUPPORT_VIEW] Deactivated for tenant:${tenant.tenant_id}`,
  );

  // ── Clear the httpOnly cookie — server-side projection stops immediately ──
  const response = NextResponse.json({
    status: 'deactivated',
    tenant_id: tenant.tenant_id,
    deactivated_at: new Date().toISOString(),
  });

  response.cookies.set(SUPPORT_VIEW_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 0, // Immediately expire
  });

  return response;
}
