'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AccountGate from '@/components/government/AccountGate';

export default function GovernmentLoginPage() {
  const router = useRouter();
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function checkSession() {
      try {
        const res = await fetch('/api/government/auth', {
          credentials: 'include',
        });

        if (res.ok) {
          router.replace('/government/portal/dashboard');
          return;
        }
      } catch {
        // Ignore network errors here; user can still sign in manually.
      } finally {
        if (!cancelled) {
          setCheckingSession(false);
        }
      }
    }

    checkSession();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (checkingSession) {
    return (
      <main style={styles.loadingPage}>
        <div style={styles.loadingCard}>
          <h1 style={{ margin: '0 0 8px' }}>Verifying secure session…</h1>
          <p style={{ margin: 0, color: '#94A3B8' }}>Please wait while we check your government access.</p>
        </div>
      </main>
    );
  }

  return (
    <AccountGate
      isSignedIn={false}
      onAuthSuccess={() => {
        router.push('/government/portal/dashboard');
      }}
    >
      <></>
    </AccountGate>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  loadingPage: {
    minHeight: '100vh',
    display: 'grid',
    placeItems: 'center',
    padding: '120px 16px 40px',
  },
  loadingCard: {
    width: '100%',
    maxWidth: 560,
    border: '1px solid rgba(30, 64, 175, 0.2)',
    borderRadius: 16,
    background: 'rgba(15, 23, 42, 0.55)',
    padding: 24,
  },
};
