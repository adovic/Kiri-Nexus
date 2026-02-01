'use client';

// TODO: Add server component wrapper (page.tsx -> CallsClient.tsx pattern)
// to verify session server-side before rendering, matching dashboard/page.tsx pattern.
// Current protection relies on middleware cookie-existence check only.

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  PhoneCall, PhoneIncoming, PhoneOutgoing, PhoneMissed, Clock, Search,
  Filter, Play, Download, Calendar, ArrowRight, Settings
} from 'lucide-react';

// =============================================================================
// TYPES
// =============================================================================

type Call = {
  id: string;
  caller: string;
  phone: string;
  type: 'inbound' | 'outbound' | 'missed';
  duration: string;
  outcome: string;
  time: string;
  date: string;
  sentiment: 'positive' | 'neutral' | 'negative';
};

// =============================================================================
// EMPTY STATE COMPONENT
// =============================================================================

function EmptyState() {
  return (
    <div style={styles.emptyState}>
      <div style={styles.emptyIcon}>
        <PhoneCall size={40} />
      </div>
      <h3 style={styles.emptyTitle}>No Calls Yet</h3>
      <p style={styles.emptyDesc}>
        Your AI receptionist hasn&apos;t handled any calls yet. Once your phone number is
        connected and calls start coming in, they&apos;ll appear here with full transcripts
        and analytics.
      </p>
      <div style={styles.emptyActions}>
        <Link href="/dashboard/settings" style={styles.emptyActionBtn}>
          <Settings size={16} />
          Configure Phone
        </Link>
        <Link href="/demo/setup" style={styles.emptyActionSecondary}>
          Try Demo
          <ArrowRight size={16} />
        </Link>
      </div>
      <div style={styles.emptyHint}>
        <p style={styles.emptyHintText}>
          <strong>What you&apos;ll see here:</strong> Call recordings, transcripts,
          sentiment analysis, booking confirmations, and caller information.
        </p>
      </div>
    </div>
  );
}

// =============================================================================
// COMPONENTS
// =============================================================================

function CallTypeIcon({ type }: { type: string }) {
  const icons: Record<string, { icon: typeof PhoneCall; color: string; bg: string }> = {
    inbound: { icon: PhoneIncoming, color: '#22c55e', bg: 'rgba(34, 197, 94, 0.15)' },
    outbound: { icon: PhoneOutgoing, color: '#3B82F6', bg: 'rgba(59, 130, 246, 0.15)' },
    missed: { icon: PhoneMissed, color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)' },
  };
  const { icon: Icon, color, bg } = icons[type] || icons.inbound;

  return (
    <div style={{ ...styles.typeIcon, background: bg, color }}>
      <Icon size={16} />
    </div>
  );
}

function SentimentDot({ sentiment }: { sentiment: string }) {
  const colors: Record<string, string> = {
    positive: '#22c55e',
    neutral: '#f59e0b',
    negative: '#ef4444',
  };
  return <div style={{ ...styles.sentimentDot, background: colors[sentiment] || colors.neutral }} />;
}

function StatsRow({ calls }: { calls: Call[] }) {
  // Calculate real stats from actual data
  const totalCalls = calls.length;
  const answeredCalls = calls.filter((c) => c.type !== 'missed').length;
  const missedCalls = calls.filter((c) => c.type === 'missed').length;

  // Calculate average duration
  const durationsInSeconds = calls
    .filter((c) => c.duration !== '-')
    .map((c) => {
      const [min, sec] = c.duration.split(':').map(Number);
      return min * 60 + sec;
    });
  const avgDuration = durationsInSeconds.length > 0
    ? Math.round(durationsInSeconds.reduce((a, b) => a + b, 0) / durationsInSeconds.length)
    : 0;
  const avgMin = Math.floor(avgDuration / 60);
  const avgSec = avgDuration % 60;

  return (
    <div style={styles.statsRow}>
      <div style={styles.statCard}>
        <div style={styles.statIcon}>
          <PhoneCall size={20} />
        </div>
        <div>
          <div style={styles.statValue}>{totalCalls}</div>
          <div style={styles.statLabel}>Total Calls</div>
        </div>
      </div>
      <div style={styles.statCard}>
        <div style={{ ...styles.statIcon, background: 'rgba(34, 197, 94, 0.1)', color: '#22c55e' }}>
          <PhoneIncoming size={20} />
        </div>
        <div>
          <div style={styles.statValue}>{answeredCalls}</div>
          <div style={styles.statLabel}>Answered</div>
        </div>
      </div>
      <div style={styles.statCard}>
        <div style={{ ...styles.statIcon, background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>
          <PhoneMissed size={20} />
        </div>
        <div>
          <div style={styles.statValue}>{missedCalls}</div>
          <div style={styles.statLabel}>Missed</div>
        </div>
      </div>
      <div style={styles.statCard}>
        <div style={{ ...styles.statIcon, background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }}>
          <Clock size={20} />
        </div>
        <div>
          <div style={styles.statValue}>{avgMin}:{avgSec.toString().padStart(2, '0')}</div>
          <div style={styles.statLabel}>Avg Duration</div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function CallsPage() {
  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Load calls from Firestore (currently returns empty)
  useEffect(() => {
    async function loadCalls() {
      // In a real implementation, this would fetch from /api/calls
      // For now, we show the empty state honestly
      setLoading(false);
      setCalls([]);
    }
    loadCalls();
  }, []);

  // Filter calls based on search
  const filteredCalls = calls.filter(
    (call) =>
      call.caller.toLowerCase().includes(searchQuery.toLowerCase()) ||
      call.phone.includes(searchQuery)
  );

  if (loading) {
    return (
      <div style={styles.page}>
        <div style={styles.loadingState}>Loading calls...</div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Call Logs</h1>
          <p style={styles.subtitle}>Review and analyze all your AI-handled calls</p>
        </div>
        {calls.length > 0 && (
          <button style={styles.exportButton}>
            <Download size={18} />
            Export Report
          </button>
        )}
      </div>

      {/* Show empty state if no calls */}
      {calls.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          {/* Stats Row */}
          <StatsRow calls={calls} />

          {/* Filters */}
          <div style={styles.filterBar}>
            <div style={styles.searchWrapper}>
              <Search size={18} style={styles.searchIcon} />
              <input
                type="text"
                placeholder="Search calls..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={styles.searchInput}
              />
            </div>
            <div style={styles.filterActions}>
              <button style={styles.filterButton}>
                <Calendar size={16} />
                Date Range
              </button>
              <button style={styles.filterButton}>
                <Filter size={16} />
                Filter
              </button>
            </div>
          </div>

          {/* Table */}
          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Type</th>
                  <th style={styles.th}>Caller</th>
                  <th style={styles.th}>Phone</th>
                  <th style={styles.th}>Duration</th>
                  <th style={styles.th}>Outcome</th>
                  <th style={styles.th}>Sentiment</th>
                  <th style={styles.th}>Time</th>
                  <th style={styles.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredCalls.map((call) => (
                  <tr key={call.id} style={styles.tr}>
                    <td style={styles.td}>
                      <CallTypeIcon type={call.type} />
                    </td>
                    <td style={styles.td}>
                      <div style={styles.callerName}>{call.caller}</div>
                    </td>
                    <td style={styles.td}>
                      <span style={styles.phoneText}>{call.phone}</span>
                    </td>
                    <td style={styles.td}>
                      <span style={styles.durationText}>{call.duration}</span>
                    </td>
                    <td style={styles.td}>
                      <span style={styles.outcomeText}>{call.outcome}</span>
                    </td>
                    <td style={styles.td}>
                      <div style={styles.sentimentWrapper}>
                        <SentimentDot sentiment={call.sentiment} />
                        <span style={styles.sentimentText}>{call.sentiment}</span>
                      </div>
                    </td>
                    <td style={styles.td}>
                      <div style={styles.timeWrapper}>
                        <span style={styles.timeText}>{call.time}</span>
                        <span style={styles.dateText}>{call.date}</span>
                      </div>
                    </td>
                    <td style={styles.td}>
                      <div style={styles.actionButtons}>
                        <button style={styles.actionBtn} title="Play Recording">
                          <Play size={14} />
                        </button>
                        <button style={styles.actionBtn} title="Download">
                          <Download size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination hint */}
          <div style={styles.pagination}>
            <span style={styles.paginationText}>
              Showing {filteredCalls.length} of {calls.length} calls
            </span>
          </div>
        </>
      )}
    </div>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const styles: { [key: string]: React.CSSProperties } = {
  page: {
    padding: '0',
  },
  loadingState: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '300px',
    color: '#94A3B8',
    fontSize: '14px',
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: '24px',
  },
  title: {
    fontSize: '28px',
    fontWeight: 700,
    color: '#F8FAFC',
    margin: '0 0 4px',
  },
  subtitle: {
    fontSize: '14px',
    color: '#94A3B8',
    margin: 0,
  },
  exportButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 20px',
    fontSize: '14px',
    fontWeight: 600,
    color: '#F8FAFC',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '10px',
    cursor: 'pointer',
  },
  // Empty State
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '80px 40px',
    background: 'rgba(255, 255, 255, 0.02)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: '20px',
    textAlign: 'center',
  },
  emptyIcon: {
    width: '80px',
    height: '80px',
    borderRadius: '20px',
    background: 'rgba(59, 130, 246, 0.1)',
    color: '#3B82F6',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '24px',
  },
  emptyTitle: {
    fontSize: '22px',
    fontWeight: 700,
    color: '#F8FAFC',
    margin: '0 0 12px',
  },
  emptyDesc: {
    fontSize: '15px',
    color: '#94A3B8',
    maxWidth: '500px',
    lineHeight: 1.6,
    margin: '0 0 28px',
  },
  emptyActions: {
    display: 'flex',
    gap: '12px',
    marginBottom: '32px',
  },
  emptyActionBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 24px',
    fontSize: '14px',
    fontWeight: 600,
    color: '#fff',
    textDecoration: 'none',
    background: 'linear-gradient(135deg, #3B82F6 0%, #6366F1 100%)',
    borderRadius: '10px',
  },
  emptyActionSecondary: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 24px',
    fontSize: '14px',
    fontWeight: 600,
    color: '#94A3B8',
    textDecoration: 'none',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '10px',
  },
  emptyHint: {
    padding: '16px 24px',
    background: 'rgba(59, 130, 246, 0.05)',
    border: '1px solid rgba(59, 130, 246, 0.1)',
    borderRadius: '12px',
    maxWidth: '500px',
  },
  emptyHintText: {
    fontSize: '13px',
    color: '#94A3B8',
    margin: 0,
    lineHeight: 1.6,
  },
  // Stats
  statsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '16px',
    marginBottom: '24px',
  },
  statCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '20px',
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: '14px',
  },
  statIcon: {
    width: '48px',
    height: '48px',
    borderRadius: '12px',
    background: 'rgba(59, 130, 246, 0.1)',
    color: '#3B82F6',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    fontSize: '24px',
    fontWeight: 700,
    color: '#F8FAFC',
  },
  statLabel: {
    fontSize: '13px',
    color: '#94A3B8',
  },
  // Filters
  filterBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '20px',
  },
  searchWrapper: {
    position: 'relative',
    width: '320px',
  },
  searchIcon: {
    position: 'absolute',
    left: '14px',
    top: '50%',
    transform: 'translateY(-50%)',
    color: '#64748B',
  },
  searchInput: {
    width: '100%',
    padding: '12px 12px 12px 42px',
    fontSize: '14px',
    color: '#F8FAFC',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '10px',
    outline: 'none',
  },
  filterActions: {
    display: 'flex',
    gap: '10px',
  },
  filterButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 16px',
    fontSize: '13px',
    fontWeight: 500,
    color: '#94A3B8',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  // Table
  tableWrapper: {
    background: 'rgba(255, 255, 255, 0.02)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: '16px',
    overflow: 'hidden',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  th: {
    padding: '14px 16px',
    fontSize: '12px',
    fontWeight: 600,
    color: '#64748B',
    textAlign: 'left',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
  },
  tr: {
    borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
  },
  td: {
    padding: '14px 16px',
    fontSize: '14px',
    color: '#F8FAFC',
  },
  typeIcon: {
    width: '36px',
    height: '36px',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  callerName: {
    fontWeight: 500,
  },
  phoneText: {
    fontSize: '13px',
    color: '#94A3B8',
  },
  durationText: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#F8FAFC',
  },
  outcomeText: {
    fontSize: '13px',
    color: '#94A3B8',
  },
  sentimentWrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  sentimentDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
  },
  sentimentText: {
    fontSize: '13px',
    color: '#94A3B8',
    textTransform: 'capitalize',
  },
  timeWrapper: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  timeText: {
    fontSize: '14px',
    color: '#F8FAFC',
  },
  dateText: {
    fontSize: '12px',
    color: '#64748B',
  },
  actionButtons: {
    display: 'flex',
    gap: '8px',
  },
  actionBtn: {
    width: '32px',
    height: '32px',
    borderRadius: '6px',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    color: '#94A3B8',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  pagination: {
    display: 'flex',
    justifyContent: 'center',
    padding: '20px',
  },
  paginationText: {
    fontSize: '13px',
    color: '#64748B',
  },
};
