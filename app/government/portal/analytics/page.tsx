'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  BarChart3,
  TrendingUp,
  Clock,
  DollarSign,
  Users,
  Phone,
  MessageSquare,
  ArrowUp,
  ArrowDown,
  Shield,
  Fingerprint,
  CheckCircle,
  AlertTriangle,
} from 'lucide-react';
import { useGovAuth } from '@/context/GovAuthContext';
import InfoBubble from '@/components/government/InfoBubble';
import { getFirebaseClient } from '@/lib/firebase/client';
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  where,
  type DocumentData,
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { useWitness, useIntegrity } from '../dashboard/DashboardClient';

// =============================================================================
// TYPES
// =============================================================================

interface CallRecord {
  id: string;
  sessionId: string;
  duration: number;
  timestamp: string;
  status: string;
  toolsUsed: string[];
  transcriptCount: number;
}

interface HourBucket {
  hour: string;
  calls: number;
}

interface ToolAggregate {
  intent: string;
  count: number;
  percentage: number;
}

interface CostMetrics {
  hoursSaved: number;
  hourlyRate: number;
  totalSavings: number;
  callsHandled: number;
  avgCallDuration: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const ASSUMED_HOURLY_RATE = 28; // $/hr for staff cost savings estimate

// =============================================================================
// AGGREGATION ENGINE — All metrics computed from live call records
// =============================================================================

function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.round(totalSeconds % 60);
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

function aggregateByHour(calls: CallRecord[]): HourBucket[] {
  // Bucket every call by its hour-of-day (local time)
  const buckets: Record<number, number> = {};
  for (let h = 0; h < 24; h++) buckets[h] = 0;

  for (const c of calls) {
    const d = new Date(c.timestamp);
    if (!isNaN(d.getTime())) {
      buckets[d.getHours()]++;
    }
  }

  // Only return hours that have calls or fall in the 8 AM–6 PM business window
  const result: HourBucket[] = [];
  for (let h = 8; h <= 17; h++) {
    const ampm = h < 12 ? 'AM' : 'PM';
    const display = h === 12 ? 12 : h > 12 ? h - 12 : h;
    result.push({ hour: `${display} ${ampm}`, calls: buckets[h] });
  }
  return result;
}

function aggregateTools(calls: CallRecord[]): ToolAggregate[] {
  const counts: Record<string, number> = {};
  for (const c of calls) {
    for (const tool of c.toolsUsed) {
      counts[tool] = (counts[tool] || 0) + 1;
    }
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([intent, count]) => ({
      intent: humanizeToolName(intent),
      count,
      percentage: Math.round((count / total) * 100),
    }));
}

function humanizeToolName(raw: string): string {
  return raw
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function computeCostMetrics(calls: CallRecord[]): CostMetrics {
  const totalDurationSec = calls.reduce((sum, c) => sum + (c.duration || 0), 0);
  const hoursSaved = parseFloat((totalDurationSec / 3600).toFixed(1));
  const avgSec = calls.length > 0 ? totalDurationSec / calls.length : 0;

  return {
    hoursSaved,
    hourlyRate: ASSUMED_HOURLY_RATE,
    totalSavings: Math.round(hoursSaved * ASSUMED_HOURLY_RATE),
    callsHandled: calls.length,
    avgCallDuration: formatDuration(avgSec),
  };
}

function computeCompletionRate(calls: CallRecord[]): string {
  if (calls.length === 0) return '0%';
  const completed = calls.filter((c) => c.status === 'completed').length;
  return `${((completed / calls.length) * 100).toFixed(1)}%`;
}

// =============================================================================
// WITNESSED BY WATERMARK — Binds every chart to the cryptographic audit chain
// =============================================================================

function WitnessedBy({ chainHead }: { chainHead: string | null }) {
  const display = chainHead
    ? `${chainHead.slice(0, 10)}…${chainHead.slice(-6)}`
    : '—';
  return (
    <div style={styles.witnessWatermark}>
      <Shield size={10} color="#334155" />
      <span>Witnessed by {display}</span>
    </div>
  );
}

// =============================================================================
// FORENSIC VERIFICATION BADGE — Top-of-chart integrity seal
// =============================================================================
// Displayed at the top of every chart. Shows chain verification status,
// the truncated Merkle root, and entry count from the audit-integrity API.

function ForensicVerificationBadge({
  chainHead,
  verified,
  totalEntries,
  loading,
}: {
  chainHead: string | null;
  verified: boolean | null;
  totalEntries: number | null;
  loading: boolean;
}) {
  const hashDisplay = chainHead
    ? `${chainHead.slice(0, 8)}…${chainHead.slice(-6)}`
    : '———';

  if (loading) {
    return (
      <div style={{ ...styles.forensicBadge, borderColor: 'rgba(100, 116, 139, 0.2)' }}>
        <Fingerprint size={12} color="#64748B" />
        <span style={{ ...styles.forensicLabel, color: '#64748B' }}>VERIFYING CHAIN…</span>
      </div>
    );
  }

  const isVerified = verified === true;
  const isBroken = verified === false;

  return (
    <div
      style={{
        ...styles.forensicBadge,
        borderColor: isBroken
          ? 'rgba(239, 68, 68, 0.4)'
          : isVerified
            ? 'rgba(34, 197, 94, 0.25)'
            : 'rgba(100, 116, 139, 0.2)',
        background: isBroken
          ? 'rgba(239, 68, 68, 0.06)'
          : isVerified
            ? 'rgba(34, 197, 94, 0.04)'
            : 'rgba(100, 116, 139, 0.04)',
      }}
    >
      {isBroken ? (
        <AlertTriangle size={12} color="#EF4444" />
      ) : isVerified ? (
        <CheckCircle size={12} color="#22C55E" />
      ) : (
        <Fingerprint size={12} color="#64748B" />
      )}
      <span
        style={{
          ...styles.forensicLabel,
          color: isBroken ? '#EF4444' : isVerified ? '#22C55E' : '#64748B',
        }}
      >
        {isBroken ? 'CHAIN BROKEN' : isVerified ? 'FORENSIC VERIFIED' : 'UNVERIFIED'}
      </span>
      <span style={styles.forensicSep}>|</span>
      <span style={styles.forensicHash}>{hashDisplay}</span>
      {totalEntries !== null && (
        <>
          <span style={styles.forensicSep}>|</span>
          <span style={styles.forensicEntries}>{totalEntries} entries</span>
        </>
      )}
    </div>
  );
}

// =============================================================================
// STAT CARD
// =============================================================================

function StatCard({
  label,
  value,
  icon: Icon,
  trend,
  trendUp,
  info,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  trend?: string;
  trendUp?: boolean;
  info?: { what: string; why: string; missing?: string };
}) {
  return (
    <div style={styles.statCard}>
      <div style={styles.statIcon}>
        <Icon size={22} color="#60A5FA" />
      </div>
      <div style={styles.statContent}>
        <span style={styles.statLabel}>
          {label}
          {info && <InfoBubble what={info.what} why={info.why} missing={info.missing} />}
        </span>
        <span style={styles.statValue}>{value}</span>
        {trend && (
          <span style={{
            ...styles.statTrend,
            color: trendUp ? '#22C55E' : '#EF4444',
          }}>
            {trendUp ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
            {trend}
          </span>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// CHART: CALL VOLUME BY HOUR (live)
// =============================================================================

function CallVolumeChart({
  data,
  chainHead,
  verified,
  totalEntries,
  integrityLoading,
}: {
  data: HourBucket[];
  chainHead: string | null;
  verified: boolean | null;
  totalEntries: number | null;
  integrityLoading: boolean;
}) {
  const maxCalls = Math.max(...data.map((d) => d.calls), 1);

  return (
    <div style={styles.chartCard}>
      <div style={styles.chartHeader}>
        <div style={styles.chartIcon}>
          <BarChart3 size={20} color="#60A5FA" />
        </div>
        <div>
          <h3 style={styles.chartTitle}>Call Volume by Hour</h3>
          <p style={styles.chartSubtitle}>Live distribution from call feed</p>
        </div>
      </div>
      <ForensicVerificationBadge
        chainHead={chainHead}
        verified={verified}
        totalEntries={totalEntries}
        loading={integrityLoading}
      />
      <div style={styles.barChart}>
        {data.map((d, idx) => (
          <div key={idx} style={styles.barGroup}>
            <div style={styles.barContainer}>
              <div
                style={{
                  ...styles.bar,
                  height: `${(d.calls / maxCalls) * 100}%`,
                  minHeight: d.calls > 0 ? '4px' : '0px',
                }}
              />
            </div>
            <span style={styles.barLabel}>{d.hour}</span>
          </div>
        ))}
      </div>
      <WitnessedBy chainHead={chainHead} />
    </div>
  );
}

// =============================================================================
// CHART: TOP CITIZEN INTENTS (live)
// =============================================================================

function TopIntentsChart({
  data,
  chainHead,
  verified,
  totalEntries,
  integrityLoading,
}: {
  data: ToolAggregate[];
  chainHead: string | null;
  verified: boolean | null;
  totalEntries: number | null;
  integrityLoading: boolean;
}) {
  return (
    <div style={styles.chartCard}>
      <div style={styles.chartHeader}>
        <div style={styles.chartIcon}>
          <MessageSquare size={20} color="#60A5FA" />
        </div>
        <div>
          <h3 style={styles.chartTitle}>Top Citizen Intents</h3>
          <p style={styles.chartSubtitle}>Most common tool invocations</p>
        </div>
      </div>
      <ForensicVerificationBadge
        chainHead={chainHead}
        verified={verified}
        totalEntries={totalEntries}
        loading={integrityLoading}
      />
      <div style={styles.intentsList}>
        {data.length === 0 && (
          <span style={{ fontSize: '13px', color: '#475569' }}>
            No tool invocations recorded yet.
          </span>
        )}
        {data.map((item, idx) => (
          <div key={idx} style={styles.intentRow}>
            <div style={styles.intentInfo}>
              <span style={styles.intentRank}>#{idx + 1}</span>
              <span style={styles.intentName}>{item.intent}</span>
            </div>
            <div style={styles.intentStats}>
              <div style={styles.intentBarBg}>
                <div
                  style={{
                    ...styles.intentBar,
                    width: `${item.percentage}%`,
                  }}
                />
              </div>
              <span style={styles.intentCount}>{item.count}</span>
            </div>
          </div>
        ))}
      </div>
      <WitnessedBy chainHead={chainHead} />
    </div>
  );
}

// =============================================================================
// CHART: COST SAVINGS CALCULATOR (live)
// =============================================================================

function CostSavingsCard({
  metrics,
  chainHead,
  verified,
  totalEntries,
  integrityLoading,
}: {
  metrics: CostMetrics;
  chainHead: string | null;
  verified: boolean | null;
  totalEntries: number | null;
  integrityLoading: boolean;
}) {
  return (
    <div style={styles.savingsCard}>
      <div style={styles.chartHeader}>
        <div style={{ ...styles.chartIcon, background: 'rgba(34, 197, 94, 0.15)' }}>
          <DollarSign size={20} color="#22C55E" />
        </div>
        <div>
          <h3 style={styles.chartTitle}>Cost Savings Calculator</h3>
          <p style={styles.chartSubtitle}>Estimated staff time savings (live)</p>
        </div>
      </div>
      <ForensicVerificationBadge
        chainHead={chainHead}
        verified={verified}
        totalEntries={totalEntries}
        loading={integrityLoading}
      />

      <div style={styles.savingsHighlight}>
        <span style={styles.savingsLabel}>Total Estimated Savings</span>
        <span style={styles.savingsValue}>
          ${metrics.totalSavings.toLocaleString()}
        </span>
        <span style={styles.savingsSubtext}>
          Based on {metrics.hoursSaved} hours at ${metrics.hourlyRate}/hr
        </span>
      </div>

      <div style={styles.savingsBreakdown}>
        <div style={styles.savingsItem}>
          <Clock size={18} color="#64748B" />
          <div style={styles.savingsItemContent}>
            <span style={styles.savingsItemValue}>{metrics.hoursSaved} hours</span>
            <span style={styles.savingsItemLabel}>Staff Time Saved</span>
          </div>
        </div>
        <div style={styles.savingsItem}>
          <Phone size={18} color="#64748B" />
          <div style={styles.savingsItemContent}>
            <span style={styles.savingsItemValue}>
              {metrics.callsHandled.toLocaleString()}
            </span>
            <span style={styles.savingsItemLabel}>Calls Handled by AI</span>
          </div>
        </div>
        <div style={styles.savingsItem}>
          <Users size={18} color="#64748B" />
          <div style={styles.savingsItemContent}>
            <span style={styles.savingsItemValue}>{metrics.avgCallDuration}</span>
            <span style={styles.savingsItemLabel}>Avg. Call Duration</span>
          </div>
        </div>
      </div>
      <WitnessedBy chainHead={chainHead} />
    </div>
  );
}

// =============================================================================
// MAIN PAGE — Live Analytics with Firestore onSnapshot
// =============================================================================

export default function AnalyticsPage() {
  const { agency, isLoading: govLoading } = useGovAuth();
  const { data: witnessData } = useWitness();
  const integritySwr = useIntegrity();

  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);

  // ── Wait for Firebase Auth to resolve ───────────────────────────
  // Must wait for a *signed-in* user before opening Firestore
  // listeners — onAuthStateChanged fires immediately with null
  // before GovAuthContext's signInAnonymously() completes.
  useEffect(() => {
    const { auth } = getFirebaseClient();
    if (!auth) {
      setAuthReady(true);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setAuthReady(true);
        unsubscribe();
      }
    });

    // Safety valve: proceed after 5 s even if auth hasn't resolved
    const timeout = setTimeout(() => setAuthReady(true), 5_000);

    return () => {
      unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  // ── Live Firestore listener (fires only after auth resolves) ────
  // SECURITY: Filters by tenant_id to enforce tenant isolation.
  // Without this filter, all signed-in users would see every tenant's data.
  useEffect(() => {
    if (!authReady) return;

    const { db, auth } = getFirebaseClient();
    if (!db) {
      setFeedLoading(false);
      return;
    }

    const uid = auth?.currentUser?.uid;
    if (!uid) {
      setFeedLoading(false);
      return;
    }

    const q = query(
      collection(db, 'government_calls'),
      where('tenant_id', '==', uid),
      orderBy('timestamp', 'desc'),
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const records: CallRecord[] = snapshot.docs.map((doc) => {
          const d = doc.data() as DocumentData;
          return {
            id: doc.id,
            sessionId: d.sessionId ?? '',
            duration: d.duration ?? 0,
            timestamp: d.timestamp ?? '',
            status: d.status ?? '',
            toolsUsed: Array.isArray(d.toolsUsed) ? d.toolsUsed : [],
            transcriptCount: d.transcriptCount ?? 0,
          };
        });
        setCalls(records);
        setFeedLoading(false);
      },
      (err) => {
        console.error('[Analytics] Firestore listener error:', err);
        setFeedLoading(false);
      },
    );

    return () => unsubscribe();
  }, [authReady]);

  // ── Derived metrics (recomputed on every snapshot) ────────────────
  const hourlyData = useMemo(() => aggregateByHour(calls), [calls]);
  const toolsData = useMemo(() => aggregateTools(calls), [calls]);
  const costMetrics = useMemo(() => computeCostMetrics(calls), [calls]);
  const completionRate = useMemo(() => computeCompletionRate(calls), [calls]);

  const chainHead = witnessData?.chain_head ?? null;

  // ── Forensic verification state ─────────────────────────────────
  const chainVerified = integritySwr.data?.valid ?? null;
  const chainTotalEntries = integritySwr.data?.total_entries ?? null;
  const integrityLoading = !integritySwr.data && !integritySwr.error;

  // ── Loading ───────────────────────────────────────────────────────
  if (govLoading || feedLoading) {
    return (
      <div style={styles.loadingContainer}>
        <style>{'@keyframes spin { to { transform: rotate(360deg); } }'}</style>
        <div style={styles.loadingSpinner} />
        <p style={styles.loadingText}>
          {feedLoading ? 'Connecting to live feed...' : 'Loading analytics...'}
        </p>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <style>{'@keyframes spin { to { transform: rotate(360deg); } }'}</style>
      <div style={styles.container}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.headerTop}>
            <div>
              <h1 style={styles.title}>Analytics</h1>
              <p style={styles.subtitle}>
                {agency.name} — Live Performance Metrics
                <span style={styles.liveBadge}>LIVE</span>
              </p>
            </div>
            {/* Chain Integrity Banner */}
            <div
              style={{
                ...styles.chainBanner,
                borderColor: chainVerified === false
                  ? 'rgba(239, 68, 68, 0.5)'
                  : chainVerified === true
                    ? 'rgba(34, 197, 94, 0.3)'
                    : 'rgba(100, 116, 139, 0.2)',
                background: chainVerified === false
                  ? 'rgba(239, 68, 68, 0.06)'
                  : chainVerified === true
                    ? 'rgba(34, 197, 94, 0.04)'
                    : 'rgba(15, 23, 42, 0.6)',
              }}
            >
              <Fingerprint
                size={16}
                color={
                  chainVerified === false
                    ? '#EF4444'
                    : chainVerified === true
                      ? '#22C55E'
                      : '#64748B'
                }
              />
              <div style={styles.chainBannerText}>
                <span style={{
                  ...styles.chainBannerTitle,
                  color: chainVerified === false
                    ? '#EF4444'
                    : chainVerified === true
                      ? '#22C55E'
                      : '#94A3B8',
                }}>
                  {integrityLoading
                    ? 'Verifying Chain…'
                    : chainVerified === true
                      ? 'Audit Chain Intact'
                      : chainVerified === false
                        ? 'Audit Chain Broken'
                        : 'Chain Status Unknown'}
                  <InfoBubble
                    what="The Audit Chain is a SHA-256 hash chain linking every system action. Each entry references the previous entry's hash, creating a tamper-evident ledger."
                    why="If this chain is 'Broken', it means an entry was modified or deleted after recording — indicating potential data tampering."
                    missing="The chain has not been initialized yet. It begins when the first system action is recorded."
                  />
                </span>
                <span style={styles.chainBannerHash}>
                  {chainHead ? `${chainHead.slice(0, 12)}…${chainHead.slice(-8)}` : '—'}
                  {chainTotalEntries !== null && ` · ${chainTotalEntries} entries`}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Stats Row — all computed from live data */}
        <div style={styles.statsGrid}>
          <StatCard
            label="Total Calls"
            value={calls.length.toLocaleString()}
            icon={Phone}
            info={{
              what: 'The total number of citizen calls handled by the AI receptionist.',
              why: 'Tracks overall system utilization. A sudden drop may indicate an outage or configuration issue.',
              missing: 'No calls have been recorded yet. The counter starts when the first call is received.',
            }}
          />
          <StatCard
            label="Avg. Handle Time"
            value={costMetrics.avgCallDuration}
            icon={Clock}
            info={{
              what: 'The average duration of all recorded calls from start to end.',
              why: 'Shorter handle times usually indicate efficient AI resolution. Unusually long calls may signal complex issues or system delays.',
              missing: 'Requires at least one completed call to calculate.',
            }}
          />
          <StatCard
            label="Resolution Rate"
            value={completionRate}
            icon={TrendingUp}
            info={{
              what: 'The percentage of calls that reached a "completed" status vs. all calls.',
              why: 'A high resolution rate means the AI is successfully handling citizen requests without needing human escalation.',
              missing: 'No completed calls recorded. Calls in progress or dropped will not contribute to this metric.',
            }}
          />
          <StatCard
            label="Cost Savings"
            value={`$${costMetrics.totalSavings.toLocaleString()}`}
            icon={DollarSign}
            info={{
              what: 'Estimated staff cost savings based on total call time handled by AI multiplied by the assumed hourly rate ($28/hr).',
              why: 'Demonstrates ROI of the AI receptionist by quantifying the labor hours it replaces.',
              missing: 'No calls recorded yet. This value accumulates as the AI handles more calls.',
            }}
          />
        </div>

        {/* Charts Row */}
        <div style={styles.chartsRow}>
          <CallVolumeChart
            data={hourlyData}
            chainHead={chainHead}
            verified={chainVerified}
            totalEntries={chainTotalEntries}
            integrityLoading={integrityLoading}
          />
          <TopIntentsChart
            data={toolsData}
            chainHead={chainHead}
            verified={chainVerified}
            totalEntries={chainTotalEntries}
            integrityLoading={integrityLoading}
          />
        </div>

        {/* Cost Savings */}
        <CostSavingsCard
          metrics={costMetrics}
          chainHead={chainHead}
          verified={chainVerified}
          totalEntries={chainTotalEntries}
          integrityLoading={integrityLoading}
        />
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
    maxWidth: '1200px',
    margin: '0 auto',
  },
  loadingContainer: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '16px',
  },
  loadingSpinner: {
    width: '40px',
    height: '40px',
    borderWidth: '3px',
    borderStyle: 'solid',
    borderColor: 'rgba(30, 64, 175, 0.2)',
    borderTopColor: '#1E40AF',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  loadingText: {
    fontSize: '14px',
    color: '#64748B',
  },
  header: {
    marginBottom: '32px',
  },
  headerTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '24px',
  },
  chainBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px 16px',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderRadius: '10px',
    flexShrink: 0,
  },
  chainBannerText: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  chainBannerTitle: {
    fontSize: '12px',
    fontWeight: 700,
    letterSpacing: '0.04em',
  },
  chainBannerHash: {
    fontSize: '10px',
    fontFamily: 'monospace',
    color: '#475569',
    letterSpacing: '0.02em',
  },
  title: {
    fontSize: '32px',
    fontWeight: 800,
    color: '#F8FAFC',
    margin: '0 0 8px 0',
    letterSpacing: '-0.03em',
  },
  subtitle: {
    fontSize: '15px',
    color: '#64748B',
    margin: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  liveBadge: {
    fontSize: '10px',
    fontWeight: 800,
    color: '#22C55E',
    letterSpacing: '0.08em',
    padding: '2px 8px',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'rgba(34, 197, 94, 0.4)',
    borderRadius: '4px',
    background: 'rgba(34, 197, 94, 0.1)',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '20px',
    marginBottom: '32px',
  },
  statCard: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '16px',
    padding: '24px',
    background: 'rgba(15, 23, 42, 0.6)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'rgba(30, 64, 175, 0.2)',
    borderRadius: '16px',
  },
  statIcon: {
    width: '48px',
    height: '48px',
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
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
  },
  statValue: {
    fontSize: '24px',
    fontWeight: 700,
    color: '#F8FAFC',
    letterSpacing: '-0.02em',
  },
  statTrend: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '12px',
  },
  chartsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '24px',
    marginBottom: '24px',
  },
  chartCard: {
    padding: '24px',
    background: 'rgba(15, 23, 42, 0.6)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'rgba(30, 64, 175, 0.2)',
    borderRadius: '16px',
    position: 'relative',
  },
  chartHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    marginBottom: '24px',
  },
  chartIcon: {
    width: '44px',
    height: '44px',
    background: 'rgba(30, 64, 175, 0.15)',
    borderRadius: '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chartTitle: {
    fontSize: '16px',
    fontWeight: 700,
    color: '#F8FAFC',
    margin: '0 0 4px 0',
  },
  chartSubtitle: {
    fontSize: '13px',
    color: '#64748B',
    margin: 0,
  },
  barChart: {
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: '160px',
    gap: '8px',
  },
  barGroup: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    height: '100%',
  },
  barContainer: {
    flex: 1,
    width: '100%',
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  bar: {
    width: '70%',
    background: 'linear-gradient(180deg, #3B82F6 0%, #1E40AF 100%)',
    borderRadius: '4px 4px 0 0',
    transition: 'height 0.3s ease',
  },
  barLabel: {
    fontSize: '10px',
    color: '#64748B',
    whiteSpace: 'nowrap',
  },
  intentsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  intentRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '16px',
  },
  intentInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    minWidth: '180px',
  },
  intentRank: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#64748B',
    width: '24px',
  },
  intentName: {
    fontSize: '14px',
    color: '#F8FAFC',
  },
  intentStats: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  intentBarBg: {
    flex: 1,
    height: '8px',
    background: 'rgba(30, 64, 175, 0.2)',
    borderRadius: '4px',
    overflow: 'hidden',
  },
  intentBar: {
    height: '100%',
    background: 'linear-gradient(90deg, #1E40AF 0%, #3B82F6 100%)',
    borderRadius: '4px',
  },
  intentCount: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#60A5FA',
    minWidth: '40px',
    textAlign: 'right',
  },
  savingsCard: {
    padding: '32px',
    background: 'rgba(15, 23, 42, 0.6)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'rgba(34, 197, 94, 0.2)',
    borderRadius: '16px',
    position: 'relative',
  },
  savingsHighlight: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '32px',
    background: 'rgba(34, 197, 94, 0.05)',
    borderRadius: '12px',
    marginBottom: '24px',
  },
  savingsLabel: {
    fontSize: '14px',
    color: '#64748B',
    marginBottom: '8px',
  },
  savingsValue: {
    fontSize: '48px',
    fontWeight: 800,
    color: '#22C55E',
    letterSpacing: '-0.03em',
  },
  savingsSubtext: {
    fontSize: '13px',
    color: '#94A3B8',
    marginTop: '8px',
  },
  savingsBreakdown: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '20px',
  },
  savingsItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '16px',
    background: 'rgba(30, 64, 175, 0.05)',
    borderRadius: '10px',
  },
  savingsItemContent: {
    display: 'flex',
    flexDirection: 'column',
  },
  savingsItemValue: {
    fontSize: '18px',
    fontWeight: 700,
    color: '#F8FAFC',
  },
  savingsItemLabel: {
    fontSize: '12px',
    color: '#64748B',
  },
  // ── Witness Watermark ─────────────────────────────────────────────
  witnessWatermark: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginTop: '16px',
    paddingTop: '12px',
    borderTop: '1px solid rgba(51, 65, 85, 0.25)',
    fontSize: '10px',
    fontFamily: 'monospace',
    color: '#334155',
    letterSpacing: '0.02em',
    userSelect: 'none',
  },
  // ── Forensic Verification Badge ─────────────────────────────────
  forensicBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    marginBottom: '16px',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderRadius: '6px',
    userSelect: 'none',
  },
  forensicLabel: {
    fontSize: '10px',
    fontWeight: 800,
    letterSpacing: '0.08em',
    fontFamily: 'monospace',
  },
  forensicSep: {
    fontSize: '10px',
    color: 'rgba(100, 116, 139, 0.3)',
    fontFamily: 'monospace',
  },
  forensicHash: {
    fontSize: '10px',
    fontWeight: 600,
    color: '#60A5FA',
    fontFamily: 'monospace',
    letterSpacing: '0.02em',
  },
  forensicEntries: {
    fontSize: '10px',
    fontWeight: 600,
    color: '#475569',
    fontFamily: 'monospace',
  },
};
