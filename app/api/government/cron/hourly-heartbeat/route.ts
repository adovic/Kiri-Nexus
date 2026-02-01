import { NextResponse } from 'next/server';
import { CRON_SECRET } from '@/lib/government/chain-witness';
import { emitAllHeartbeats } from '@/lib/government/sovereign-heartbeat';

// =============================================================================
// SOVEREIGN HEARTBEAT — Hourly Cron Endpoint
// =============================================================================
// Writes a [HEARTBEAT] entry into every tenant's Merkle chain every 60 minutes.
// Each entry proves the system was HEALTHY, sovereign data was LOCKED to the
// correct region, and chain integrity was VERIFIED at that hour.
//
// Gaps in heartbeat entries prove downtime. A broken chain proves tampering.
// Monthly billing reports use heartbeat count to calculate uptime SLA.
//
// Security:
//   - Protected by CRON_SECRET (same secret as the daily-anchor cron)
//   - Vercel Cron sends this header automatically when configured
//   - Manual invocation requires the Authorization: Bearer <secret> header
//
// Schedule (add to vercel.json):
//   "crons": [
//     { "path": "/api/government/cron/hourly-heartbeat", "schedule": "0 * * * *" }
//   ]
//
// Manual trigger:
//   curl -X POST /api/government/cron/hourly-heartbeat \
//        -H "Authorization: Bearer <CRON_SECRET>"
// =============================================================================

/**
 * Verify the request is authorized to trigger the heartbeat.
 */
function isAuthorized(req: Request): boolean {
  if (!CRON_SECRET) {
    console.warn(
      '[Heartbeat Cron] No CRON_SECRET configured — allowing request in development mode.',
    );
    return true;
  }

  const authHeader = req.headers.get('authorization') || '';
  if (authHeader === `Bearer ${CRON_SECRET}`) return true;

  const cronHeader = req.headers.get('x-cron-secret') || '';
  if (cronHeader === CRON_SECRET) return true;

  return false;
}

export async function POST(req: Request) {
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
    const summary = emitAllHeartbeats();

    return NextResponse.json({
      status: 'complete',
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      pulse_timestamp: summary.pulse_timestamp,
      region: summary.region,
      summary: {
        total_tenants: summary.total_tenants,
        healthy: summary.healthy,
        degraded: summary.degraded,
        errors: summary.errors,
      },
      results: summary.results,
    });
  } catch (err) {
    console.error('[Heartbeat Cron] Fatal error:', err);
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

// Vercel Cron sends GET requests by default
export async function GET(req: Request) {
  return POST(req);
}
