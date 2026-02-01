import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { adminAuth } from '@/lib/firebase/admin';

// =============================================================================
// LOGOUT - Clear Session Cookie
// =============================================================================
// Clears the httpOnly session cookie and optionally revokes Firebase tokens.
// =============================================================================

const SESSION_COOKIE_NAME = '__session';

export async function POST() {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;

    // Clear the session cookie regardless of validity
    cookieStore.set(SESSION_COOKIE_NAME, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0, // Expire immediately
    });

    // Optionally revoke refresh tokens for extra security
    if (sessionCookie) {
      try {
        const decodedClaims = await adminAuth.verifySessionCookie(sessionCookie);
        await adminAuth.revokeRefreshTokens(decodedClaims.uid);
      } catch {
        // Session was already invalid, continue with logout
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Logout] Error:', error);

    // Still clear the cookie even on error
    const cookieStore = await cookies();
    cookieStore.delete(SESSION_COOKIE_NAME);

    return NextResponse.json({ success: true });
  }
}
