import { NextResponse } from 'next/server';
import { CRON_SECRET } from '@/lib/government/chain-witness';
import { emitPulseForAllTenants } from '@/lib/government/uptime-witness';

// =============================================================================
// UPTIME WITNESS — 10-Minute Cron Endpoint
// =============================================================================
// Writes a [PULSE] entry into every tenant's Merkle chain every 10 minutes.
// If a gap is detected (PID change, time gap, missing state), emits
// [SYSTEM_RECOVERY] entries for all tenants BEFORE the pulse — proving
// chain continuity was maintained across downtime.
//
// Security:
//   - Protected by CRON_SECRET (same secret as daily-anchor / hourly-heartbeat)
//   - Vercel Cron sends this header automatically when configured
//   - Manual invocation requires the Authorization: Bearer <secret> header
//
// Schedule (add to vercel.json):
//   "crons": [
//     { "path": "/api/government/cron/uptime-pulse", "schedule": "*/10 * * * *" }
//   ]
//
// Manual trigger:
//   curl -X POST /api/government/cron/uptime-pulse \
//        -H "Authorization: Bearer <CRON_SECRET>"
// =============================================================================

/**
 * Verify the request is authorized to trigger the uptime pulse.
 */
function isAuthorized(req: Request): boolean {
  if (!CRON_SECRET) {
    console.warn(
      '[Uptime Pulse Cron] No CRON_SECRET configured — allowing request in development mode.',
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

  try {
    const summary = emitPulseForAllTenants();

    return NextResponse.json({
      status: 'complete',
      started_at: summary.started_at,
      completed_at: summary.completed_at,
      gap_detected: summary.gap_detected,
      gap_info: summary.gap_info,
      uptime_sequence: summary.uptime_sequence,
      summary: {
        total_tenants: summary.total_tenants,
        pulsed: summary.pulsed,
        recovered: summary.recovered,
        errors: summary.errors,
      },
      results: summary.results,
    });
  } catch (err) {
    console.error('[Uptime Pulse Cron] Fatal error:', err);
    return NextResponse.json(
      {
        status: 'fatal_error',
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
