'use client';

import React from 'react';
import {
  ChevronRight,
  ChevronLeft,
  Check,
  Building2,
  Clock,
  Users,
  AlertTriangle,
  Shield,
  BookOpen,
  Plug,
  Eye,
  FileText,
  Sparkles,
  Monitor,
  Globe,
  Key,
  FileDown,
  Fingerprint,
  Lock,
  Activity,
  Bell,
  Bot,
  ClipboardList,
  Database,
  CloudUpload,
  GitBranch,
  RefreshCw,
  UserCheck,
} from 'lucide-react';
import InfoBubble from '@/components/government/InfoBubble';
import { styles } from '@/components/government/setup/SetupStyles';
import type {
  ComplianceValidationResult,
  ContentValidationResult,
} from '@/lib/government/compliance-baseline';

// ── Types (mirrored from setup/page.tsx) ──

interface Department {
  id: string;
  name: string;
  phone: string;
  keywords: string;
}

interface BusinessHours {
  [key: string]: { open: string; close: string; enabled: boolean };
}

interface GoldenRule {
  id: string;
  question: string;
  answer: string;
}

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  type: string;
}

interface AgencyConfig {
  defaultDept: string;
  keywords: string;
  integrationTitle: string;
  integrationOptions: string[];
}

// ── Constants ──

const DRIFT_SPARKLINE = [
  0.01, 0.02, 0.01, 0.03, 0.02, 0.01, 0.02, 0.04, 0.02, 0.01,
  0.03, 0.02, 0.01, 0.02, 0.03, 0.01, 0.02, 0.01, 0.03, 0.02,
  0.01, 0.02, 0.01, 0.03, 0.02, 0.01, 0.02, 0.02,
];

const AUDITOR_MOCK_FINDINGS = [
  { id: 'ABF-001', severity: 'Low' as const, description: 'Confidence score 0.61 on permit lookup — below 0.70 threshold', tool: 'check_permit_status', timestamp: '2026-01-20T14:22:00Z' },
  { id: 'ABF-002', severity: 'Medium' as const, description: 'FTE cost deviation 18% between receipt RCPT-3A1F and Baseline Set 1', tool: 'log_service_request', timestamp: '2026-01-22T09:15:00Z' },
  { id: 'ABF-003', severity: 'High' as const, description: 'High-confidence mismatch: Policy §14.03 cited but not in Baseline ordinance set', tool: 'schedule_appointment', timestamp: '2026-01-24T16:41:00Z' },
];

const STALE_THRESHOLD_DAYS = 90;
const RAIO_EXPIRY_DAYS = 30;

const TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern Time (ET)', offset: 'UTC-5' },
  { value: 'America/Chicago', label: 'Central Time (CT)', offset: 'UTC-6' },
  { value: 'America/Denver', label: 'Mountain Time (MT)', offset: 'UTC-7' },
  { value: 'America/Phoenix', label: 'Arizona Time (AZ)', offset: 'UTC-7' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)', offset: 'UTC-8' },
  { value: 'America/Anchorage', label: 'Alaska Time (AKT)', offset: 'UTC-9' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time (HT)', offset: 'UTC-10' },
];

const DEFAULT_CRISIS_KEYWORDS = [
  'suicide',
  'kill myself',
  'emergency',
  'dying',
  'heart attack',
  'can\'t breathe',
  'overdose',
  'gun',
  'weapon',
  'threat',
];

// ── Props ──

export interface ReviewStepProps {
  // Form state
  agencyName: string;
  jurisdictionState: string;
  voiceTone: string;
  timezone: string;
  afterHoursBehavior: string;
  businessHours: BusinessHours;
  departments: Department[];
  websiteUrl: string;
  files: UploadedFile[];
  goldenRules: GoldenRule[];
  provider311: string;
  alertProvider: string;
  emergencyNumber: string;
  customCrisisKeywords: string[];
  infrastructureTarget: string;
  agencyConfig: AgencyConfig;

  // Compliance & governance
  acknowledgeAiGovernance: boolean;
  foiaConfigured: boolean;
  auditExported: boolean;
  nhiDownloaded: boolean;
  sanitizedLogGenerated: boolean;
  raioPagingEnabled: boolean;
  mathRevalidated: boolean;

  // Audit system
  auditHealthChecked: boolean;
  auditSystemFailed: boolean;
  auditFailureDetail: string;

  // RAIO / Supervisor
  lastRaioVerification: string;
  raioVerificationAge: number;
  isRaioExpired: boolean;
  raioDaysRemaining: number;
  raioCheckInUserId: string;
  raioCheckInPending: boolean;
  raioLedgerInfo: { merkle_root_hash: string; digital_fingerprint: string; entry_id: string } | null;

  // Machine identity
  agentNhiId: string;
  commissionDate: string;

  // Auditor bot
  auditorBotEnabled: boolean;
  auditorLastScan: string;
  auditorDigestEmail: string;
  auditorScanRunning: boolean;

  // Baseline
  baselineVersion: number;
  baselineStatus: 'idle' | 'parsing' | 'valid' | 'error';
  baselineFile: { name: string; size: number } | null;
  baselineErrors: string[];
  baselineExtracted: { laborCost: number; fteCount: number; ordinances: string[] } | null;
  baselineDiff: { field: string; oldVal: string; newVal: string; direction: string }[];
  baselinePrevHash: string;
  baselineHash: string;
  dataEffectiveDate: string;
  isBaselineStale: boolean;
  baselineStaleDays: number;

  // Validation
  complianceResult: ComplianceValidationResult | null;
  contentResult: ContentValidationResult | null;
  stepValidation: Record<string, boolean>;
  allStepsValid: boolean;
  complianceBlocked: boolean;
  loading: boolean;

  // State setters
  setShowModelCardModal: (v: boolean) => void;
  setAcknowledgeAiGovernance: (v: boolean) => void;
  setShowResolutionModal: (v: boolean) => void;
  setShowPresentationModal: (v: boolean) => void;
  setFoiaConfigured: (v: boolean) => void;
  setRaioCheckInUserId: (v: string) => void;
  setRaioPagingEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  setAuditorBotEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  setAuditorDigestEmail: (v: string) => void;
  setShowDecisionTraceModal: (v: boolean) => void;
  setMathRevalidated: (v: boolean) => void;
  setDataEffectiveDate: (v: string) => void;
  setShowComplianceModal: (v: boolean) => void;

  // Handler functions
  verifyAuditHealth: () => void;
  handleSupervisorCheckIn: () => void;
  exportDecisionAuditCsv: () => void;
  downloadMachineIdentityJson: () => void;
  generateSanitizedLog: () => void;
  handleAuditorScan: () => void;
  handleBaselineUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleBack: () => void;
  handleFinish: () => void;

  // Refs
  baselineInputRef: React.RefObject<HTMLInputElement | null>;
}

export default function ReviewStep(props: ReviewStepProps) {
  const {
    agencyName, jurisdictionState, voiceTone, timezone, afterHoursBehavior,
    businessHours, departments, websiteUrl, files, goldenRules,
    provider311, alertProvider, emergencyNumber, customCrisisKeywords,
    infrastructureTarget, agencyConfig,
    acknowledgeAiGovernance, foiaConfigured, auditExported, nhiDownloaded,
    sanitizedLogGenerated, raioPagingEnabled, mathRevalidated,
    auditHealthChecked, auditSystemFailed, auditFailureDetail,
    lastRaioVerification, raioVerificationAge, isRaioExpired, raioDaysRemaining,
    raioCheckInUserId, raioCheckInPending, raioLedgerInfo,
    agentNhiId, commissionDate,
    auditorBotEnabled, auditorLastScan, auditorDigestEmail, auditorScanRunning,
    baselineVersion, baselineStatus, baselineFile, baselineErrors,
    baselineExtracted, baselineDiff, baselinePrevHash, baselineHash,
    dataEffectiveDate, isBaselineStale, baselineStaleDays,
    complianceResult, contentResult, stepValidation, allStepsValid, complianceBlocked, loading,
    setShowModelCardModal, setAcknowledgeAiGovernance, setShowResolutionModal,
    setShowPresentationModal, setFoiaConfigured, setRaioCheckInUserId,
    setRaioPagingEnabled, setAuditorBotEnabled, setAuditorDigestEmail,
    setShowDecisionTraceModal, setMathRevalidated, setDataEffectiveDate, setShowComplianceModal,
    verifyAuditHealth, handleSupervisorCheckIn, exportDecisionAuditCsv,
    downloadMachineIdentityJson, generateSanitizedLog, handleAuditorScan,
    handleBaselineUpload, handleBack, handleFinish,
    baselineInputRef,
  } = props;

  return (
              <div style={styles.card}>
                <h2 style={styles.cardTitle}>Review &amp; Launch</h2>
                <p style={styles.cardDesc}>
                  Verify your configuration before going live. You can go back to any step to make changes.
                </p>

                {/* ============================================= */}
                {/* COMPLIANCE ALERT BANNERS — Fail-Closed System */}
                {/* ============================================= */}

                {/* 🔴 AUDIT TRAIL FAILURE — highest severity */}
                {auditHealthChecked && auditSystemFailed && (
                  <div style={styles.complianceAlertCritical}>
                    <div style={styles.complianceAlertIconRow}>
                      <div style={styles.complianceAlertIconCritical}>
                        <Shield size={20} color="#FFFFFF" />
                      </div>
                      <div style={styles.complianceAlertContent}>
                        <div style={styles.complianceAlertTitleCritical}>
                          🔴 SYSTEM SUSPENDED: Immutable Audit Trail Failure
                        </div>
                        <p style={styles.complianceAlertDesc}>
                          The persistent audit log could not be written. All AI tool executions are
                          blocked until the audit subsystem is restored. This is a compliance-critical
                          failure under M-26-04 §3.2 — no AI action may proceed without an immutable
                          operational receipt.
                        </p>
                        {auditFailureDetail && (
                          <code style={styles.complianceAlertCode}>{auditFailureDetail}</code>
                        )}
                        <div style={styles.complianceAlertActions}>
                          <button
                            onClick={() => window.location.href = 'mailto:itsecurity@municipality.gov?subject=CRITICAL: AI Audit Trail Failure'}
                            style={styles.complianceAlertBtnCritical}
                          >
                            <AlertTriangle size={14} />
                            Contact IT Security
                          </button>
                          <button onClick={verifyAuditHealth} style={styles.complianceAlertBtnRetry}>
                            <RefreshCw size={14} />
                            Re-Check Audit Health
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ⚠️ RAIO HEARTBEAT EXPIRED — agent paused */}
                {isRaioExpired && lastRaioVerification && (
                  <div style={styles.complianceAlertWarning}>
                    <div style={styles.complianceAlertIconRow}>
                      <div style={styles.complianceAlertIconWarning}>
                        <UserCheck size={20} color="#FFFFFF" />
                      </div>
                      <div style={styles.complianceAlertContent}>
                        <div style={styles.complianceAlertTitleWarning}>
                          ⚠️ AGENT PAUSED: Mandatory 30-Day Human Re-Verification Required
                        </div>
                        <p style={styles.complianceAlertDesc}>
                          The Responsible AI Officer (RAIO) supervisor check-in has expired.
                          Last verified {raioVerificationAge} days ago — exceeds the 30-day
                          threshold mandated by M-26-04 §4.3. All agent tool executions will
                          return <strong>403 Agent Suspended</strong> until a human supervisor
                          re-authenticates.
                        </p>
                        <div style={styles.complianceAlertActions}>
                          <button onClick={handleSupervisorCheckIn} style={styles.complianceAlertBtnWarning}>
                            <UserCheck size={14} />
                            Renew Supervisor Check-In Now
                          </button>
                          <button
                            onClick={() => window.location.href = 'mailto:admin@municipality.gov?subject=RAIO Re-Verification Required — Agent Paused'}
                            style={styles.complianceAlertBtnContact}
                          >
                            Contact Admin
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Profile Summary */}
                <div style={{
                  ...styles.reviewSection,
                  borderColor: stepValidation.profile ? 'rgba(30, 64, 175, 0.15)' : 'rgba(239, 68, 68, 0.4)',
                }}>
                  <div style={styles.reviewSectionHeader}>
                    <Building2 size={16} color={stepValidation.profile ? '#60A5FA' : '#EF4444'} />
                    <h4 style={styles.reviewSectionTitle}>Agency Profile</h4>
                    {!stepValidation.profile && (
                      <span style={styles.incompleteBadge}>Incomplete</span>
                    )}
                  </div>
                  <div style={styles.reviewGrid}>
                    <div style={styles.reviewItem}>
                      <span style={styles.reviewLabel}>Agency Name</span>
                      <span style={styles.reviewValue}>{agencyName || '—'}</span>
                    </div>
                    <div style={styles.reviewItem}>
                      <span style={styles.reviewLabel}>State</span>
                      <span style={styles.reviewValue}>{jurisdictionState || '—'}</span>
                    </div>
                    <div style={styles.reviewItem}>
                      <span style={styles.reviewLabel}>Voice Tone</span>
                      <span style={styles.reviewValue}>{voiceTone || '—'}</span>
                    </div>
                  </div>
                </div>

                {/* Operations Summary */}
                <div style={{
                  ...styles.reviewSection,
                  borderColor: stepValidation.operations ? 'rgba(30, 64, 175, 0.15)' : 'rgba(239, 68, 68, 0.4)',
                }}>
                  <div style={styles.reviewSectionHeader}>
                    <Clock size={16} color={stepValidation.operations ? '#60A5FA' : '#EF4444'} />
                    <h4 style={styles.reviewSectionTitle}>Operations</h4>
                    {!stepValidation.operations && (
                      <span style={styles.incompleteBadge}>Incomplete</span>
                    )}
                  </div>
                  <div style={styles.reviewGrid}>
                    <div style={styles.reviewItem}>
                      <span style={styles.reviewLabel}>Timezone</span>
                      <span style={styles.reviewValue}>
                        {TIMEZONES.find(t => t.value === timezone)?.label || timezone}
                      </span>
                    </div>
                    <div style={styles.reviewItem}>
                      <span style={styles.reviewLabel}>After Hours</span>
                      <span style={{ ...styles.reviewValue, textTransform: 'capitalize' }}>
                        {afterHoursBehavior}
                      </span>
                    </div>
                    <div style={styles.reviewItem}>
                      <span style={styles.reviewLabel}>Days Open</span>
                      <span style={styles.reviewValue}>
                        {Object.entries(businessHours).filter(([, v]) => v.enabled).map(([d]) => d).join(', ') || '—'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Departments Summary */}
                <div style={{
                  ...styles.reviewSection,
                  borderColor: stepValidation.departments ? 'rgba(30, 64, 175, 0.15)' : 'rgba(239, 68, 68, 0.4)',
                }}>
                  <div style={styles.reviewSectionHeader}>
                    <Users size={16} color={stepValidation.departments ? '#60A5FA' : '#EF4444'} />
                    <h4 style={styles.reviewSectionTitle}>Departments</h4>
                    {!stepValidation.departments && (
                      <span style={styles.incompleteBadge}>Incomplete</span>
                    )}
                  </div>
                  <div style={styles.reviewList}>
                    {departments.filter(d => d.name).map((dept) => (
                      <div key={dept.id} style={styles.reviewListItem}>
                        <span style={styles.reviewValue}>{dept.name}</span>
                        <span style={styles.reviewLabel}>{dept.phone || 'No phone'}</span>
                      </div>
                    ))}
                    {!departments.some(d => d.name) && (
                      <span style={styles.reviewLabel}>No departments configured</span>
                    )}
                  </div>
                </div>

                {/* Knowledge Summary */}
                <div style={{
                  ...styles.reviewSection,
                  borderColor: stepValidation.knowledge ? 'rgba(30, 64, 175, 0.15)' : 'rgba(239, 68, 68, 0.4)',
                }}>
                  <div style={styles.reviewSectionHeader}>
                    <BookOpen size={16} color={stepValidation.knowledge ? '#60A5FA' : '#EF4444'} />
                    <h4 style={styles.reviewSectionTitle}>Knowledge Base</h4>
                    {!stepValidation.knowledge && (
                      <span style={styles.incompleteBadge}>Incomplete</span>
                    )}
                  </div>
                  <div style={styles.reviewGrid}>
                    <div style={styles.reviewItem}>
                      <span style={styles.reviewLabel}>Website</span>
                      <span style={styles.reviewValue}>{websiteUrl || '—'}</span>
                    </div>
                    <div style={styles.reviewItem}>
                      <span style={styles.reviewLabel}>Files Uploaded</span>
                      <span style={styles.reviewValue}>{files.length}</span>
                    </div>
                    <div style={styles.reviewItem}>
                      <span style={styles.reviewLabel}>Golden Rules</span>
                      <span style={styles.reviewValue}>
                        {goldenRules.filter(r => r.question.trim() && r.answer.trim()).length}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Integrations Summary */}
                <div style={{
                  ...styles.reviewSection,
                  borderColor: stepValidation.integrations ? 'rgba(30, 64, 175, 0.15)' : 'rgba(239, 68, 68, 0.4)',
                }}>
                  <div style={styles.reviewSectionHeader}>
                    <Plug size={16} color={stepValidation.integrations ? '#60A5FA' : '#EF4444'} />
                    <h4 style={styles.reviewSectionTitle}>Integrations</h4>
                    {!stepValidation.integrations && (
                      <span style={styles.incompleteBadge}>Incomplete</span>
                    )}
                  </div>
                  <div style={styles.reviewGrid}>
                    <div style={styles.reviewItem}>
                      <span style={styles.reviewLabel}>{agencyConfig.integrationTitle}</span>
                      <span style={styles.reviewValue}>
                        {provider311 ? provider311.charAt(0).toUpperCase() + provider311.slice(1) : 'Not connected'}
                      </span>
                    </div>
                    <div style={styles.reviewItem}>
                      <span style={styles.reviewLabel}>Emergency Alerts</span>
                      <span style={styles.reviewValue}>
                        {alertProvider ? alertProvider.charAt(0).toUpperCase() + alertProvider.slice(1) : 'Not connected'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Crisis Summary */}
                <div style={{
                  ...styles.reviewSection,
                  borderColor: stepValidation.crisis ? 'rgba(30, 64, 175, 0.15)' : 'rgba(239, 68, 68, 0.4)',
                }}>
                  <div style={styles.reviewSectionHeader}>
                    <AlertTriangle size={16} color={stepValidation.crisis ? '#EF4444' : '#EF4444'} />
                    <h4 style={styles.reviewSectionTitle}>Crisis Protocol</h4>
                    {!stepValidation.crisis && (
                      <span style={styles.incompleteBadge}>Incomplete</span>
                    )}
                  </div>
                  <div style={styles.reviewGrid}>
                    <div style={styles.reviewItem}>
                      <span style={styles.reviewLabel}>Emergency Number</span>
                      <span style={styles.reviewValue}>{emergencyNumber || '—'}</span>
                    </div>
                    <div style={styles.reviewItem}>
                      <span style={styles.reviewLabel}>Total Keywords</span>
                      <span style={styles.reviewValue}>
                        {DEFAULT_CRISIS_KEYWORDS.length + customCrisisKeywords.length}
                      </span>
                    </div>
                  </div>
                </div>

                {/* AI Transparency */}
                <div style={styles.transparencySection}>
                  <div style={styles.transparencySectionHeader}>
                    <Eye size={18} color="#A855F7" />
                    <h4 style={styles.transparencySectionTitle}>AI Transparency</h4>
                    <span style={styles.transparencyBadge}>2026 AI Governance</span>
                  </div>
                  <p style={styles.transparencyDesc}>
                    Federal and state regulations require disclosure of AI systems used in
                    government operations. Review the model card and acknowledge governance protocols.
                  </p>

                  <button
                    onClick={() => setShowModelCardModal(true)}
                    style={styles.modelCardBtn}
                  >
                    <Eye size={16} />
                    View AI Model Card
                  </button>

                  <label style={styles.transparencyCheckboxLabel}>
                    <input
                      type="checkbox"
                      checked={acknowledgeAiGovernance}
                      onChange={(e) => setAcknowledgeAiGovernance(e.target.checked)}
                      style={styles.transparencyCheckbox}
                    />
                    <span style={styles.transparencyCheckboxText}>
                      I acknowledge the AI Governance and Human-in-the-Loop protocols.
                      <span style={styles.required}> *</span>
                    </span>
                  </label>
                </div>

                {/* Auto-Legislated Procurement — Resolution Drafter */}
                <div style={styles.resolutionSection}>
                  <div style={styles.resolutionHeader}>
                    <FileText size={18} color="#F59E0B" />
                    <h4 style={styles.resolutionSectionTitle}>Auto-Legislated Procurement</h4>
                    <span style={styles.resolutionBadge}>Council Ready</span>
                  </div>
                  <p style={styles.resolutionDesc}>
                    Generate a pre-drafted City Council resolution with all procurement data,
                    compliance certifications, and ROI projections auto-populated from your configuration.
                  </p>
                  <div style={styles.resolutionActions}>
                    <button
                      onClick={() => setShowResolutionModal(true)}
                      style={styles.draftResolutionBtn}
                    >
                      <Sparkles size={16} />
                      Draft City Council Resolution
                    </button>
                    <button
                      onClick={() => setShowPresentationModal(true)}
                      style={styles.presentationToggleBtn}
                    >
                      <Monitor size={16} />
                      Council Presentation Mode
                    </button>
                  </div>
                </div>

                {/* Transparency & Public Trust */}
                <div style={styles.transparencyPortalSection}>
                  <div style={styles.transparencyPortalHeader}>
                    <Eye size={18} color="#38BDF8" />
                    <h4 style={styles.transparencyPortalTitle}>Transparency &amp; Public Trust</h4>
                    <span style={styles.transparencyPortalBadge}>FOIA Ready</span>
                  </div>

                  {/* Public FOIA Link Card */}
                  <div style={styles.foiaCard}>
                    <div style={styles.foiaCardHeader}>
                      <Globe size={16} color="#38BDF8" />
                      <span style={styles.foiaCardTitle}>Public FOIA Link</span>
                    </div>
                    <p style={styles.foiaCardText}>
                      Your public-facing transparency link is being generated. Once your agent is live,
                      citizens can access AI decision-logs, routing audit trails, and bias reports
                      directly from your jurisdiction&apos;s transparency portal.
                    </p>
                    <div style={styles.foiaLinkPreview}>
                      <Globe size={13} color="#64748B" />
                      <span style={styles.foiaLinkUrl}>
                        https://{agencyName ? agencyName.toLowerCase().replace(/\s+/g, '-') : 'agency'}.gov/ai-transparency
                      </span>
                      <span style={styles.foiaLinkStatus}>Pending</span>
                    </div>
                    <button
                      onClick={() => setFoiaConfigured(true)}
                      style={{
                        ...styles.foiaConfigureBtn,
                        ...(foiaConfigured ? styles.foiaConfigureBtnDone : {}),
                      }}
                    >
                      {foiaConfigured ? (
                        <>
                          <Check size={15} />
                          Decision-Logs Configured
                        </>
                      ) : (
                        <>
                          <Key size={15} />
                          Configure Public Decision-Logs
                        </>
                      )}
                    </button>
                  </div>

                  {/* M-26-04 Compliance Label */}
                  <div style={styles.foiaComplianceNote}>
                    <Shield size={14} color="#22C55E" style={{ flexShrink: 0, marginTop: '1px' }} />
                    <span>
                      Enables self-serve citizen oversight as mandated by the 2026 Federal AI
                      Transparency Act. All AI decision-logs are retained per your state&apos;s
                      public records schedule and are FOIA-requestable by default.
                    </span>
                  </div>

                  {/* Export Decision Audit */}
                  <button
                    onClick={exportDecisionAuditCsv}
                    style={{
                      ...styles.exportAuditBtn,
                      ...(auditExported ? styles.exportAuditBtnDone : {}),
                    }}
                  >
                    {auditExported ? (
                      <>
                        <Check size={15} />
                        Decision Audit Exported
                      </>
                    ) : (
                      <>
                        <FileDown size={15} />
                        Download Full Decision Audit (.CSV)
                      </>
                    )}
                  </button>
                </div>

                {/* Non-Human Identity (NHI) Digital Credential */}
                <div style={styles.nhiSection}>
                  <div style={styles.nhiHeader}>
                    <Fingerprint size={18} color="#A78BFA" />
                    <h4 style={styles.nhiTitle}>Non-Human Identity Credential</h4>
                    <span style={styles.nhiBadgeDfars}>DFARS Compliant</span>
                  </div>

                  {/* Agent ID Display */}
                  <div style={styles.nhiIdCard}>
                    <div style={styles.nhiIdLabel}>Agent Identifier</div>
                    <div style={styles.nhiIdValue}>{agentNhiId}</div>
                    <div style={styles.nhiIdSub}>
                      SHA-256 derived &middot; Unique per contract &middot; Non-transferable
                    </div>
                  </div>

                  {/* Metadata Grid */}
                  <div style={styles.nhiMetaGrid}>
                    <div style={styles.nhiMetaItem}>
                      <div style={styles.nhiMetaLabel}>Date Commissioned</div>
                      <div style={styles.nhiMetaValue}>{commissionDate}</div>
                    </div>
                    <div style={styles.nhiMetaItem}>
                      <div style={styles.nhiMetaLabel}>Authorization Scope</div>
                      <div style={styles.nhiMetaValue}>Procurement</div>
                    </div>
                    <div style={styles.nhiMetaItem}>
                      <div style={styles.nhiMetaLabel}>Security Clearance</div>
                      <div style={{ ...styles.nhiMetaValue, display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Shield size={12} color="#22C55E" />
                        DFARS 252.204-7012
                      </div>
                    </div>
                    <div style={styles.nhiMetaItem}>
                      <div style={styles.nhiMetaLabel}>Infrastructure Target</div>
                      <div style={{ ...styles.nhiMetaValue, display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Lock size={12} color="#60A5FA" />
                        {infrastructureTarget === 'azure-gov-us' ? 'Azure Gov (US)' : 'Standard'}
                      </div>
                    </div>
                  </div>

                  {/* Compliance Frameworks */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                    <span style={{ fontSize: '10px', fontWeight: 700, color: '#94A3B8', letterSpacing: '0.08em' }}>COMPLIANCE FRAMEWORKS</span>
                    <InfoBubble
                      what="HIPAA Security Rule (45 CFR §164.312) — Requires encryption of PHI at rest (AES-256) and in transit (TLS 1.3). Administrative safeguards under §164.308 mandate audit controls and workforce training."
                      why="Per 45 CFR §160.404, civil penalties range from $100-$50,000 per violation (max $1.9M/category/year). Government agencies processing health data (911, social services) fall under Covered Entity definitions in 45 CFR §160.103."
                      missing="Without documented HIPAA Business Associate Agreement (BAA) and encryption verification, PHI-containing recordings violate 45 CFR §164.502(e) disclosure limitations."
                    />
                  </div>
                  <div style={styles.nhiFrameworks}>
                    {['StateRAMP', 'SOC 2 Type II', 'HIPAA', 'M-26-04'].map((fw) => (
                      <span key={fw} style={styles.nhiFrameworkTag}>{fw}</span>
                    ))}
                  </div>

                  {/* Download Machine-Identity JSON */}
                  <button
                    onClick={downloadMachineIdentityJson}
                    style={{
                      ...styles.nhiDownloadBtn,
                      ...(nhiDownloaded ? styles.nhiDownloadBtnDone : {}),
                    }}
                  >
                    {nhiDownloaded ? (
                      <>
                        <Check size={15} />
                        Machine-Identity JSON Exported
                      </>
                    ) : (
                      <>
                        <FileDown size={15} />
                        Download Agent Machine-Identity JSON
                      </>
                    )}
                  </button>
                  <p style={styles.nhiHint}>
                    Provide this file to your IT department for agent white-listing and network ACL configuration.
                  </p>

                  {/* Supervisor Check-In — 30-Day Human Re-authentication */}
                  <div style={{
                    ...styles.raioCheckInCard,
                    ...(isRaioExpired && lastRaioVerification ? styles.raioCheckInCardExpired : {}),
                  }}>
                    <div style={styles.raioCheckInHeader}>
                      <UserCheck size={16} color={isRaioExpired ? '#EF4444' : '#22C55E'} />
                      <span style={styles.raioCheckInTitle}>Supervisor Keep-Alive</span>
                      {lastRaioVerification ? (
                        <span style={{
                          ...styles.raioCheckInBadge,
                          ...(isRaioExpired ? styles.raioCheckInBadgeExpired : {}),
                        }}>
                          {isRaioExpired ? 'Expired' : 'Active'}
                        </span>
                      ) : (
                        <span style={styles.raioCheckInBadgePending}>Awaiting</span>
                      )}
                    </div>

                    {lastRaioVerification ? (
                      <div style={styles.raioCheckInMeta}>
                        <div style={styles.raioCheckInMetaRow}>
                          <span style={styles.raioCheckInMetaLabel}>Last Verified</span>
                          <span style={styles.raioCheckInMetaValue}>
                            {new Date(lastRaioVerification).toLocaleDateString('en-US', {
                              year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                            })}
                          </span>
                        </div>
                        <div style={styles.raioCheckInMetaRow}>
                          <span style={styles.raioCheckInMetaLabel}>Status</span>
                          <span style={{
                            ...styles.raioCheckInMetaValue,
                            color: isRaioExpired ? '#EF4444' : '#22C55E',
                            fontWeight: 700,
                          }}>
                            {isRaioExpired
                              ? `Expired ${raioVerificationAge - RAIO_EXPIRY_DAYS} day(s) ago — Agent SUSPENDED`
                              : `${raioDaysRemaining} day(s) remaining`}
                          </span>
                        </div>
                        {raioLedgerInfo && (
                          <>
                            <div style={styles.raioCheckInMetaRow}>
                              <span style={styles.raioCheckInMetaLabel}>RAIO</span>
                              <span style={styles.raioCheckInMetaValue}>{raioCheckInUserId}</span>
                            </div>
                            <div style={styles.raioCheckInMetaRow}>
                              <span style={styles.raioCheckInMetaLabel}>Merkle Root</span>
                              <span style={{ ...styles.raioCheckInMetaValue, fontFamily: 'monospace', fontSize: '11px' }}>
                                {raioLedgerInfo.merkle_root_hash.slice(0, 24)}…
                              </span>
                            </div>
                            <div style={styles.raioCheckInMetaRow}>
                              <span style={styles.raioCheckInMetaLabel}>Fingerprint</span>
                              <span style={{ ...styles.raioCheckInMetaValue, fontFamily: 'monospace', fontSize: '11px' }}>
                                {raioLedgerInfo.digital_fingerprint.slice(0, 24)}…
                              </span>
                            </div>
                            <div style={styles.raioCheckInMetaRow}>
                              <span style={styles.raioCheckInMetaLabel}>Ledger Entry</span>
                              <span style={{ ...styles.raioCheckInMetaValue, fontFamily: 'monospace', fontSize: '11px' }}>
                                {raioLedgerInfo.entry_id}
                              </span>
                            </div>
                          </>
                        )}
                      </div>
                    ) : (
                      <p style={styles.raioCheckInText}>
                        M-26-04 requires a human supervisor (RAIO) to verify agent authorization every 30 days.
                        No check-in has been recorded yet.
                      </p>
                    )}

                    {isRaioExpired && lastRaioVerification && (
                      <div style={styles.raioCheckInWarning}>
                        <AlertTriangle size={13} color="#EF4444" />
                        <span>Agent Suspended: Human Supervisor (RAIO) check-in required as per M-26-04. All tool executions are blocked until re-authenticated.</span>
                      </div>
                    )}

                    {/* RAIO Identity Input — binds check-in to a specific person */}
                    <div style={{ marginTop: '8px' }}>
                      <input
                        type="email"
                        value={raioCheckInUserId}
                        onChange={(e) => setRaioCheckInUserId(e.target.value)}
                        placeholder="RAIO email (e.g. officer@agency.gov)"
                        style={{
                          width: '100%',
                          padding: '8px 10px',
                          borderRadius: '6px',
                          border: '1px solid #334155',
                          background: '#0F172A',
                          color: '#E2E8F0',
                          fontSize: '13px',
                          fontFamily: 'monospace',
                          marginBottom: '8px',
                          outline: 'none',
                          boxSizing: 'border-box' as const,
                        }}
                      />
                    </div>

                    <button
                      onClick={handleSupervisorCheckIn}
                      disabled={!raioCheckInUserId.trim() || raioCheckInPending}
                      style={{
                        ...styles.raioCheckInBtn,
                        opacity: (!raioCheckInUserId.trim() || raioCheckInPending) ? 0.5 : 1,
                        cursor: (!raioCheckInUserId.trim() || raioCheckInPending) ? 'not-allowed' : 'pointer',
                      }}
                    >
                      <UserCheck size={15} />
                      {raioCheckInPending
                        ? 'Recording to Governance Ledger…'
                        : lastRaioVerification
                          ? 'Renew Supervisor Check-In'
                          : 'Perform Initial Supervisor Check-In'}
                    </button>
                  </div>
                </div>

                {/* Compliance & FOIA Management */}
                <div style={styles.complianceFoiaSection}>
                  <div style={styles.complianceFoiaHeader}>
                    <Shield size={18} color="#F472B6" />
                    <h4 style={styles.complianceFoiaTitle}>Compliance &amp; FOIA Management</h4>
                    <InfoBubble
                      what="Federal FOIA (5 U.S.C. §552) and state equivalents (e.g., Illinois FOIA 5 ILCS 140/) require disclosure of agency records. AI decision-logs qualify as 'agency records' under DOJ guidance (OIP 2023-01)."
                      why="5 U.S.C. §552(a)(3) mandates 20-day response windows. Local Records Act (50 ILCS 205/) requires 7-year retention for municipal records. Premature destruction violates 18 U.S.C. §1519 (obstruction) if litigation is anticipated."
                      missing="Without configured retention schedules aligned to your state's Local Records Act, AI logs may be destroyed before FOIA request windows close — exposing the agency to civil liability under Vaughn v. Rosen, 484 F.2d 820 (D.C. Cir. 1973)."
                    />
                    <span style={styles.complianceFoiaBadge}>Active</span>
                  </div>

                  {/* FOIA Redaction */}
                  <div style={styles.foiaRedactionCard}>
                    <div style={styles.foiaRedactionHeader}>
                      <Eye size={16} color="#F472B6" />
                      <span style={styles.foiaRedactionTitle}>FOIA &amp; Transparency</span>
                    </div>
                    <p style={styles.foiaRedactionText}>
                      Generate a public-safe version of all AI interaction logs with personally identifiable
                      information (PII) automatically redacted. Caller IDs, addresses, and personal details are
                      replaced with <code style={styles.foiaRedactionCode}>[REDACTED]</code> tokens before export.
                    </p>
                    <button
                      onClick={generateSanitizedLog}
                      style={{
                        ...styles.sanitizedLogBtn,
                        ...(sanitizedLogGenerated ? styles.sanitizedLogBtnDone : {}),
                      }}
                    >
                      {sanitizedLogGenerated ? (
                        <>
                          <Check size={15} />
                          Sanitized Log Generated
                        </>
                      ) : (
                        <>
                          <FileDown size={15} />
                          Generate Sanitized Public Log (Auto-Redact PII)
                        </>
                      )}
                    </button>
                  </div>

                  {/* Neutrality Health Sparkline */}
                  <div style={styles.driftCard}>
                    <div style={styles.driftCardHeader}>
                      <Activity size={16} color="#22C55E" />
                      <span style={styles.driftCardTitle}>Neutrality Health</span>
                      <span style={styles.driftHealthy}>Healthy</span>
                    </div>
                    <div style={styles.sparklineContainer}>
                      <svg
                        viewBox="0 0 270 50"
                        style={{ width: '100%', height: '50px' }}
                        preserveAspectRatio="none"
                      >
                        {/* Threshold line at 5% drift */}
                        <line x1="0" y1="12.5" x2="270" y2="12.5" stroke="rgba(239,68,68,0.2)" strokeWidth="1" strokeDasharray="4,3" />
                        {/* Sparkline */}
                        <polyline
                          fill="none"
                          stroke="#22C55E"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          points={DRIFT_SPARKLINE.map((v, i) => `${(i / (DRIFT_SPARKLINE.length - 1)) * 270},${50 - v * 1000}`).join(' ')}
                        />
                        {/* Area fill */}
                        <polygon
                          fill="rgba(34,197,94,0.08)"
                          points={`0,50 ${DRIFT_SPARKLINE.map((v, i) => `${(i / (DRIFT_SPARKLINE.length - 1)) * 270},${50 - v * 1000}`).join(' ')} 270,50`}
                        />
                      </svg>
                      <div style={styles.sparklineAxisRow}>
                        <span style={styles.sparklineAxisLabel}>28 days ago</span>
                        <span style={styles.sparklineAxisLabel}>Today</span>
                      </div>
                    </div>
                    <div style={styles.driftLabel}>
                      <Shield size={13} color="#22C55E" style={{ flexShrink: 0 }} />
                      <span>
                        <strong>M-26-04 Drift Analysis: 0.02% (Healthy).</strong>{' '}
                        Next Audit: Quarterly.
                      </span>
                    </div>
                  </div>

                  {/* Data Freshness Warning */}
                  {isBaselineStale && !mathRevalidated && (
                    <div style={styles.freshnessWarningCard}>
                      <div style={styles.freshnessWarningHeader}>
                        <AlertTriangle size={16} color="#F59E0B" />
                        <span style={styles.freshnessWarningTitle}>Data Freshness Alert</span>
                        <span style={styles.freshnessWarningBadge}>Stale</span>
                      </div>
                      <p style={styles.freshnessWarningText}>
                        WARNING: Regional Labor Index may be stale. Federal M-26-04 guidelines recommend
                        quarterly validation of staffing math. Baseline data is{' '}
                        <strong>{baselineStaleDays} days old</strong> (threshold: {STALE_THRESHOLD_DAYS} days).
                      </p>
                      <button
                        onClick={() => setMathRevalidated(true)}
                        style={styles.revalidateBtn}
                      >
                        <RefreshCw size={15} />
                        Re-Validate Math (RAIO Confirmation)
                      </button>
                    </div>
                  )}
                  {mathRevalidated && isBaselineStale && (
                    <div style={styles.freshnessRevalidatedCard}>
                      <div style={styles.freshnessRevalidatedHeader}>
                        <Check size={16} color="#22C55E" />
                        <span style={styles.freshnessRevalidatedTitle}>Math Re-Validated</span>
                        <span style={styles.freshnessRevalidatedBadge}>RAIO Confirmed</span>
                      </div>
                      <p style={styles.freshnessRevalidatedText}>
                        RAIO has re-confirmed the staffing math despite the data being {baselineStaleDays} days old.
                        Next quarterly validation due in {Math.max(0, 90 - (baselineStaleDays % 90))} days.
                      </p>
                    </div>
                  )}

                  {/* AI Decision Trace — Duty to Justify */}
                  <div style={styles.decisionTraceCard}>
                    <div style={styles.decisionTraceHeader}>
                      <ClipboardList size={16} color="#F472B6" />
                      <span style={styles.decisionTraceTitle}>AI Decision Trace</span>
                      <span style={styles.decisionTraceBadge}>Duty to Justify</span>
                    </div>
                    <p style={styles.decisionTraceText}>
                      All decisions are mapped to their specific training source and local ordinance
                      for 100% auditability.
                    </p>
                    <button
                      onClick={() => setShowDecisionTraceModal(true)}
                      style={styles.decisionTraceBtn}
                    >
                      <Eye size={15} />
                      View Sample Decision Trace
                    </button>
                  </div>

                  {/* RAIO Paging Toggle */}
                  <div style={styles.pagingCard}>
                    <div style={styles.pagingCardLeft}>
                      <div style={styles.pagingIconWrap}>
                        <Bell size={18} color={raioPagingEnabled ? '#F59E0B' : '#64748B'} />
                      </div>
                      <div>
                        <div style={styles.pagingTitle}>High-Risk Event Paging</div>
                        <div style={styles.pagingDesc}>
                          RAIO Emergency Alerts — Route critical AI escalations to designated accountability officers via SMS/email.
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => setRaioPagingEnabled(!raioPagingEnabled)}
                      style={{
                        ...styles.pagingToggle,
                        ...(raioPagingEnabled ? styles.pagingToggleOn : {}),
                      }}
                    >
                      <span
                        style={{
                          ...styles.pagingToggleKnob,
                          ...(raioPagingEnabled ? styles.pagingToggleKnobOn : {}),
                        }}
                      />
                    </button>
                  </div>
                  {raioPagingEnabled && (
                    <div style={styles.pagingActiveNote}>
                      <Check size={13} color="#22C55E" />
                      <span>RAIO paging active — Emergency escalations will trigger real-time alerts to your designated officers.</span>
                    </div>
                  )}

                  {/* AI Auditor Bot Settings */}
                  <div style={styles.auditorCard}>
                    <div style={styles.auditorHeader}>
                      <div style={styles.auditorHeaderLeft}>
                        <Bot size={16} color="#818CF8" />
                        <span style={styles.auditorTitle}>AI Auditor Settings</span>
                        <span style={styles.auditorBadge}>Oversight Bot</span>
                      </div>
                      <button
                        onClick={() => setAuditorBotEnabled(!auditorBotEnabled)}
                        style={{
                          ...styles.auditorToggle,
                          ...(auditorBotEnabled ? styles.auditorToggleOn : {}),
                        }}
                      >
                        <span
                          style={{
                            ...styles.auditorToggleKnob,
                            ...(auditorBotEnabled ? styles.auditorToggleKnobOn : {}),
                          }}
                        />
                      </button>
                    </div>
                    <p style={styles.auditorDesc}>
                      Enable automated weekly scans of the persistent audit log for high-confidence mismatches,
                      policy citation errors, and cost deviations against Baseline Set 1.
                    </p>

                    {auditorBotEnabled && (
                      <>
                        {/* Scan Status */}
                        <div style={styles.auditorStatusRow}>
                          <div style={styles.auditorStatusItem}>
                            <span style={styles.auditorStatusLabel}>Schedule</span>
                            <span style={styles.auditorStatusValue}>Weekly (Sunday 02:00 UTC)</span>
                          </div>
                          <div style={styles.auditorStatusItem}>
                            <span style={styles.auditorStatusLabel}>Last Scan</span>
                            <span style={styles.auditorStatusValue}>
                              {auditorLastScan
                                ? new Date(auditorLastScan).toLocaleDateString('en-US', {
                                  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                                })
                                : 'Not yet run'}
                            </span>
                          </div>
                          <div style={styles.auditorStatusItem}>
                            <span style={styles.auditorStatusLabel}>Log Source</span>
                            <span style={{ ...styles.auditorStatusValue, fontFamily: 'monospace', fontSize: '11px' }}>
                              data/audit/action_audit_log.ndjson
                            </span>
                          </div>
                        </div>

                        {/* Mock Findings Table */}
                        <div style={styles.auditorFindingsHeader}>
                          <span style={styles.auditorFindingsTitle}>Recent Findings ({AUDITOR_MOCK_FINDINGS.length})</span>
                        </div>
                        <div style={styles.auditorFindings}>
                          {AUDITOR_MOCK_FINDINGS.map((f) => (
                            <div key={f.id} style={styles.auditorFindingRow}>
                              <span style={{
                                ...styles.auditorSeverity,
                                ...(f.severity === 'High' ? styles.auditorSeverityHigh : {}),
                                ...(f.severity === 'Medium' ? styles.auditorSeverityMedium : {}),
                                ...(f.severity === 'Low' ? styles.auditorSeverityLow : {}),
                              }}>
                                {f.severity}
                              </span>
                              <div style={styles.auditorFindingContent}>
                                <div style={styles.auditorFindingDesc}>{f.description}</div>
                                <div style={styles.auditorFindingMeta}>
                                  <code style={styles.auditorFindingId}>{f.id}</code>
                                  <span style={styles.auditorFindingTool}>{f.tool}</span>
                                  <span style={styles.auditorFindingTime}>
                                    {new Date(f.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                  </span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* RAIO Weekly Digest Email */}
                        <div style={styles.auditorEmailSection}>
                          <label style={styles.auditorEmailLabel}>
                            RAIO Weekly Digest Email
                          </label>
                          <div style={styles.auditorEmailRow}>
                            <input
                              type="email"
                              placeholder="raio-oversight@agency.gov"
                              value={auditorDigestEmail}
                              onChange={(e) => setAuditorDigestEmail(e.target.value)}
                              style={styles.auditorEmailInput}
                            />
                            {auditorDigestEmail && auditorDigestEmail.includes('@') && (
                              <Check size={14} color="#22C55E" style={{ flexShrink: 0 }} />
                            )}
                          </div>
                          <span style={styles.auditorEmailHint}>
                            Findings are compiled into a weekly digest and sent to this address every Monday at 08:00 local.
                          </span>
                        </div>

                        {/* Manual Scan Button */}
                        <button
                          onClick={handleAuditorScan}
                          disabled={auditorScanRunning}
                          style={{
                            ...styles.auditorScanBtn,
                            ...(auditorScanRunning ? styles.auditorScanBtnRunning : {}),
                          }}
                        >
                          {auditorScanRunning ? (
                            <>
                              <RefreshCw size={15} style={{ animation: 'spin 1s linear infinite' }} />
                              Scanning Audit Log…
                            </>
                          ) : (
                            <>
                              <Bot size={15} />
                              Run Manual Scan Now
                            </>
                          )}
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Baseline Set 1 Upload */}
                <div style={styles.baselineSection}>
                  <div style={styles.baselineHeader}>
                    <Database size={18} color="#60A5FA" />
                    <h4 style={styles.baselineTitle}>
                      Baseline Set 1 — Data Ingestion
                      {baselineVersion > 0 && (
                        <span style={styles.policyVersionBadge}>v{baselineVersion}.0</span>
                      )}
                    </h4>
                    <span style={{
                      ...styles.baselineBadge,
                      ...(baselineStatus === 'valid' ? styles.baselineBadgeValid : {}),
                      ...(baselineStatus === 'error' ? styles.baselineBadgeError : {}),
                    }}>
                      {baselineStatus === 'idle' && 'Awaiting Upload'}
                      {baselineStatus === 'parsing' && 'Processing…'}
                      {baselineStatus === 'valid' && 'Verified'}
                      {baselineStatus === 'error' && 'Attention'}
                    </span>
                  </div>

                  <p style={styles.baselineDesc}>
                    Upload your municipality&apos;s current labor and policy baseline as a CSV file. The system
                    will extract <strong>Projected Labor Cost</strong>, <strong>FTE Count</strong>, and
                    all <strong>Policy/Ordinance</strong> references, then validate them against your
                    contract configuration.
                  </p>

                  {/* Upload Zone */}
                  <div
                    style={styles.baselineUploadZone}
                    onClick={() => baselineInputRef.current?.click()}
                  >
                    <input
                      ref={baselineInputRef as React.RefObject<HTMLInputElement>}
                      type="file"
                      accept=".csv"
                      onChange={handleBaselineUpload}
                      style={{ display: 'none' }}
                    />
                    {baselineFile ? (
                      <div style={styles.baselineFileInfo}>
                        <FileText size={20} color="#60A5FA" />
                        <div>
                          <div style={styles.baselineFileName}>{baselineFile.name}</div>
                          <div style={styles.baselineFileSize}>
                            {(baselineFile.size / 1024).toFixed(1)} KB
                          </div>
                        </div>
                        {baselineStatus === 'valid' && <Check size={18} color="#22C55E" />}
                        {baselineStatus === 'error' && <AlertTriangle size={18} color="#EF4444" />}
                      </div>
                    ) : (
                      <div style={styles.baselineUploadPrompt}>
                        <CloudUpload size={28} color="#475569" />
                        <span style={styles.baselineUploadText}>
                          Click to upload Baseline CSV
                        </span>
                        <span style={styles.baselineUploadHint}>
                          Required columns: Projected Labor Cost, FTE Count, Policy/Ordinance
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Validation Errors */}
                  {baselineErrors.length > 0 && (
                    <div style={styles.baselineErrorBox}>
                      {baselineErrors.map((err, i) => (
                        <div key={i} style={styles.baselineErrorRow}>
                          <AlertTriangle size={13} color="#EF4444" style={{ flexShrink: 0, marginTop: '1px' }} />
                          <span>{err}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Extracted Data Summary */}
                  {baselineExtracted && (
                    <div style={styles.baselineExtractedCard}>
                      <div style={styles.baselineExtractedHeader}>
                        <Check size={14} color="#22C55E" />
                        <span style={styles.baselineExtractedTitle}>Extracted Baseline Data</span>
                      </div>
                      <div style={styles.baselineExtractedGrid}>
                        <div style={styles.baselineExtractedItem}>
                          <div style={styles.baselineExtractedLabel}>Projected Labor Cost</div>
                          <div style={styles.baselineExtractedValue}>
                            ${baselineExtracted.laborCost.toLocaleString()}
                          </div>
                        </div>
                        <div style={styles.baselineExtractedItem}>
                          <div style={styles.baselineExtractedLabel}>FTE Count</div>
                          <div style={styles.baselineExtractedValue}>
                            {baselineExtracted.fteCount}
                          </div>
                        </div>
                        <div style={styles.baselineExtractedItem}>
                          <div style={styles.baselineExtractedLabel}>Ordinances Found</div>
                          <div style={styles.baselineExtractedValue}>
                            {baselineExtracted.ordinances.length}
                          </div>
                        </div>
                      </div>
                      {baselineExtracted.ordinances.length > 0 && (
                        <div style={styles.baselineOrdinanceList}>
                          {baselineExtracted.ordinances.map((ord, i) => (
                            <span key={i} style={styles.baselineOrdinanceTag}>{ord}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Policy Diff — shown on re-upload (version > 1) */}
                  {baselineDiff.length > 0 && baselineVersion > 1 && (
                    <div style={styles.policyDiffCard}>
                      <div style={styles.policyDiffHeader}>
                        <GitBranch size={14} color="#A78BFA" />
                        <span style={styles.policyDiffTitle}>
                          Policy Diff — v{baselineVersion - 1}.0 → v{baselineVersion}.0
                        </span>
                        <span style={styles.policyDiffBadge}>RECALIBRATED</span>
                      </div>

                      <div style={styles.policyDiffTable}>
                        <div style={styles.policyDiffTableHeader}>
                          <span style={styles.policyDiffColField}>Field</span>
                          <span style={styles.policyDiffColOld}>Previous</span>
                          <span style={styles.policyDiffColNew}>Updated</span>
                          <span style={styles.policyDiffColDir}>Δ</span>
                        </div>
                        {baselineDiff.map((d, i) => (
                          <div key={i} style={styles.policyDiffRow}>
                            <span style={styles.policyDiffCellField}>{d.field}</span>
                            <span style={styles.policyDiffCellOld}>{d.oldVal}</span>
                            <span style={styles.policyDiffCellNew}>{d.newVal}</span>
                            <span style={{
                              ...styles.policyDiffCellDir,
                              color: d.direction === 'up' ? '#EF4444' : d.direction === 'down' ? '#22C55E' : '#A78BFA',
                            }}>
                              {d.direction === 'up' ? '▲' : d.direction === 'down' ? '▼' : '◆'}
                            </span>
                          </div>
                        ))}
                      </div>

                      {baselinePrevHash && (
                        <div style={styles.policyDiffHashCompare}>
                          <span style={styles.policyDiffHashLabel}>Previous Hash:</span>
                          <code style={styles.policyDiffHashCode}>{baselinePrevHash.slice(0, 12)}…</code>
                          <span style={styles.policyDiffHashArrow}>→</span>
                          <span style={styles.policyDiffHashLabel}>New Hash:</span>
                          <code style={styles.policyDiffHashCode}>{baselineHash.slice(0, 12)}…</code>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Data Effective Date */}
                  {baselineExtracted && (
                    <div style={styles.effectiveDateRow}>
                      <label style={styles.effectiveDateLabel}>
                        <Clock size={13} color="#60A5FA" style={{ flexShrink: 0 }} />
                        Data Effective Date
                      </label>
                      <input
                        type="date"
                        value={dataEffectiveDate}
                        onChange={(e) => { setDataEffectiveDate(e.target.value); setMathRevalidated(false); }}
                        style={styles.effectiveDateInput}
                      />
                      {dataEffectiveDate && (
                        <span style={{
                          ...styles.effectiveDateHint,
                          ...(isBaselineStale ? { color: '#F59E0B' } : { color: '#22C55E' }),
                        }}>
                          {isBaselineStale
                            ? `${baselineStaleDays} days old — exceeds ${STALE_THRESHOLD_DAYS}-day threshold`
                            : `${baselineStaleDays} days old — within freshness window`}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Cryptographic Hash */}
                  {baselineHash && (
                    <div style={styles.baselineHashRow}>
                      <Lock size={13} color="#60A5FA" style={{ flexShrink: 0 }} />
                      <span style={styles.baselineHashLabel}>SHA-256:</span>
                      <code style={styles.baselineHashValue}>{baselineHash.slice(0, 16)}…{baselineHash.slice(-8)}</code>
                      <span style={styles.baselineHashLock}>
                        {baselineVersion > 1 ? 'Re-Hashed (Recalibrated)' : 'Cryptographically Locked'}
                      </span>
                    </div>
                  )}
                </div>

                {/* Validation Warning */}
                {!allStepsValid && !complianceBlocked && (
                  <div style={styles.validationWarning}>
                    <AlertTriangle size={16} color="#EF4444" />
                    <span>
                      Complete all required fields above before launching. Click any section in the sidebar to fix.
                    </span>
                  </div>
                )}

                {/* M-26-04 Compliance Block Warning (Headers OR Content) */}
                {complianceBlocked && (
                  <div style={{
                    ...styles.validationWarning,
                    background: '#FEF2F2',
                    border: '1px solid #FECACA',
                  }}>
                    <Shield size={16} color="#DC2626" />
                    <span style={{ color: '#991B1B' }}>
                      <strong>M-26-04 Compliance Hold:</strong>{' '}
                      {complianceResult && !complianceResult.passed
                        ? `Your baseline CSV is missing ${complianceResult.missing_fields.length} mandatory policy field(s).`
                        : contentResult && !contentResult.passed
                          ? `${contentResult.failures.length} field(s) contain invalid or placeholder data.`
                          : 'Compliance validation failed.'
                      }{' '}
                      <button
                        onClick={() => setShowComplianceModal(true)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#DC2626',
                          textDecoration: 'underline',
                          cursor: 'pointer',
                          padding: 0,
                          fontSize: 'inherit',
                          fontWeight: 600,
                        }}
                      >
                        View Details
                      </button>
                    </span>
                  </div>
                )}

                <div style={styles.cardFooter}>
                  <button onClick={handleBack} style={styles.secondaryBtn}>
                    <ChevronLeft size={18} />
                    Back
                  </button>
                  <button
                    onClick={handleFinish}
                    style={{
                      ...styles.launchBtn,
                      opacity: allStepsValid && !loading ? 1 : 0.5,
                      cursor: allStepsValid && !loading ? 'pointer' : 'not-allowed',
                    }}
                    disabled={!allStepsValid || loading}
                  >
                    {loading ? (
                      <>
                        <div style={styles.spinner} />
                        Launching Agent...
                      </>
                    ) : (
                      <>
                        Launch AI Agent
                        <ChevronRight size={18} />
                      </>
                    )}
                  </button>
                </div>
              </div>
  );
}
