'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  LayoutDashboard,
  FileText,
  BarChart3,
  Settings,
  MapPin,
  Download,
  Mic,
  Send,
  Phone,
  Clock,
  AlertTriangle,
  CheckCircle,
  ChevronRight,
  Radio
} from 'lucide-react';

// ===========================================
// SIDEBAR COMPONENT
// ===========================================
function Sidebar({ activeItem, onItemClick }: { activeItem: string; onItemClick: (item: string) => void }) {
  const menuItems = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'requests', label: '311 Requests', icon: Phone },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'foia', label: 'FOIA Vault', icon: FileText },
    { id: 'broadcast', label: 'Town Hall', icon: Radio },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div style={styles.sidebar}>
      <div style={styles.sidebarHeader}>
        <div style={styles.sidebarLogo}>
          <div style={styles.sidebarLogoIcon}>CC</div>
          <div>
            <span style={styles.sidebarTitle}>City Clerk</span>
            <span style={styles.sidebarSubtitle}>Dashboard</span>
          </div>
        </div>
      </div>

      <nav style={styles.sidebarNav}>
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeItem === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onItemClick(item.id)}
              style={{
                ...styles.sidebarItem,
                background: isActive ? 'rgba(30, 64, 175, 0.2)' : 'transparent',
                borderColor: isActive ? 'rgba(59, 130, 246, 0.5)' : 'transparent',
                color: isActive ? '#60A5FA' : '#94A3B8',
              }}
            >
              <Icon size={18} />
              <span>{item.label}</span>
              {isActive && <div style={styles.activeIndicator} />}
            </button>
          );
        })}
      </nav>

      <div style={styles.sidebarFooter}>
        <Link href="/government/demo" style={styles.backLink}>
          Back to Demo Call
        </Link>
      </div>
    </div>
  );
}

// ===========================================
// STAT CARD COMPONENT
// ===========================================
function StatCard({
  label,
  value,
  change,
  icon: Icon,
}: {
  label: string;
  value: string;
  change?: string;
  icon: React.ElementType;
}) {
  return (
    <div style={styles.statCard}>
      <div style={styles.statIcon}>
        <Icon size={20} />
      </div>
      <div style={styles.statContent}>
        <span style={styles.statLabel}>{label}</span>
        <span style={styles.statValue}>{value}</span>
        {change && <span style={styles.statChange}>{change}</span>}
      </div>
    </div>
  );
}

// ===========================================
// MAIN PAGE COMPONENT
// ===========================================
export default function CivicDashboardPage() {
  const [activeItem, setActiveItem] = useState('overview');
  const [isRecording, setIsRecording] = useState(false);

  const recentCalls = [
    { id: 'GOV-8472', time: '14:32', type: 'License Renewal', status: 'resolved', duration: '2:45' },
    { id: 'GOV-8471', time: '14:15', type: 'Permit Question', status: 'resolved', duration: '4:12' },
    { id: 'GOV-8470', time: '13:58', type: 'Meeting Schedule', status: 'escalated', duration: '1:23' },
    { id: 'GOV-8469', time: '13:42', type: 'Records Request', status: 'resolved', duration: '3:56' },
    { id: 'GOV-8468', time: '13:21', type: 'Noise Complaint', status: 'pending', duration: '5:02' },
  ];

  return (
    <div style={styles.page}>
      <Sidebar activeItem={activeItem} onItemClick={setActiveItem} />

      <main style={styles.main}>
        {/* Header */}
        <header style={styles.header}>
          <div>
            <h1 style={styles.pageTitle}>Civic Operations Dashboard</h1>
            <p style={styles.pageSubtitle}>Real-time overview of city services and constituent interactions</p>
          </div>
          <div style={styles.headerActions}>
            <span style={styles.liveIndicator}>
              <span style={styles.liveDot} />
              Live
            </span>
          </div>
        </header>

        {/* Stats Row */}
        <div style={styles.statsGrid}>
          <StatCard icon={Phone} label="Calls Today" value="127" change="+12% vs yesterday" />
          <StatCard icon={Clock} label="Avg Wait Time" value="0:42" change="-15% improvement" />
          <StatCard icon={CheckCircle} label="Resolution Rate" value="94.2%" />
          <StatCard icon={AlertTriangle} label="Escalations" value="8" />
        </div>

        {/* Main Content Grid */}
        <div style={styles.contentGrid}>
          {/* 311 Heatmap */}
          <div style={styles.widget}>
            <div style={styles.widgetHeader}>
              <MapPin size={18} />
              <h3 style={styles.widgetTitle}>311 Service Heatmap</h3>
            </div>
            <div style={styles.mapWidget}>
              {/* Simplified city map representation */}
              <div style={styles.cityMap}>
                <svg viewBox="0 0 400 300" style={{ width: '100%', height: '100%' }}>
                  {/* Grid lines */}
                  {[...Array(8)].map((_, i) => (
                    <line key={`h${i}`} x1="0" y1={i * 40 + 20} x2="400" y2={i * 40 + 20} stroke="rgba(30, 64, 175, 0.1)" />
                  ))}
                  {[...Array(10)].map((_, i) => (
                    <line key={`v${i}`} x1={i * 45 + 20} y1="0" x2={i * 45 + 20} y2="300" stroke="rgba(30, 64, 175, 0.1)" />
                  ))}

                  {/* Pothole markers (red) */}
                  <circle cx="80" cy="120" r="20" fill="rgba(239, 68, 68, 0.3)" />
                  <circle cx="80" cy="120" r="8" fill="#ef4444" />
                  <circle cx="220" cy="80" r="15" fill="rgba(239, 68, 68, 0.3)" />
                  <circle cx="220" cy="80" r="6" fill="#ef4444" />
                  <circle cx="320" cy="200" r="25" fill="rgba(239, 68, 68, 0.3)" />
                  <circle cx="320" cy="200" r="10" fill="#ef4444" />

                  {/* Trash miss markers (yellow) */}
                  <circle cx="150" cy="180" r="18" fill="rgba(245, 158, 11, 0.3)" />
                  <circle cx="150" cy="180" r="7" fill="#f59e0b" />
                  <circle cx="280" cy="120" r="12" fill="rgba(245, 158, 11, 0.3)" />
                  <circle cx="280" cy="120" r="5" fill="#f59e0b" />
                  <circle cx="100" cy="240" r="16" fill="rgba(245, 158, 11, 0.3)" />
                  <circle cx="100" cy="240" r="6" fill="#f59e0b" />
                </svg>
              </div>
              <div style={styles.mapLegend}>
                <div style={styles.legendItem}>
                  <div style={{ ...styles.legendDot, background: '#ef4444' }} />
                  <span>Potholes (12)</span>
                </div>
                <div style={styles.legendItem}>
                  <div style={{ ...styles.legendDot, background: '#f59e0b' }} />
                  <span>Trash Misses (8)</span>
                </div>
              </div>
            </div>
          </div>

          {/* FOIA Vault */}
          <div style={styles.widget}>
            <div style={styles.widgetHeader}>
              <FileText size={18} />
              <h3 style={styles.widgetTitle}>FOIA Vault</h3>
              <button style={styles.exportAllBtn}>
                <Download size={14} />
                Export for Public Record (ZIP)
              </button>
            </div>
            <div style={styles.foiaList}>
              {recentCalls.map((call) => (
                <div key={call.id} style={styles.foiaItem}>
                  <div style={styles.foiaInfo}>
                    <span style={styles.foiaId}>{call.id}</span>
                    <span style={styles.foiaType}>{call.type}</span>
                  </div>
                  <div style={styles.foiaMeta}>
                    <span style={styles.foiaTime}>{call.time}</span>
                    <span style={styles.foiaDuration}>{call.duration}</span>
                    <span style={{
                      ...styles.foiaStatus,
                      color: call.status === 'resolved' ? '#22c55e' : call.status === 'escalated' ? '#ef4444' : '#f59e0b',
                    }}>
                      {call.status}
                    </span>
                  </div>
                  <button style={styles.foiaDownload}>
                    <Download size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Town Hall Broadcaster */}
          <div style={{ ...styles.widget, gridColumn: 'span 2' }}>
            <div style={styles.widgetHeader}>
              <Radio size={18} />
              <h3 style={styles.widgetTitle}>Town Hall Broadcaster</h3>
              <span style={styles.innovationBadge}>INNOVATION</span>
            </div>
            <div style={styles.broadcasterContent}>
              <div style={styles.broadcasterInfo}>
                <h4 style={styles.broadcasterSubtitle}>Emergency & Community Announcements</h4>
                <p style={styles.broadcasterText}>
                  Record messages that will be broadcast to all callers before their interaction begins.
                  Use for emergency alerts, meeting notices, or seasonal announcements.
                </p>

                <div style={styles.activeMessages}>
                  <div style={styles.activeMessage}>
                    <span style={styles.messagePriority}>HIGH</span>
                    <span style={styles.messageText}>Water main break on Oak Street - Expect delays</span>
                    <span style={styles.messageExpiry}>Expires: 6:00 PM</span>
                  </div>
                </div>
              </div>

              <div style={styles.broadcasterActions}>
                <button
                  onClick={() => setIsRecording(!isRecording)}
                  style={{
                    ...styles.recordBtn,
                    background: isRecording ? 'rgba(239, 68, 68, 0.15)' : 'rgba(30, 64, 175, 0.15)',
                    borderColor: isRecording ? 'rgba(239, 68, 68, 0.3)' : 'rgba(30, 64, 175, 0.3)',
                    color: isRecording ? '#ef4444' : '#60A5FA',
                  }}
                >
                  <Mic size={20} />
                  {isRecording ? 'Stop Recording' : 'Record Message'}
                </button>
                <button style={styles.broadcastBtn} disabled={!isRecording}>
                  <Send size={18} />
                  Broadcast to Residents
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// ===========================================
// STYLES - Government Navy & Blue (Clean Dashboard)
// ===========================================
const styles: { [key: string]: React.CSSProperties } = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    paddingTop: '68px',
  },
  sidebar: {
    width: '260px',
    background: 'rgba(12, 18, 32, 0.95)',
    borderRight: '1px solid rgba(30, 64, 175, 0.2)',
    display: 'flex',
    flexDirection: 'column',
    position: 'fixed',
    top: '68px',
    bottom: 0,
    left: 0,
  },
  sidebarHeader: {
    padding: '24px 20px',
    borderBottom: '1px solid rgba(30, 64, 175, 0.15)',
  },
  sidebarLogo: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  sidebarLogoIcon: {
    width: '40px',
    height: '40px',
    background: 'linear-gradient(135deg, #1E40AF 0%, #3B82F6 100%)',
    borderRadius: '10px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontSize: '14px',
    fontWeight: 700,
  },
  sidebarTitle: {
    display: 'block',
    fontSize: '15px',
    fontWeight: 700,
    color: '#F8FAFC',
  },
  sidebarSubtitle: {
    display: 'block',
    fontSize: '12px',
    color: '#64748B',
  },
  sidebarNav: {
    flex: 1,
    padding: '16px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  sidebarItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 16px',
    borderRadius: '10px',
    border: '1px solid transparent',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    position: 'relative',
  },
  activeIndicator: {
    position: 'absolute',
    left: 0,
    top: '50%',
    transform: 'translateY(-50%)',
    width: '3px',
    height: '20px',
    background: '#3B82F6',
    borderRadius: '0 2px 2px 0',
  },
  sidebarFooter: {
    padding: '20px',
    borderTop: '1px solid rgba(30, 64, 175, 0.15)',
  },
  backLink: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    color: '#64748B',
    fontSize: '13px',
    textDecoration: 'none',
  },
  main: {
    flex: 1,
    marginLeft: '260px',
    padding: '32px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '32px',
  },
  pageTitle: {
    fontSize: '28px',
    fontWeight: 800,
    color: '#F8FAFC',
    margin: '0 0 8px 0',
  },
  pageSubtitle: {
    fontSize: '14px',
    color: '#94A3B8',
    margin: 0,
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  liveIndicator: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    background: 'rgba(34, 197, 94, 0.1)',
    border: '1px solid rgba(34, 197, 94, 0.3)',
    borderRadius: '100px',
    color: '#22c55e',
    fontSize: '13px',
    fontWeight: 600,
  },
  liveDot: {
    width: '8px',
    height: '8px',
    background: '#22c55e',
    borderRadius: '50%',
    animation: 'pulse 2s infinite',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '20px',
    marginBottom: '32px',
  },
  statCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '24px',
    background: 'rgba(15, 23, 42, 0.6)',
    border: '1px solid rgba(30, 64, 175, 0.2)',
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
    color: '#60A5FA',
  },
  statContent: {
    display: 'flex',
    flexDirection: 'column',
  },
  statLabel: {
    fontSize: '12px',
    color: '#64748B',
    marginBottom: '4px',
  },
  statValue: {
    fontSize: '24px',
    fontWeight: 800,
    color: '#F8FAFC',
  },
  statChange: {
    fontSize: '11px',
    color: '#22c55e',
    marginTop: '4px',
  },
  contentGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '24px',
  },
  widget: {
    background: 'rgba(15, 23, 42, 0.6)',
    border: '1px solid rgba(30, 64, 175, 0.2)',
    borderRadius: '20px',
    overflow: 'hidden',
  },
  widgetHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '20px 24px',
    borderBottom: '1px solid rgba(30, 64, 175, 0.15)',
    background: 'rgba(30, 64, 175, 0.05)',
    color: '#60A5FA',
  },
  widgetTitle: {
    fontSize: '15px',
    fontWeight: 600,
    color: '#F8FAFC',
    margin: 0,
    flex: 1,
  },
  exportAllBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 14px',
    background: 'rgba(34, 197, 94, 0.1)',
    border: '1px solid rgba(34, 197, 94, 0.3)',
    borderRadius: '8px',
    color: '#22c55e',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  mapWidget: {
    padding: '24px',
  },
  cityMap: {
    height: '240px',
    background: 'rgba(12, 18, 32, 0.5)',
    border: '1px solid rgba(30, 64, 175, 0.15)',
    borderRadius: '12px',
    marginBottom: '16px',
  },
  mapLegend: {
    display: 'flex',
    gap: '24px',
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '13px',
    color: '#94A3B8',
  },
  legendDot: {
    width: '12px',
    height: '12px',
    borderRadius: '50%',
  },
  foiaList: {
    padding: '12px',
  },
  foiaItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '14px 16px',
    borderRadius: '10px',
    border: '1px solid rgba(30, 64, 175, 0.1)',
    marginBottom: '8px',
  },
  foiaInfo: {
    flex: 1,
  },
  foiaId: {
    display: 'block',
    fontSize: '13px',
    fontWeight: 600,
    color: '#F8FAFC',
    fontFamily: 'monospace',
  },
  foiaType: {
    display: 'block',
    fontSize: '12px',
    color: '#64748B',
    marginTop: '2px',
  },
  foiaMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  foiaTime: {
    fontSize: '12px',
    color: '#64748B',
    fontFamily: 'monospace',
  },
  foiaDuration: {
    fontSize: '12px',
    color: '#94A3B8',
    fontFamily: 'monospace',
  },
  foiaStatus: {
    fontSize: '11px',
    fontWeight: 600,
    textTransform: 'uppercase',
  },
  foiaDownload: {
    padding: '8px',
    background: 'rgba(30, 64, 175, 0.1)',
    border: '1px solid rgba(30, 64, 175, 0.2)',
    borderRadius: '8px',
    color: '#60A5FA',
    cursor: 'pointer',
  },
  innovationBadge: {
    padding: '4px 10px',
    background: 'rgba(168, 85, 247, 0.15)',
    border: '1px solid rgba(168, 85, 247, 0.3)',
    borderRadius: '6px',
    color: '#a855f7',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.05em',
  },
  broadcasterContent: {
    padding: '24px',
    display: 'grid',
    gridTemplateColumns: '1fr auto',
    gap: '40px',
  },
  broadcasterInfo: {},
  broadcasterSubtitle: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#F8FAFC',
    margin: '0 0 8px 0',
  },
  broadcasterText: {
    fontSize: '13px',
    color: '#94A3B8',
    margin: '0 0 20px 0',
    lineHeight: 1.6,
  },
  activeMessages: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  activeMessage: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '14px 18px',
    background: 'rgba(245, 158, 11, 0.08)',
    border: '1px solid rgba(245, 158, 11, 0.2)',
    borderRadius: '10px',
  },
  messagePriority: {
    padding: '3px 8px',
    background: 'rgba(245, 158, 11, 0.15)',
    border: '1px solid rgba(245, 158, 11, 0.3)',
    borderRadius: '4px',
    color: '#f59e0b',
    fontSize: '10px',
    fontWeight: 700,
  },
  messageText: {
    flex: 1,
    fontSize: '13px',
    color: '#F8FAFC',
  },
  messageExpiry: {
    fontSize: '11px',
    color: '#64748B',
  },
  broadcasterActions: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    alignItems: 'flex-end',
  },
  recordBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '14px 24px',
    border: '1px solid',
    borderRadius: '10px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  broadcastBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '14px 24px',
    background: 'linear-gradient(135deg, #1E40AF 0%, #3B82F6 100%)',
    border: 'none',
    borderRadius: '10px',
    color: '#fff',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
  },
};
