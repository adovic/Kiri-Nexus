import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { getAuditLog, logAdminAccess, AuditWriteError } from '@/lib/government/audit-logger';
import type { AdminAccessEntry } from '@/lib/government/audit-logger';
import { guardPublicEndpoint } from '@/lib/api/guards';

// =============================================================================
// ADMIN AUDIT ACCESS ENDPOINT (Sovereign Data Protection)
// =============================================================================
// RATE LIMIT: 60 requests per 5 minutes per IP (defense-in-depth)
// =============================================================================
// This route allows SUPER_ADMIN users to view or download a tenant's audit log.
//
// EVERY access is recorded as an [AUDIT_SHIELD] entry in the TARGET tenant's
// own log, giving the data owner a tamper-evident chain of custody that
// includes internal support access.
//
// Auth flow:
//   1. Extract admin email from session (cookie or header — same as portal)
//   2. Verify SUPER_ADMIN role against the `superAdmins` Firestore collection
//   3. Log the access via logAdminAccess() → dual-write:
//        [AUDIT_SHIELD] in the tenant's chain + [ADMIN_ACTIVITY] in the system log
//   4. Return the tenant's audit log
//
// Query params:
//   ?tenant_id=<id>           — (required) target tenant
//   ?action=view|download     — (optional, default: view)
//   ?purpose=<string>         — (optional, default: "Technical Review")
// =============================================================================

const SUPER_ADMINS_COLLECTION = 'superAdmins';

// ── SUPER_ADMIN Resolution ───────────────────────────────────────────────────

interface SuperAdminProfile {
  email: string;
  name: string;
  role: 'SUPER_ADMIN';
}

/**
 * Verify that the given email belongs to a SUPER_ADMIN.
 * Checks the `superAdmins` Firestore collection where doc ID = email.
 */
async function verifySuperAdmin(email: string): Promise<SuperAdminProfile | null> {
  if (!email) return null;

  try {
    const doc = await adminDb
      .collection(SUPER_ADMINS_COLLECTION)
      .doc(email.toLowerCase())
      .get();

    if (!doc.exists) return null;

    const data = doc.data();
    if (data?.role !== 'SUPER_ADMIN') return null;

    return {
      email: email.toLowerCase(),
      name: data.name || email,
      role: 'SUPER_ADMIN',
    };
  } catch (err) {
    console.error('[Admin Audit Access] Firestore lookup failed:', err);
    return null;
  }
}

// ── Email Extraction (mirrors tenant-resolver pattern) ───────────────────────

function extractAdminEmail(req: Request): string | null {
  // Priority 1: Middleware-injected header (production path)
  const headerEmail = req.headers.get('x-gov-user-email');
  if (headerEmail && headerEmail.includes('@')) {
    return headerEmail.toLowerCase().trim();
  }

  // Priority 2: Cookie-based email (dev/demo path)
  const cookie = req.headers.get('cookie') || '';
  const tokenMatch = cookie.match(/gov-auth-token=([^;]+)/);
  if (!tokenMatch) return null;

  const tokenValue = decodeURIComponent(tokenMatch[1].trim());
  if (tokenValue.includes('@')) {
    return tokenValue.toLowerCase();
  }

  return null;
}

// ── Route Handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // Rate limit: 60 requests per 5 minutes per IP
  const guardResponse = guardPublicEndpoint(req, {
    maxRequests: 60,
    windowMs: 5 * 60 * 1000,
    routeName: '/api/government/admin-audit-access',
  });
  if (guardResponse) return guardResponse;

  // ── Step 1: Extract admin identity ──
  const adminEmail = extractAdminEmail(req);

  if (!adminEmail) {
    return NextResponse.json(
      {
        error: 'Unauthorized',
        detail: 'No admin identity could be resolved from your session. Please log in with a SUPER_ADMIN account.',
      },
      { status: 401 },
    );
  }

  // ── Step 2: Verify SUPER_ADMIN role ──
  const admin = await verifySuperAdmin(adminEmail);

  if (!admin) {
    console.warn(
      `[Admin Audit Access] DENIED — ${adminEmail} is not a SUPER_ADMIN`,
    );
    return NextResponse.json(
      {
        error: 'Forbidden',
        detail: 'Access restricted to SUPER_ADMIN role. Your account does not have sovereign audit access privileges.',
      },
      { status: 403 },
    );
  }

  // ── Step 3: Parse query params ──
  const url = new URL(req.url);
  const tenantId = url.searchParams.get('tenant_id');
  const action = (url.searchParams.get('action') || 'view') as AdminAccessEntry['action'];
  const purpose = url.searchParams.get('purpose') || 'Technical Review';

  if (!tenantId) {
    return NextResponse.json(
      {
        error: 'Bad Request',
        detail: 'Missing required query parameter: tenant_id',
      },
      { status: 400 },
    );
  }

  // Validate action param
  if (!['view', 'download', 'export'].includes(action)) {
    return NextResponse.json(
      {
        error: 'Bad Request',
        detail: 'Invalid action. Must be one of: view, download, export.',
      },
      { status: 400 },
    );
  }

  // ── Step 4: Log the admin access (DUAL-WRITE: AUDIT_SHIELD + ADMIN_ACTIVITY) ──
  // logAdminAccess() atomically writes:
  //   Write 1: [AUDIT_SHIELD] → tenant's chain (sovereign protection)
  //   Write 2: [ADMIN_ACTIVITY] → system-wide admin_access.log (developer liability)
  // Both entries share the same timestamp and receipt ID.
  let shieldEntry: AdminAccessEntry;
  try {
    const dualLog = logAdminAccess(admin.email, tenantId, {
      action,
      purpose,
      admin_name: admin.name,
    });
    shieldEntry = dualLog.shield;
  } catch (err) {
    const detail = err instanceof AuditWriteError ? err.message : String(err);
    console.error('[Admin Audit Access] AUDIT_SHIELD write failed:', detail);
    return NextResponse.json(
      {
        error: 'Audit Shield Failure',
        detail: `Admin access could not be recorded to tenant "${tenantId}" audit log. Data access is BLOCKED until the audit shield can write successfully.`,
        cause: detail,
      },
      { status: 500 },
    );
  }

  // ── Step 5: Return the audit log ──
  const auditEntries = getAuditLog(tenantId);

  const responsePayload = {
    tenant_id: tenantId,
    admin_id: admin.email,
    admin_name: admin.name,
    action,
    shield_receipt: {
      receipt_id: shieldEntry.admin_access_receipt_id,
      timestamp: shieldEntry.timestamp,
      marker: shieldEntry.marker,
      purpose: shieldEntry.purpose,
    },
    entry_count: auditEntries.length,
    entries: auditEntries,
    accessed_at: new Date().toISOString(),
  };

  // For download action, return as a downloadable NDJSON file
  if (action === 'download' || action === 'export') {
    const ndjson = auditEntries
      .map((e) => JSON.stringify(e))
      .join('\n');

    return new Response(ndjson, {
      status: 200,
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Content-Disposition': `attachment; filename="${tenantId}_audit_log.ndjson"`,
        'X-Audit-Shield-Receipt': shieldEntry.admin_access_receipt_id,
      },
    });
  }

  // For view action, return structured JSON
  return NextResponse.json(responsePayload, {
    headers: {
      'X-Audit-Shield-Receipt': shieldEntry.admin_access_receipt_id,
    },
  });
}
