'use client';

// TODO: Add server component wrapper (page.tsx -> KnowledgeClient.tsx pattern)
// to verify session server-side before rendering, matching dashboard/page.tsx pattern.
// Current protection relies on middleware cookie-existence check only.

import { useState } from 'react';
import Link from 'next/link';
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
  Upload,
  LinkIcon,
  AlertCircle,
} from 'lucide-react';

// ===========================================
// TYPES
// ===========================================
interface WebSync {
  url: string;
  lastSynced: string;
  status: 'synced' | 'syncing' | 'error';
  pagesIndexed: number;
}

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
// EMPTY STATE COMPONENT
// ===========================================
function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  iconColor = '#3B82F6',
  bgColor = 'rgba(59, 130, 246, 0.1)',
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  action?: React.ReactNode;
  iconColor?: string;
  bgColor?: string;
}) {
  return (
    <div style={styles.emptyState}>
      <div style={{ ...styles.emptyIcon, background: bgColor }}>
        <Icon size={24} color={iconColor} />
      </div>
      <h3 style={styles.emptyTitle}>{title}</h3>
      <p style={styles.emptyDesc}>{description}</p>
      {action}
    </div>
  );
}

// ===========================================
// MAIN PAGE COMPONENT
// ===========================================
export default function CommercialKnowledgePage() {
  // Start with empty/null states - data will come from Firestore when implemented
  const [webSync, setWebSync] = useState<WebSync | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [goldenRules, setGoldenRules] = useState<GoldenRule[]>([]);
  const [isRetraining, setIsRetraining] = useState(false);
  const [isRescanning, setIsRescanning] = useState(false);

  // New rule form state
  const [newQuestion, setNewQuestion] = useState('');
  const [newAnswer, setNewAnswer] = useState('');

  // Website URL form state
  const [websiteUrl, setWebsiteUrl] = useState('');

  const handleRetrain = async () => {
    if (documents.length === 0 && goldenRules.length === 0 && !webSync) {
      return; // Nothing to train on
    }
    setIsRetraining(true);
    await new Promise((resolve) => setTimeout(resolve, 2000));
    setIsRetraining(false);
  };

  const handleRescan = async () => {
    if (!webSync) return;
    setIsRescanning(true);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    setWebSync({ ...webSync, lastSynced: 'Just now' });
    setIsRescanning(false);
  };

  const handleConnectWebsite = () => {
    if (websiteUrl.trim()) {
      // TODO: Implement actual website sync via API
      setWebSync({
        url: websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`,
        lastSynced: 'Just now',
        status: 'synced',
        pagesIndexed: 0,
      });
      setWebsiteUrl('');
    }
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

  const hasKnowledge = webSync || documents.length > 0 || goldenRules.length > 0;

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <h1 style={styles.title}>Knowledge Base</h1>
          <p style={styles.subtitle}>
            Manage the information sources that power your AI receptionist.
          </p>
        </div>
        <button
          onClick={handleRetrain}
          disabled={isRetraining || !hasKnowledge}
          style={{
            ...styles.retrainBtn,
            opacity: isRetraining || !hasKnowledge ? 0.5 : 1,
            cursor: isRetraining || !hasKnowledge ? 'not-allowed' : 'pointer',
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
                <div style={styles.iconWrapper}>
                  <Globe size={18} color="#3B82F6" />
                </div>
                <h2 style={styles.cardTitle}>Website Sync</h2>
              </div>
              {webSync && (
                <div style={styles.syncStatus}>
                  <span style={styles.syncDot} />
                  Synced {webSync.lastSynced}
                </div>
              )}
            </div>

            {webSync ? (
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
                    <span style={styles.statValue}>Auto</span>
                    <span style={styles.statLabel}>Sync Mode</span>
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
            ) : (
              <div style={styles.connectWebsite}>
                <EmptyState
                  icon={LinkIcon}
                  title="Connect Your Website"
                  description="Sync your website content so your AI can answer questions about your business, services, and pricing."
                />
                <div style={styles.urlInputRow}>
                  <input
                    type="text"
                    placeholder="https://yourbusiness.com"
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                    style={styles.urlInput}
                  />
                  <button
                    onClick={handleConnectWebsite}
                    disabled={!websiteUrl.trim()}
                    style={{
                      ...styles.connectBtn,
                      opacity: websiteUrl.trim() ? 1 : 0.5,
                      cursor: websiteUrl.trim() ? 'pointer' : 'not-allowed',
                    }}
                  >
                    <LinkIcon size={16} />
                    Connect
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Document Library Card */}
          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <div style={styles.cardTitleRow}>
                <div style={styles.iconWrapper}>
                  <FileText size={18} color="#3B82F6" />
                </div>
                <h2 style={styles.cardTitle}>Documents</h2>
              </div>
              <span style={styles.docCount}>{documents.length} files</span>
            </div>

            {documents.length > 0 ? (
              <div style={styles.documentList}>
                {documents.map((doc) => (
                  <div key={doc.id} style={styles.documentItem}>
                    <div style={styles.documentIcon}>
                      <FileText size={16} color={doc.type === 'pdf' ? '#EF4444' : '#3B82F6'} />
                    </div>
                    <div style={styles.documentInfo}>
                      <span style={styles.documentName}>{doc.name}</span>
                      <span style={styles.documentMeta}>
                        {doc.size} • {doc.uploadedAt}
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
            ) : (
              <EmptyState
                icon={FileText}
                title="No Documents Yet"
                description="Upload PDFs, Word docs, or text files with information you want your AI to know—like service menus, pricing sheets, or FAQs."
              />
            )}

            <button style={styles.uploadBtn}>
              <Upload size={16} />
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
                <div style={styles.iconWrapperGold}>
                  <Shield size={18} color="#F59E0B" />
                </div>
                <h2 style={styles.cardTitle}>Quick Answers</h2>
              </div>
              <span style={styles.ruleCount}>{goldenRules.length} rules</span>
            </div>

            <p style={styles.cardDesc}>
              Pre-defined responses for common questions. These override AI-generated answers.
            </p>

            {/* Rules Table */}
            {goldenRules.length > 0 ? (
              <div style={styles.rulesTable}>
                <div style={styles.rulesTableHeader}>
                  <span style={styles.rulesTableHeaderCell}>Question</span>
                  <span style={styles.rulesTableHeaderCell}>Answer</span>
                  <span style={styles.rulesTableHeaderAction}></span>
                </div>
                {goldenRules.map((rule) => (
                  <div key={rule.id} style={styles.rulesTableRow}>
                    <div style={styles.rulesTableCell}>
                      <span style={styles.ruleCellQ}>Q:</span>
                      {rule.question}
                    </div>
                    <div style={styles.rulesTableCell}>
                      <span style={styles.ruleCellA}>A:</span>
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
            ) : (
              <EmptyState
                icon={Shield}
                title="No Quick Answers Yet"
                description="Add rules for questions that need specific answers—like pricing, hours, or policies."
                iconColor="#F59E0B"
                bgColor="rgba(245, 158, 11, 0.1)"
              />
            )}

            {/* Add New Rule Form */}
            <div style={styles.addRuleForm}>
              <h3 style={styles.addRuleTitle}>Add New Rule</h3>
              <div style={styles.addRuleInputs}>
                <input
                  type="text"
                  placeholder="Question: e.g., Do you offer same-day service?"
                  value={newQuestion}
                  onChange={(e) => setNewQuestion(e.target.value)}
                  style={styles.addRuleInput}
                />
                <input
                  type="text"
                  placeholder="Answer: e.g., Yes! We offer same-day service for emergencies."
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
          <div style={hasKnowledge ? styles.statusCard : styles.statusCardEmpty}>
            <div style={styles.statusHeader}>
              {hasKnowledge ? (
                <>
                  <Check size={18} color="#22C55E" />
                  <h3 style={styles.statusTitle}>AI Status</h3>
                  <span style={styles.statusBadge}>Ready</span>
                </>
              ) : (
                <>
                  <AlertCircle size={18} color="#64748B" />
                  <h3 style={styles.statusTitleEmpty}>AI Status</h3>
                  <span style={styles.statusBadgeEmpty}>Needs Data</span>
                </>
              )}
            </div>
            <div style={styles.statusContent}>
              {hasKnowledge ? (
                <>
                  <div style={styles.statusItem}>
                    <Globe size={14} color="#3B82F6" />
                    <span>{webSync ? '1 website connected' : 'No website connected'}</span>
                  </div>
                  <div style={styles.statusItem}>
                    <BookOpen size={14} color="#3B82F6" />
                    <span>{documents.length} documents indexed</span>
                  </div>
                  <div style={styles.statusItem}>
                    <Shield size={14} color="#F59E0B" />
                    <span>{goldenRules.length} quick answers active</span>
                  </div>
                </>
              ) : (
                <div style={styles.statusItemEmpty}>
                  <p style={styles.statusEmptyText}>
                    Add content to train your AI receptionist. Connect your website, upload documents, or add quick answers above.
                  </p>
                </div>
              )}
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
    maxWidth: '1400px',
    margin: '0 auto',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '32px',
  },
  headerLeft: {},
  title: {
    fontSize: '28px',
    fontWeight: 700,
    color: '#F8FAFC',
    margin: '0 0 8px 0',
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
    background: 'linear-gradient(135deg, #3B82F6 0%, #6366F1 100%)',
    color: '#fff',
    padding: '12px 24px',
    borderRadius: '10px',
    fontSize: '14px',
    fontWeight: 600,
    border: 'none',
    boxShadow: '0 0 20px rgba(59, 130, 246, 0.3)',
  },
  spinner: {
    width: '16px',
    height: '16px',
    border: '2px solid rgba(255, 255, 255, 0.3)',
    borderTopColor: '#fff',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  spinnerSmall: {
    width: '14px',
    height: '14px',
    border: '2px solid rgba(59, 130, 246, 0.3)',
    borderTopColor: '#3B82F6',
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
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: '20px',
    padding: '24px',
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
  iconWrapper: {
    width: '36px',
    height: '36px',
    background: 'rgba(59, 130, 246, 0.1)',
    borderRadius: '10px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapperGold: {
    width: '36px',
    height: '36px',
    background: 'rgba(245, 158, 11, 0.1)',
    borderRadius: '10px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: '17px',
    fontWeight: 600,
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
    gap: '4px',
  },
  webSyncLabel: {
    fontSize: '12px',
    color: '#64748B',
    fontWeight: 500,
  },
  webSyncLink: {
    fontSize: '15px',
    color: '#3B82F6',
    textDecoration: 'none',
  },
  webSyncStats: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px',
  },
  statBox: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    padding: '16px',
    background: 'rgba(59, 130, 246, 0.05)',
    border: '1px solid rgba(59, 130, 246, 0.1)',
    borderRadius: '12px',
    textAlign: 'center',
  },
  statValue: {
    fontSize: '22px',
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
    background: 'rgba(59, 130, 246, 0.1)',
    border: '1px solid rgba(59, 130, 246, 0.2)',
    borderRadius: '10px',
    fontSize: '14px',
    fontWeight: 600,
    color: '#3B82F6',
    cursor: 'pointer',
  },
  connectWebsite: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  urlInputRow: {
    display: 'flex',
    gap: '12px',
  },
  urlInput: {
    flex: 1,
    padding: '12px 14px',
    fontSize: '14px',
    color: '#F8FAFC',
    background: 'rgba(15, 23, 42, 0.6)',
    border: '1px solid rgba(148, 163, 184, 0.2)',
    borderRadius: '8px',
    outline: 'none',
  },
  connectBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 20px',
    background: '#3B82F6',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 600,
    color: '#fff',
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
    padding: '12px 14px',
    background: 'rgba(255, 255, 255, 0.02)',
    border: '1px solid rgba(255, 255, 255, 0.04)',
    borderRadius: '10px',
  },
  documentIcon: {
    width: '32px',
    height: '32px',
    background: 'rgba(59, 130, 246, 0.1)',
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
    gap: '6px',
  },
  docActionBtn: {
    width: '28px',
    height: '28px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(59, 130, 246, 0.1)',
    border: 'none',
    borderRadius: '6px',
    color: '#3B82F6',
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
    background: 'rgba(59, 130, 246, 0.05)',
    border: '1px dashed rgba(59, 130, 246, 0.3)',
    borderRadius: '10px',
    fontSize: '14px',
    fontWeight: 600,
    color: '#3B82F6',
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
    gridTemplateColumns: '1fr 1fr 36px',
    gap: '12px',
    padding: '12px 14px',
    background: 'rgba(255, 255, 255, 0.02)',
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
    gridTemplateColumns: '1fr 1fr 36px',
    gap: '12px',
    padding: '14px',
    background: 'rgba(255, 255, 255, 0.01)',
    borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
    alignItems: 'flex-start',
  },
  rulesTableCell: {
    fontSize: '13px',
    color: '#CBD5E1',
    lineHeight: 1.5,
  },
  ruleCellQ: {
    fontWeight: 700,
    color: '#3B82F6',
    marginRight: '6px',
  },
  ruleCellA: {
    fontWeight: 700,
    color: '#22C55E',
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
    background: 'rgba(255, 255, 255, 0.02)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
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
    padding: '12px 14px',
    fontSize: '14px',
    color: '#F8FAFC',
    background: 'rgba(15, 23, 42, 0.6)',
    border: '1px solid rgba(148, 163, 184, 0.2)',
    borderRadius: '8px',
    outline: 'none',
    boxSizing: 'border-box',
  },
  addRuleBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 20px',
    background: '#3B82F6',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 600,
    color: '#fff',
  },
  statusCard: {
    background: 'rgba(34, 197, 94, 0.05)',
    border: '1px solid rgba(34, 197, 94, 0.15)',
    borderRadius: '16px',
    padding: '20px',
  },
  statusCardEmpty: {
    background: 'rgba(100, 116, 139, 0.05)',
    border: '1px solid rgba(100, 116, 139, 0.15)',
    borderRadius: '16px',
    padding: '20px',
  },
  statusHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '16px',
  },
  statusTitle: {
    fontSize: '15px',
    fontWeight: 600,
    color: '#22C55E',
    margin: 0,
    flex: 1,
  },
  statusTitleEmpty: {
    fontSize: '15px',
    fontWeight: 600,
    color: '#64748B',
    margin: 0,
    flex: 1,
  },
  statusBadge: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#22C55E',
    background: 'rgba(34, 197, 94, 0.15)',
    padding: '4px 10px',
    borderRadius: '100px',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  statusBadgeEmpty: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#64748B',
    background: 'rgba(100, 116, 139, 0.15)',
    padding: '4px 10px',
    borderRadius: '100px',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  statusContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  statusItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    fontSize: '13px',
    color: '#CBD5E1',
  },
  statusItemEmpty: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  statusEmptyText: {
    fontSize: '13px',
    color: '#94A3B8',
    margin: 0,
    lineHeight: 1.5,
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    padding: '24px 16px',
  },
  emptyIcon: {
    width: '48px',
    height: '48px',
    borderRadius: '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '16px',
  },
  emptyTitle: {
    fontSize: '15px',
    fontWeight: 600,
    color: '#F8FAFC',
    margin: '0 0 8px 0',
  },
  emptyDesc: {
    fontSize: '13px',
    color: '#94A3B8',
    margin: 0,
    maxWidth: '280px',
    lineHeight: 1.5,
  },
};
