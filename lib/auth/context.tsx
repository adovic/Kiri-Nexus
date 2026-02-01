'use client';

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendEmailVerification,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithPopup,
  type User,
} from 'firebase/auth';
import { getFirebaseClient } from '@/lib/firebase/client';
import { devError } from '@/lib/debug';

// =============================================================================
// TYPES
// =============================================================================

export type AuthUser = {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
};

type AuthState = {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
};

type AuthContextType = AuthState & {
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  resendVerification: () => Promise<void>;
};

// =============================================================================
// CONTEXT
// =============================================================================

const AuthContext = createContext<AuthContextType | null>(null);

// =============================================================================
// HELPER: Map Firebase User to AuthUser
// =============================================================================

function mapUser(user: User | null): AuthUser | null {
  if (!user) return null;
  return {
    uid: user.uid,
    email: user.email,
    emailVerified: user.emailVerified,
    displayName: user.displayName,
  };
}

// =============================================================================
// PROVIDER
// =============================================================================

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
    error: null,
  });

  const { auth } = getFirebaseClient();

  // ---------------------------------------------------------------------------
  // Listen to auth state changes
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!auth) {
      setState({ user: null, loading: false, error: 'Firebase Auth not initialized' });
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      // Skip anonymous users - they should not create sessions or be treated as logged in
      // Anonymous auth may be used internally by Firebase but should not grant app access
      if (firebaseUser?.isAnonymous) {
        setState({ user: null, loading: false, error: null });
        return;
      }

      const user = mapUser(firebaseUser);

      // If user is logged in (non-anonymous), create/refresh server session
      if (firebaseUser) {
        try {
          const idToken = await firebaseUser.getIdToken();
          await fetch('/api/auth/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken }),
          });
        } catch (err) {
          devError('Failed to create session', err);
        }
      }

      setState({ user, loading: false, error: null });
    });

    return () => unsubscribe();
  }, [auth]);

  // ---------------------------------------------------------------------------
  // Sign In with Email/Password
  // ---------------------------------------------------------------------------
  const signIn = useCallback(async (email: string, password: string) => {
    if (!auth) throw new Error('Firebase Auth not initialized');

    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const credential = await signInWithEmailAndPassword(auth, email, password);

      // Create server session
      const idToken = await credential.user.getIdToken();
      await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });

      setState({ user: mapUser(credential.user), loading: false, error: null });
    } catch (err: any) {
      const message = getErrorMessage(err.code);
      setState((prev) => ({ ...prev, loading: false, error: message }));
      throw new Error(message);
    }
  }, [auth]);

  // ---------------------------------------------------------------------------
  // Sign Up with Email/Password
  // ---------------------------------------------------------------------------
  const signUp = useCallback(async (email: string, password: string) => {
    if (!auth) throw new Error('Firebase Auth not initialized');

    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const credential = await createUserWithEmailAndPassword(auth, email, password);

      // Send email verification
      await sendEmailVerification(credential.user);

      // Create server session
      const idToken = await credential.user.getIdToken();
      await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });

      setState({ user: mapUser(credential.user), loading: false, error: null });
    } catch (err: any) {
      const message = getErrorMessage(err.code);
      setState((prev) => ({ ...prev, loading: false, error: message }));
      throw new Error(message);
    }
  }, [auth]);

  // ---------------------------------------------------------------------------
  // Sign In with Google
  // ---------------------------------------------------------------------------
  const signInWithGoogle = useCallback(async () => {
    if (!auth) throw new Error('Firebase Auth not initialized');

    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const provider = new GoogleAuthProvider();
      const credential = await signInWithPopup(auth, provider);

      // Create server session
      const idToken = await credential.user.getIdToken();
      await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });

      setState({ user: mapUser(credential.user), loading: false, error: null });
    } catch (err: any) {
      const message = getErrorMessage(err.code);
      setState((prev) => ({ ...prev, loading: false, error: message }));
      throw new Error(message);
    }
  }, [auth]);

  // ---------------------------------------------------------------------------
  // Sign Out
  // ---------------------------------------------------------------------------
  const signOut = useCallback(async () => {
    if (!auth) throw new Error('Firebase Auth not initialized');

    try {
      // Clear server session first
      await fetch('/api/auth/logout', { method: 'POST' });

      // Then sign out of Firebase
      await firebaseSignOut(auth);

      setState({ user: null, loading: false, error: null });
    } catch (err: any) {
      devError('Sign out error', err);
      // Still clear local state even if server logout fails
      setState({ user: null, loading: false, error: null });
    }
  }, [auth]);

  // ---------------------------------------------------------------------------
  // Password Reset
  // ---------------------------------------------------------------------------
  const resetPassword = useCallback(async (email: string) => {
    if (!auth) throw new Error('Firebase Auth not initialized');

    try {
      await sendPasswordResetEmail(auth, email);
    } catch (err: any) {
      throw new Error(getErrorMessage(err.code));
    }
  }, [auth]);

  // ---------------------------------------------------------------------------
  // Resend Verification Email
  // ---------------------------------------------------------------------------
  const resendVerification = useCallback(async () => {
    if (!auth?.currentUser) throw new Error('No user logged in');

    try {
      await sendEmailVerification(auth.currentUser);
    } catch (err: any) {
      throw new Error(getErrorMessage(err.code));
    }
  }, [auth]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <AuthContext.Provider
      value={{
        ...state,
        signIn,
        signUp,
        signInWithGoogle,
        signOut,
        resetPassword,
        resendVerification,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// =============================================================================
// HOOK
// =============================================================================

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// =============================================================================
// ERROR MESSAGE MAPPING
// =============================================================================

function getErrorMessage(code: string): string {
  switch (code) {
    case 'auth/email-already-in-use':
      return 'An account with this email already exists.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/operation-not-allowed':
      return 'Email/password sign-in is not enabled.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters.';
    case 'auth/user-disabled':
      return 'This account has been disabled.';
    case 'auth/user-not-found':
      return 'No account found with this email.';
    case 'auth/wrong-password':
      return 'Incorrect password.';
    case 'auth/invalid-credential':
      return 'Invalid email or password.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please try again later.';
    case 'auth/popup-closed-by-user':
      return 'Sign-in cancelled.';
    case 'auth/popup-blocked':
      return 'Popup was blocked. Please allow popups.';
    default:
      return 'An error occurred. Please try again.';
  }
}
