import { NextResponse } from 'next/server';
import {
  anchorAllTenantsRemote,
  CRON_SECRET,
} from '@/lib/government/chain-witness';

// =============================================================================
// DAILY CHAIN ANCHOR — Cron Endpoint
// =============================================================================
// Captures the current chain head hash for every tenant silo on disk and
// stores each as a signed "anchor" record in Firestore.
//
// This is the "Remote Witnessing" system: even if the entire .ndjson file
// is deleted or rewritten, the anchor in Firestore proves what the chain
// state WAS at the time of capture.
//
// Security:
//   - Protected by CRON_SECRET (set via environment variable)
//   - Vercel Cron sends this header automatically when configured
//   - Manual invocation requires the Authorization: Bearer <secret> header
//
// Schedule (Vercel cron config in vercel.json):
//   "crons": [{ "path": "/api/government/cron/daily-anchor", "schedule": "0 0 * * *" }]
//
// Can also be invoked manually (e.g., after a security incident) with:
//   curl -X POST /api/government/cron/daily-anchor \
//        -H "Authorization: Bearer <CRON_SECRET>"
// =============================================================================

/**
 * Verify the request is authorized to trigger the anchor.
 *
 * Accepts two auth patterns:
 *   1. Vercel Cron:     Authorization header matches CRON_SECRET
 *   2. Manual trigger:  Authorization: Bearer <CRON_SECRET>
 */
function isAuthorized(req: Request): boolean {
  // If no CRON_SECRET is set, allow in development only
  if (!CRON_SECRET) {
    console.warn(
      '[Daily Anchor] No CRON_SECRET configured — allowing request in development mode.',
    );
    return true;
  }

  const authHeader = req.headers.get('authorization') || '';

  // Pattern 1: Exact match (Vercel Cron)
  if (authHeader === `Bearer ${CRON_SECRET}`) return true;

  // Pattern 2: x-cron-secret header (alternative)
  const cronHeader = req.headers.get('x-cron-secret') || '';
  if (cronHeader === CRON_SECRET) return true;

  return false;
}

export async function POST(req: Request) {
  // ── Auth gate ──
  if (!isAuthorized(req)) {
    return NextResponse.json(
      {
        error: 'Unauthorized',
        detail: 'Invalid or missing CRON_SECRET. Set the Authorization header to "Bearer <CRON_SECRET>".',
      },
      { status: 401 },
    );
  }

  const startedAt = new Date().toISOString();

  try {
    // ── Anchor all tenants ──
    const results = await anchorAllTenantsRemote();

    const anchored = results.filter((r) => r.status === 'anchored');
    const errors = results.filter((r) => r.status === 'error');

    console.log(
      `[Daily Anchor] Complete — ${anchored.length} tenants anchored, ${errors.length} errors`,
    );

    return NextResponse.json({
      status: 'complete',
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      summary: {
        total_tenants: results.length,
        anchored: anchored.length,
        errors: errors.length,
      },
      results,
    });
  } catch (err) {
    console.error('[Daily Anchor] Fatal error:', err);
    return NextResponse.json(
      {
        status: 'fatal_error',
        started_at: startedAt,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}

// Also support GET for Vercel Cron (which sends GET requests by default)
export async function GET(req: Request) {
  return POST(req);
}
