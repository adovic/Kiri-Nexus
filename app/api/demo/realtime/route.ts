import { NextRequest, NextResponse } from 'next/server';
import { guardPublicEndpoint, safeErrorResponse } from '@/lib/api/guards';

// Force Node.js runtime for reliable env var access
export const runtime = 'nodejs';

// =============================================================================
// DEMO REALTIME API ROUTE — OpenAI ONLY (PUBLIC)
// =============================================================================
// This route is EXCLUSIVELY for the commercial demo (/demo/call).
// It uses OpenAI's consumer Realtime API — NEVER Azure.
//
// IMPORTANT: This route must work even if ZERO Azure env vars exist.
// Azure is reserved for government/HIPAA routes only.
//
// Required Environment Variable:
//   OPENAI_API_KEY — Consumer OpenAI API key (server-side only, never NEXT_PUBLIC)
//
// Provider Split:
//   - Demo + Commercial Preview → OpenAI + ElevenLabs (this route)
//   - Government + HIPAA        → Azure OpenAI only (see /api/realtime)
//
// ABUSE PREVENTION:
//   - Rate limit: 30 requests per 5 minutes per IP
//   - Origin validation: localhost (dev) or allowed domains (prod)
// =============================================================================

const OPENAI_MODEL = 'gpt-4o-realtime-preview-2024-12-17';

// Rate limit: 30 requests per 5 minutes
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

// =============================================================================
// API ROUTE HANDLER
// =============================================================================

export async function GET(request: NextRequest) {
  // Abuse prevention: rate limit + origin check
  const guardResponse = guardPublicEndpoint(request, {
    maxRequests: RATE_LIMIT_MAX,
    windowMs: RATE_LIMIT_WINDOW_MS,
    routeName: '/api/demo/realtime',
  });
  if (guardResponse) return guardResponse;
  // Hard-coded provider: OpenAI only
  const provider = 'openai';

  // Get API key (OPENAI_API_KEY only — server-side, never NEXT_PUBLIC)
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  // Diagnostic logging (never log the actual key)
  console.log(`[/api/demo/realtime] OPENAI_API_KEY present: ${!!apiKey}`);

  // Check OpenAI configuration
  if (!apiKey) {
    console.error('[/api/demo/realtime] 503 - OPENAI_API_KEY not configured');
    return NextResponse.json(
      {
        error: 'Demo voice is not configured',
        configRequired: true,
        provider,
        hint: 'Add OPENAI_API_KEY to .env.local'
      },
      { status: 503 }
    );
  }

  try {
    // Call OpenAI Realtime Sessions endpoint to mint an ephemeral token
    const res = await fetch('https://api.openai.com/v1/realtime/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        // 'shimmer' is a fast, professional female voice ideal for receptionists
        // Other options: alloy (neutral), echo (male), fable (expressive), onyx (deep), nova (female)
        voice: 'shimmer',
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[/api/demo/realtime] OpenAI returned ${res.status}:`, errText);

      let errorMessage = `OpenAI returned ${res.status}`;
      try {
        const errJson = JSON.parse(errText);
        errorMessage = errJson.error?.message || errJson.message || errorMessage;
      } catch {
        if (errText.length < 500) errorMessage = errText;
      }

      // Handle auth errors
      if (res.status === 401) {
        return NextResponse.json(
          {
            error: 'OpenAI API key is invalid or lacks realtime access',
            configRequired: true,
            provider,
            hint: 'Check OPENAI_API_KEY is valid and has realtime API access enabled'
          },
          { status: 503 }
        );
      }

      // Handle rate limits
      if (res.status === 429) {
        return NextResponse.json(
          {
            error: 'OpenAI rate limit reached',
            provider,
            hint: 'Please wait a moment and try again'
          },
          { status: 429 }
        );
      }

      return NextResponse.json(
        { error: errorMessage, status: res.status, provider },
        { status: res.status }
      );
    }

    const data = await res.json();

    // Validate response structure
    if (!data.client_secret?.value) {
      console.error('[/api/demo/realtime] OpenAI response missing client_secret.value:', JSON.stringify(data));
      return NextResponse.json(
        {
          error: 'Invalid response from OpenAI',
          message: 'Response missing client_secret',
          provider
        },
        { status: 502 }
      );
    }

    // Success — return token with provider info
    return NextResponse.json({
      ...data,
      provider,
      voiceProvider: 'openai', // OpenAI Realtime includes voice
    });

  } catch (e: unknown) {
    // Use safe error response - never expose stack traces or sensitive info
    return safeErrorResponse(e, '/api/demo/realtime', 500);
  }
}
