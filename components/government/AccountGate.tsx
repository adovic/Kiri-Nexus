'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Lock, UserPlus, LogIn, ArrowRight, AlertCircle } from 'lucide-react';
import { getFirebaseClient } from '@/lib/firebase/client';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from 'firebase/auth';

// =============================================================================
// ACCOUNT GATE — Pre-Payment Authentication Barrier
// =============================================================================
// Inserted BEFORE the Payment page. If the user is already signed in, this
// component renders nothing and passes through. If not, it renders a
// Sign Up / Login form that must be completed before proceeding to payment.
//
// Logic:
//   - If `user.isSignedIn === true` → skip (render children)
//   - If `user.isSignedIn === false` → default to Sign Up, toggle for Login
//
// After successful auth, the user is redirected to the payment page with
// their existing URL params preserved.
// =============================================================================

interface AccountGateProps {
  isSignedIn: boolean;
  children: React.ReactNode;
  onAuthSuccess?: () => void;
}

type AuthMode = 'signup' | 'login';

function firebaseErrorMessage(code: string): string {
  switch (code) {
    case 'auth/email-already-in-use':
      return 'This email already has an account. Try logging in instead.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters.';
    case 'auth/user-not-found':
      return 'No account found with this email.';
    case 'auth/wrong-password':
      return 'Incorrect password. Please try again.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment and try again.';
    case 'auth/invalid-credential':
      return 'Invalid credentials. Please check your email and password.';
    default:
      return 'Authentication failed. Please try again.';
  }
}

export default function AccountGate({ isSignedIn, children, onAuthSuccess }: AccountGateProps) {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // If user is already signed in, render children (payment page)
  if (isSignedIn) {
    return <>{children}</>;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email || !password) {
      setError('Please enter both email and password.');
      return;
    }

    if (mode === 'signup') {
      if (password.length < 8) {
        setError('Password must be at least 8 characters.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match.');
        return;
      }
    }

    setLoading(true);

    try {
      const { auth } = getFirebaseClient();
      if (!auth) {
        setError('Authentication service unavailable.');
        setLoading(false);
        return;
      }

      // Firebase Auth
      let userCredential;
      try {
        if (mode === 'signup') {
          userCredential = await createUserWithEmailAndPassword(auth, email, password);
        } else {
          userCredential = await signInWithEmailAndPassword(auth, email, password);
        }
      } catch (firebaseErr: unknown) {
        const code = (firebaseErr as { code?: string }).code ?? '';
        setError(firebaseErrorMessage(code));
        setLoading(false);
        return;
      }

      // Server-side tenant authorization
      const idToken = await userCredential.user.getIdToken();
      const res = await fetch('/api/government/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: mode, idToken }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Authorization failed.');
        setLoading(false);
        return;
      }

      // Store tenant data
      if (data.tenant_id) {
        localStorage.setItem('govTenantData', JSON.stringify({
          tenant_id: data.tenant_id,
          agency: data.agency,
          user: data.user,
          status: data.status,
        }));
      }

      // Notify parent
      onAuthSuccess?.();

    } catch {
      setError('An unexpected error occurred. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.headerIcon}>
            <Shield size={32} color="#3B82F6" />
          </div>
          <h1 style={styles.title}>Create Your Account</h1>
          <p style={styles.subtitle}>
            A government account is required before activating your license.
          </p>
        </div>

        {/* Auth Mode Toggle */}
        <div style={styles.modeToggle}>
          <button
            onClick={() => { setMode('signup'); setError(''); }}
            style={{
              ...styles.modeBtn,
              background: mode === 'signup' ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
              color: mode === 'signup' ? '#60A5FA' : '#64748B',
              borderColor: mode === 'signup' ? '#3B82F6' : 'rgba(30, 64, 175, 0.2)',
            }}
          >
            <UserPlus size={16} />
            Sign Up
          </button>
          <button
            onClick={() => { setMode('login'); setError(''); }}
            style={{
              ...styles.modeBtn,
              background: mode === 'login' ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
              color: mode === 'login' ? '#60A5FA' : '#64748B',
              borderColor: mode === 'login' ? '#3B82F6' : 'rgba(30, 64, 175, 0.2)',
            }}
          >
            <LogIn size={16} />
            Login
          </button>
        </div>

        {/* Auth Form */}
        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.inputGroup}>
            <label style={styles.label}>Government Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@agency.gov"
              style={styles.input}
              autoComplete="email"
            />
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'signup' ? 'Minimum 8 characters' : 'Enter your password'}
              style={styles.input}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            />
          </div>

          {mode === 'signup' && (
            <div style={styles.inputGroup}>
              <label style={styles.label}>Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your password"
                style={styles.input}
                autoComplete="new-password"
              />
            </div>
          )}

          {error && (
            <div style={styles.errorBox}>
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              ...styles.submitBtn,
              opacity: loading ? 0.7 : 1,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? (
              <>
                <div style={styles.spinner} />
                {mode === 'signup' ? 'Creating Account...' : 'Signing In...'}
              </>
            ) : (
              <>
                <Lock size={16} />
                {mode === 'signup' ? 'Create Account & Continue' : 'Sign In & Continue'}
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        <p style={styles.legalNote}>
          By creating an account, you agree to our Terms of Service and Privacy Policy.
          Government accounts are subject to agency verification.
        </p>
      </div>
    </div>
  );
}

// =============================================================================
// STYLES
// =============================================================================
const styles: { [key: string]: React.CSSProperties } = {
  page: {
    minHeight: '100vh',
    background: '#0C1220',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 24px',
  },
  container: {
    width: '100%',
    maxWidth: '460px',
    background: 'rgba(15, 23, 42, 0.6)',
    border: '1px solid rgba(30, 64, 175, 0.2)',
    borderRadius: '24px',
    padding: '40px 36px',
  },
  header: {
    textAlign: 'center',
    marginBottom: '32px',
  },
  headerIcon: {
    width: '64px',
    height: '64px',
    background: 'rgba(59, 130, 246, 0.1)',
    borderRadius: '16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 20px',
  },
  title: {
    fontSize: '24px',
    fontWeight: 800,
    color: '#F8FAFC',
    margin: '0 0 8px 0',
    letterSpacing: '-0.02em',
  },
  subtitle: {
    fontSize: '14px',
    color: '#94A3B8',
    margin: 0,
    lineHeight: 1.5,
  },
  modeToggle: {
    display: 'flex',
    gap: '10px',
    marginBottom: '28px',
  },
  modeBtn: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '12px 16px',
    border: '2px solid',
    borderRadius: '12px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    background: 'transparent',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '18px',
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  label: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#94A3B8',
  },
  input: {
    padding: '14px 16px',
    fontSize: '15px',
    color: '#F8FAFC',
    background: 'rgba(15, 23, 42, 0.8)',
    border: '1px solid rgba(30, 64, 175, 0.3)',
    borderRadius: '10px',
    outline: 'none',
  },
  errorBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '12px 16px',
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: '10px',
    fontSize: '13px',
    color: '#EF4444',
  },
  submitBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    padding: '16px 24px',
    background: 'linear-gradient(135deg, #1E40AF 0%, #3B82F6 100%)',
    border: 'none',
    borderRadius: '12px',
    fontSize: '15px',
    fontWeight: 700,
    color: '#fff',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    marginTop: '4px',
  },
  spinner: {
    width: '16px',
    height: '16px',
    border: '2px solid rgba(255, 255, 255, 0.3)',
    borderTopColor: '#fff',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  legalNote: {
    textAlign: 'center',
    fontSize: '11px',
    color: '#475569',
    marginTop: '24px',
    lineHeight: 1.5,
  },
};
