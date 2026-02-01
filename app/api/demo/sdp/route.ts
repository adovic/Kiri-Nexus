import { NextRequest, NextResponse } from 'next/server';
import { guardPublicEndpoint } from '@/lib/api/guards';

// Force Node.js runtime for reliable env var access
export const runtime = 'nodejs';

// =============================================================================
// DEMO SDP EXCHANGE ROUTE — Server-Side WebRTC Signaling (PUBLIC)
// =============================================================================
// This route proxies the SDP exchange with OpenAI's Realtime API to avoid
// CORS issues when calling from the browser.
//
// Flow:
//   1. Client calls /api/demo/realtime to get ephemeral key
//   2. Client creates WebRTC offer
//   3. Client calls THIS route with { sdp, ephemeralKey, model }
//   4. This route calls OpenAI server-side and returns the SDP answer
//   5. Client sets remote description with the answer
//
// ABUSE PREVENTION:
//   - Rate limit: 30 requests per 5 minutes per IP
//   - Origin validation: localhost (dev) or allowed domains (prod)
// =============================================================================

const DEFAULT_MODEL = 'gpt-4o-realtime-preview-2024-12-17';

// Rate limit: 30 requests per 5 minutes (same as /api/demo/realtime)
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;

// =============================================================================
// API ROUTE HANDLER
// =============================================================================

export async function POST(request: NextRequest) {
  // Abuse prevention: rate limit + origin check
  const guardResponse = guardPublicEndpoint(request, {
    maxRequests: RATE_LIMIT_MAX,
    windowMs: RATE_LIMIT_WINDOW_MS,
    routeName: '/api/demo/sdp',
  });
  if (guardResponse) return guardResponse;

  try {
    // Parse request body
    const body = await request.json().catch(() => ({}));
    const sdp = body?.sdp as string | undefined;
    const ephemeralKey = body?.ephemeralKey as string | undefined;
    const model = (body?.model as string) || DEFAULT_MODEL;

    // Validate required fields
    if (!sdp) {
      console.error('[/api/demo/sdp] Missing SDP in request body');
      return NextResponse.json(
        { error: 'Missing required field: sdp' },
        { status: 400 }
      );
    }

    if (!ephemeralKey) {
      console.error('[/api/demo/sdp] Missing ephemeralKey in request body');
      return NextResponse.json(
        { error: 'Missing required field: ephemeralKey' },
        { status: 400 }
      );
    }

    // Validate ephemeral key format (basic sanity check)
    if (typeof ephemeralKey !== 'string' || ephemeralKey.length < 20) {
      console.error('[/api/demo/sdp] Invalid ephemeralKey format');
      return NextResponse.json(
        { error: 'Invalid ephemeral key format' },
        { status: 400 }
      );
    }

    // Log request (never log the actual key)
    // Verify audio is in the SDP offer (look for m=audio line)
    const hasAudioInSdp = sdp.includes('m=audio');
    console.log(`[/api/demo/sdp] SDP exchange request - model: ${model}, sdp length: ${sdp.length}, hasAudio: ${hasAudioInSdp}`);

    // Make server-side request to OpenAI Realtime API
    const openaiUrl = `https://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`;

    const res = await fetch(openaiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ephemeralKey}`,
        'Content-Type': 'application/sdp',
      },
      body: sdp,
    });

    // Log response status (never log sensitive data)
    console.log(`[/api/demo/sdp] OpenAI response status: ${res.status}`);

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[/api/demo/sdp] OpenAI SDP exchange failed (${res.status}):`,
        errText.length > 200 ? errText.slice(0, 200) + '...' : errText
      );

      // Handle specific error codes
      if (res.status === 401) {
        return NextResponse.json(
          { error: 'Authentication failed - ephemeral key may be expired or invalid' },
          { status: 401 }
        );
      }

      if (res.status === 429) {
        return NextResponse.json(
          { error: 'Rate limit exceeded - please wait and try again' },
          { status: 429 }
        );
      }

      return NextResponse.json(
        { error: `OpenAI SDP exchange failed: ${res.status}` },
        { status: res.status >= 500 ? 502 : res.status }
      );
    }

    // Get the SDP answer
    const answerSdp = await res.text();

    if (!answerSdp || answerSdp.length < 50) {
      console.error('[/api/demo/sdp] Invalid SDP answer received');
      return NextResponse.json(
        { error: 'Invalid SDP answer from OpenAI' },
        { status: 502 }
      );
    }

    // Verify audio is in the SDP answer
    const answerHasAudio = answerSdp.includes('m=audio');
    console.log(`[/api/demo/sdp] SDP exchange successful - answer length: ${answerSdp.length}, answerHasAudio: ${answerHasAudio}`);

    // Return the SDP answer
    return NextResponse.json({ sdp: answerSdp });

  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    console.error('[/api/demo/sdp] Exception:', message);
    return NextResponse.json(
      { error: 'SDP exchange failed' },
      { status: 500 }
    );
  }
}
