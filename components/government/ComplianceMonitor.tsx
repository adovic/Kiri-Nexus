'use client';

import { useState, useEffect } from 'react';
import useSWR from 'swr';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Lock,
  MapPin,
  Eye,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader,
  Clock,
} from 'lucide-react';

// =============================================================================
// SOVEREIGN GUARD — CJIS / HIPAA Compliance Monitor
// =============================================================================
//
// A status card that continuously monitors three compliance domains:
//
//   1. ENCRYPTION AT REST  — AES-256-GCM key active + 90-day rotation policy
//   2. DATA RESIDENCY      — Sovereignty region pinned to expected US locale
//   3. ACCESS AUDIT        — Admin access events in the last 24 hours
//
// Shield icon color:
//   Green  (#22C55E) — All checks pass
//   Yellow (#F59E0B) — Key rotation overdue (> 90 days)
//   Red    (#EF4444) — Encryption missing or residency violation
//
// Data: SWR polling → GET /api/government/compliance-status (30s interval)
// =============================================================================

// ── Types ────────────────────────────────────────────────────────────────────

interface ComplianceData {
  encryption: {
    active: boolean;
    cipher: string | null;
    key_age_days: number | null;
    rotation_overdue: boolean;
    rotation_threshold_days: number;
  };
  residency: {
    region: string | null;
    expected_region: string;
    pinned: boolean;
  };
  access_logs: {
    events_24h: number;
    last_access_at: string | null;
    total_events: number;
  };
  overall: 'compliant' | 'warning' | 'critical';
  tenant_id: string;
  agency_name: string;
  checked_at: string;
}

// ── SWR Fetcher ──────────────────────────────────────────────────────────────

const fetcher = (url: string) =>
  fetch(url, { credentials: 'include' }).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });

// ── Status Color Map ─────────────────────────────────────────────────────────

const STATUS_COLORS = {
  compliant: '#22C55E',
  warning: '#F59E0B',
  critical: '#EF4444',
  loading: '#64748B',
} as const;

const STATUS_GLOW = {
  compliant: 'rgba(34, 197, 94, 0.25)',
  warning: 'rgba(245, 158, 11, 0.25)',
  critical: 'rgba(239, 68, 68, 0.25)',
  loading: 'rgba(100, 116, 139, 0.15)',
} as const;

const STATUS_LABELS = {
  compliant: 'ALL CHECKS PASS',
  warning: 'KEY ROTATION OVERDUE',
  critical: 'COMPLIANCE VIOLATION',
} as const;

// ── Helper: Relative Time ────────────────────────────────────────────────────

function relativeTime(isoString: string | null): string {
  if (!isoString) return 'Never';
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// =============================================================================
// CheckRow — Individual Compliance Check Display
// =============================================================================

function CheckRow({
  icon,
  label,
  status,
  detail,
  subDetail,
}: {
  icon: React.ReactNode;
  label: string;
  status: 'pass' | 'warn' | 'fail' | 'loading';
  detail: string;
  subDetail?: string;
}) {
  const color =
    status === 'pass'
      ? '#22C55E'
      : status === 'warn'
        ? '#F59E0B'
        : status === 'fail'
          ? '#EF4444'
          : '#64748B';

  const StatusIcon =
    status === 'pass'
      ? CheckCircle
      : status === 'warn'
        ? AlertTriangle
        : status === 'fail'
          ? XCircle
          : Loader;

  return (
    <div style={s.checkRow}>
      <div style={s.checkIconWrap}>{icon}</div>
      <div style={s.checkContent}>
        <div style={s.checkHeader}>
          <span style={s.checkLabel}>{label}</span>
          <div style={s.checkStatus}>
            <StatusIcon
              size={13}
              color={color}
              style={
                status === 'loading'
                  ? { animation: 'complianceSpin 1s linear infinite' }
                  : undefined
              }
            />
            <span style={{ ...s.checkStatusText, color }}>
              {status === 'pass'
                ? 'PASS'
                : status === 'warn'
                  ? 'WARN'
                  : status === 'fail'
                    ? 'FAIL'
                    : 'CHECKING'}
            </span>
          </div>
        </div>
        <span style={s.checkDetail}>{detail}</span>
        {subDetail && <span style={s.checkSubDetail}>{subDetail}</span>}
      </div>
    </div>
  );
}

// =============================================================================
// ComplianceMonitor — Main Export
// =============================================================================

export default function ComplianceMonitor() {
  const { data, error } = useSWR<ComplianceData>(
    '/api/government/compliance-status',
    fetcher,
    { refreshInterval: 30_000, revalidateOnFocus: false },
  );

  const isLoading = !data && !error;
  const overall = data?.overall ?? null;
  const statusKey = overall ?? 'loading';
  const color = STATUS_COLORS[statusKey];
  const glow = STATUS_GLOW[statusKey];

  // ── Pulsing shield animation state ──
  const [pulseVisible, setPulseVisible] = useState(true);
  useEffect(() => {
    if (statusKey === 'critical') {
      const interval = setInterval(() => setPulseVisible((v) => !v), 800);
      return () => clearInterval(interval);
    }
    setPulseVisible(true);
  }, [statusKey]);

  // ── Shield Icon Selection ──
  const ShieldIcon =
    statusKey === 'compliant'
      ? ShieldCheck
      : statusKey === 'critical'
        ? ShieldAlert
        : Shield;

  // ── Encryption check row ──
  const encStatus = !data
    ? 'loading'
    : data.encryption.active
      ? data.encryption.rotation_overdue
        ? 'warn'
        : 'pass'
      : 'fail';

  const encDetail = !data
    ? 'Verifying encryption key...'
    : data.encryption.active
      ? `${data.encryption.cipher}  ·  Key Age: ${data.encryption.key_age_days !== null ? `${data.encryption.key_age_days}d` : 'Unknown'}`
      : 'No encryption key detected';

  const encSub =
    data?.encryption.rotation_overdue
      ? `Rotation overdue — threshold: ${data.encryption.rotation_threshold_days}d`
      : data?.encryption.active
        ? `Rotation threshold: ${data.encryption.rotation_threshold_days}d`
        : undefined;

  // ── Residency check row ──
  const resStatus = !data
    ? 'loading'
    : data.residency.pinned
      ? 'pass'
      : 'fail';

  const resDetail = !data
    ? 'Checking data residency...'
    : data.residency.pinned
      ? `Region: ${data.residency.region}  ·  Pinned`
      : data.residency.region
        ? `Region: ${data.residency.region}  ·  Expected: ${data.residency.expected_region}`
        : `SOVEREIGNTY_REGION not configured  ·  Expected: ${data.residency.expected_region}`;

  // ── Access logs check row ──
  const accessDetail = !data
    ? 'Reading access audit...'
    : `${data.access_logs.events_24h} admin event${data.access_logs.events_24h !== 1 ? 's' : ''} (24h)  ·  Total: ${data.access_logs.total_events}`;

  const accessSub = data?.access_logs.last_access_at
    ? `Last access: ${relativeTime(data.access_logs.last_access_at)}`
    : data
      ? 'No admin access recorded'
      : undefined;

  return (
    <>
      {/* Keyframe injection */}
      <style>{`
        @keyframes complianceSpin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes complianceShieldPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes complianceGlowPulse {
          0%, 100% { box-shadow: 0 0 12px ${STATUS_GLOW.critical}; }
          50% { box-shadow: 0 0 28px rgba(239, 68, 68, 0.5); }
        }
      `}</style>

      <div
        style={{
          ...s.card,
          borderColor: `${color}22`,
          boxShadow: `0 0 16px ${glow}`,
          ...(statusKey === 'critical'
            ? { animation: 'complianceGlowPulse 2s ease-in-out infinite' }
            : {}),
        }}
      >
        {/* ── Header ─────────────────────────────────────────── */}
        <div style={s.header}>
          <div style={s.headerLeft}>
            <div
              style={{
                ...s.shieldWrap,
                background: `${color}15`,
                borderColor: `${color}30`,
              }}
            >
              <ShieldIcon
                size={22}
                color={color}
                style={{
                  opacity: pulseVisible ? 1 : 0.4,
                  transition: 'opacity 0.3s ease',
                }}
              />
            </div>
            <div style={s.headerText}>
              <span style={s.title}>SOVEREIGN GUARD</span>
              <span style={s.subtitle}>CJIS / HIPAA Compliance Monitor</span>
            </div>
          </div>
          <div style={s.headerRight}>
            {isLoading ? (
              <div style={{ ...s.badge, borderColor: '#64748B40', color: '#64748B' }}>
                <Loader
                  size={11}
                  style={{ animation: 'complianceSpin 1s linear infinite' }}
                />
                <span>CHECKING</span>
              </div>
            ) : error ? (
              <div style={{ ...s.badge, borderColor: '#EF444460', color: '#EF4444' }}>
                <XCircle size={11} />
                <span>ERROR</span>
              </div>
            ) : (
              <div style={{ ...s.badge, borderColor: `${color}50`, color }}>
                {statusKey === 'compliant' && <CheckCircle size={11} />}
                {statusKey === 'warning' && <AlertTriangle size={11} />}
                {statusKey === 'critical' && <XCircle size={11} />}
                <span>{STATUS_LABELS[overall!]}</span>
              </div>
            )}
          </div>
        </div>

        {/* ── Separator ─────────────────────────────────────── */}
        <div style={s.separator} />

        {/* ── Compliance Checks ─────────────────────────────── */}
        <div style={s.checksContainer}>
          <CheckRow
            icon={<Lock size={15} color="#60A5FA" />}
            label="ENCRYPTION AT REST"
            status={encStatus as 'pass' | 'warn' | 'fail' | 'loading'}
            detail={encDetail}
            subDetail={encSub}
          />

          <CheckRow
            icon={<MapPin size={15} color="#A78BFA" />}
            label="DATA RESIDENCY"
            status={resStatus as 'pass' | 'warn' | 'fail' | 'loading'}
            detail={resDetail}
          />

          <CheckRow
            icon={<Eye size={15} color="#38BDF8" />}
            label="ACCESS AUDIT"
            status={isLoading ? 'loading' : 'pass'}
            detail={accessDetail}
            subDetail={accessSub}
          />
        </div>

        {/* ── Footer ────────────────────────────────────────── */}
        <div style={s.footer}>
          <Clock size={10} color="#475569" />
          <span style={s.footerText}>
            {data
              ? `Last verified: ${new Date(data.checked_at).toLocaleString('en-US', {
                  hour12: false,
                  timeZone: 'UTC',
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })} UTC`
              : 'Awaiting first compliance check...'}
          </span>
          <span style={s.footerDivider}>|</span>
          <span style={s.footerText}>Polling: 30s</span>
        </div>
      </div>
    </>
  );
}

// =============================================================================
// STYLES — ComplianceMonitor
// =============================================================================

const s: { [key: string]: React.CSSProperties } = {
  // ── Card Container ────────────────────────────────────────────────────────
  card: {
    background: 'rgba(15, 23, 42, 0.85)',
    border: '1px solid',
    borderRadius: '12px',
    padding: '0',
    backdropFilter: 'blur(12px)',
    overflow: 'hidden',
    fontFamily:
      "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Cascadia Code', Consolas, monospace",
  },

  // ── Header ────────────────────────────────────────────────────────────────
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px 12px',
    gap: '12px',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  shieldWrap: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '42px',
    height: '42px',
    borderRadius: '10px',
    border: '1px solid',
    flexShrink: 0,
  },
  headerText: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
  },
  title: {
    fontSize: '13px',
    fontWeight: 800,
    letterSpacing: '0.1em',
    color: '#F8FAFC',
  },
  subtitle: {
    fontSize: '10px',
    fontWeight: 500,
    letterSpacing: '0.06em',
    color: '#64748B',
  },
  headerRight: {
    flexShrink: 0,
  },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    padding: '4px 10px',
    border: '1px solid',
    borderRadius: '6px',
    fontSize: '10px',
    fontWeight: 800,
    letterSpacing: '0.08em',
    fontFamily:
      "'JetBrains Mono', 'Fira Code', 'SF Mono', Consolas, monospace",
    whiteSpace: 'nowrap' as const,
  },

  // ── Separator ─────────────────────────────────────────────────────────────
  separator: {
    height: '1px',
    background:
      'linear-gradient(to right, transparent, rgba(100, 116, 139, 0.2) 20%, rgba(100, 116, 139, 0.2) 80%, transparent)',
    margin: '0 20px',
  },

  // ── Checks Container ──────────────────────────────────────────────────────
  checksContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0',
    padding: '8px 0',
  },

  // ── Individual Check Row ──────────────────────────────────────────────────
  checkRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    padding: '10px 20px',
    transition: 'background 0.2s ease',
  },
  checkIconWrap: {
    width: '32px',
    height: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '8px',
    background: 'rgba(30, 41, 59, 0.6)',
    border: '1px solid rgba(51, 65, 85, 0.4)',
    flexShrink: 0,
    marginTop: '1px',
  },
  checkContent: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '3px',
    flex: 1,
    minWidth: 0,
  },
  checkHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
  },
  checkLabel: {
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.08em',
    color: '#CBD5E1',
  },
  checkStatus: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    flexShrink: 0,
  },
  checkStatusText: {
    fontSize: '10px',
    fontWeight: 800,
    letterSpacing: '0.1em',
  },
  checkDetail: {
    fontSize: '11px',
    fontWeight: 500,
    color: '#94A3B8',
    letterSpacing: '0.02em',
  },
  checkSubDetail: {
    fontSize: '10px',
    fontWeight: 500,
    color: '#64748B',
    letterSpacing: '0.02em',
  },

  // ── Footer ────────────────────────────────────────────────────────────────
  footer: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 20px 10px',
    borderTop: '1px solid rgba(51, 65, 85, 0.25)',
  },
  footerText: {
    fontSize: '10px',
    fontWeight: 500,
    color: '#475569',
    letterSpacing: '0.02em',
  },
  footerDivider: {
    fontSize: '10px',
    color: '#334155',
  },
};
