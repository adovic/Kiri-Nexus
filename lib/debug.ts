// =============================================================================
// DEBUG UTILITIES
// =============================================================================
// Conditional logging that only outputs in development mode.
// Use these instead of console.log to avoid noisy production logs.

const isDev = process.env.NODE_ENV !== 'production';

/**
 * Development-only console.log
 * Will not output anything in production
 */
export function devLog(...args: unknown[]): void {
  if (isDev) {
    console.log(...args);
  }
}

/**
 * Development-only console.warn
 * Will not output anything in production
 */
export function devWarn(...args: unknown[]): void {
  if (isDev) {
    console.warn(...args);
  }
}

/**
 * Development-only console.error
 * In production, this still logs errors but without stack traces
 */
export function devError(message: string, error?: unknown): void {
  if (isDev) {
    console.error(message, error);
  } else {
    // In production, log the message but not potentially sensitive error details
    console.error(message);
  }
}

/**
 * Server-side only log with prefix
 * Useful for API routes and server components
 */
export function serverLog(prefix: string, ...args: unknown[]): void {
  if (isDev && typeof window === 'undefined') {
    console.log(`[${prefix}]`, ...args);
  }
}
