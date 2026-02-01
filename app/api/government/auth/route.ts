import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { randomBytes } from 'crypto';

// =============================================================================
// GOVERNMENT AUTH API — Secure session management
// =============================================================================
// POST  → Login or Sign-up (validates Firebase ID token, creates secure session)
// GET   → Session validation (validates httpOnly cookie, returns tenant data)
//
// SECURITY CHANGES (v2):
//   - Removed all hardcoded admin bypass credentials
//   - Cookies are now httpOnly (not accessible to JavaScript)
//   - Session token is an opaque UUID, NOT the user's email
//   - Session data stored server-side in Firestore
// =============================================================================

const GOV_TENANTS_COLLECTION = 'govTenants';
const GOV_SESSIONS_COLLECTION = 'govSessions';

// Session duration: 24 hours
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;

/**
 * Generate a cryptographically secure session token
 */
function generateSessionToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Create or update a session in Firestore
 */
async function createSession(
  sessionToken: string,
  data: {
    email: string;
    uid: string;
    tenantId: string;
    tenantData: Record<string, unknown>;
  }
): Promise<void> {
  await adminDb.collection(GOV_SESSIONS_COLLECTION).doc(sessionToken).set({
    email: data.email,
    uid: data.uid,
    tenantId: data.tenantId,
    tenantData: data.tenantData,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + SESSION_DURATION_MS).toISOString(),
  });
}

/**
 * Retrieve session from Firestore and validate expiry
 */
async function getSession(sessionToken: string): Promise<{
  email: string;
  uid: string;
  tenantId: string;
  tenantData: Record<string, unknown>;
} | null> {
  const doc = await adminDb.collection(GOV_SESSIONS_COLLECTION).doc(sessionToken).get();
  if (!doc.exists) return null;

  const data = doc.data();
  if (!data) return null;

  // Check expiry
  const expiresAt = new Date(data.expiresAt);
  if (expiresAt < new Date()) {
    // Session expired - delete it
    await adminDb.collection(GOV_SESSIONS_COLLECTION).doc(sessionToken).delete();
    return null;
  }

  return {
    email: data.email,
    uid: data.uid,
    tenantId: data.tenantId,
    tenantData: data.tenantData,
  };
}

/**
 * Delete a session from Firestore
 */
async function deleteSession(sessionToken: string): Promise<void> {
  await adminDb.collection(GOV_SESSIONS_COLLECTION).doc(sessionToken).delete();
}

/**
 * Set secure httpOnly session cookie
 */
function setSessionCookie(response: NextResponse, sessionToken: string): void {
  const isProduction = process.env.NODE_ENV === 'production';

  response.cookies.set('gov-session', sessionToken, {
    path: '/',
    maxAge: SESSION_DURATION_MS / 1000, // in seconds
    httpOnly: true, // CRITICAL: Not accessible to JavaScript
    secure: isProduction, // HTTPS only in production
    sameSite: 'lax',
  });
}

/**
 * Clear session cookie
 */
function clearSessionCookie(response: NextResponse): void {
  response.cookies.set('gov-session', '', {
    path: '/',
    maxAge: 0,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, idToken } = body;

    // Validate ID token is provided
    if (!idToken || typeof idToken !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid ID token' }, { status: 400 });
    }

    // ── Verify Firebase ID Token ───────────────────────────────────
    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(idToken);
    } catch {
      return NextResponse.json(
        { error: 'Invalid or expired credentials. Please try again.' },
        { status: 401 },
      );
    }

    const email = decodedToken.email?.toLowerCase();
    const uid = decodedToken.uid;

    if (!email) {
      return NextResponse.json(
        { error: 'Account does not have an email address.' },
        { status: 400 },
      );
    }

    // ── SIGN-UP ────────────────────────────────────────────────────
    if (action === 'signup') {
      // Check if email is already authorized on an existing tenant
      const existing = await adminDb
        .collection(GOV_TENANTS_COLLECTION)
        .where('authorized_emails', 'array-contains', email)
        .limit(1)
        .get();

      if (!existing.empty) {
        return NextResponse.json(
          { error: 'This email is already associated with an agency. Use Login instead.' },
          { status: 409 },
        );
      }

      // Check if user already owns a tenant
      const ownedTenant = await adminDb
        .collection(GOV_TENANTS_COLLECTION)
        .where('owner_uid', '==', uid)
        .limit(1)
        .get();

      if (!ownedTenant.empty) {
        // Return the existing tenant data
        const doc = ownedTenant.docs[0];
        const data = doc.data();

        const tenantData = {
          agency: {
            name: data.agency_name || '',
            state: data.jurisdiction_state || '',
            tier: data.status === 'provisioning' ? 'Provisioning' : 'Municipality',
          },
          user: { name: decodedToken.name || email.split('@')[0], role: 'Owner' },
          status: data.status,
        };

        // Create secure session
        const sessionToken = generateSessionToken();
        await createSession(sessionToken, {
          email,
          uid,
          tenantId: doc.id,
          tenantData,
        });

        const response = NextResponse.json({
          success: true,
          tenant_id: doc.id,
          ...tenantData,
        });

        setSessionCookie(response, sessionToken);
        return response;
      }

      // Create new tenant in provisioning state
      const newTenant = {
        agency_name: '',
        jurisdiction_state: '',
        vapi_secret: '',
        vapi_assistant_id: '',
        vapi_public_key: '',
        server_url: '',
        agent_nhi: '',
        status: 'provisioning' as const,
        owner_uid: uid,
        authorized_emails: [email],
        created_at: new Date().toISOString(),
      };

      const docRef = await adminDb.collection(GOV_TENANTS_COLLECTION).add(newTenant);

      console.log(`[Gov Auth] New tenant provisioned: ${docRef.id} for ${email}`);

      const tenantData = {
        agency: { name: '', state: '', tier: 'Provisioning' },
        user: { name: decodedToken.name || email.split('@')[0], role: 'Owner' },
        status: 'provisioning',
      };

      // Create secure session
      const sessionToken = generateSessionToken();
      await createSession(sessionToken, {
        email,
        uid,
        tenantId: docRef.id,
        tenantData,
      });

      const response = NextResponse.json({
        success: true,
        tenant_id: docRef.id,
        ...tenantData,
      });

      setSessionCookie(response, sessionToken);
      return response;
    }

    // ── LOGIN ──────────────────────────────────────────────────────
    // Query for tenants where this email is authorized (active OR provisioning)
    const snapshot = await adminDb
      .collection(GOV_TENANTS_COLLECTION)
      .where('authorized_emails', 'array-contains', email)
      .where('status', 'in', ['active', 'provisioning'])
      .limit(1)
      .get();

    if (snapshot.empty) {
      return NextResponse.json(
        {
          error:
            'No authorized agency found for this email. Contact your agency administrator or create a new account.',
        },
        { status: 403 },
      );
    }

    const tenantDoc = snapshot.docs[0];
    const tenantDocData = tenantDoc.data();

    const tenantData = {
      agency: {
        name: tenantDocData.agency_name || '',
        state: tenantDocData.jurisdiction_state || '',
        tier: tenantDocData.status === 'provisioning' ? 'Provisioning' : 'Municipality',
      },
      user: {
        name: decodedToken.name || email.split('@')[0],
        role: tenantDocData.owner_uid === uid ? 'Owner' : 'Operator',
      },
      status: tenantDocData.status,
    };

    // Create secure session
    const sessionToken = generateSessionToken();
    await createSession(sessionToken, {
      email,
      uid,
      tenantId: tenantDoc.id,
      tenantData,
    });

    const response = NextResponse.json({
      success: true,
      tenant_id: tenantDoc.id,
      ...tenantData,
    });

    setSessionCookie(response, sessionToken);
    return response;
  } catch (err) {
    console.error('[Gov Auth] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// =============================================================================
// GET — Session validation
// =============================================================================
// Called by GovAuthContext on mount to validate an existing session
// and retrieve tenant data without requiring a new Firebase ID token.

export async function GET(req: Request) {
  try {
    // Extract session token from httpOnly cookie
    const cookie = req.headers.get('cookie') || '';
    const sessionMatch = cookie.match(/gov-session=([^;]+)/);

    if (!sessionMatch) {
      return NextResponse.json({ error: 'No session' }, { status: 401 });
    }

    const sessionToken = decodeURIComponent(sessionMatch[1].trim());

    if (!sessionToken || sessionToken.length < 32) {
      return NextResponse.json({ error: 'Invalid session token' }, { status: 401 });
    }

    // Retrieve session from Firestore
    const session = await getSession(sessionToken);

    if (!session) {
      // Session not found or expired - clear the cookie
      const response = NextResponse.json(
        { error: 'Session expired or invalid' },
        { status: 401 },
      );
      clearSessionCookie(response);
      return response;
    }

    // Return the cached tenant data from the session
    return NextResponse.json({
      success: true,
      tenant_id: session.tenantId,
      ...session.tenantData,
    });
  } catch (err) {
    console.error('[Gov Auth] Session validation error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// =============================================================================
// DELETE — Logout / session destruction
// =============================================================================
// Called to explicitly destroy a session

export async function DELETE(req: Request) {
  try {
    const cookie = req.headers.get('cookie') || '';
    const sessionMatch = cookie.match(/gov-session=([^;]+)/);

    if (sessionMatch) {
      const sessionToken = decodeURIComponent(sessionMatch[1].trim());
      if (sessionToken && sessionToken.length >= 32) {
        await deleteSession(sessionToken);
      }
    }

    const response = NextResponse.json({ success: true });
    clearSessionCookie(response);
    return response;
  } catch (err) {
    console.error('[Gov Auth] Logout error:', err);
    // Still clear the cookie even if Firestore delete fails
    const response = NextResponse.json({ success: true });
    clearSessionCookie(response);
    return response;
  }
}
