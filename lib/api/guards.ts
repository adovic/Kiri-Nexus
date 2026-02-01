// =============================================================================
// API GUARDS — Rate Limiting + Origin Validation
// =============================================================================
// Lightweight abuse-prevention for public demo endpoints.
// Uses in-memory storage for development; TODO: add Upstash/Redis for production.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';

// =============================================================================
// CONFIGURATION
// =============================================================================

const IS_DEV = process.env.NODE_ENV !== 'production';

// Allowed origins for production (add your domains here)
const ALLOWED_ORIGINS_PROD = [
  'https://kiri.ai',
  'https://www.kiri.ai',
  'https://ai-receptionist-cb48a.web.app',
  'https://ai-receptionist-cb48a.firebaseapp.com',
];

// =============================================================================
// IN-MEMORY RATE LIMITER
// =============================================================================
// TODO: Replace with Upstash Redis for production to persist across serverless instances.
// npm install @upstash/ratelimit @upstash/redis
//
// Example Upstash implementation:
// import { Ratelimit } from '@upstash/ratelimit';
// import { Redis } from '@upstash/redis';
// const ratelimit = new Ratelimit({
//   redis: Redis.fromEnv(),
//   limiter: Ratelimit.slidingWindow(30, '5 m'),
// });
// =============================================================================

interface RateLimitEntry {
  count: number;
  resetAt: number; // Unix timestamp in ms
}

// In-memory store (cleared on serverless cold start — acceptable for dev)
const rateLimitStore = new Map<string, RateLimitEntry>();

// Cleanup stale entries periodically (every 60s)
let lastCleanup = Date.now();
function cleanupStaleEntries() {
  const now = Date.now();
  if (now - lastCleanup < 60_000) return;
  lastCleanup = now;

  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt < now) {
      rateLimitStore.delete(key);
    }
  }
}

/**
 * Check rate limit for a given key (typically IP + route).
 * Returns { allowed: boolean, remaining: number, resetAt: number }
 */
export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): { allowed: boolean; remaining: number; resetAt: number } {
  cleanupStaleEntries();

  const now = Date.now();
  const existing = rateLimitStore.get(key);

  if (!existing || existing.resetAt < now) {
    // New window
    const resetAt = now + windowMs;
    rateLimitStore.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: maxRequests - 1, resetAt };
  }

  // Existing window
  if (existing.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt };
  }

  existing.count++;
  return { allowed: true, remaining: maxRequests - existing.count, resetAt: existing.resetAt };
}

// =============================================================================
// IP EXTRACTION
// =============================================================================

/**
 * Extract client IP from request headers.
 * Handles common proxy headers (Vercel, Cloudflare, etc.)
 */
export function getClientIP(request: NextRequest): string {
  // Vercel / standard proxy
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    // Take the first IP (client IP before proxies)
    return forwarded.split(',')[0].trim();
  }

  // Cloudflare
  const cfIP = request.headers.get('cf-connecting-ip');
  if (cfIP) return cfIP;

  // Real IP header
  const realIP = request.headers.get('x-real-ip');
  if (realIP) return realIP;

  // Fallback for local development
  return '127.0.0.1';
}

// =============================================================================
// ORIGIN VALIDATION
// =============================================================================

/**
 * Validate request origin/referer against allowed domains.
 * In dev: allows localhost and missing origin.
 * In prod: requires matching origin or referer.
 */
export function validateOrigin(request: NextRequest): { valid: boolean; origin: string | null } {
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');

  // In development, allow localhost and missing origins
  if (IS_DEV) {
    if (!origin && !referer) {
      return { valid: true, origin: null };
    }
    if (origin?.includes('localhost') || referer?.includes('localhost')) {
      return { valid: true, origin: origin || referer };
    }
    if (origin?.includes('127.0.0.1') || referer?.includes('127.0.0.1')) {
      return { valid: true, origin: origin || referer };
    }
    // Also allow in dev if no origin (e.g., curl, Postman)
    return { valid: true, origin: origin || referer || null };
  }

  // In production, require valid origin
  if (!origin && !referer) {
    return { valid: false, origin: null };
  }

  const checkUrl = origin || referer || '';

  // Check against allowed origins
  for (const allowed of ALLOWED_ORIGINS_PROD) {
    if (checkUrl.startsWith(allowed)) {
      return { valid: true, origin: checkUrl };
    }
  }

  // Also allow the request's own host (same-origin requests)
  const host = request.headers.get('host');
  if (host) {
    const hostOrigin = `https://${host}`;
    if (checkUrl.startsWith(hostOrigin)) {
      return { valid: true, origin: checkUrl };
    }
  }

  return { valid: false, origin: checkUrl };
}

// =============================================================================
// COMBINED GUARD MIDDLEWARE
// =============================================================================

export interface GuardOptions {
  maxRequests: number;      // Max requests in window
  windowMs: number;         // Window duration in ms
  routeName: string;        // For rate limit key namespacing
}

/**
 * Combined guard that checks both rate limit and origin.
 * Returns null if request is allowed, or a NextResponse if blocked.
 */
export function guardPublicEndpoint(
  request: NextRequest,
  options: GuardOptions
): NextResponse | null {
  // 1. Validate origin
  const { valid: originValid } = validateOrigin(request);
  if (!originValid) {
    // Log without exposing sensitive details
    console.warn(`[${options.routeName}] Origin validation failed`);
    return NextResponse.json(
      { error: 'Forbidden' },
      { status: 403 }
    );
  }

  // 2. Check rate limit
  const ip = getClientIP(request);
  const rateLimitKey = `${options.routeName}:${ip}`;
  const { allowed, remaining, resetAt } = checkRateLimit(
    rateLimitKey,
    options.maxRequests,
    options.windowMs
  );

  if (!allowed) {
    const retryAfterSec = Math.ceil((resetAt - Date.now()) / 1000);
    console.warn(`[${options.routeName}] Rate limit exceeded for IP: ${ip.substring(0, 8)}...`);
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(retryAfterSec),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.floor(resetAt / 1000)),
        },
      }
    );
  }

  // Request allowed — return null to continue processing
  return null;
}

// =============================================================================
// SAFE ERROR RESPONSE
// =============================================================================

/**
 * Create a safe error response that never exposes stack traces or sensitive info.
 */
export function safeErrorResponse(
  error: unknown,
  routeName: string,
  status: number = 500
): NextResponse {
  // Log the actual error server-side (without secrets)
  const message = error instanceof Error ? error.message : 'Unknown error';
  console.error(`[${routeName}] Error:`, message);

  // Return generic error to client
  return NextResponse.json(
    { error: status === 500 ? 'Internal server error' : 'Request failed' },
    { status }
  );
}
