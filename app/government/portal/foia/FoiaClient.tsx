'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Search,
  Download,
  FileText,
  Shield,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  Calendar,
  Filter,
  Printer,
  Eye,
  X,
  User,
  Bot,
  Lock,
} from 'lucide-react';

// ===========================================
// TYPES
// ===========================================
interface TranscriptEntry {
  role: 'ai' | 'user' | 'tool';
  text: string;
  timestamp: string;
  toolCall?: string;
}

export interface CallRecord {
  id: string;
  sessionId: string;
  transcript: TranscriptEntry[];
  duration: number;
  timestamp: string;
  status: string;
  toolsUsed: string[];
  transcriptCount: number;
}

interface FoiaClientProps {
  calls: CallRecord[];
}

// ===========================================
// STATUS BADGE COMPONENT
// ===========================================
function StatusBadge({ status }: { status: string }) {
  const colors: { [key: string]: { bg: string; text: string } } = {
    completed: { bg: 'rgba(34, 197, 94, 0.15)', text: '#22C55E' },
    transferred: { bg: 'rgba(59, 130, 246, 0.15)', text: '#3B82F6' },
    voicemail: { bg: 'rgba(245, 158, 11, 0.15)', text: '#F59E0B' },
    'in-progress': { bg: 'rgba(168, 85, 247, 0.15)', text: '#A855F7' },
  };

  const style = colors[status] || colors.completed;

  return (
    <span style={{
      padding: '4px 10px',
      background: style.bg,
      color: style.text,
      borderRadius: '4px',
      fontSize: '11px',
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
    }}>
      {status}
    </span>
  );
}

// ===========================================
// RECORD DETAIL MODAL
// ===========================================
function RecordDetailModal({
  call,
  onClose,
  onPrint,
}: {
  call: CallRecord;
  onClose: () => void;
  onPrint: () => void;
}) {
  return (
    <div style={modalStyles.overlay} onClick={onClose}>
      <div style={modalStyles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div style={modalStyles.header}>
          <div style={modalStyles.headerLeft}>
            <div style={modalStyles.officialBadge}>
              <Shield size={14} />
              Official Record
            </div>
            <h2 style={modalStyles.title}>Public Record #{call.id.slice(0, 8)}</h2>
            <p style={modalStyles.subtitle}>
              Recorded: {formatDate(call.timestamp)} | Duration: {formatDuration(call.duration)}
            </p>
          </div>
          <button onClick={onClose} style={modalStyles.closeBtn}>
            <X size={20} />
          </button>
        </div>

        {/* Record Metadata */}
        <div style={modalStyles.metadataGrid}>
          <div style={modalStyles.metaItem}>
            <span style={modalStyles.metaLabel}>Session ID</span>
            <span style={modalStyles.metaValue}>{call.sessionId}</span>
          </div>
          <div style={modalStyles.metaItem}>
            <span style={modalStyles.metaLabel}>Status</span>
            <StatusBadge status={call.status} />
          </div>
          <div style={modalStyles.metaItem}>
            <span style={modalStyles.metaLabel}>Total Messages</span>
            <span style={modalStyles.metaValue}>{call.transcriptCount}</span>
          </div>
          <div style={modalStyles.metaItem}>
            <span style={modalStyles.metaLabel}>Tools Invoked</span>
            <span style={modalStyles.metaValue}>{call.toolsUsed.length || 'None'}</span>
          </div>
        </div>

        {/* Transcript */}
        <div style={modalStyles.transcriptSection}>
          <h3 style={modalStyles.sectionTitle}>Complete Transcript</h3>
          <div style={modalStyles.transcriptContainer}>
            {call.transcript
              .filter(entry => entry.role !== 'tool')
              .map((entry, idx) => (
                <div key={idx} style={modalStyles.transcriptEntry}>
                  <div style={{
                    ...modalStyles.roleTag,
                    background: entry.role === 'user' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(34, 197, 94, 0.15)',
                    color: entry.role === 'user' ? '#60A5FA' : '#22C55E',
                  }}>
                    {entry.role === 'user' ? <User size={12} /> : <Bot size={12} />}
                    {entry.role === 'user' ? 'CALLER' : 'AI SYSTEM'}
                  </div>
                  <p style={modalStyles.transcriptText}>{entry.text}</p>
                </div>
              ))}
          </div>
        </div>

        {/* Footer Actions */}
        <div style={modalStyles.footer}>
          <div style={modalStyles.footerNote}>
            <Lock size={14} />
            This record is maintained in compliance with FOIA requirements
          </div>
          <button onClick={onPrint} style={modalStyles.printBtn}>
            <Printer size={16} />
            Print Official Record
          </button>
        </div>
      </div>
    </div>
  );
}

// ===========================================
// HELPER FUNCTIONS
// ===========================================
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function formatDateShort(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

// ===========================================
// MAIN FOIA CLIENT COMPONENT
// ===========================================
export default function FoiaClient({ calls }: FoiaClientProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedCall, setSelectedCall] = useState<CallRecord | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  // Filter calls based on search and date range
  const filteredCalls = calls.filter(call => {
    // Text search (session ID or transcript content)
    const matchesSearch = searchTerm === '' ||
      call.sessionId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      call.transcript.some(t => t.text.toLowerCase().includes(searchTerm.toLowerCase()));

    // Date range filter
    const callDate = new Date(call.timestamp);
    const matchesDateFrom = !dateFrom || callDate >= new Date(dateFrom);
    const matchesDateTo = !dateTo || callDate <= new Date(dateTo + 'T23:59:59');

    return matchesSearch && matchesDateFrom && matchesDateTo;
  });

  // Pagination
  const totalPages = Math.ceil(filteredCalls.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedCalls = filteredCalls.slice(startIndex, startIndex + itemsPerPage);

  const handlePrintRecord = (call: CallRecord) => {
    // Store the call data for print
    const printContent = `
      PUBLIC RECORD - FOIA COMPLIANT
      ================================
      Record ID: ${call.id}
      Session ID: ${call.sessionId}
      Date: ${formatDate(call.timestamp)}
      Duration: ${formatDuration(call.duration)}
      Status: ${call.status}

      TRANSCRIPT:
      ${call.transcript.filter(t => t.role !== 'tool').map(t =>
        `[${t.role.toUpperCase()}]: ${t.text}`
      ).join('\n\n')}

      ================================
      Generated: ${new Date().toISOString()}
      This record is maintained in compliance with FOIA requirements.
    `;

    console.log('Printing Record:', printContent);
    window.print();
  };

  const handleExportAll = () => {
    const csvContent = [
      'Record ID,Session ID,Date,Duration (seconds),Status,Message Count',
      ...filteredCalls.map(call =>
        `${call.id},${call.sessionId},${call.timestamp},${call.duration},${call.status},${call.transcriptCount}`
      ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `foia-records-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearFilters = () => {
    setSearchTerm('');
    setDateFrom('');
    setDateTo('');
    setCurrentPage(1);
  };

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        {/* Back Navigation */}
        <Link href="/government/portal/dashboard" style={styles.backLink}>
          <ArrowLeft size={16} />
          Back to Dashboard
        </Link>

        {/* Header */}
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <div style={styles.secureBadge}>
              <Shield size={14} />
              Secure Archive
            </div>
            <h1 style={styles.title}>Public Records Request Fulfillment</h1>
            <p style={styles.subtitle}>
              FOIA-compliant call records and transcripts • {calls.length} total records
            </p>
          </div>
          <div style={styles.headerRight}>
            <button onClick={handleExportAll} style={styles.exportAllBtn}>
              <Download size={16} />
              Export All ({filteredCalls.length})
            </button>
          </div>
        </div>

        {/* Search & Filter Section */}
        <div style={styles.filterSection}>
          <div style={styles.filterHeader}>
            <Filter size={16} color="#64748B" />
            <span style={styles.filterTitle}>Search & Filter Records</span>
            {(searchTerm || dateFrom || dateTo) && (
              <button onClick={clearFilters} style={styles.clearBtn}>
                Clear All
              </button>
            )}
          </div>

          <div style={styles.filterGrid}>
            {/* Keyword Search */}
            <div style={styles.filterGroup}>
              <label style={styles.filterLabel}>Keywords</label>
              <div style={styles.searchBox}>
                <Search size={16} color="#64748B" />
                <input
                  type="text"
                  placeholder="Search by ID, transcript content..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                  style={styles.searchInput}
                />
              </div>
            </div>

            {/* Date From */}
            <div style={styles.filterGroup}>
              <label style={styles.filterLabel}>From Date</label>
              <div style={styles.dateBox}>
                <Calendar size={16} color="#64748B" />
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => {
                    setDateFrom(e.target.value);
                    setCurrentPage(1);
                  }}
                  style={styles.dateInput}
                />
              </div>
            </div>

            {/* Date To */}
            <div style={styles.filterGroup}>
              <label style={styles.filterLabel}>To Date</label>
              <div style={styles.dateBox}>
                <Calendar size={16} color="#64748B" />
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => {
                    setDateTo(e.target.value);
                    setCurrentPage(1);
                  }}
                  style={styles.dateInput}
                />
              </div>
            </div>
          </div>

          {/* Active Filters Summary */}
          {(searchTerm || dateFrom || dateTo) && (
            <div style={styles.filterSummary}>
              Showing {filteredCalls.length} of {calls.length} records
              {searchTerm && <span style={styles.filterTag}>keyword: "{searchTerm}"</span>}
              {dateFrom && <span style={styles.filterTag}>from: {dateFrom}</span>}
              {dateTo && <span style={styles.filterTag}>to: {dateTo}</span>}
            </div>
          )}
        </div>

        {/* Records Table */}
        <div style={styles.tableContainer}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Record Date</th>
                <th style={styles.th}>Session ID</th>
                <th style={styles.th}>Duration</th>
                <th style={styles.th}>Messages</th>
                <th style={styles.th}>Status</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedCalls.length === 0 ? (
                <tr>
                  <td colSpan={6} style={styles.emptyState}>
                    <FileText size={40} color="#334155" />
                    <p style={styles.emptyTitle}>No records found matching these criteria</p>
                    <p style={styles.emptySubtitle}>Try adjusting your search terms or date range</p>
                  </td>
                </tr>
              ) : (
                paginatedCalls.map((call) => (
                  <tr key={call.id} style={styles.tr}>
                    <td style={styles.td}>
                      <div style={styles.dateCell}>
                        <span style={styles.dateMain}>{formatDateShort(call.timestamp)}</span>
                        <span style={styles.dateTime}>
                          {new Date(call.timestamp).toLocaleTimeString('en-US', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    </td>
                    <td style={styles.td}>
                      <span style={styles.sessionId}>{call.sessionId.slice(0, 16)}...</span>
                    </td>
                    <td style={styles.td}>
                      <span style={styles.duration}>{formatDuration(call.duration)}</span>
                    </td>
                    <td style={styles.td}>
                      <span style={styles.messageCount}>{call.transcriptCount}</span>
                    </td>
                    <td style={styles.td}>
                      <StatusBadge status={call.status} />
                    </td>
                    <td style={{ ...styles.td, textAlign: 'right' }}>
                      <div style={styles.actionBtns}>
                        <button
                          onClick={() => setSelectedCall(call)}
                          style={styles.viewBtn}
                          title="View Record"
                        >
                          <Eye size={14} />
                          View
                        </button>
                        <button
                          onClick={() => handlePrintRecord(call)}
                          style={styles.downloadBtn}
                          title="Download Official Record"
                        >
                          <Download size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {filteredCalls.length > 0 && (
          <div style={styles.pagination}>
            <span style={styles.paginationInfo}>
              Showing {startIndex + 1}-{Math.min(startIndex + itemsPerPage, filteredCalls.length)} of {filteredCalls.length} records
            </span>
            <div style={styles.paginationBtns}>
              <button
                style={{
                  ...styles.pageBtn,
                  opacity: currentPage === 1 ? 0.4 : 1,
                  cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                }}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft size={18} />
              </button>
              <span style={styles.pageNum}>Page {currentPage} of {totalPages || 1}</span>
              <button
                style={{
                  ...styles.pageBtn,
                  opacity: currentPage >= totalPages ? 0.4 : 1,
                  cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer',
                }}
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}

        {/* Legal Footer */}
        <div style={styles.legalFooter}>
          <Lock size={14} />
          <span>
            All records are maintained in compliance with the Freedom of Information Act (FOIA).
            Records may be subject to redaction for privacy protection.
          </span>
        </div>
      </div>

      {/* Record Detail Modal */}
      {selectedCall && (
        <RecordDetailModal
          call={selectedCall}
          onClose={() => setSelectedCall(null)}
          onPrint={() => handlePrintRecord(selectedCall)}
        />
      )}
    </div>
  );
}

// ===========================================
// STYLES
// ===========================================
const styles: { [key: string]: React.CSSProperties } = {
  page: {
    minHeight: '100vh',
    background: '#0C1220',
    padding: '32px 40px',
  },
  container: {
    maxWidth: '1300px',
    margin: '0 auto',
  },
  backLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '13px',
    color: '#64748B',
    textDecoration: 'none',
    marginBottom: '24px',
    transition: 'color 0.2s',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '32px',
  },
  headerLeft: {},
  headerRight: {},
  secureBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    background: 'rgba(34, 197, 94, 0.1)',
    border: '1px solid rgba(34, 197, 94, 0.3)',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: 700,
    color: '#22C55E',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '12px',
  },
  title: {
    fontSize: '28px',
    fontWeight: 800,
    color: '#F8FAFC',
    margin: '0 0 8px 0',
    letterSpacing: '-0.02em',
  },
  subtitle: {
    fontSize: '14px',
    color: '#64748B',
    margin: 0,
  },
  exportAllBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 20px',
    background: 'linear-gradient(135deg, #1E40AF 0%, #1E3A8A 100%)',
    border: '1px solid rgba(59, 130, 246, 0.3)',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 600,
    color: '#fff',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  filterSection: {
    background: 'rgba(15, 23, 42, 0.6)',
    border: '1px solid rgba(30, 64, 175, 0.2)',
    borderRadius: '12px',
    padding: '20px 24px',
    marginBottom: '24px',
  },
  filterHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '16px',
  },
  filterTitle: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#94A3B8',
    flex: 1,
  },
  clearBtn: {
    background: 'transparent',
    border: 'none',
    fontSize: '12px',
    color: '#60A5FA',
    cursor: 'pointer',
    padding: '4px 8px',
  },
  filterGrid: {
    display: 'grid',
    gridTemplateColumns: '2fr 1fr 1fr',
    gap: '16px',
  },
  filterGroup: {},
  filterLabel: {
    display: 'block',
    fontSize: '11px',
    fontWeight: 600,
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '8px',
  },
  searchBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px 14px',
    background: 'rgba(15, 23, 42, 0.8)',
    border: '1px solid rgba(30, 64, 175, 0.3)',
    borderRadius: '8px',
  },
  searchInput: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    fontSize: '14px',
    color: '#F8FAFC',
  },
  dateBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px 14px',
    background: 'rgba(15, 23, 42, 0.8)',
    border: '1px solid rgba(30, 64, 175, 0.3)',
    borderRadius: '8px',
  },
  dateInput: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    fontSize: '14px',
    color: '#F8FAFC',
    colorScheme: 'dark',
  },
  filterSummary: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginTop: '16px',
    paddingTop: '16px',
    borderTop: '1px solid rgba(30, 64, 175, 0.2)',
    fontSize: '13px',
    color: '#94A3B8',
  },
  filterTag: {
    padding: '4px 10px',
    background: 'rgba(59, 130, 246, 0.15)',
    borderRadius: '4px',
    fontSize: '12px',
    color: '#60A5FA',
  },
  tableContainer: {
    background: 'rgba(15, 23, 42, 0.6)',
    border: '1px solid rgba(30, 64, 175, 0.2)',
    borderRadius: '12px',
    overflow: 'hidden',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  th: {
    padding: '14px 20px',
    textAlign: 'left',
    fontSize: '11px',
    fontWeight: 700,
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    borderBottom: '1px solid rgba(30, 64, 175, 0.3)',
    background: 'rgba(15, 23, 42, 0.8)',
  },
  tr: {
    borderBottom: '1px solid rgba(30, 64, 175, 0.1)',
    transition: 'background 0.15s',
  },
  td: {
    padding: '14px 20px',
    verticalAlign: 'middle',
  },
  dateCell: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  dateMain: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#F8FAFC',
  },
  dateTime: {
    fontSize: '12px',
    color: '#64748B',
  },
  sessionId: {
    fontSize: '13px',
    color: '#60A5FA',
    fontFamily: 'monospace',
  },
  duration: {
    fontSize: '14px',
    color: '#94A3B8',
    fontFamily: 'monospace',
  },
  messageCount: {
    fontSize: '14px',
    color: '#94A3B8',
    fontFamily: 'monospace',
  },
  actionBtns: {
    display: 'flex',
    gap: '8px',
    justifyContent: 'flex-end',
  },
  viewBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    background: 'rgba(30, 64, 175, 0.15)',
    border: '1px solid rgba(30, 64, 175, 0.3)',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: 600,
    color: '#60A5FA',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  downloadBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    background: 'rgba(34, 197, 94, 0.15)',
    border: '1px solid rgba(34, 197, 94, 0.3)',
    borderRadius: '6px',
    color: '#22C55E',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  emptyState: {
    textAlign: 'center',
    padding: '60px 20px',
  },
  emptyTitle: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#64748B',
    margin: '16px 0 4px 0',
  },
  emptySubtitle: {
    fontSize: '13px',
    color: '#475569',
    margin: 0,
  },
  pagination: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: '20px',
    padding: '0 8px',
  },
  paginationInfo: {
    fontSize: '13px',
    color: '#64748B',
  },
  paginationBtns: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  pageBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '36px',
    height: '36px',
    background: 'rgba(15, 23, 42, 0.6)',
    border: '1px solid rgba(30, 64, 175, 0.2)',
    borderRadius: '8px',
    color: '#94A3B8',
    cursor: 'pointer',
  },
  pageNum: {
    fontSize: '13px',
    color: '#94A3B8',
  },
  legalFooter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    marginTop: '32px',
    padding: '16px',
    fontSize: '12px',
    color: '#475569',
    textAlign: 'center',
  },
};

const modalStyles: { [key: string]: React.CSSProperties } = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.85)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '20px',
  },
  modal: {
    width: '100%',
    maxWidth: '800px',
    maxHeight: '85vh',
    background: '#0F172A',
    border: '1px solid rgba(30, 64, 175, 0.3)',
    borderRadius: '16px',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: '24px',
    borderBottom: '1px solid rgba(30, 64, 175, 0.2)',
    background: 'rgba(15, 23, 42, 0.5)',
  },
  headerLeft: {},
  officialBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 10px',
    background: 'rgba(34, 197, 94, 0.15)',
    border: '1px solid rgba(34, 197, 94, 0.3)',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 700,
    color: '#22C55E',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '12px',
  },
  title: {
    fontSize: '20px',
    fontWeight: 700,
    color: '#F8FAFC',
    margin: 0,
  },
  subtitle: {
    fontSize: '13px',
    color: '#64748B',
    margin: '6px 0 0 0',
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: '#64748B',
    cursor: 'pointer',
    padding: '4px',
  },
  metadataGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '1px',
    background: 'rgba(30, 64, 175, 0.2)',
    borderBottom: '1px solid rgba(30, 64, 175, 0.2)',
  },
  metaItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    padding: '16px 20px',
    background: '#0F172A',
  },
  metaLabel: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  metaValue: {
    fontSize: '14px',
    color: '#F8FAFC',
    fontFamily: 'monospace',
    wordBreak: 'break-all',
  },
  transcriptSection: {
    flex: 1,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  sectionTitle: {
    fontSize: '12px',
    fontWeight: 700,
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    padding: '16px 24px 12px',
    margin: 0,
  },
  transcriptContainer: {
    flex: 1,
    overflowY: 'auto',
    padding: '0 24px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  transcriptEntry: {
    padding: '12px 16px',
    background: 'rgba(15, 23, 42, 0.6)',
    borderRadius: '8px',
    border: '1px solid rgba(30, 64, 175, 0.15)',
  },
  roleTag: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '3px 8px',
    borderRadius: '4px',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.05em',
    marginBottom: '8px',
  },
  transcriptText: {
    fontSize: '14px',
    color: '#E2E8F0',
    margin: 0,
    lineHeight: 1.6,
  },
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 24px',
    borderTop: '1px solid rgba(30, 64, 175, 0.2)',
    background: 'rgba(15, 23, 42, 0.5)',
  },
  footerNote: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '12px',
    color: '#64748B',
  },
  printBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 20px',
    background: 'linear-gradient(135deg, #1E40AF 0%, #1E3A8A 100%)',
    border: '1px solid rgba(59, 130, 246, 0.3)',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: 600,
    color: '#fff',
    cursor: 'pointer',
  },
};
