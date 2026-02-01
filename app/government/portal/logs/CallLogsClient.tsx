'use client';

import { useState } from 'react';
import {
  Download,
  Play,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  X,
  User,
  Bot,
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

interface CallLogsClientProps {
  calls: CallRecord[];
  agencyName: string;
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
      borderRadius: '6px',
      fontSize: '12px',
      fontWeight: 600,
      textTransform: 'capitalize',
    }}>
      {status}
    </span>
  );
}

// ===========================================
// TRANSCRIPT MODAL COMPONENT
// ===========================================
function TranscriptModal({
  call,
  onClose
}: {
  call: CallRecord;
  onClose: () => void;
}) {
  return (
    <div style={modalStyles.overlay} onClick={onClose}>
      <div style={modalStyles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={modalStyles.header}>
          <div>
            <h2 style={modalStyles.title}>Call Transcript</h2>
            <p style={modalStyles.subtitle}>
              Session: {call.sessionId.slice(0, 8)}... • {formatDate(call.timestamp)} • {formatDuration(call.duration)}
            </p>
          </div>
          <button onClick={onClose} style={modalStyles.closeBtn}>
            <X size={20} />
          </button>
        </div>

        <div style={modalStyles.transcriptContainer}>
          {call.transcript
            .filter(entry => entry.role !== 'tool')
            .map((entry, idx) => (
              <div
                key={idx}
                style={{
                  ...modalStyles.message,
                  alignSelf: entry.role === 'user' ? 'flex-end' : 'flex-start',
                }}
              >
                <div style={{
                  ...modalStyles.messageBubble,
                  background: entry.role === 'user'
                    ? 'rgba(30, 64, 175, 0.3)'
                    : 'rgba(15, 23, 42, 0.8)',
                  borderColor: entry.role === 'user'
                    ? 'rgba(59, 130, 246, 0.4)'
                    : 'rgba(30, 64, 175, 0.2)',
                }}>
                  <div style={modalStyles.messageHeader}>
                    {entry.role === 'user' ? (
                      <User size={14} color="#60A5FA" />
                    ) : (
                      <Bot size={14} color="#22C55E" />
                    )}
                    <span style={{
                      fontSize: '11px',
                      color: entry.role === 'user' ? '#60A5FA' : '#22C55E',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                    }}>
                      {entry.role === 'user' ? 'Resident' : 'AI Assistant'}
                    </span>
                  </div>
                  <p style={modalStyles.messageText}>{entry.text}</p>
                </div>
              </div>
            ))}
        </div>

        {call.toolsUsed.length > 0 && (
          <div style={modalStyles.toolsSection}>
            <span style={modalStyles.toolsLabel}>Tools Used:</span>
            {call.toolsUsed.map((tool, idx) => (
              <span key={idx} style={modalStyles.toolBadge}>{tool}</span>
            ))}
          </div>
        )}
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
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

// ===========================================
// MAIN CLIENT COMPONENT
// ===========================================
export default function CallLogsClient({ calls, agencyName }: CallLogsClientProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCall, setSelectedCall] = useState<CallRecord | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Filter calls based on search term
  const filteredCalls = calls.filter(call =>
    call.sessionId.toLowerCase().includes(searchTerm.toLowerCase()) ||
    call.status.toLowerCase().includes(searchTerm.toLowerCase()) ||
    call.toolsUsed.some(tool => tool.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Pagination
  const totalPages = Math.ceil(filteredCalls.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedCalls = filteredCalls.slice(startIndex, startIndex + itemsPerPage);

  const handleExportCSV = () => {
    const csvContent = [
      'Session ID,Timestamp,Duration (seconds),Status,Tools Used,Transcript Count',
      ...filteredCalls.map(call =>
        `${call.sessionId},${call.timestamp},${call.duration},${call.status},"${call.toolsUsed.join('; ')}",${call.transcriptCount}`
      ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `call-logs-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <h1 style={styles.title}>Call Logs</h1>
            <p style={styles.subtitle}>{agencyName} - AI Call Records</p>
          </div>
          <div style={styles.headerRight}>
            <button onClick={handleExportCSV} style={styles.exportBtn}>
              <Download size={18} />
              Export CSV (FOIA)
            </button>
          </div>
        </div>

        {/* Stats Banner */}
        <div style={styles.statsBanner}>
          <div style={styles.stat}>
            <span style={styles.statValue}>{calls.length}</span>
            <span style={styles.statLabel}>Total Calls</span>
          </div>
          <div style={styles.stat}>
            <span style={styles.statValue}>
              {calls.filter(c => c.status === 'completed').length}
            </span>
            <span style={styles.statLabel}>Completed</span>
          </div>
          <div style={styles.stat}>
            <span style={styles.statValue}>
              {calls.length > 0
                ? formatDuration(calls.reduce((acc, c) => acc + c.duration, 0) / calls.length)
                : '0:00'
              }
            </span>
            <span style={styles.statLabel}>Avg Duration</span>
          </div>
        </div>

        {/* Filters */}
        <div style={styles.filters}>
          <div style={styles.searchBox}>
            <Search size={18} color="#64748B" />
            <input
              type="text"
              placeholder="Search by session ID, status, or tool..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              style={styles.searchInput}
            />
          </div>
          <button style={styles.filterBtn}>
            <Filter size={18} />
            Filters
          </button>
        </div>

        {/* Table */}
        <div style={styles.tableContainer}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Date/Time</th>
                <th style={styles.th}>Session ID</th>
                <th style={styles.th}>Duration</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Messages</th>
                <th style={styles.th}>Transcript</th>
              </tr>
            </thead>
            <tbody>
              {paginatedCalls.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ ...styles.td, textAlign: 'center', padding: '40px' }}>
                    <p style={{ color: '#64748B', margin: 0 }}>
                      {searchTerm ? 'No calls match your search.' : 'No call records found.'}
                    </p>
                  </td>
                </tr>
              ) : (
                paginatedCalls.map((call) => (
                  <tr key={call.id} style={styles.tr}>
                    <td style={styles.td}>
                      <span style={styles.timestamp}>{formatDate(call.timestamp)}</span>
                    </td>
                    <td style={styles.td}>
                      <span style={styles.sessionId}>{call.sessionId.slice(0, 12)}...</span>
                    </td>
                    <td style={styles.td}>
                      <span style={styles.duration}>{formatDuration(call.duration)}</span>
                    </td>
                    <td style={styles.td}>
                      <StatusBadge status={call.status} />
                    </td>
                    <td style={styles.td}>
                      <span style={styles.messageCount}>{call.transcriptCount}</span>
                    </td>
                    <td style={styles.td}>
                      <button
                        onClick={() => setSelectedCall(call)}
                        style={styles.playBtn}
                      >
                        <Play size={14} />
                        View
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div style={styles.pagination}>
          <span style={styles.paginationInfo}>
            Showing {filteredCalls.length === 0 ? 0 : startIndex + 1}-{Math.min(startIndex + itemsPerPage, filteredCalls.length)} of {filteredCalls.length} records
          </span>
          <div style={styles.paginationBtns}>
            <button
              style={{
                ...styles.pageBtn,
                opacity: currentPage === 1 ? 0.5 : 1,
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
                opacity: currentPage >= totalPages ? 0.5 : 1,
                cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer',
              }}
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Transcript Modal */}
      {selectedCall && (
        <TranscriptModal
          call={selectedCall}
          onClose={() => setSelectedCall(null)}
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
    padding: '40px',
  },
  container: {
    maxWidth: '1200px',
    margin: '0 auto',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '24px',
  },
  headerLeft: {},
  headerRight: {},
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
  },
  exportBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 20px',
    background: '#1E40AF',
    border: 'none',
    borderRadius: '10px',
    fontSize: '14px',
    fontWeight: 600,
    color: '#fff',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  statsBanner: {
    display: 'flex',
    gap: '16px',
    marginBottom: '24px',
  },
  stat: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '20px',
    background: 'rgba(15, 23, 42, 0.6)',
    border: '1px solid rgba(30, 64, 175, 0.2)',
    borderRadius: '12px',
  },
  statValue: {
    fontSize: '28px',
    fontWeight: 700,
    color: '#F8FAFC',
  },
  statLabel: {
    fontSize: '13px',
    color: '#64748B',
    marginTop: '4px',
  },
  filters: {
    display: 'flex',
    gap: '12px',
    marginBottom: '24px',
  },
  searchBox: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 16px',
    background: 'rgba(15, 23, 42, 0.6)',
    border: '1px solid rgba(30, 64, 175, 0.2)',
    borderRadius: '10px',
  },
  searchInput: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    fontSize: '14px',
    color: '#F8FAFC',
  },
  filterBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 20px',
    background: 'rgba(15, 23, 42, 0.6)',
    border: '1px solid rgba(30, 64, 175, 0.2)',
    borderRadius: '10px',
    fontSize: '14px',
    fontWeight: 500,
    color: '#94A3B8',
    cursor: 'pointer',
  },
  tableContainer: {
    background: 'rgba(15, 23, 42, 0.6)',
    border: '1px solid rgba(30, 64, 175, 0.2)',
    borderRadius: '16px',
    overflow: 'hidden',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  th: {
    padding: '16px 20px',
    textAlign: 'left',
    fontSize: '12px',
    fontWeight: 600,
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    borderBottom: '1px solid rgba(30, 64, 175, 0.2)',
    background: 'rgba(15, 23, 42, 0.4)',
  },
  tr: {
    borderBottom: '1px solid rgba(30, 64, 175, 0.1)',
  },
  td: {
    padding: '16px 20px',
  },
  timestamp: {
    fontSize: '14px',
    color: '#CBD5E1',
    fontFamily: 'monospace',
  },
  sessionId: {
    fontSize: '14px',
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
  playBtn: {
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
  },
  pagination: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: '20px',
    padding: '0 8px',
  },
  paginationInfo: {
    fontSize: '14px',
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
    fontSize: '14px',
    color: '#94A3B8',
  },
};

const modalStyles: { [key: string]: React.CSSProperties } = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.8)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '20px',
  },
  modal: {
    width: '100%',
    maxWidth: '700px',
    maxHeight: '80vh',
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
    padding: '20px 24px',
    borderBottom: '1px solid rgba(30, 64, 175, 0.2)',
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
    margin: '4px 0 0 0',
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: '#64748B',
    cursor: 'pointer',
    padding: '4px',
  },
  transcriptContainer: {
    flex: 1,
    overflowY: 'auto',
    padding: '20px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  message: {
    display: 'flex',
    maxWidth: '85%',
  },
  messageBubble: {
    padding: '12px 16px',
    borderRadius: '12px',
    border: '1px solid',
  },
  messageHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginBottom: '6px',
  },
  messageText: {
    fontSize: '14px',
    color: '#E2E8F0',
    margin: 0,
    lineHeight: 1.5,
  },
  toolsSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '16px 24px',
    borderTop: '1px solid rgba(30, 64, 175, 0.2)',
    flexWrap: 'wrap',
  },
  toolsLabel: {
    fontSize: '12px',
    color: '#64748B',
    fontWeight: 600,
  },
  toolBadge: {
    padding: '4px 8px',
    background: 'rgba(168, 85, 247, 0.15)',
    color: '#A855F7',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 600,
  },
};
