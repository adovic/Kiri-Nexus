'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { mutate } from 'swr';
import { getFirebaseClient } from '@/lib/firebase/client';
import { signOut, onAuthStateChanged } from 'firebase/auth';
import { devError, devWarn } from '@/lib/debug';

// ===========================================
// TYPES
// ===========================================
interface Agency {
  name: string;
  state: string;
  tier: string;
}

interface User {
  name: string;
  role: string;
}

interface GovAuthContextType {
  isAuthenticated: boolean;
  agency: Agency;
  user: User;
  isLoading: boolean;
  /** Tenant status: 'active' = full access, 'provisioning' = new account (empty state) */
  tenantStatus: 'active' | 'provisioning' | null;
  login: (email: string, password: string) => void;
  logout: () => void;
  /** Force-clear session (cookie + Firebase Auth) and redirect to login.
   *  Call this from any component that catches a 401 stale-session error. */
  forceRefresh: () => void;
}

// ===========================================
// DEFAULT VALUES
// ===========================================
const EMPTY_AGENCY: Agency = { name: '', state: '', tier: '' };
const EMPTY_USER: User = { name: '', role: '' };

// ===========================================
// CONTEXT
// ===========================================
const GovAuthContext = createContext<GovAuthContextType | undefined>(undefined);

// ===========================================
// HELPER — Ensure Firebase Auth session
// ===========================================
// After the login page authenticates via signInWithEmailAndPassword,
// Firebase Auth should already have a session. This helper just waits
// for the auth state to resolve so Firestore listeners work.

async function ensureFirebaseAuth(): Promise<void> {
  const { auth } = getFirebaseClient();
  if (!auth) return;

  if (auth.currentUser) return;

  // Wait for any pending auth state to resolve
  const currentUser = await new Promise<import('firebase/auth').User | null>(
    (resolve) => {
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        unsubscribe();
        resolve(user);
      });
    },
  );

  if (currentUser) return;

  // If no session exists (e.g., page refresh after Firebase Auth expired
  // but cookie still valid), the session validation will redirect to login.
}

// ===========================================
// HELPER — Read cached tenant data
// ===========================================
function readCachedTenantData(): {
  agency: Agency;
  user: User;
  status: 'active' | 'provisioning';
} | null {
  try {
    const raw = localStorage.getItem('govTenantData');
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data?.agency && data?.user && data?.status) {
      return {
        agency: data.agency,
        user: data.user,
        status: data.status,
      };
    }
    return null;
  } catch {
    return null;
  }
}

// ===========================================
// PROVIDER
// ===========================================
export function GovAuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [agency, setAgency] = useState<Agency>(EMPTY_AGENCY);
  const [user, setUser] = useState<User>(EMPTY_USER);
  const [tenantStatus, setTenantStatus] = useState<'active' | 'provisioning' | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Since the session cookie is now httpOnly, we cannot check for it client-side.
    // Instead, we always call the API to validate the session.
    const loadUserData = async () => {
      // Ensure Firebase Auth session for Firestore listeners
      try {
        await ensureFirebaseAuth();
      } catch (err) {
        devError('[GovAuth] Firebase auth failed:', err);
      }

      // 1. Try localStorage cache for immediate render (optimistic)
      const cached = readCachedTenantData();
      if (cached) {
        setAgency(cached.agency);
        setUser(cached.user);
        setTenantStatus(cached.status);
        setIsAuthenticated(true);
        // Don't set loading to false yet - wait for API validation
      }

      // 2. Validate session with API (authoritative source)
      try {
        const res = await fetch('/api/government/auth', {
          credentials: 'include',
        });

        if (res.ok) {
          const data = await res.json();
          setAgency(data.agency);
          setUser(data.user);
          setTenantStatus(data.status);
          setIsAuthenticated(true);

          // Update cache with fresh data
          localStorage.setItem(
            'govTenantData',
            JSON.stringify({
              agency: data.agency,
              user: data.user,
              tenant_id: data.tenant_id,
              status: data.status,
            }),
          );
        } else if (res.status === 401 || res.status === 403) {
          // No valid session - clear state and redirect
          devWarn('[GovAuth] Session validation failed:', res.status);
          localStorage.removeItem('govTenantData');
          localStorage.removeItem('govUser');
          setIsAuthenticated(false);
          setAgency(EMPTY_AGENCY);
          setUser(EMPTY_USER);
          setTenantStatus(null);
          router.push('/government/login');
        }
      } catch (err) {
        devError('[GovAuth] Session validation error:', err);
        // If network fails but we have cache, keep the cached state
        if (!cached) {
          // No cache and network failed - redirect to login
          router.push('/government/login');
        }
      }

      setIsLoading(false);
    };

    loadUserData();
  }, [router]);

  const login = async (_email: string, _password: string) => {
    // The login page now handles Firebase Auth + API validation.
    // This function just reads the stored tenant data and updates state.
    const cached = readCachedTenantData();
    if (cached) {
      setAgency(cached.agency);
      setUser(cached.user);
      setTenantStatus(cached.status);
    }
    setIsAuthenticated(true);
  };

  // ── Shared session teardown (used by logout + forceRefresh) ──
  const destroySession = async () => {
    // 1. Call the logout API to clear the httpOnly cookie and Firestore session
    try {
      await fetch('/api/government/auth', {
        method: 'DELETE',
        credentials: 'include',
      });
    } catch (err) {
      devError('[GovAuth] Logout API call failed:', err);
    }

    // 2. Clear localStorage
    localStorage.removeItem('govTenantData');
    localStorage.removeItem('govUser');

    // 3. Purge ALL SWR caches to prevent ghost data from the
    //    previous session leaking into a different account.
    mutate(() => true, undefined, { revalidate: false });

    // 4. Sign out of Firebase Auth so Firestore listeners are torn down
    try {
      const { auth } = getFirebaseClient();
      if (auth) await signOut(auth);
    } catch (err) {
      devError('[GovAuth] Firebase sign-out failed:', err);
    }

    // 5. Reset React state
    setAgency(EMPTY_AGENCY);
    setUser(EMPTY_USER);
    setTenantStatus(null);
    setIsAuthenticated(false);
  };

  const logout = async () => {
    await destroySession();
    router.push('/government/login');
  };

  const forceRefresh = async () => {
    devWarn('[GovAuth] forceRefresh triggered — clearing stale session');
    await destroySession();
    router.push('/government/login');
  };

  return (
    <GovAuthContext.Provider
      value={{
        isAuthenticated,
        agency,
        user,
        isLoading,
        tenantStatus,
        login,
        logout,
        forceRefresh,
      }}
    >
      {children}
    </GovAuthContext.Provider>
  );
}

// ===========================================
// HOOK
// ===========================================
export function useGovAuth() {
  const context = useContext(GovAuthContext);
  if (context === undefined) {
    throw new Error('useGovAuth must be used within a GovAuthProvider');
  }
  return context;
}
