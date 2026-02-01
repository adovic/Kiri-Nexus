'use client';

import { useState } from 'react';
import {
  BookOpen,
  Globe,
  FileText,
  Shield,
  RefreshCw,
  Plus,
  Trash2,
  Download,
  Check,
  Clock,
  Zap,
} from 'lucide-react';

// ===========================================
// MOCK DATA
// ===========================================
const MOCK_WEB_SYNC = {
  url: 'https://cityofirvine.org',
  lastSynced: '1 hour ago',
  status: 'synced',
  pagesIndexed: 247,
};

const MOCK_DOCUMENTS = [
  { id: '1', name: 'Municipal Code 2024.pdf', size: '4.2 MB', uploadedAt: '2024-01-15', type: 'pdf' },
  { id: '2', name: 'Fee Schedule FY24.pdf', size: '890 KB', uploadedAt: '2024-01-10', type: 'pdf' },
  { id: '3', name: 'Permit Application Guide.docx', size: '1.2 MB', uploadedAt: '2024-01-08', type: 'docx' },
  { id: '4', name: 'Public Meeting Procedures.pdf', size: '650 KB', uploadedAt: '2024-01-05', type: 'pdf' },
  { id: '5', name: 'Zoning Ordinance Summary.pdf', size: '2.1 MB', uploadedAt: '2024-01-02', type: 'pdf' },
];

const MOCK_GOLDEN_RULES = [
  { id: '1', question: 'How do I submit a FOIA / public records request?', answer: 'Submit a Public Records Act request online at our portal, by email to the City Clerk, or in person at City Hall. Requests are processed within 10 business days per state law.' },
  { id: '2', question: 'When is the next City Council meeting?', answer: 'City Council meets the 1st and 3rd Tuesday of each month at 7:00 PM in the Council Chambers. Agendas are posted 72 hours in advance on the city website.' },
  { id: '3', question: 'How do I reach emergency services or report a hazard?', answer: 'For life-threatening emergencies, dial 911. For non-emergency police, fire, or public works issues, call the city non-emergency line or submit a 311 service request through our portal.' },
];

// ===========================================
// TYPES
// ===========================================
interface GoldenRule {
  id: string;
  question: string;
  answer: string;
}

interface Document {
  id: string;
  name: string;
  size: string;
  uploadedAt: string;
  type: string;
}

// ===========================================
// MAIN PAGE COMPONENT
// ===========================================
export default function GovernmentKnowledgePage() {
  const [webSync, setWebSync] = useState(MOCK_WEB_SYNC);
  const [documents, setDocuments] = useState<Document[]>(MOCK_DOCUMENTS);
  const [goldenRules, setGoldenRules] = useState<GoldenRule[]>(MOCK_GOLDEN_RULES);
  const [isRetraining, setIsRetraining] = useState(false);
  const [isRescanning, setIsRescanning] = useState(false);

  // New rule form state
  const [newQuestion, setNewQuestion] = useState('');
  const [newAnswer, setNewAnswer] = useState('');

  const handleRetrain = async () => {
    setIsRetraining(true);
    await new Promise((resolve) => setTimeout(resolve, 2000));
    setIsRetraining(false);
  };

  const handleRescan = async () => {
    setIsRescanning(true);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    setWebSync({ ...webSync, lastSynced: 'Just now' });
    setIsRescanning(false);
  };

  const handleDeleteDocument = (id: string) => {
    setDocuments(documents.filter((d) => d.id !== id));
  };

  const handleAddRule = () => {
    if (newQuestion.trim() && newAnswer.trim()) {
      setGoldenRules([
        ...goldenRules,
        { id: Date.now().toString(), question: newQuestion, answer: newAnswer },
      ]);
      setNewQuestion('');
      setNewAnswer('');
    }
  };

  const handleDeleteRule = (id: string) => {
    setGoldenRules(goldenRules.filter((r) => r.id !== id));
  };

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <div style={styles.headerBadge}>
              <BookOpen size={16} />
              Intelligence Center
            </div>
            <h1 style={styles.title}>AI Knowledge Base</h1>
            <p style={styles.subtitle}>
              Manage the data sources that power your AI receptionist.
            </p>
          </div>
          <button
            onClick={handleRetrain}
            disabled={isRetraining}
            style={{
              ...styles.retrainBtn,
              opacity: isRetraining ? 0.7 : 1,
            }}
          >
            {isRetraining ? (
              <>
                <div style={styles.spinner} />
                Retraining...
              </>
            ) : (
              <>
                <Zap size={18} />
                Retrain AI
              </>
            )}
          </button>
        </div>

        {/* Main Grid */}
        <div style={styles.mainGrid}>
          {/* Left Column */}
          <div style={styles.leftColumn}>
            {/* Live Web Sync Card */}
            <div style={styles.card}>
              <div style={styles.cardHeader}>
                <div style={styles.cardTitleRow}>
                  <Globe size={20} color="#60A5FA" />
                  <h2 style={styles.cardTitle}>Live Web Sync</h2>
                </div>
                <div style={styles.syncStatus}>
                  <span style={styles.syncDot} />
                  Synced {webSync.lastSynced}
                </div>
              </div>

              <div style={styles.webSyncContent}>
                <div style={styles.webSyncUrl}>
                  <span style={styles.webSyncLabel}>Connected URL</span>
                  <a href={webSync.url} target="_blank" rel="noopener noreferrer" style={styles.webSyncLink}>
                    {webSync.url}
                  </a>
                </div>

                <div style={styles.webSyncStats}>
                  <div style={styles.statBox}>
                    <span style={styles.statValue}>{webSync.pagesIndexed}</span>
                    <span style={styles.statLabel}>Pages Indexed</span>
                  </div>
                  <div style={styles.statBox}>
                    <span style={styles.statValue}>Hourly</span>
                    <span style={styles.statLabel}>Sync Frequency</span>
                  </div>
                </div>

                <button
                  onClick={handleRescan}
                  disabled={isRescanning}
                  style={styles.rescanBtn}
                >
                  {isRescanning ? (
                    <>
                      <div style={styles.spinnerSmall} />
                      Scanning...
                    </>
                  ) : (
                    <>
                      <RefreshCw size={16} />
                      Rescan Now
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Document Library Card */}
            <div style={styles.card}>
              <div style={styles.cardHeader}>
                <div style={styles.cardTitleRow}>
                  <FileText size={20} color="#60A5FA" />
                  <h2 style={styles.cardTitle}>Document Library</h2>
                </div>
                <span style={styles.docCount}>{documents.length} files</span>
              </div>

              <div style={styles.documentList}>
                {documents.map((doc) => (
                  <div key={doc.id} style={styles.documentItem}>
                    <div style={styles.documentIcon}>
                      <FileText size={18} color={doc.type === 'pdf' ? '#EF4444' : '#3B82F6'} />
                    </div>
                    <div style={styles.documentInfo}>
                      <span style={styles.documentName}>{doc.name}</span>
                      <span style={styles.documentMeta}>
                        {doc.size} • Uploaded {doc.uploadedAt}
                      </span>
                    </div>
                    <div style={styles.documentActions}>
                      <button style={styles.docActionBtn} title="Download">
                        <Download size={14} />
                      </button>
                      <button
                        style={styles.docActionBtnDanger}
                        title="Delete"
                        onClick={() => handleDeleteDocument(doc.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <button style={styles.uploadBtn}>
                <Plus size={16} />
                Upload Document
              </button>
            </div>
          </div>

          {/* Right Column */}
          <div style={styles.rightColumn}>
            {/* Golden Rules Card */}
            <div style={styles.card}>
              <div style={styles.cardHeader}>
                <div style={styles.cardTitleRow}>
                  <Shield size={20} color="#60A5FA" />
                  <h2 style={styles.cardTitle}>Golden Rules</h2>
                </div>
                <span style={styles.ruleCount}>{goldenRules.length} overrides</span>
              </div>

              <p style={styles.cardDesc}>
                Manual overrides for specific questions. These take priority over all other sources.
              </p>

              {/* Rules Table */}
              <div style={styles.rulesTable}>
                <div style={styles.rulesTableHeader}>
                  <span style={styles.rulesTableHeaderCell}>When asked...</span>
                  <span style={styles.rulesTableHeaderCell}>AI responds...</span>
                  <span style={styles.rulesTableHeaderAction}></span>
                </div>
                {goldenRules.map((rule) => (
                  <div key={rule.id} style={styles.rulesTableRow}>
                    <div style={styles.rulesTableCell}>
                      <span style={styles.ruleCellLabel}>Q:</span>
                      {rule.question}
                    </div>
                    <div style={styles.rulesTableCell}>
                      <span style={styles.ruleCellLabel}>A:</span>
                      {rule.answer}
                    </div>
                    <button
                      style={styles.ruleDeleteBtn}
                      onClick={() => handleDeleteRule(rule.id)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>

              {/* Add New Rule Form */}
              <div style={styles.addRuleForm}>
                <h3 style={styles.addRuleTitle}>Add New Rule</h3>
                <div style={styles.addRuleInputs}>
                  <input
                    type="text"
                    placeholder="Question: e.g., How do I submit a FOIA request?"
                    value={newQuestion}
                    onChange={(e) => setNewQuestion(e.target.value)}
                    style={styles.addRuleInput}
                  />
                  <input
                    type="text"
                    placeholder="Answer: e.g., Submit online, by email, or in person at City Hall."
                    value={newAnswer}
                    onChange={(e) => setNewAnswer(e.target.value)}
                    style={styles.addRuleInput}
                  />
                </div>
                <button
                  onClick={handleAddRule}
                  disabled={!newQuestion.trim() || !newAnswer.trim()}
                  style={{
                    ...styles.addRuleBtn,
                    opacity: newQuestion.trim() && newAnswer.trim() ? 1 : 0.5,
                    cursor: newQuestion.trim() && newAnswer.trim() ? 'pointer' : 'not-allowed',
                  }}
                >
                  <Plus size={16} />
                  Add Rule
                </button>
              </div>
            </div>

            {/* Training Status Card */}
            <div style={styles.statusCard}>
              <div style={styles.statusHeader}>
                <Check size={20} color="#22C55E" />
                <h3 style={styles.statusTitle}>AI Training Status</h3>
              </div>
              <div style={styles.statusContent}>
                <div style={styles.statusItem}>
                  <Clock size={14} color="#64748B" />
                  <span>Last trained: Today at 2:34 PM</span>
                </div>
                <div style={styles.statusItem}>
                  <Check size={14} color="#22C55E" />
                  <span>All sources indexed successfully</span>
                </div>
                <div style={styles.statusItem}>
                  <Shield size={14} color="#60A5FA" />
                  <span>{goldenRules.length} golden rules active</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
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
    marginBottom: '40px',
  },
  headerLeft: {},
  headerBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    background: 'rgba(30, 64, 175, 0.15)',
    border: '1px solid rgba(30, 64, 175, 0.3)',
    padding: '6px 14px',
    borderRadius: '8px',
    fontSize: '12px',
    fontWeight: 600,
    color: '#60A5FA',
    marginBottom: '16px',
  },
  title: {
    fontSize: '32px',
    fontWeight: 800,
    color: '#F8FAFC',
    margin: '0 0 8px 0',
    letterSpacing: '-0.02em',
  },
  subtitle: {
    fontSize: '15px',
    color: '#94A3B8',
    margin: 0,
  },
  retrainBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '10px',
    background: 'linear-gradient(135deg, #1E40AF 0%, #3B82F6 100%)',
    color: '#fff',
    padding: '14px 28px',
    borderRadius: '10px',
    fontSize: '15px',
    fontWeight: 600,
    border: 'none',
    cursor: 'pointer',
    boxShadow: '0 0 20px rgba(59, 130, 246, 0.3)',
  },
  spinner: {
    width: '18px',
    height: '18px',
    border: '2px solid rgba(255, 255, 255, 0.3)',
    borderTopColor: '#fff',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  spinnerSmall: {
    width: '14px',
    height: '14px',
    border: '2px solid rgba(96, 165, 250, 0.3)',
    borderTopColor: '#60A5FA',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  mainGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '24px',
  },
  leftColumn: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  rightColumn: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  card: {
    background: 'rgba(15, 23, 42, 0.6)',
    border: '1px solid rgba(30, 64, 175, 0.2)',
    borderRadius: '16px',
    padding: '24px',
    backdropFilter: 'blur(12px)',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
  },
  cardTitleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  cardTitle: {
    fontSize: '18px',
    fontWeight: 700,
    color: '#F8FAFC',
    margin: 0,
  },
  cardDesc: {
    fontSize: '13px',
    color: '#94A3B8',
    margin: '0 0 20px 0',
  },
  syncStatus: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '13px',
    color: '#22C55E',
    fontWeight: 500,
  },
  syncDot: {
    width: '8px',
    height: '8px',
    background: '#22C55E',
    borderRadius: '50%',
    boxShadow: '0 0 8px rgba(34, 197, 94, 0.6)',
  },
  webSyncContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  webSyncUrl: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  webSyncLabel: {
    fontSize: '12px',
    color: '#64748B',
    fontWeight: 500,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  webSyncLink: {
    fontSize: '15px',
    color: '#60A5FA',
    textDecoration: 'none',
  },
  webSyncStats: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
  },
  statBox: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    padding: '16px',
    background: 'rgba(30, 64, 175, 0.1)',
    borderRadius: '10px',
    textAlign: 'center',
  },
  statValue: {
    fontSize: '24px',
    fontWeight: 700,
    color: '#F8FAFC',
  },
  statLabel: {
    fontSize: '12px',
    color: '#64748B',
  },
  rescanBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '12px 20px',
    background: 'rgba(30, 64, 175, 0.15)',
    border: '1px solid rgba(30, 64, 175, 0.3)',
    borderRadius: '10px',
    fontSize: '14px',
    fontWeight: 600,
    color: '#60A5FA',
    cursor: 'pointer',
  },
  docCount: {
    fontSize: '13px',
    color: '#64748B',
  },
  documentList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    marginBottom: '16px',
  },
  documentItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 16px',
    background: 'rgba(15, 23, 42, 0.4)',
    border: '1px solid rgba(30, 64, 175, 0.1)',
    borderRadius: '10px',
  },
  documentIcon: {
    width: '36px',
    height: '36px',
    background: 'rgba(30, 64, 175, 0.1)',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  documentInfo: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  documentName: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#F8FAFC',
  },
  documentMeta: {
    fontSize: '12px',
    color: '#64748B',
  },
  documentActions: {
    display: 'flex',
    gap: '8px',
  },
  docActionBtn: {
    width: '28px',
    height: '28px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(30, 64, 175, 0.1)',
    border: 'none',
    borderRadius: '6px',
    color: '#60A5FA',
    cursor: 'pointer',
  },
  docActionBtnDanger: {
    width: '28px',
    height: '28px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(239, 68, 68, 0.1)',
    border: 'none',
    borderRadius: '6px',
    color: '#EF4444',
    cursor: 'pointer',
  },
  uploadBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    width: '100%',
    padding: '12px',
    background: 'rgba(30, 64, 175, 0.1)',
    border: '1px dashed rgba(30, 64, 175, 0.3)',
    borderRadius: '10px',
    fontSize: '14px',
    fontWeight: 600,
    color: '#60A5FA',
    cursor: 'pointer',
  },
  ruleCount: {
    fontSize: '13px',
    color: '#64748B',
  },
  rulesTable: {
    marginBottom: '24px',
  },
  rulesTableHeader: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 40px',
    gap: '12px',
    padding: '12px 16px',
    background: 'rgba(30, 64, 175, 0.1)',
    borderRadius: '10px 10px 0 0',
    fontSize: '11px',
    fontWeight: 600,
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  rulesTableHeaderCell: {},
  rulesTableHeaderAction: {},
  rulesTableRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 40px',
    gap: '12px',
    padding: '16px',
    background: 'rgba(15, 23, 42, 0.4)',
    borderBottom: '1px solid rgba(30, 64, 175, 0.1)',
    alignItems: 'flex-start',
  },
  rulesTableCell: {
    fontSize: '13px',
    color: '#CBD5E1',
    lineHeight: 1.5,
  },
  ruleCellLabel: {
    fontWeight: 700,
    color: '#60A5FA',
    marginRight: '6px',
  },
  ruleDeleteBtn: {
    width: '28px',
    height: '28px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(239, 68, 68, 0.1)',
    border: 'none',
    borderRadius: '6px',
    color: '#EF4444',
    cursor: 'pointer',
  },
  addRuleForm: {
    padding: '20px',
    background: 'rgba(30, 64, 175, 0.05)',
    border: '1px solid rgba(30, 64, 175, 0.15)',
    borderRadius: '12px',
  },
  addRuleTitle: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#F8FAFC',
    margin: '0 0 16px 0',
  },
  addRuleInputs: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    marginBottom: '16px',
  },
  addRuleInput: {
    width: '100%',
    padding: '12px 16px',
    fontSize: '14px',
    color: '#F8FAFC',
    background: 'rgba(15, 23, 42, 0.6)',
    border: '1px solid rgba(30, 64, 175, 0.3)',
    borderRadius: '8px',
    outline: 'none',
    boxSizing: 'border-box',
  },
  addRuleBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 20px',
    background: '#1E40AF',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 600,
    color: '#fff',
  },
  statusCard: {
    background: 'rgba(34, 197, 94, 0.05)',
    border: '1px solid rgba(34, 197, 94, 0.2)',
    borderRadius: '16px',
    padding: '24px',
  },
  statusHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '16px',
  },
  statusTitle: {
    fontSize: '16px',
    fontWeight: 700,
    color: '#22C55E',
    margin: 0,
  },
  statusContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  statusItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    fontSize: '14px',
    color: '#CBD5E1',
  },
};
