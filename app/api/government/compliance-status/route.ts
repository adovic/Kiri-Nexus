import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import {
  resolveTenantFromSession,
} from '@/lib/government/tenant-resolver';
import { hasTenantKey } from '@/lib/government/tenant-key-manager';
import { getTenantAccessHistory } from '@/lib/government/audit-logger';
import { guardPublicEndpoint } from '@/lib/api/guards';

// =============================================================================
// COMPLIANCE STATUS ENDPOINT — Sovereign Guard (CJIS / HIPAA)
// =============================================================================
// RATE LIMIT: 60 requests per 5 minutes per IP (defense-in-depth)
// =============================================================================
//
// Returns a consolidated compliance posture snapshot for the authenticated
// tenant. Three compliance domains are checked:
//
//   1. ENCRYPTION  — AES-256-GCM key active + key age (90-day rotation policy)
//   2. RESIDENCY   — SOVEREIGNTY_REGION env var pinned to expected US region
//   3. ACCESS LOGS — Admin access events ([AUDIT_SHIELD]) in last 24 hours
//
// Overall status:
//   "compliant" — all checks pass
//   "warning"   — non-critical issue (e.g. key rotation overdue)
//   "critical"  — encryption missing or residency violation
//
// Auth: Session cookie only (dashboard browser path).
// =============================================================================

const ROTATION_THRESHOLD_DAYS = 90;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
const KEYS_ROOT = path.join(process.cwd(), 'data', 'keys');
const EXPECTED_REGION = process.env.COMPLIANCE_EXPECTED_REGION || 'US-WEST';

/**
 * Sanitize tenant ID for key file path lookup.
 * Mirrors the logic in tenant-key-manager.ts (not exported).
 */
function sanitizeTenantId(tenantId: string): string {
  return tenantId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || '_global';
}

/**
 * Resolve the key file path for a given tenant.
 */
function getKeyPath(tenantId: string): string {
  return path.join(KEYS_ROOT, `${sanitizeTenantId(tenantId)}.key`);
}

// ── GET Handler ──────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // Rate limit: 60 requests per 5 minutes per IP
  const guardResponse = guardPublicEndpoint(req, {
    maxRequests: 60,
    windowMs: 5 * 60 * 1000,
    routeName: '/api/government/compliance-status',
  });
  if (guardResponse) return guardResponse;

  // ── Auth: Session-only (dashboard path) ──
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

  const now = new Date();
  const tenantId = tenant.tenant_id;

  // =====================================================================
  // CHECK 1: ENCRYPTION STATUS — AES-256-GCM Key Active + Age
  // =====================================================================

  const encryptionActive = hasTenantKey(tenantId);
  let keyAgeDays: number | null = null;
  let rotationOverdue = false;

  if (encryptionActive) {
    try {
      const keyPath = getKeyPath(tenantId);
      const stat = fs.statSync(keyPath);
      const ageMs = now.getTime() - stat.mtime.getTime();
      keyAgeDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
      rotationOverdue = keyAgeDays > ROTATION_THRESHOLD_DAYS;
    } catch {
      // stat failed — key file exists (hasTenantKey returned true) but
      // metadata is unreadable. Flag as overdue out of caution.
      keyAgeDays = null;
      rotationOverdue = true;
    }
  }

  // =====================================================================
  // CHECK 2: DATA RESIDENCY — SOVEREIGNTY_REGION Env Var
  // =====================================================================

  const sovereigntyRegion = process.env.SOVEREIGNTY_REGION || null;
  const residencyPinned =
    sovereigntyRegion !== null &&
    sovereigntyRegion.toUpperCase() === EXPECTED_REGION.toUpperCase();

  // =====================================================================
  // CHECK 3: ACCESS LOGS — Admin Events in Last 24 Hours
  // =====================================================================

  const cutoff = new Date(now.getTime() - TWENTY_FOUR_HOURS_MS);
  let adminEvents24h = 0;
  let lastAccessAt: string | null = null;
  let totalAdminEvents = 0;

  try {
    const history = getTenantAccessHistory(tenantId);
    totalAdminEvents = history.length;

    // Sort newest-first for last_access_at
    history.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );

    if (history.length > 0) {
      lastAccessAt = history[0].timestamp;
    }

    adminEvents24h = history.filter(
      (e) => new Date(e.timestamp).getTime() >= cutoff.getTime(),
    ).length;
  } catch {
    // Non-fatal: access log read failure does not invalidate other checks
  }

  // =====================================================================
  // OVERALL STATUS DERIVATION
  // =====================================================================
  //   critical  → encryption missing OR residency not pinned
  //   warning   → all checks pass but key rotation overdue (> 90 days)
  //   compliant → everything green

  let overall: 'compliant' | 'warning' | 'critical' = 'compliant';

  if (!encryptionActive || !residencyPinned) {
    overall = 'critical';
  } else if (rotationOverdue) {
    overall = 'warning';
  }

  // =====================================================================
  // RESPONSE
  // =====================================================================

  return NextResponse.json({
    encryption: {
      active: encryptionActive,
      cipher: encryptionActive ? 'AES-256-GCM' : null,
      key_age_days: keyAgeDays,
      rotation_overdue: rotationOverdue,
      rotation_threshold_days: ROTATION_THRESHOLD_DAYS,
    },
    residency: {
      region: sovereigntyRegion,
      expected_region: EXPECTED_REGION,
      pinned: residencyPinned,
    },
    access_logs: {
      events_24h: adminEvents24h,
      last_access_at: lastAccessAt,
      total_events: totalAdminEvents,
    },
    overall,
    tenant_id: tenantId,
    agency_name: tenant.agency_name,
    checked_at: now.toISOString(),
  });
}
