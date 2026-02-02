'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth/context';

type AuthMode = 'login' | 'signup';

type Props = {
  mode: AuthMode;
};

function getSafeRedirect(raw: string | null): string {
  if (!raw || !raw.startsWith('/')) return '/dashboard';
  if (raw.startsWith('//')) return '/dashboard';
  return raw;
}

export default function AuthPage({ mode }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = useMemo(() => getSafeRedirect(searchParams.get('redirect')), [searchParams]);

  const { user, loading, error: authError, signIn, signUp, signInWithGoogle, resetPassword } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      router.replace(redirectTo);
    }
  }, [loading, redirectTo, router, user]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setResetSent(false);

    if (!email || !password) {
      setError('Please enter both email and password.');
      return;
    }

    if (mode === 'signup' && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setBusy(true);

    try {
      if (mode === 'login') {
        await signIn(email, password);
      } else {
        await signUp(email, password);
      }
      router.push(redirectTo);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Authentication failed.';
      setError(message);
      setBusy(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setBusy(true);
    setError('');
    setResetSent(false);
    try {
      await signInWithGoogle();
      router.push(redirectTo);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Google sign-in failed.';
      setError(message);
      setBusy(false);
    }
  };

  const handleResetPassword = async () => {
    setError('');
    setResetSent(false);

    if (!email) {
      setError('Enter your email first, then click reset.');
      return;
    }

    setBusy(true);
    try {
      await resetPassword(email);
      setResetSent(true);
      setBusy(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not send reset email.';
      setError(message);
      setBusy(false);
    }
  };

  const oppositeHref =
    mode === 'login'
      ? `/signup${redirectTo !== '/dashboard' ? `?redirect=${encodeURIComponent(redirectTo)}` : ''}`
      : `/login${redirectTo !== '/dashboard' ? `?redirect=${encodeURIComponent(redirectTo)}` : ''}`;

  if (loading || user) {
    return (
      <main style={styles.page}>
        <div style={styles.card}>
          <h1 style={styles.title}>Checking your session…</h1>
          <p style={styles.subtitle}>One moment while we load your account.</p>
        </div>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
        <p style={styles.subtitle}>
          {mode === 'login'
            ? 'Sign in to continue to your dashboard.'
            : 'Sign up to save your receptionist configuration.'}
        </p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.label}>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="you@company.com"
              style={styles.input}
              required
            />
          </label>

          <label style={styles.label}>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              placeholder={mode === 'signup' ? 'At least 6 characters' : 'Your password'}
              style={styles.input}
              required
            />
          </label>

          {mode === 'signup' && (
            <label style={styles.label}>
              Confirm password
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="Repeat password"
                style={styles.input}
                required
              />
            </label>
          )}

          {(error || authError) && <p style={styles.error}>{error || authError}</p>}
          {resetSent && <p style={styles.success}>Password reset email sent. Check your inbox.</p>}

          <button type="submit" disabled={busy} className="btn btn-primary full-width">
            {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={busy}
          className="btn btn-subtle full-width"
          style={{ marginTop: 10 }}
        >
          Continue with Google
        </button>

        {mode === 'login' && (
          <button
            type="button"
            onClick={handleResetPassword}
            disabled={busy}
            className="btn btn-ghost full-width"
            style={{ marginTop: 10 }}
          >
            Reset password
          </button>
        )}

        <p style={styles.switchText}>
          {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}{' '}
          <Link href={oppositeHref} style={styles.switchLink}>
            {mode === 'login' ? 'Sign up' : 'Log in'}
          </Link>
        </p>
      </div>
    </main>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  page: {
    minHeight: '100vh',
    display: 'grid',
    placeItems: 'center',
    padding: '120px 16px 40px',
  },
  card: {
    width: '100%',
    maxWidth: 430,
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: 16,
    background: 'rgba(255, 255, 255, 0.03)',
    boxShadow: '0 12px 30px rgba(0, 0, 0, 0.35)',
    padding: 24,
  },
  title: {
    margin: '0 0 8px',
  },
  subtitle: {
    margin: '0 0 18px',
    color: '#b6b3ac',
  },
  form: {
    display: 'grid',
    gap: 10,
  },
  label: {
    display: 'grid',
    gap: 6,
    fontSize: 13,
    color: '#e7e6e3',
  },
  input: {
    width: '100%',
    height: 42,
    borderRadius: 10,
    border: '1px solid rgba(255, 255, 255, 0.14)',
    background: 'rgba(255, 255, 255, 0.03)',
    color: '#fff',
    padding: '0 12px',
    outline: 'none',
  },
  error: {
    margin: 0,
    color: '#f87171',
    fontSize: 13,
  },
  success: {
    margin: 0,
    color: '#34d399',
    fontSize: 13,
  },
  switchText: {
    margin: '14px 0 0',
    fontSize: 13,
    color: '#b6b3ac',
    textAlign: 'center',
  },
  switchLink: {
    color: '#d4af37',
    textDecoration: 'none',
    fontWeight: 600,
  },
};
