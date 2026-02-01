import { NextRequest, NextResponse } from 'next/server';
import { initializeState } from '@/lib/commercial/device-state';
import { guardPublicEndpoint, safeErrorResponse } from '@/lib/api/guards';

// =============================================================================
// COMMERCIAL RESET API — PUBLIC (Sandbox Only)
// =============================================================================
// This endpoint resets the IN-MEMORY demo sandbox state for the commercial demo.
//
// SAFETY GUARANTEE:
//   - This route ONLY touches in-memory state in lib/commercial/device-state.ts
//   - It does NOT access Firestore, Firebase Auth, or any real user data
//   - It does NOT modify any persistent storage
//   - The state being reset is purely for demo simulation (inventory, devices, etc.)
//
// ABUSE PREVENTION:
//   - Rate limit: 10 requests per 5 minutes per IP
//   - Origin validation: localhost (dev) or allowed domains (prod)
// =============================================================================

// Rate limit: 10 requests per 5 minutes
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

export async function POST(request: NextRequest) {
  // Abuse prevention: rate limit + origin check
  const guardResponse = guardPublicEndpoint(request, {
    maxRequests: RATE_LIMIT_MAX,
    windowMs: RATE_LIMIT_WINDOW_MS,
    routeName: '/api/commercial/reset',
  });
  if (guardResponse) return guardResponse;

  try {
    let industry = 'restaurant';
    try {
      const body = await request.json();
      // Only accept 'industry' field, ignore everything else
      if (body?.industry && typeof body.industry === 'string') {
        industry = body.industry;
      }
    } catch {
      // No body or invalid JSON — use default
    }

    const resolvedKey = initializeState(industry);
    // Log without exposing full request body
    console.log(`[Commercial API] State seeded for industry: ${resolvedKey}`);
    return NextResponse.json({
      status: 'reset_complete',
      industry: resolvedKey,
    });
  } catch (error) {
    // Use safe error response - never expose stack traces
    return safeErrorResponse(error, '/api/commercial/reset', 500);
  }
}
