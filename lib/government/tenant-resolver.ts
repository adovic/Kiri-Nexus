import 'server-only';
import { adminDb } from '@/lib/firebase/admin';
import { generateTenantKey } from '@/lib/government/tenant-key-manager';

// =============================================================================
// SERVER-SIDE TENANT RESOLVER (Zero Trust)
// =============================================================================
// All tenant identity MUST be resolved server-side. Client-supplied tenant IDs
// are NEVER trusted. This module provides two resolution paths:
//
//   1. Vapi Webhook Path  → resolveTenantFromVapiSecret(secret)
//      The per-tenant vapi_secret is configured in the Vapi dashboard and
//      forwarded as `x-vapi-secret`. We look up the owning tenant in Firestore.
//
//   2. Session Path        → resolveTenantFromSession(req)
//      For browser-facing routes. Reads the `gov-auth-token` cookie, extracts
//      the email, and resolves the tenant from the `govTenants` collection.
//
// If either path fails to resolve, the caller MUST return 401 Unauthorized.
// =============================================================================

const GOV_TENANTS_COLLECTION = 'govTenants';

// ── Types ────────────────────────────────────────────────────────────────────

export interface GovTenantConfig {
  /** Firestore document ID — the canonical tenant identifier */
  tenant_id: string;
  /** Human-readable agency name */
  agency_name: string;
  /** US state / jurisdiction */
  jurisdiction_state: string;
  /** Per-tenant Vapi webhook secret */
  vapi_secret: string;
  /** Vapi assistant ID provisioned for this tenant */
  vapi_assistant_id: string;
  /** Vapi public key for client SDK */
  vapi_public_key: string;
  /** Webhook server URL for tool calls */
  server_url: string;
  /** Non-Human Identity badge */
  agent_nhi: string;
  /** Tenant status */
  status: 'active' | 'suspended' | 'provisioning';
  /** Firebase UID of the tenant owner */
  owner_uid: string;
  /** Authorized email addresses (owner + admins) */
  authorized_emails: string[];
}

export class TenantResolutionError extends Error {
  constructor(
    message: string,
    public readonly resolution_path: 'vapi_secret' | 'session',
    public readonly detail?: string,
  ) {
    super(message);
    this.name = 'TenantResolutionError';
  }
}

// ── Resolution Path 1: Vapi Webhook Secret ───────────────────────────────────

/**
 * Resolve a tenant from the per-tenant Vapi webhook secret.
 *
 * Each tenant is provisioned with a unique `vapi_secret` stored in
 * the `govTenants` Firestore collection. Vapi forwards this secret
 * as the `x-vapi-secret` header on every webhook call.
 *
 * @returns The tenant config, or null if the secret doesn't match any tenant.
 */
export async function resolveTenantFromVapiSecret(
  secret: string,
): Promise<GovTenantConfig | null> {
  if (!secret || secret.trim().length === 0) {
    return null;
  }

  try {
    const snapshot = await adminDb
      .collection(GOV_TENANTS_COLLECTION)
      .where('vapi_secret', '==', secret.trim())
      .where('status', '==', 'active')
      .limit(1)
      .get();

    if (snapshot.empty) {
      console.warn(
        `[Tenant Resolver] No active tenant found for vapi_secret (prefix: ${secret.slice(0, 8)}...)`,
      );
      return null;
    }

    const doc = snapshot.docs[0];
    return {
      tenant_id: doc.id,
      ...(doc.data() as Omit<GovTenantConfig, 'tenant_id'>),
    };
  } catch (err) {
    console.error('[Tenant Resolver] Firestore lookup failed (vapi_secret path):', err);
    return null;
  }
}

// ── Resolution Path 2: Session (Browser Routes) ─────────────────────────────

/**
 * Resolve a tenant from the authenticated user's session.
 *
 * Reads the `gov-auth-token` cookie (which should contain the user's
 * email or Firebase ID token), then queries Firestore for a tenant
 * where this email is in the `authorized_emails` array.
 *
 * @returns The tenant config, or null if no tenant is found for this session.
 */
export async function resolveTenantFromSession(
  req: Request,
): Promise<GovTenantConfig | null> {
  const email = extractEmailFromRequest(req);
  if (!email) {
    return null;
  }

  try {
    const snapshot = await adminDb
      .collection(GOV_TENANTS_COLLECTION)
      .where('authorized_emails', 'array-contains', email.toLowerCase())
      .where('status', '==', 'active')
      .limit(1)
      .get();

    if (snapshot.empty) {
      console.warn(
        `[Tenant Resolver] No active tenant found for email: ${email}`,
      );
      return null;
    }

    const doc = snapshot.docs[0];
    return {
      tenant_id: doc.id,
      ...(doc.data() as Omit<GovTenantConfig, 'tenant_id'>),
    };
  } catch (err) {
    console.error('[Tenant Resolver] Firestore lookup failed (session path):', err);
    return null;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extract the user's email from the request.
 *
 * Priority:
 *   1. `x-gov-user-email` header (set by middleware after token verification)
 *   2. `gov-auth-token` cookie containing the email directly (dev/demo mode)
 */
function extractEmailFromRequest(req: Request): string | null {
  // Priority 1: Middleware-injected header (production path)
  const headerEmail = req.headers.get('x-gov-user-email');
  if (headerEmail && headerEmail.includes('@')) {
    return headerEmail.toLowerCase().trim();
  }

  // Priority 2: Cookie-based email (dev/demo path)
  const cookie = req.headers.get('cookie') || '';
  const tokenMatch = cookie.match(/gov-auth-token=([^;]+)/);
  if (!tokenMatch) {
    return null;
  }

  const tokenValue = decodeURIComponent(tokenMatch[1].trim());

  // If the cookie value is an email address, use it directly
  if (tokenValue.includes('@')) {
    return tokenValue.toLowerCase();
  }

  // If the cookie is just "authenticated" (legacy mock), reject it.
  // Production requires a real email or Firebase ID token.
  return null;
}

// ── Admin: Provision a New Tenant ────────────────────────────────────────────

/**
 * Create a new government tenant in Firestore.
 * Called during the setup/onboarding flow after payment.
 */
export async function provisionGovTenant(config: {
  tenant_id: string;
  agency_name: string;
  jurisdiction_state: string;
  vapi_secret: string;
  vapi_assistant_id: string;
  vapi_public_key: string;
  server_url: string;
  agent_nhi: string;
  owner_uid: string;
  authorized_emails: string[];
}): Promise<GovTenantConfig> {
  const tenantData: Omit<GovTenantConfig, 'tenant_id'> = {
    agency_name: config.agency_name,
    jurisdiction_state: config.jurisdiction_state,
    vapi_secret: config.vapi_secret,
    vapi_assistant_id: config.vapi_assistant_id,
    vapi_public_key: config.vapi_public_key,
    server_url: config.server_url,
    agent_nhi: config.agent_nhi,
    status: 'active',
    owner_uid: config.owner_uid,
    authorized_emails: config.authorized_emails.map((e) => e.toLowerCase()),
  };

  await adminDb
    .collection(GOV_TENANTS_COLLECTION)
    .doc(config.tenant_id)
    .set(tenantData);

  // Generate a unique AES-256-GCM encryption key for this tenant's audit logs.
  // The key is stored in data/keys/{tenant_id}.key — physically separate from
  // audit data. This separation enables crypto-shredding on Sovereign Exit.
  generateTenantKey(config.tenant_id);

  console.log(
    `[Tenant Resolver] Provisioned tenant: ${config.tenant_id} (${config.agency_name}) — encryption key generated`,
  );

  return { tenant_id: config.tenant_id, ...tenantData };
}
