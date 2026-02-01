'use client';

// TODO: Add server component wrapper (page.tsx -> LeadsClient.tsx pattern)
// to verify session server-side before rendering, matching dashboard/page.tsx pattern.
// Current protection relies on middleware cookie-existence check only.

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Users, Search, Filter, Download, Plus, Phone, Mail, MoreVertical, Star, Clock, ArrowRight, PhoneCall } from 'lucide-react';

// =============================================================================
// TYPES
// =============================================================================

type Lead = {
  id: string;
  name: string;
  phone: string;
  email: string;
  source: string;
  status: 'Hot' | 'Warm' | 'Cold' | 'New';
  score: number;
  lastContact: string;
  starred: boolean;
};

// =============================================================================
// EMPTY STATE COMPONENT
// =============================================================================

function EmptyState() {
  return (
    <div style={styles.emptyState}>
      <div style={styles.emptyIcon}>
        <Users size={40} />
      </div>
      <h3 style={styles.emptyTitle}>No Leads Yet</h3>
      <p style={styles.emptyDesc}>
        Leads are automatically captured when your AI receptionist handles calls.
        Each caller becomes a lead with their contact info, call summary, and
        AI-scored priority level.
      </p>
      <div style={styles.emptyActions}>
        <Link href="/demo/setup" style={styles.emptyActionBtn}>
          <PhoneCall size={16} />
          Try Demo Call
        </Link>
        <Link href="/how-it-works" style={styles.emptyActionSecondary}>
          Learn More
          <ArrowRight size={16} />
        </Link>
      </div>
      <div style={styles.emptyHint}>
        <p style={styles.emptyHintText}>
          <strong>How it works:</strong> When calls come in, your AI receptionist
          captures caller details, determines intent, and scores them based on
          conversion likelihood. Hot leads need immediate follow-up.
        </p>
      </div>
    </div>
  );
}

// =============================================================================
// COMPONENTS
// =============================================================================

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    Hot: { bg: 'rgba(239, 68, 68, 0.15)', text: '#ef4444' },
    Warm: { bg: 'rgba(245, 158, 11, 0.15)', text: '#f59e0b' },
    Cold: { bg: 'rgba(59, 130, 246, 0.15)', text: '#3B82F6' },
    New: { bg: 'rgba(34, 197, 94, 0.15)', text: '#22c55e' },
  };
  const color = colors[status] || colors.New;

  return (
    <span style={{ ...styles.statusBadge, background: color.bg, color: color.text }}>
      {status}
    </span>
  );
}

function ScoreBar({ score }: { score: number }) {
  const color = score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#94A3B8';
  return (
    <div style={styles.scoreWrapper}>
      <div style={styles.scoreBar}>
        <div style={{ ...styles.scoreProgress, width: `${score}%`, background: color }} />
      </div>
      <span style={{ ...styles.scoreText, color }}>{score}</span>
    </div>
  );
}

function StatsRow({ leads }: { leads: Lead[] }) {
  const totalLeads = leads.length;
  const hotLeads = leads.filter((l) => l.status === 'Hot').length;
  const newToday = leads.filter((l) => l.lastContact === 'Just now' || l.lastContact.includes('hour')).length;

  return (
    <div style={styles.statsRow}>
      <div style={styles.statCard}>
        <div style={styles.statIcon}>
          <Users size={20} />
        </div>
        <div>
          <div style={styles.statValue}>{totalLeads}</div>
          <div style={styles.statLabel}>Total Leads</div>
        </div>
      </div>
      <div style={styles.statCard}>
        <div style={{ ...styles.statIcon, background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>
          <Star size={20} />
        </div>
        <div>
          <div style={styles.statValue}>{hotLeads}</div>
          <div style={styles.statLabel}>Hot Leads</div>
        </div>
      </div>
      <div style={styles.statCard}>
        <div style={{ ...styles.statIcon, background: 'rgba(34, 197, 94, 0.1)', color: '#22c55e' }}>
          <Clock size={20} />
        </div>
        <div>
          <div style={styles.statValue}>{newToday}</div>
          <div style={styles.statLabel}>New Today</div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Load leads from Firestore (currently returns empty)
  useEffect(() => {
    async function loadLeads() {
      // In a real implementation, this would fetch from /api/leads
      // For now, we show the empty state honestly
      setLoading(false);
      setLeads([]);
    }
    loadLeads();
  }, []);

  // Filter leads based on search
  const filteredLeads = leads.filter(
    (lead) =>
      lead.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.phone.includes(searchQuery) ||
      lead.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div style={styles.page}>
        <div style={styles.loadingState}>Loading leads...</div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Leads</h1>
          <p style={styles.subtitle}>Manage and track your potential customers</p>
        </div>
        {leads.length > 0 && (
          <button style={styles.addButton}>
            <Plus size={18} />
            Add Lead
          </button>
        )}
      </div>

      {/* Show empty state if no leads */}
      {leads.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          {/* Stats Row */}
          <StatsRow leads={leads} />

          {/* Filters */}
          <div style={styles.filterBar}>
            <div style={styles.searchWrapper}>
              <Search size={18} style={styles.searchIcon} />
              <input
                type="text"
                placeholder="Search leads..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={styles.searchInput}
              />
            </div>
            <div style={styles.filterActions}>
              <button style={styles.filterButton}>
                <Filter size={16} />
                Filter
              </button>
              <button style={styles.filterButton}>
                <Download size={16} />
                Export
              </button>
            </div>
          </div>

          {/* Table */}
          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}></th>
                  <th style={styles.th}>Name</th>
                  <th style={styles.th}>Contact</th>
                  <th style={styles.th}>Source</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Score</th>
                  <th style={styles.th}>Last Contact</th>
                  <th style={styles.th}></th>
                </tr>
              </thead>
              <tbody>
                {filteredLeads.map((lead) => (
                  <tr key={lead.id} style={styles.tr}>
                    <td style={styles.td}>
                      <button style={styles.starButton}>
                        <Star size={16} fill={lead.starred ? '#f59e0b' : 'none'} color={lead.starred ? '#f59e0b' : '#64748B'} />
                      </button>
                    </td>
                    <td style={styles.td}>
                      <div style={styles.leadName}>{lead.name}</div>
                    </td>
                    <td style={styles.td}>
                      <div style={styles.contactInfo}>
                        <span style={styles.contactItem}>
                          <Phone size={12} />
                          {lead.phone}
                        </span>
                        <span style={styles.contactItem}>
                          <Mail size={12} />
                          {lead.email}
                        </span>
                      </div>
                    </td>
                    <td style={styles.td}>
                      <span style={styles.sourceText}>{lead.source}</span>
                    </td>
                    <td style={styles.td}>
                      <StatusBadge status={lead.status} />
                    </td>
                    <td style={styles.td}>
                      <ScoreBar score={lead.score} />
                    </td>
                    <td style={styles.td}>
                      <span style={styles.lastContact}>{lead.lastContact}</span>
                    </td>
                    <td style={styles.td}>
                      <button style={styles.moreButton}>
                        <MoreVertical size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
  addButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 20px',
    fontSize: '14px',
    fontWeight: 600,
    color: '#fff',
    background: 'linear-gradient(135deg, #3B82F6 0%, #6366F1 100%)',
    border: 'none',
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
    gridTemplateColumns: 'repeat(3, 1fr)',
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
  starButton: {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    padding: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  leadName: {
    fontWeight: 500,
  },
  contactInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  contactItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '12px',
    color: '#94A3B8',
  },
  sourceText: {
    fontSize: '13px',
    color: '#94A3B8',
  },
  statusBadge: {
    display: 'inline-block',
    padding: '4px 10px',
    fontSize: '12px',
    fontWeight: 600,
    borderRadius: '6px',
  },
  scoreWrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  scoreBar: {
    width: '60px',
    height: '6px',
    background: 'rgba(255, 255, 255, 0.1)',
    borderRadius: '3px',
    overflow: 'hidden',
  },
  scoreProgress: {
    height: '100%',
    borderRadius: '3px',
  },
  scoreText: {
    fontSize: '13px',
    fontWeight: 600,
  },
  lastContact: {
    fontSize: '13px',
    color: '#94A3B8',
  },
  moreButton: {
    background: 'transparent',
    border: 'none',
    color: '#64748B',
    cursor: 'pointer',
    padding: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
};
