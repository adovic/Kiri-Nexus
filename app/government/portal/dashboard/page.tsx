'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Phone,
  FileText,
  Radio,
  TrendingUp,
  Clock,
  AlertTriangle,
  Shield,
  ChevronRight,
  Fingerprint,
  Activity,
  ShieldOff,
  CheckCircle,
  Timer,
  Lock,
  AlertOctagon,
} from 'lucide-react';
import OperationsControl from './OperationsControl';
import IntegrityGuard from '@/components/government/IntegrityGuard';
import DashboardClient, {
  useHealth,
  useIntegrity,
  useWitness,
  useRaio,
} from './DashboardClient';
import type { IntegrityData, HealthData, RaioStatusData } from './DashboardClient';
import InfoBubble from '@/components/government/InfoBubble';
import { useGovAuth } from '@/context/GovAuthContext';
import { getFirebaseClient } from '@/lib/firebase/client';
import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import { doc, onSnapshot, type DocumentData } from 'firebase/firestore';

// =============================================================================
// KIRI NEXUS CONTROL PLANE — LIVE DASHBOARD
// =============================================================================
// Zero mock data. All widgets are wired to live API endpoints.
//
// Data sources:
//   /api/government/audit-integrity  → Chain-of-Custody Monitor
//   /api/government/raio-checkin     → RAIO Sovereign Authorization Widget
//   /api/health                      → System Status Badge
//   Firestore tenants/{uid}          → Analytics Overview
//
// Emergency controls:
//   /api/government/tools/suspend       → Glass Break: Suspend AI
//   /api/government/sovereign-exit/archive → Glass Break: Sovereign Exit
// =============================================================================

// Types imported from DashboardClient — single source of truth for API shapes.

// ── Quick Actions ────────────────────────────────────────────────────────────

const QUICK_ACTIONS = [
  {
    id: 'log311',
    title: 'Log 311 Request',
    description: 'Create a new citizen service request',
    icon: Phone,
    color: '#3B82F6',
    href: '/government/portal/logs',
  },
  {
    id: 'foia',
    title: 'FOIA Archive',
    description: 'Access call transcripts and records',
    icon: FileText,
    color: '#22C55E',
    href: '/government/portal/foia',
  },
  {
    id: 'emergency',
    title: 'Emergency Broadcast',
    description: 'Activate crisis mode messaging',
    icon: Radio,
    color: '#EF4444',
    href: '#',
  },
];

// =============================================================================
// SYSTEM STATUS BADGE — Wired to /api/health
// =============================================================================

function SystemStatusBadge({ health }: { health: { data: HealthData | null; error: string | null; loading: boolean } }) {
  const isHealthy = health.data?.status === 'ok';
  const isDown = health.error || (health.data && health.data.status !== 'ok');

  if (health.loading && !health.data) {
    return (
      <div style={{
        ...styles.statusBadge,
        backgroundColor: 'rgba(100, 116, 139, 0.1)',
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: 'rgba(100, 116, 139, 0.3)',
        color: '#94A3B8',
      }}>
        <span style={{ ...styles.statusDot, background: '#94A3B8', boxShadow: 'none' }} />
        Checking...
      </div>
    );
  }

  if (isDown) {
    return (
      <div style={{
        ...styles.statusBadge,
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: 'rgba(239, 68, 68, 0.4)',
        color: '#EF4444',
      }}>
        <span style={{ ...styles.statusDot, background: '#EF4444', boxShadow: '0 0 12px rgba(239, 68, 68, 0.8)' }} />
        SYSTEM DOWN
      </div>
    );
  }

  return (
    <div style={styles.statusBadge}>
      <span style={styles.statusDot} />
      {isHealthy ? 'System Operational' : 'Degraded'}
    </div>
  );
}

// =============================================================================
// CHAIN-OF-CUSTODY MONITOR — Live Merkle Feed
// =============================================================================

function ChainOfCustodyMonitor({ integrity }: {
  integrity: { data: IntegrityData | null; error: string | null; loading: boolean };
}) {
  const { data, error, loading } = integrity;

  const isVerified = data?.valid === true;
  const isBroken = data?.valid === false;
  const merkleRoot = data?.chain_head_hash || null;
  const isCriticalFailure = isBroken || (!loading && !data && !error) || (error && !data);

  return (
    <div style={{
      ...styles.monitorCard,
      borderColor: isCriticalFailure
        ? 'rgba(239, 68, 68, 0.5)'
        : isVerified
          ? 'rgba(34, 197, 94, 0.3)'
          : 'rgba(30, 64, 175, 0.2)',
    }}>
      <div style={styles.monitorHeader}>
        <Fingerprint size={20} color="#A78BFA" />
        <span style={styles.monitorTitle}>Chain-of-Custody Monitor</span>
        {loading && !data && (
          <span style={{ fontSize: '12px', color: '#64748B', marginLeft: 'auto' }}>Verifying...</span>
        )}
      </div>

      {/* Integrity Badge */}
      {isVerified && (
        <div style={styles.verifiedBadge}>
          <CheckCircle size={18} color="#22C55E" />
          <span style={styles.verifiedText}>VERIFIED</span>
          <span style={styles.pulsingDot} />
        </div>
      )}

      {isCriticalFailure && (
        <div style={styles.criticalBadge}>
          <AlertOctagon size={18} color="#EF4444" />
          <span style={styles.criticalText}>CRITICAL INTEGRITY FAILURE</span>
        </div>
      )}

      {/* Merkle Root */}
      <div style={styles.monitorRow}>
        <Shield size={14} color={isVerified ? '#22C55E' : '#EF4444'} />
        <span style={styles.monitorLabel}>Merkle Root:</span>
        <span style={{
          ...styles.monitorMono,
          color: merkleRoot ? '#60A5FA' : '#EF4444',
        }}>
          {merkleRoot
            ? `${merkleRoot.slice(0, 16)}...${merkleRoot.slice(-8)}`
            : 'MISSING'}
        </span>
      </div>

      {/* Chain Stats */}
      <div style={styles.monitorRow}>
        <Activity size={14} color="#60A5FA" />
        <span style={styles.monitorLabel}>Chain Entries:</span>
        <span style={styles.monitorMono}>
          {data ? `${data.verified_entries}/${data.total_entries} verified` : '--'}
        </span>
      </div>

      {/* Break Detail */}
      {isBroken && data?.break_detail && (
        <div style={styles.breakDetail}>
          <AlertTriangle size={14} color="#F59E0B" />
          <span style={{ fontSize: '12px', color: '#F59E0B', fontFamily: 'monospace' }}>
            Break at index {data.first_broken_index}: {data.break_detail}
          </span>
        </div>
      )}

      {/* Last Verified */}
      <div style={styles.monitorRow}>
        <Clock size={14} color="#64748B" />
        <span style={styles.monitorLabel}>Last Verified:</span>
        <span style={styles.monitorMono}>
          {data?.checked_at
            ? new Date(data.checked_at).toLocaleTimeString()
            : '--'}
        </span>
      </div>

      {error && (
        <div style={{ fontSize: '11px', color: '#EF4444', marginTop: '8px', fontFamily: 'monospace' }}>
          Fetch error: {error}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// RAIO LEDGER WIDGET — Sovereign Authorization Status
// =============================================================================

function RaioLedgerWidget({ raio }: {
  raio: { data: RaioStatusData | null; error: string | null; loading: boolean };
}) {
  const { data, error, loading } = raio;
  const [countdown, setCountdown] = useState('');

  // Countdown timer to authorization window end
  useEffect(() => {
    if (!data?.latest_entry?.authorization_window?.until) {
      setCountdown('');
      return;
    }

    const tick = () => {
      const until = new Date(data.latest_entry!.authorization_window.until).getTime();
      const now = Date.now();
      const diff = until - now;

      if (diff <= 0) {
        setCountdown('EXPIRED');
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      setCountdown(`${days}d ${hours}h ${minutes}m ${seconds}s`);
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [data?.latest_entry?.authorization_window?.until]);

  const isAuthorized = data?.authorized === true;
  const isExpired = data?.expired === true;
  const noAuth = !data?.latest_entry;
  const certStatus = data?.certification_status ?? null;
  const isGracePeriod = certStatus === 'GRACE_PERIOD';
  const recertRequired = data?.recertification_required === true;

  return (
    <div style={{
      ...styles.raioCard,
      borderColor: isAuthorized
        ? isGracePeriod
          ? 'rgba(245, 158, 11, 0.4)'
          : 'rgba(34, 197, 94, 0.25)'
        : 'rgba(239, 68, 68, 0.4)',
    }}>
      <div style={styles.raioHeader}>
        <Lock size={20} color={isAuthorized ? (isGracePeriod ? '#F59E0B' : '#22C55E') : '#EF4444'} />
        <span style={styles.raioTitle}>Sovereign Authorization Status</span>
        {/* Certification Status Badge */}
        {certStatus && (
          <span style={{
            marginLeft: 'auto',
            fontSize: '10px',
            fontWeight: 800,
            fontFamily: 'monospace',
            letterSpacing: '0.08em',
            padding: '3px 8px',
            borderRadius: '4px',
            border: '1px solid',
            ...(certStatus === 'ACTIVE'
              ? { color: '#22C55E', borderColor: 'rgba(34, 197, 94, 0.4)', background: 'rgba(34, 197, 94, 0.08)' }
              : certStatus === 'GRACE_PERIOD'
                ? { color: '#F59E0B', borderColor: 'rgba(245, 158, 11, 0.4)', background: 'rgba(245, 158, 11, 0.08)' }
                : { color: '#EF4444', borderColor: 'rgba(239, 68, 68, 0.4)', background: 'rgba(239, 68, 68, 0.08)' }),
          }}>
            {certStatus.replace('_', ' ')}
          </span>
        )}
      </div>

      {/* Recertification Required Banner */}
      {recertRequired && (
        <div style={styles.recertBanner}>
          <AlertOctagon size={16} color="#EF4444" />
          <div>
            <div style={{ fontSize: '13px', fontWeight: 800, color: '#EF4444', letterSpacing: '0.04em' }}>
              RECERTIFICATION REQUIRED
            </div>
            <div style={{ fontSize: '11px', color: '#F87171', marginTop: '2px' }}>
              RAIO authorization has expired. AI tool execution is suspended until a new check-in is performed.
            </div>
          </div>
        </div>
      )}

      {/* Grace Period Warning */}
      {isGracePeriod && !recertRequired && (
        <div style={styles.graceBanner}>
          <AlertTriangle size={16} color="#F59E0B" />
          <div>
            <div style={{ fontSize: '13px', fontWeight: 800, color: '#F59E0B', letterSpacing: '0.04em' }}>
              GRACE PERIOD — {data?.days_until_expiry ?? data?.days_remaining ?? '?'} DAY(S) LEFT
            </div>
            <div style={{ fontSize: '11px', color: '#FBBF24', marginTop: '2px' }}>
              Authorization expires soon. Schedule a RAIO check-in to maintain continuity.
            </div>
          </div>
        </div>
      )}

      {/* Authorization Status */}
      {loading && !data ? (
        <div style={{ fontSize: '13px', color: '#64748B' }}>Resolving authorization...</div>
      ) : isAuthorized ? (
        <div style={isGracePeriod ? styles.raioGrace : styles.raioAuthorized}>
          <Shield size={16} color={isGracePeriod ? '#F59E0B' : '#22C55E'} />
          <span style={{ color: isGracePeriod ? '#F59E0B' : '#22C55E', fontWeight: 700, fontSize: '14px' }}>
            {isGracePeriod ? 'AUTHORIZED — GRACE PERIOD' : 'AUTHORIZED'}
          </span>
        </div>
      ) : noAuth ? (
        <div style={styles.raioExpired}>
          <ShieldOff size={16} color="#EF4444" />
          <span style={{ color: '#EF4444', fontWeight: 700, fontSize: '14px' }}>NO AUTHORIZATION</span>
        </div>
      ) : isExpired ? (
        <div style={styles.raioExpired}>
          <ShieldOff size={16} color="#EF4444" />
          <span style={{ color: '#EF4444', fontWeight: 700, fontSize: '14px' }}>EXPIRED</span>
        </div>
      ) : null}

      {/* Countdown Timer */}
      {countdown && (
        <div style={styles.countdownRow}>
          <Timer size={14} color={countdown === 'EXPIRED' ? '#EF4444' : '#F59E0B'} />
          <span style={styles.raioLabel}>Window Remaining:</span>
          <span style={{
            ...styles.countdownValue,
            color: countdown === 'EXPIRED' ? '#EF4444' : '#F59E0B',
          }}>
            {countdown}
          </span>
        </div>
      )}

      {/* Days Until Expiry */}
      {data && (
        <div style={styles.raioRow}>
          <Clock size={14} color="#64748B" />
          <span style={styles.raioLabel}>Days Until Expiry:</span>
          <span style={{
            ...styles.raioMono,
            color: (data.days_until_expiry ?? data.days_remaining) > 7
              ? '#22C55E'
              : (data.days_until_expiry ?? data.days_remaining) > 0
                ? '#F59E0B'
                : '#EF4444',
          }}>
            {data.days_until_expiry ?? data.days_remaining}
          </span>
        </div>
      )}

      {/* Last Check-in */}
      {data?.latest_entry && (
        <>
          <div style={styles.raioRow}>
            <Fingerprint size={14} color="#A78BFA" />
            <span style={styles.raioLabel}>RAIO:</span>
            <span style={styles.raioMono}>{data.latest_entry.raio_user_id}</span>
          </div>
          <div style={styles.raioRow}>
            <Clock size={14} color="#64748B" />
            <span style={styles.raioLabel}>Last Check-in:</span>
            <span style={styles.raioMono}>
              {new Date(data.latest_entry.timestamp).toLocaleDateString()}
            </span>
          </div>
        </>
      )}

      {/* Ledger Integrity */}
      {data?.ledger_integrity && (
        <div style={styles.raioRow}>
          <Shield size={14} color={data.ledger_integrity.valid ? '#22C55E' : '#EF4444'} />
          <span style={styles.raioLabel}>Ledger Chain:</span>
          <span style={{
            fontSize: '12px',
            fontWeight: 600,
            color: data.ledger_integrity.valid ? '#22C55E' : '#EF4444',
          }}>
            {data.ledger_integrity.valid ? 'INTACT' : 'BROKEN'} ({data.ledger_integrity.total_entries} entries)
          </span>
        </div>
      )}

      {/* Verdict */}
      {data?.verdict && (
        <div style={styles.verdictBox}>
          <span style={{ fontSize: '11px', color: '#94A3B8', fontFamily: 'monospace', lineHeight: 1.4 }}>
            {data.verdict}
          </span>
        </div>
      )}

      {error && (
        <div style={{ fontSize: '11px', color: '#EF4444', marginTop: '8px', fontFamily: 'monospace' }}>
          Fetch error: {error}
        </div>
      )}
    </div>
  );
}

// GlassBreakEmergencyBox has been replaced by OperationsControl.tsx

// =============================================================================
// STAT CARD COMPONENT
// =============================================================================

function StatCard({
  label,
  value,
  icon: Icon,
  trend,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  trend?: string;
}) {
  return (
    <div style={styles.statCard}>
      <div style={styles.statIcon}>
        <Icon size={20} color="#60A5FA" />
      </div>
      <div style={styles.statContent}>
        <span style={styles.statLabel}>{label}</span>
        <span style={styles.statValue}>{value}</span>
        {trend && <span style={styles.statTrend}>{trend}</span>}
      </div>
    </div>
  );
}

// =============================================================================
// ACTION CARD COMPONENT
// =============================================================================

function ActionCard({ action }: { action: typeof QUICK_ACTIONS[0] }) {
  const Icon = action.icon;
  const isEmergency = action.id === 'emergency';

  return (
    <Link
      href={action.href}
      style={{
        ...styles.actionCard,
        borderColor: isEmergency ? 'rgba(239, 68, 68, 0.3)' : 'rgba(30, 64, 175, 0.2)',
        background: isEmergency ? 'rgba(239, 68, 68, 0.05)' : 'rgba(15, 23, 42, 0.6)',
      }}
    >
      <div style={{
        ...styles.actionIcon,
        background: isEmergency ? 'rgba(239, 68, 68, 0.15)' : `${action.color}15`,
      }}>
        <Icon size={24} color={action.color} />
      </div>
      <div style={styles.actionContent}>
        <h3 style={{
          ...styles.actionTitle,
          color: isEmergency ? '#EF4444' : '#F8FAFC',
        }}>{action.title}</h3>
        <p style={styles.actionDesc}>{action.description}</p>
      </div>
      <ChevronRight size={20} color="#64748B" />
    </Link>
  );
}

// =============================================================================
// WITNESS LATENCY BADGE — Real sync metric (replaces cosmetic clock)
// =============================================================================
//
// Displays the measured delta between server_timestamp and client receive time.
//   ≤ 2000ms  → green   "Witness Latency: Xms"
//   > 2000ms  → yellow  "SYNC DELAY: Xms"
//   > 5000ms  → red     "CHAIN STALLED: Xms"

const LATENCY_WARN_MS = 2_000;
const LATENCY_CRIT_MS = 5_000;

function WitnessLatencyBadge({ latencyMs }: { latencyMs: number | null }) {
  let label: string;
  let color: string;

  if (latencyMs === null) {
    label = 'Witness Latency: ---';
    color = '#64748B';
  } else if (latencyMs > LATENCY_CRIT_MS) {
    label = `CHAIN STALLED: ${latencyMs}ms`;
    color = '#EF4444';
  } else if (latencyMs > LATENCY_WARN_MS) {
    label = `SYNC DELAY: ${latencyMs}ms`;
    color = '#F59E0B';
  } else {
    label = `Witness Latency: ${latencyMs}ms`;
    color = '#22C55E';
  }

  return (
    <div style={{ ...styles.lastSync, color, fontFamily: 'monospace', fontWeight: 600 }}>
      {label}
    </div>
  );
}

// =============================================================================
// MAIN DASHBOARD — KIRI NEXUS CONTROL PLANE
// =============================================================================

export default function GovernmentPortalDashboard() {
  const { isLoading: govLoading, tenantStatus } = useGovAuth();

  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [tenantData, setTenantData] = useState<DocumentData | null>(null);
  const [tenantLoading, setTenantLoading] = useState(true);

  // ── Firebase Auth listener ──────────────────────────────────────────
  useEffect(() => {
    const { auth } = getFirebaseClient();
    if (!auth) {
      setAuthResolved(true);
      setTenantLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setAuthResolved(true);
      if (!user) {
        setTenantLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // ── Real-time tenant document listener ──────────────────────────────
  useEffect(() => {
    if (!firebaseUser?.uid) return;

    const { db } = getFirebaseClient();
    if (!db) {
      setTenantLoading(false);
      return;
    }

    const tenantRef = doc(db, 'tenants', firebaseUser.uid);
    const unsubscribe = onSnapshot(
      tenantRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setTenantData(snapshot.data());
        } else {
          setTenantData(null);
        }
        setTenantLoading(false);
      },
      (error) => {
        console.error('[Kiri Nexus] Tenant sync failed:', error);
        setTenantData(null);
        setTenantLoading(false);
      },
    );

    return () => unsubscribe();
  }, [firebaseUser?.uid]);

  // ── Live API Data Feeds (SWR — shared cache with TelemetryBar) ─────
  const healthSwr = useHealth();
  const witnessSwr = useWitness();
  const integritySwr = useIntegrity();
  const tenantId = firebaseUser?.uid || null;
  const raioSwr = useRaio(tenantId);

  // Adapt SWR returns to the { data, error, loading } shape used by widgets
  const health = {
    data: healthSwr.data ?? null,
    error: healthSwr.error ? (healthSwr.error as Error).message ?? String(healthSwr.error) : null,
    loading: !healthSwr.data && !healthSwr.error,
  };
  const integrity = {
    data: integritySwr.data ?? null,
    error: integritySwr.error ? (integritySwr.error as Error).message ?? String(integritySwr.error) : null,
    loading: !integritySwr.data && !integritySwr.error,
  };
  const raio = {
    data: raioSwr.data ?? null,
    error: raioSwr.error ? (raioSwr.error as Error).message ?? String(raioSwr.error) : null,
    loading: !raioSwr.data && !raioSwr.error,
  };

  // ── Loading state ───────────────────────────────────────────────────
  if (govLoading || !authResolved || tenantLoading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.loadingSpinner} />
        <p style={styles.loadingText}>Establishing sovereign data link...</p>
      </div>
    );
  }

  // ── Provisioning state — new account, no subscription yet ──────────
  if (tenantStatus === 'provisioning') {
    return (
      <div style={styles.loadingContainer}>
        <style>{`
          @keyframes pulse-border {
            0%, 100% { border-color: rgba(30, 64, 175, 0.3); }
            50% { border-color: rgba(59, 130, 246, 0.6); }
          }
        `}</style>
        <div style={{
          maxWidth: '560px',
          width: '100%',
          padding: '48px 40px',
          background: 'rgba(15, 23, 42, 0.8)',
          borderWidth: '1px',
          borderStyle: 'solid',
          borderColor: 'rgba(30, 64, 175, 0.3)',
          borderRadius: '20px',
          textAlign: 'center',
          animation: 'pulse-border 3s ease-in-out infinite',
        }}>
          <div style={{
            width: '72px',
            height: '72px',
            background: 'rgba(30, 64, 175, 0.15)',
            borderRadius: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 24px',
          }}>
            <Clock size={36} color="#3B82F6" />
          </div>

          <h2 style={{
            fontSize: '24px',
            fontWeight: 800,
            color: '#F8FAFC',
            margin: '0 0 8px 0',
            letterSpacing: '-0.02em',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
          }}>
            Account Provisioning
            <InfoBubble
              what="Your agency account is in the 'Provisioning' state. This means your login is active but the operational dashboard is not yet enabled."
              why="To transition from Provisioning to Active, complete the subscription process via the Get Started button below. Once payment is confirmed, your control plane activates automatically."
              missing="If this status persists after payment, contact your procurement officer or use the Speak to an Advisor link."
            />
          </h2>

          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 14px',
            background: 'rgba(245, 158, 11, 0.1)',
            borderWidth: '1px',
            borderStyle: 'solid',
            borderColor: 'rgba(245, 158, 11, 0.3)',
            borderRadius: '6px',
            fontSize: '11px',
            fontWeight: 700,
            color: '#F59E0B',
            letterSpacing: '0.05em',
            marginBottom: '20px',
          }}>
            <AlertTriangle size={12} />
            AWAITING SUBSCRIPTION
          </div>

          <p style={{
            fontSize: '15px',
            color: '#94A3B8',
            lineHeight: 1.6,
            margin: '0 0 32px 0',
          }}>
            Your agency account has been created and is awaiting subscription activation.
            Once your procurement is finalized, the Kiri Nexus Control Plane will
            populate with live telemetry, audit chains, and RAIO governance data.
          </p>

          {/* What's included panel */}
          <div style={{
            textAlign: 'left',
            padding: '20px 24px',
            background: 'rgba(30, 64, 175, 0.08)',
            borderWidth: '1px',
            borderStyle: 'solid',
            borderColor: 'rgba(30, 64, 175, 0.15)',
            borderRadius: '12px',
            marginBottom: '32px',
          }}>
            <p style={{
              fontSize: '12px',
              fontWeight: 700,
              color: '#60A5FA',
              letterSpacing: '0.05em',
              margin: '0 0 12px 0',
            }}>
              UPON ACTIVATION YOU WILL RECEIVE
              <InfoBubble
                what="These features are included in every Kiri Nexus government subscription. They activate the moment your procurement is finalized."
                why="Understanding what is included helps you set expectations with your team and prepare for onboarding."
              />
            </p>
            {[
              { icon: Activity, text: 'Live AI call telemetry and analytics' },
              { icon: Shield, text: 'SHA-256 tamper-proof audit chain' },
              { icon: Fingerprint, text: 'RAIO M-26-04 sovereign governance ledger' },
              { icon: Lock, text: 'Sovereign Exit — full data portability' },
            ].map((item, i) => (
              <div key={i} style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '8px 0',
                borderTopWidth: i > 0 ? '1px' : '0',
                borderTopStyle: 'solid',
                borderTopColor: 'rgba(30, 64, 175, 0.1)',
              }}>
                <item.icon size={16} color="#3B82F6" />
                <span style={{ fontSize: '13px', color: '#CBD5E1' }}>{item.text}</span>
              </div>
            ))}
          </div>

          {/* CTA Buttons */}
          <div style={{
            display: 'flex',
            gap: '12px',
            justifyContent: 'center',
            flexWrap: 'wrap',
          }}>
            <Link
              href="/government/pricing"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '14px 28px',
                fontSize: '14px',
                fontWeight: 600,
                color: '#fff',
                background: 'linear-gradient(135deg, #1E40AF 0%, #3B82F6 100%)',
                borderWidth: '0',
                borderStyle: 'solid',
                borderColor: 'transparent',
                borderRadius: '10px',
                textDecoration: 'none',
                boxShadow: '0 0 20px rgba(30, 64, 175, 0.4)',
              }}
            >
              <FileText size={16} />
              Get Started
            </Link>
            <Link
              href="/government/faq"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '14px 28px',
                fontSize: '14px',
                fontWeight: 600,
                color: '#94A3B8',
                background: 'rgba(15, 23, 42, 0.6)',
                borderWidth: '1px',
                borderStyle: 'solid',
                borderColor: 'rgba(30, 64, 175, 0.3)',
                borderRadius: '10px',
                textDecoration: 'none',
              }}
            >
              Speak to an Advisor
              <ChevronRight size={16} />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── No tenant data — awaiting sync ──────────────────────────────────
  if (!tenantData) {
    return (
      <div style={styles.loadingContainer}>
        <Shield size={48} color="#64748B" />
        <p style={{ ...styles.loadingText, fontSize: '18px', fontWeight: 600, color: '#94A3B8' }}>
          Waiting for System Sync...
        </p>
        <p style={styles.loadingText}>
          {firebaseUser
            ? `Authenticated as ${firebaseUser.email ?? firebaseUser.uid}. Tenant record pending.`
            : 'No Firebase session detected. Please re-authenticate.'}
        </p>
      </div>
    );
  }

  // ── Derive stats from real tenant data (NO MOCKS) ──────────────────
  const agencyName = tenantData.name ?? tenantData.agency_name ?? 'Unnamed Agency';
  const callsThisWeek = tenantData.callsThisWeek ?? tenantData.calls_this_week ?? 0;
  const avgHandleTime = tenantData.avgHandleTime ?? tenantData.avg_handle_time ?? '--';
  const topConcern = tenantData.topConcern ?? tenantData.top_concern ?? '--';
  const trend = tenantData.callTrend ?? tenantData.call_trend ?? undefined;

  return (
    <div style={styles.page}>
      {/* Pulsing CSS animation injected once */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse-green {
          0%, 100% { box-shadow: 0 0 4px rgba(34, 197, 94, 0.4); }
          50% { box-shadow: 0 0 16px rgba(34, 197, 94, 0.9); }
        }
        @keyframes pulse-red {
          0%, 100% { box-shadow: 0 0 4px rgba(239, 68, 68, 0.4); }
          50% { box-shadow: 0 0 20px rgba(239, 68, 68, 0.9); }
        }
      `}</style>

      <div style={styles.container}>
        {/* ── Header ──────────────────────────────────────────────────── */}
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <SystemStatusBadge health={health} />
            <h1 style={styles.title}>Kiri Nexus | Control Plane</h1>
            <p style={styles.subtitle}>{agencyName}</p>
          </div>
          <div style={styles.headerRight}>
            <WitnessLatencyBadge latencyMs={witnessSwr.data?.witness_latency_ms ?? null} />
            <Link href="/government/portal/logs" style={styles.testCallBtn}>
              <Phone size={16} />
              View Call Logs
            </Link>
          </div>
        </div>

        {/* ── Integrity Guard — Hard-Lock Error Boundary ──────────── */}
        {/* Wraps all data-sensitive components. If the SHA-256 audit  */}
        {/* chain is broken or a render exception occurs, the Guard    */}
        {/* unmounts everything below and displays a full-screen red   */}
        {/* lockdown overlay with forensic export capability.          */}
        <IntegrityGuard>
          {/* ── Live Control Plane Feed ──────────────────────────── */}
          {firebaseUser && tenantData && (
            <DashboardClient
              tenantData={tenantData}
              tenantId={tenantId || 'unknown'}
              firebaseUser={firebaseUser}
            />
          )}

          {/* ── Chain-of-Custody + RAIO Status Row ───────────────── */}
          <section style={styles.securitySection}>
            <h2 style={styles.sectionTitle}>Security &amp; Governance</h2>
            <div style={styles.securityRow}>
              <ChainOfCustodyMonitor integrity={integrity} />
              <RaioLedgerWidget raio={raio} />
            </div>
          </section>

          {/* ── Analytics Overview ────────────────────────────────── */}
          <section style={styles.statsSection}>
            <h2 style={styles.sectionTitle}>Analytics Overview</h2>
            <div style={styles.statsGrid}>
              <StatCard
                label="Calls This Week"
                value={typeof callsThisWeek === 'number' ? callsThisWeek.toLocaleString() : callsThisWeek}
                icon={Phone}
                trend={trend}
              />
              <StatCard
                label="Avg. Handle Time"
                value={avgHandleTime}
                icon={Clock}
              />
              <StatCard
                label="Top Concern"
                value={topConcern}
                icon={TrendingUp}
              />
              <StatCard
                label="Integrity Entries"
                value={integrity.data?.total_entries ?? '--'}
                icon={Fingerprint}
              />
            </div>
          </section>

          {/* ── Quick Actions ────────────────────────────────────── */}
          <section style={styles.actionsSection}>
            <h2 style={styles.sectionTitle}>Quick Actions</h2>
            <div style={styles.actionsGrid}>
              {QUICK_ACTIONS.map(action => (
                <ActionCard key={action.id} action={action} />
              ))}
            </div>
          </section>

          {/* ── Operations Control — Danger Zone ─────────────────── */}
          <section style={styles.emergencySection}>
            <OperationsControl
              tenantId={tenantId || 'unknown'}
              isSuspended={tenantData?.status === 'suspended'}
            />
          </section>
        </IntegrityGuard>
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
    padding: '40px',
  },
  container: {
    maxWidth: '1100px',
    margin: '0 auto',
  },
  loadingContainer: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '16px',
    background: '#0C1220',
  },
  loadingSpinner: {
    width: '40px',
    height: '40px',
    border: '3px solid rgba(30, 64, 175, 0.2)',
    borderTopColor: '#1E40AF',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  loadingText: {
    fontSize: '14px',
    color: '#64748B',
    textAlign: 'center',
  },

  // ── Header ─────────────────────────────────────────────────────────
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '40px',
  },
  headerLeft: {},
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  statusBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 14px',
    background: 'rgba(34, 197, 94, 0.1)',
    border: '1px solid rgba(34, 197, 94, 0.3)',
    borderRadius: '100px',
    fontSize: '13px',
    fontWeight: 600,
    color: '#22C55E',
    marginBottom: '16px',
  },
  statusDot: {
    width: '8px',
    height: '8px',
    background: '#22C55E',
    borderRadius: '50%',
    boxShadow: '0 0 8px rgba(34, 197, 94, 0.6)',
  },
  title: {
    fontSize: '36px',
    fontWeight: 800,
    color: '#F8FAFC',
    margin: '0 0 4px 0',
    letterSpacing: '-0.03em',
  },
  subtitle: {
    fontSize: '16px',
    fontWeight: 500,
    color: '#94A3B8',
    margin: 0,
  },
  lastSync: {
    fontSize: '13px',
    color: '#64748B',
  },
  testCallBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 20px',
    background: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)',
    color: 'white',
    fontSize: '14px',
    fontWeight: 600,
    textDecoration: 'none',
    borderRadius: '8px',
    boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)',
    transition: 'all 0.2s ease',
  },

  // ── Section Titles ─────────────────────────────────────────────────
  sectionTitle: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#64748B',
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    margin: '0 0 20px 0',
  },

  // ── Security & Governance Section ──────────────────────────────────
  securitySection: {
    marginBottom: '40px',
  },
  securityRow: {
    display: 'flex',
    gap: '20px',
    alignItems: 'flex-start',
  },

  // ── Chain-of-Custody Monitor ───────────────────────────────────────
  monitorCard: {
    flex: 1,
    padding: '24px',
    background: 'rgba(15, 23, 42, 0.6)',
    border: '1px solid rgba(30, 64, 175, 0.2)',
    borderRadius: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  monitorHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    paddingBottom: '12px',
    borderBottom: '1px solid rgba(167, 139, 250, 0.15)',
  },
  monitorTitle: {
    fontSize: '15px',
    fontWeight: 700,
    color: '#A78BFA',
    letterSpacing: '0.02em',
  },
  verifiedBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px 16px',
    background: 'rgba(34, 197, 94, 0.08)',
    border: '1px solid rgba(34, 197, 94, 0.3)',
    borderRadius: '10px',
  },
  verifiedText: {
    fontSize: '14px',
    fontWeight: 800,
    color: '#22C55E',
    letterSpacing: '0.08em',
  },
  pulsingDot: {
    width: '10px',
    height: '10px',
    background: '#22C55E',
    borderRadius: '50%',
    marginLeft: 'auto',
    animation: 'pulse-green 2s ease-in-out infinite',
  },
  criticalBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '12px 16px',
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.5)',
    borderRadius: '10px',
    animation: 'pulse-red 1.5s ease-in-out infinite',
  },
  criticalText: {
    fontSize: '13px',
    fontWeight: 800,
    color: '#EF4444',
    letterSpacing: '0.06em',
  },
  monitorRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  monitorLabel: {
    fontSize: '13px',
    color: '#94A3B8',
  },
  monitorMono: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#60A5FA',
    fontFamily: 'monospace',
  },
  breakDetail: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    padding: '10px 12px',
    background: 'rgba(245, 158, 11, 0.08)',
    border: '1px solid rgba(245, 158, 11, 0.25)',
    borderRadius: '8px',
  },

  // ── RAIO Ledger Widget ─────────────────────────────────────────────
  raioCard: {
    flex: 1,
    padding: '24px',
    background: 'rgba(15, 23, 42, 0.6)',
    border: '1px solid rgba(34, 197, 94, 0.25)',
    borderRadius: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  raioHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    paddingBottom: '12px',
    borderBottom: '1px solid rgba(100, 116, 139, 0.2)',
  },
  raioTitle: {
    fontSize: '15px',
    fontWeight: 700,
    color: '#F8FAFC',
    letterSpacing: '0.02em',
  },
  raioAuthorized: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px 16px',
    background: 'rgba(34, 197, 94, 0.08)',
    border: '1px solid rgba(34, 197, 94, 0.3)',
    borderRadius: '10px',
  },
  raioExpired: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px 16px',
    background: 'rgba(239, 68, 68, 0.08)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: '10px',
  },
  countdownRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  countdownValue: {
    fontSize: '16px',
    fontWeight: 800,
    fontFamily: 'monospace',
    letterSpacing: '0.04em',
  },
  raioRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  raioLabel: {
    fontSize: '13px',
    color: '#94A3B8',
  },
  raioMono: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#60A5FA',
    fontFamily: 'monospace',
  },
  verdictBox: {
    padding: '10px 12px',
    background: 'rgba(15, 23, 42, 0.8)',
    border: '1px solid rgba(100, 116, 139, 0.15)',
    borderRadius: '8px',
  },
  recertBanner: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    padding: '12px 16px',
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.5)',
    borderRadius: '10px',
    animation: 'pulse-red 2s ease-in-out infinite',
  },
  graceBanner: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    padding: '12px 16px',
    background: 'rgba(245, 158, 11, 0.08)',
    border: '1px solid rgba(245, 158, 11, 0.4)',
    borderRadius: '10px',
  },
  raioGrace: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px 16px',
    background: 'rgba(245, 158, 11, 0.08)',
    border: '1px solid rgba(245, 158, 11, 0.3)',
    borderRadius: '10px',
  },

  // ── Stats ──────────────────────────────────────────────────────────
  statsSection: {
    marginBottom: '40px',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '20px',
  },
  statCard: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '16px',
    padding: '24px',
    background: 'rgba(15, 23, 42, 0.6)',
    border: '1px solid rgba(30, 64, 175, 0.2)',
    borderRadius: '16px',
  },
  statIcon: {
    width: '44px',
    height: '44px',
    background: 'rgba(30, 64, 175, 0.15)',
    borderRadius: '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  statContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  statLabel: {
    fontSize: '13px',
    color: '#64748B',
  },
  statValue: {
    fontSize: '24px',
    fontWeight: 700,
    color: '#F8FAFC',
    letterSpacing: '-0.02em',
  },
  statTrend: {
    fontSize: '12px',
    color: '#22C55E',
  },

  // ── Quick Actions ──────────────────────────────────────────────────
  actionsSection: {
    marginBottom: '40px',
  },
  actionsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '20px',
  },
  actionCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '24px',
    border: '1px solid',
    borderRadius: '16px',
    textDecoration: 'none',
    transition: 'all 0.2s ease',
  },
  actionIcon: {
    width: '56px',
    height: '56px',
    borderRadius: '14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  actionContent: {
    flex: 1,
  },
  actionTitle: {
    fontSize: '16px',
    fontWeight: 700,
    margin: '0 0 4px 0',
  },
  actionDesc: {
    fontSize: '13px',
    color: '#94A3B8',
    margin: 0,
  },

  // ── Danger Zone (OperationsControl) ───────────────────────────────
  emergencySection: {
    marginBottom: '40px',
  },
};
