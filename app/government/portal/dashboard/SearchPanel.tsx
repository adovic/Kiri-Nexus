'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Search,
  Calendar,
  Shield,
  ShieldOff,
  Filter,
  Download,
  X,
  FileText,
  Phone,
  Wrench,
  AlertTriangle,
} from 'lucide-react';
import type { CallRecord, IntegrityData } from './DashboardClient';

// =============================================================================
// FORENSIC SEARCH PANEL — High-Performance Call Log Filter
// =============================================================================
// Client-side filtering against the in-memory call feed. All filtering is
// performed in a useMemo pass — zero network requests after the initial
// Firestore snapshot + SWR integrity fetch.
//
// Filters:
//   1. Free-text — matches Session ID OR transcript content (captures
//      phone numbers, caller statements, tool names mentioned in dialogue)
//   2. Date Range — From / To inclusive date bounds
//   3. Integrity Status — Audited (tool executions → chain entry) vs Unaudited
//   4. Call Status — completed | transferred | voicemail | in-progress
//
// Export:
//   FOIA Export button generates a sovereign-grade CSV bundle with chain
//   integrity metadata, timestamp, and filtered record set.
// =============================================================================

// ── Types ────────────────────────────────────────────────────────────────────

type IntegrityFilter = 'all' | 'audited' | 'unaudited';
type StatusFilter = 'all' | 'completed' | 'transferred' | 'voicemail' | 'in-progress';

interface SearchPanelProps {
  /** Raw call records from Firestore real-time feed */
  calls: CallRecord[];
  /** Chain integrity data from useIntegrity() SWR hook */
  integrityData: IntegrityData | null;
  /** Callback with the filtered result set — drives the call feed rendering */
  onFilterChange: (filtered: CallRecord[]) => void;
  /** Tenant ID for export metadata */
  tenantId: string;
  /** Agency name for export headers */
  agencyName: string;
}

// ── Phone number regex for transcript scanning ──────────────────────────────

const PHONE_REGEX = /(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/;

// =============================================================================
// SearchPanel Component
// =============================================================================

export default function SearchPanel({
  calls,
  integrityData,
  onFilterChange,
  tenantId,
  agencyName,
}: SearchPanelProps) {
  // ── Filter state ─────────────────────────────────────────────────────
  const [searchText, setSearchText] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [integrityFilter, setIntegrityFilter] = useState<IntegrityFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [isExpanded, setIsExpanded] = useState(false);

  // ── Derived values ───────────────────────────────────────────────────
  const chainValid = integrityData?.valid ?? null;
  const hasActiveFilters = searchText !== '' || dateFrom !== '' || dateTo !== '' ||
    integrityFilter !== 'all' || statusFilter !== 'all';

  // ── Client-side filtering (useMemo — instant, no network) ───────────
  const filteredCalls = useMemo(() => {
    const needle = searchText.toLowerCase().trim();

    return calls.filter((call) => {
      // ── Text search: session ID + transcript content ──
      if (needle) {
        const sessionMatch = (call.sessionId ?? call.id)
          .toLowerCase()
          .includes(needle);

        const transcriptMatch = call.transcript?.some(
          (t) => t.text?.toLowerCase().includes(needle),
        );

        // Also match against tools used
        const toolMatch = call.toolsUsed?.some(
          (tool) => tool.toLowerCase().includes(needle),
        );

        if (!sessionMatch && !transcriptMatch && !toolMatch) return false;
      }

      // ── Date range ──
      if (dateFrom || dateTo) {
        const callDate = new Date(call.timestamp);
        if (dateFrom && callDate < new Date(dateFrom)) return false;
        if (dateTo && callDate > new Date(dateTo + 'T23:59:59.999Z')) return false;
      }

      // ── Integrity status ──
      if (integrityFilter !== 'all') {
        const hasAuditTrail = (call.toolsUsed?.length ?? 0) > 0;
        if (integrityFilter === 'audited' && !hasAuditTrail) return false;
        if (integrityFilter === 'unaudited' && hasAuditTrail) return false;
      }

      // ── Call status ──
      if (statusFilter !== 'all') {
        if ((call.status ?? '').toLowerCase() !== statusFilter) return false;
      }

      return true;
    });
  }, [calls, searchText, dateFrom, dateTo, integrityFilter, statusFilter]);

  // ── Push filtered results to parent ──────────────────────────────────
  useEffect(() => {
    onFilterChange(filteredCalls);
  }, [filteredCalls, onFilterChange]);

  // ── Clear all filters ────────────────────────────────────────────────
  const clearFilters = useCallback(() => {
    setSearchText('');
    setDateFrom('');
    setDateTo('');
    setIntegrityFilter('all');
    setStatusFilter('all');
  }, []);

  // ── FOIA Export ──────────────────────────────────────────────────────
  const handleFoiaExport = useCallback(() => {
    const now = new Date().toISOString();
    const dateStr = now.split('T')[0];

    // ── Build sovereign export header ──
    const header = [
      '# ═══════════════════════════════════════════════════════════════════',
      '# SOVEREIGN FOIA EXPORT — FORENSIC SEARCH RESULTS',
      '# ═══════════════════════════════════════════════════════════════════',
      `# Agency:           ${agencyName}`,
      `# Tenant ID:        ${tenantId}`,
      `# Export Timestamp:  ${now}`,
      `# Records Exported:  ${filteredCalls.length} of ${calls.length} total`,
      `# Chain Integrity:   ${chainValid === true ? 'VERIFIED' : chainValid === false ? 'COMPROMISED' : 'UNKNOWN'}`,
      chainValid === true && integrityData
        ? `# Chain Head Hash:   ${integrityData.chain_head_hash}`
        : null,
      chainValid === true && integrityData
        ? `# Chain Height:      ${integrityData.total_entries} entries`
        : null,
      '# ───────────────────────────────────────────────────────────────────',
      '# Active Filters:',
      searchText ? `#   Search Text:     "${searchText}"` : null,
      dateFrom ? `#   Date From:       ${dateFrom}` : null,
      dateTo ? `#   Date To:         ${dateTo}` : null,
      integrityFilter !== 'all' ? `#   Integrity:       ${integrityFilter.toUpperCase()}` : null,
      statusFilter !== 'all' ? `#   Status:          ${statusFilter.toUpperCase()}` : null,
      !hasActiveFilters ? '#   (none — full dataset)' : null,
      '# ═══════════════════════════════════════════════════════════════════',
      '',
    ].filter(Boolean).join('\n');

    // ── CSV body ──
    const csvHeader = 'Record ID,Session ID,Timestamp,Duration (s),Status,Tools Used,Message Count,Has Audit Trail';
    const csvRows = filteredCalls.map((call) => {
      const hasAudit = (call.toolsUsed?.length ?? 0) > 0 ? 'YES' : 'NO';
      const tools = (call.toolsUsed ?? []).join(';') || 'none';
      // Escape CSV fields that might contain commas
      const escapedTools = tools.includes(',') ? `"${tools}"` : tools;
      return [
        call.id,
        call.sessionId ?? '',
        call.timestamp ?? '',
        call.duration ?? 0,
        call.status ?? 'unknown',
        escapedTools,
        call.transcriptCount ?? call.transcript?.length ?? 0,
        hasAudit,
      ].join(',');
    });

    const content = header + csvHeader + '\n' + csvRows.join('\n') + '\n';

    // ── Download ──
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `foia-forensic-export-${dateStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredCalls, calls, chainValid, integrityData, tenantId, agencyName, searchText, dateFrom, dateTo, integrityFilter, statusFilter, hasActiveFilters]);

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <div style={s.container}>
      {/* ── Compact Search Bar (always visible) ──────────────────────── */}
      <div style={s.searchRow}>
        <div style={s.searchInputWrap}>
          <Search size={14} color="#64748B" style={{ flexShrink: 0 }} />
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search session ID, transcript, phone number, or tool name..."
            style={s.searchInput}
          />
          {searchText && (
            <button onClick={() => setSearchText('')} style={s.clearInputBtn}>
              <X size={12} />
            </button>
          )}
        </div>

        {/* Filter toggle */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          style={{
            ...s.filterToggle,
            borderColor: hasActiveFilters
              ? 'rgba(96, 165, 250, 0.5)'
              : 'rgba(100, 116, 139, 0.25)',
            background: hasActiveFilters
              ? 'rgba(96, 165, 250, 0.08)'
              : 'rgba(15, 23, 42, 0.4)',
          }}
        >
          <Filter size={13} color={hasActiveFilters ? '#60A5FA' : '#64748B'} />
          <span style={{ color: hasActiveFilters ? '#60A5FA' : '#94A3B8' }}>
            Filters{hasActiveFilters ? ' (active)' : ''}
          </span>
        </button>

        {/* FOIA Export */}
        <button onClick={handleFoiaExport} style={s.exportBtn}>
          <Download size={13} />
          <span>FOIA Export</span>
          <span style={s.exportCount}>{filteredCalls.length}</span>
        </button>
      </div>

      {/* ── Results Summary Bar ──────────────────────────────────────── */}
      {hasActiveFilters && (
        <div style={s.resultsSummary}>
          <FileText size={12} color="#94A3B8" />
          <span style={s.resultsText}>
            <strong style={{ color: '#60A5FA' }}>{filteredCalls.length}</strong> of{' '}
            <strong>{calls.length}</strong> records match
          </span>

          {/* Chain status indicator */}
          {chainValid === true ? (
            <span style={s.chainBadgeOk}>
              <Shield size={10} />
              CHAIN INTACT
            </span>
          ) : chainValid === false ? (
            <span style={s.chainBadgeBroken}>
              <ShieldOff size={10} />
              CHAIN COMPROMISED
            </span>
          ) : null}

          <button onClick={clearFilters} style={s.clearAllBtn}>
            <X size={11} />
            Clear
          </button>
        </div>
      )}

      {/* ── Expanded Filter Panel ────────────────────────────────────── */}
      {isExpanded && (
        <div style={s.filterPanel}>
          {/* Row 1: Date Range */}
          <div style={s.filterGroup}>
            <label style={s.filterLabel}>
              <Calendar size={12} />
              Date Range
            </label>
            <div style={s.dateRow}>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                style={s.dateInput}
                placeholder="From"
              />
              <span style={s.dateSep}>to</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                style={s.dateInput}
                placeholder="To"
              />
            </div>
          </div>

          {/* Row 2: Status + Integrity */}
          <div style={s.filterRowTwo}>
            <div style={s.filterGroup}>
              <label style={s.filterLabel}>
                <Phone size={12} />
                Call Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                style={s.selectInput}
              >
                <option value="all">All Statuses</option>
                <option value="completed">Completed</option>
                <option value="transferred">Transferred</option>
                <option value="voicemail">Voicemail</option>
                <option value="in-progress">In Progress</option>
              </select>
            </div>

            <div style={s.filterGroup}>
              <label style={s.filterLabel}>
                <Shield size={12} />
                Integrity Status
              </label>
              <select
                value={integrityFilter}
                onChange={(e) => setIntegrityFilter(e.target.value as IntegrityFilter)}
                style={s.selectInput}
              >
                <option value="all">All Calls</option>
                <option value="audited">Audited (Chain-Covered)</option>
                <option value="unaudited">Unaudited (No Chain Entry)</option>
              </select>
            </div>

            <div style={s.filterGroup}>
              <label style={s.filterLabel}>
                <Wrench size={12} />
                Tool Usage
              </label>
              <div style={s.chipRow}>
                <span style={s.toolChip}>
                  {calls.filter((c) => (c.toolsUsed?.length ?? 0) > 0).length} audited
                </span>
                <span style={s.toolChipMuted}>
                  {calls.filter((c) => (c.toolsUsed?.length ?? 0) === 0).length} unaudited
                </span>
              </div>
            </div>
          </div>

          {/* Chain Integrity Banner (inside expanded panel) */}
          {chainValid === false && (
            <div style={s.chainAlert}>
              <AlertTriangle size={14} color="#F59E0B" />
              <span style={s.chainAlertText}>
                Audit chain integrity is compromised. Audited calls in this export
                carry a tamper warning. Chain break at index{' '}
                {integrityData?.first_broken_index ?? '?'}.
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const s: { [key: string]: React.CSSProperties } = {
  // ── Container ────────────────────────────────────────────────────────
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0px',
    marginBottom: '12px',
    background: 'rgba(15, 23, 42, 0.6)',
    border: '1px solid rgba(30, 64, 175, 0.2)',
    borderRadius: '12px',
    overflow: 'hidden',
  },

  // ── Search Row ───────────────────────────────────────────────────────
  searchRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 16px',
  },
  searchInputWrap: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    background: 'rgba(15, 23, 42, 0.8)',
    border: '1px solid rgba(100, 116, 139, 0.2)',
    borderRadius: '8px',
  },
  searchInput: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: '#E2E8F0',
    fontSize: '13px',
    fontFamily: 'inherit',
    letterSpacing: '0.01em',
  },
  clearInputBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '18px',
    height: '18px',
    background: 'rgba(100, 116, 139, 0.2)',
    border: 'none',
    borderRadius: '50%',
    color: '#94A3B8',
    cursor: 'pointer',
    flexShrink: 0,
  },

  // ── Filter Toggle ────────────────────────────────────────────────────
  filterToggle: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 12px',
    border: '1px solid rgba(100, 116, 139, 0.25)',
    borderRadius: '8px',
    background: 'rgba(15, 23, 42, 0.4)',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    flexShrink: 0,
    transition: 'all 0.15s ease',
  },

  // ── Export Button ────────────────────────────────────────────────────
  exportBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 14px',
    background: 'rgba(34, 197, 94, 0.1)',
    border: '1px solid rgba(34, 197, 94, 0.3)',
    borderRadius: '8px',
    color: '#22C55E',
    fontSize: '12px',
    fontWeight: 700,
    fontFamily: 'monospace',
    letterSpacing: '0.04em',
    cursor: 'pointer',
    flexShrink: 0,
    transition: 'all 0.15s ease',
  },
  exportCount: {
    fontSize: '10px',
    fontWeight: 800,
    padding: '1px 5px',
    background: 'rgba(34, 197, 94, 0.15)',
    borderRadius: '4px',
    color: '#22C55E',
  },

  // ── Results Summary ──────────────────────────────────────────────────
  resultsSummary: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    borderTop: '1px solid rgba(30, 64, 175, 0.1)',
    background: 'rgba(15, 23, 42, 0.4)',
  },
  resultsText: {
    fontSize: '12px',
    color: '#94A3B8',
    flex: 1,
  },
  chainBadgeOk: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '9px',
    fontWeight: 800,
    letterSpacing: '0.08em',
    color: '#22C55E',
    padding: '2px 6px',
    border: '1px solid rgba(34, 197, 94, 0.3)',
    borderRadius: '4px',
    background: 'rgba(34, 197, 94, 0.06)',
    fontFamily: 'monospace',
  },
  chainBadgeBroken: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '9px',
    fontWeight: 800,
    letterSpacing: '0.08em',
    color: '#EF4444',
    padding: '2px 6px',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: '4px',
    background: 'rgba(239, 68, 68, 0.06)',
    fontFamily: 'monospace',
  },
  clearAllBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 8px',
    background: 'rgba(100, 116, 139, 0.1)',
    border: '1px solid rgba(100, 116, 139, 0.2)',
    borderRadius: '6px',
    color: '#94A3B8',
    fontSize: '11px',
    fontWeight: 600,
    cursor: 'pointer',
    flexShrink: 0,
  },

  // ── Filter Panel (expanded) ──────────────────────────────────────────
  filterPanel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    padding: '14px 16px 16px',
    borderTop: '1px solid rgba(30, 64, 175, 0.1)',
    background: 'rgba(15, 23, 42, 0.3)',
  },
  filterGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    flex: 1,
  },
  filterLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '11px',
    fontWeight: 700,
    color: '#94A3B8',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  },
  dateRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  dateInput: {
    flex: 1,
    padding: '7px 10px',
    background: 'rgba(15, 23, 42, 0.8)',
    border: '1px solid rgba(100, 116, 139, 0.2)',
    borderRadius: '6px',
    color: '#E2E8F0',
    fontSize: '12px',
    fontFamily: 'monospace',
    outline: 'none',
  },
  dateSep: {
    fontSize: '11px',
    color: '#64748B',
    flexShrink: 0,
  },
  filterRowTwo: {
    display: 'flex',
    gap: '14px',
  },
  selectInput: {
    padding: '7px 10px',
    background: 'rgba(15, 23, 42, 0.8)',
    border: '1px solid rgba(100, 116, 139, 0.2)',
    borderRadius: '6px',
    color: '#E2E8F0',
    fontSize: '12px',
    fontFamily: 'inherit',
    outline: 'none',
    cursor: 'pointer',
    width: '100%',
  },
  chipRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    paddingTop: '4px',
  },
  toolChip: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#22C55E',
    padding: '3px 8px',
    background: 'rgba(34, 197, 94, 0.08)',
    border: '1px solid rgba(34, 197, 94, 0.2)',
    borderRadius: '4px',
    fontFamily: 'monospace',
  },
  toolChipMuted: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#64748B',
    padding: '3px 8px',
    background: 'rgba(100, 116, 139, 0.08)',
    border: '1px solid rgba(100, 116, 139, 0.15)',
    borderRadius: '4px',
    fontFamily: 'monospace',
  },

  // ── Chain Alert Banner ───────────────────────────────────────────────
  chainAlert: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    padding: '10px 12px',
    background: 'rgba(245, 158, 11, 0.06)',
    border: '1px solid rgba(245, 158, 11, 0.25)',
    borderRadius: '8px',
  },
  chainAlertText: {
    fontSize: '11px',
    color: '#F59E0B',
    lineHeight: 1.5,
  },
};
