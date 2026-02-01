'use client';

import { useState, useEffect } from 'react';
import {
  Building2,
  Clock,
  Route,
  AlertTriangle,
  Save,
  Plus,
  Trash2,
  Power,
  Download,
  Shield,
  Loader2,
  CheckCircle,
  XCircle,
  Globe,
  ExternalLink,
  Copy,
} from 'lucide-react';
import { useGovAuth } from '@/context/GovAuthContext';

// ===========================================
// MOCK ROUTING RULES
// ===========================================
const INITIAL_ROUTING_RULES = [
  { id: 1, keyword: 'pothole', department: 'Public Works' },
  { id: 2, keyword: 'permit', department: 'Permits & Licensing' },
  { id: 3, keyword: 'water bill', department: 'Utilities' },
  { id: 4, keyword: 'park reservation', department: 'Parks & Recreation' },
  { id: 5, keyword: 'business license', department: 'City Clerk' },
];

const DEPARTMENTS = [
  'Public Works',
  'Permits & Licensing',
  'Utilities',
  'Parks & Recreation',
  'City Clerk',
  'Police (Non-Emergency)',
  'Fire (Non-Emergency)',
  'Mayor\'s Office',
];

const TIMEZONES = [
  'America/New_York (EST)',
  'America/Chicago (CST)',
  'America/Denver (MST)',
  'America/Los_Angeles (PST)',
  'America/Phoenix (MST - No DST)',
  'America/Anchorage (AKST)',
  'Pacific/Honolulu (HST)',
];

// ===========================================
// SECTION HEADER COMPONENT
// ===========================================
function SectionHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <div style={styles.sectionHeader}>
      <div style={styles.sectionIcon}>
        <Icon size={22} color="#60A5FA" />
      </div>
      <div>
        <h2 style={styles.sectionTitle}>{title}</h2>
        <p style={styles.sectionDesc}>{description}</p>
      </div>
    </div>
  );
}

// ===========================================
// MAIN PAGE COMPONENT
// ===========================================
export default function SettingsPage() {
  const { agency, user, isLoading } = useGovAuth();
  const [cityName, setCityName] = useState(agency.name || 'City of Springfield');
  const [timezone, setTimezone] = useState('America/Chicago (CST)');
  const [crisisMode, setCrisisMode] = useState(false);
  const [routingRules, setRoutingRules] = useState(INITIAL_ROUTING_RULES);
  const [newKeyword, setNewKeyword] = useState('');
  const [newDepartment, setNewDepartment] = useState(DEPARTMENTS[0]);

  // ── Sovereign Exit State ──
  const [archivePassphrase, setArchivePassphrase] = useState('');
  const [archiveStatus, setArchiveStatus] = useState<'idle' | 'exporting' | 'done' | 'error'>('idle');
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleteStatus, setDeleteStatus] = useState<'idle' | 'deleting' | 'done' | 'error'>('idle');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // ── Transparency Portal State ──
  const [transparencyEnabled, setTransparencyEnabled] = useState(false);
  const [transparencySlug, setTransparencySlug] = useState<string | null>(null);
  const [transparencyLoading, setTransparencyLoading] = useState(true);
  const [transparencyToggling, setTransparencyToggling] = useState(false);
  const [transparencyCopied, setTransparencyCopied] = useState(false);

  // Fetch current transparency settings on mount
  useEffect(() => {
    async function fetchTransparency() {
      try {
        const res = await fetch('/api/government/transparency-settings', {
          credentials: 'include',
        });
        if (res.ok) {
          const data = await res.json();
          setTransparencyEnabled(data.transparency_enabled);
          setTransparencySlug(data.transparency_slug);
        }
      } catch {
        // Silently fail — toggle will show as disabled
      } finally {
        setTransparencyLoading(false);
      }
    }
    fetchTransparency();
  }, []);

  const handleToggleTransparency = async () => {
    setTransparencyToggling(true);
    try {
      const res = await fetch('/api/government/transparency-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ enabled: !transparencyEnabled }),
      });
      if (res.ok) {
        const data = await res.json();
        setTransparencyEnabled(data.transparency_enabled);
        setTransparencySlug(data.transparency_slug);
      }
    } catch {
      // Silently fail
    } finally {
      setTransparencyToggling(false);
    }
  };

  const handleCopyTransparencyUrl = () => {
    if (!transparencySlug) return;
    const url = `${window.location.origin}/transparency/${transparencySlug}`;
    navigator.clipboard.writeText(url);
    setTransparencyCopied(true);
    setTimeout(() => setTransparencyCopied(false), 2000);
  };

  const handleAddRule = () => {
    if (newKeyword.trim()) {
      setRoutingRules([
        ...routingRules,
        {
          id: Date.now(),
          keyword: newKeyword.trim().toLowerCase(),
          department: newDepartment,
        },
      ]);
      setNewKeyword('');
    }
  };

  const handleDeleteRule = (id: number) => {
    setRoutingRules(routingRules.filter(rule => rule.id !== id));
  };

  const [saveConfirm, setSaveConfirm] = useState(false);

  const handleSave = () => {
    setSaveConfirm(true);
    setTimeout(() => setSaveConfirm(false), 3000);
  };

  // ── Sovereign Exit: Download Encrypted Archive ──
  const handleDownloadArchive = async () => {
    if (archivePassphrase.length < 8) {
      setArchiveError('Passphrase must be at least 8 characters.');
      return;
    }

    setArchiveStatus('exporting');
    setArchiveError(null);

    try {
      // Gather client-side localStorage data
      const baselineSet1 = localStorage.getItem('govBaselineSet1');
      const agentConfig = localStorage.getItem('govAgentConfig');
      const procurementData = localStorage.getItem('govProcurementData');

      const res = await fetch('/api/government/sovereign-exit/archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          passphrase: archivePassphrase,
          baseline_set1: baselineSet1 ? JSON.parse(baselineSet1) : null,
          agent_config: agentConfig ? JSON.parse(agentConfig) : null,
          procurement_data: procurementData ? JSON.parse(procurementData) : null,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Archive export failed.');
      }

      // Trigger download
      const blob = await res.blob();
      const filename =
        res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] ||
        'sovereign_archive.enc';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setArchiveStatus('done');
      setArchivePassphrase('');
    } catch (err) {
      setArchiveStatus('error');
      setArchiveError(err instanceof Error ? err.message : 'Export failed.');
    }
  };

  // ── Sovereign Exit: Request Permanent Deletion ──
  const handlePermanentDeletion = async () => {
    if (deleteConfirmation !== 'PERMANENTLY DELETE ALL DATA') {
      setDeleteError('Confirmation phrase does not match.');
      return;
    }

    setDeleteStatus('deleting');
    setDeleteError(null);

    try {
      const res = await fetch('/api/government/sovereign-exit/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirmation: 'PERMANENTLY DELETE ALL DATA',
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Deletion failed.');
      }

      // Download the HTML certificate
      const blob = await res.blob();
      const filename =
        res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] ||
        'certificate_of_destruction.html';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setDeleteStatus('done');
      setShowDeleteDialog(false);
      setDeleteConfirmation('');
    } catch (err) {
      setDeleteStatus('error');
      setDeleteError(err instanceof Error ? err.message : 'Deletion failed.');
    }
  };

  if (isLoading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.loadingSpinner} />
        <p style={styles.loadingText}>Loading settings...</p>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        {/* Header */}
        <div style={styles.header}>
          <h1 style={styles.title}>Settings</h1>
          <p style={styles.subtitle}>Configure your AI receptionist</p>
        </div>

        {/* Agency Profile */}
        <div style={styles.section}>
          <SectionHeader
            icon={Building2}
            title="Agency Profile"
            description="Basic information about your municipality"
          />
          <div style={styles.sectionContent}>
            <div style={styles.formRow}>
              <div style={styles.formGroup}>
                <label style={styles.label}>City / Agency Name</label>
                <input
                  type="text"
                  value={cityName}
                  onChange={(e) => setCityName(e.target.value)}
                  style={styles.input}
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Timezone</label>
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  style={styles.select}
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>{tz}</option>
                  ))}
                </select>
              </div>
            </div>
            <div style={styles.formRow}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Primary Contact</label>
                <input
                  type="text"
                  value={user.name}
                  disabled
                  style={{...styles.input, opacity: 0.6}}
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Role</label>
                <input
                  type="text"
                  value={user.role}
                  disabled
                  style={{...styles.input, opacity: 0.6}}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Routing Rules */}
        <div style={styles.section}>
          <SectionHeader
            icon={Route}
            title="Routing Rules"
            description="Define how calls are routed based on caller intent"
          />
          <div style={styles.sectionContent}>
            <div style={styles.rulesTable}>
              <div style={styles.rulesHeader}>
                <span style={styles.rulesHeaderCell}>If caller says...</span>
                <span style={styles.rulesHeaderCell}>Route to Department</span>
                <span style={{...styles.rulesHeaderCell, width: '60px'}}></span>
              </div>
              {routingRules.map((rule) => (
                <div key={rule.id} style={styles.ruleRow}>
                  <span style={styles.ruleKeyword}>&quot;{rule.keyword}&quot;</span>
                  <span style={styles.ruleDepartment}>{rule.department}</span>
                  <button
                    onClick={() => handleDeleteRule(rule.id)}
                    style={styles.deleteBtn}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>

            {/* Add New Rule */}
            <div style={styles.addRuleForm}>
              <input
                type="text"
                placeholder="Enter keyword..."
                value={newKeyword}
                onChange={(e) => setNewKeyword(e.target.value)}
                style={styles.addRuleInput}
              />
              <select
                value={newDepartment}
                onChange={(e) => setNewDepartment(e.target.value)}
                style={styles.addRuleSelect}
              >
                {DEPARTMENTS.map((dept) => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
              <button onClick={handleAddRule} style={styles.addRuleBtn}>
                <Plus size={18} />
                Add Rule
              </button>
            </div>
          </div>
        </div>

        {/* Emergency Override */}
        <div style={{...styles.section, borderColor: crisisMode ? 'rgba(239, 68, 68, 0.5)' : 'rgba(30, 64, 175, 0.2)'}}>
          <SectionHeader
            icon={AlertTriangle}
            title="Emergency Override"
            description="Activate crisis mode for emergency situations"
          />
          <div style={styles.sectionContent}>
            <div style={styles.crisisToggle}>
              <div style={styles.crisisInfo}>
                <div style={styles.crisisIcon}>
                  <Power size={24} color={crisisMode ? '#EF4444' : '#64748B'} />
                </div>
                <div>
                  <h3 style={{...styles.crisisTitle, color: crisisMode ? '#EF4444' : '#F8FAFC'}}>
                    Crisis Mode {crisisMode ? 'ACTIVE' : 'Inactive'}
                  </h3>
                  <p style={styles.crisisDesc}>
                    When enabled, all calls will hear an emergency greeting before being routed to the appropriate department.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setCrisisMode(!crisisMode)}
                style={{
                  ...styles.toggleBtn,
                  background: crisisMode ? '#EF4444' : 'rgba(30, 64, 175, 0.2)',
                }}
              >
                <span style={{
                  ...styles.toggleSwitch,
                  transform: crisisMode ? 'translateX(24px)' : 'translateX(0)',
                }} />
              </button>
            </div>
            {crisisMode && (
              <div style={styles.crisisWarning}>
                <AlertTriangle size={18} color="#EF4444" />
                <span>Crisis mode is active. All callers will hear the emergency greeting.</span>
              </div>
            )}
          </div>
        </div>

        {/* Public Transparency Portal */}
        <div style={{...styles.section, borderColor: transparencyEnabled ? 'rgba(34, 197, 94, 0.3)' : 'rgba(30, 64, 175, 0.2)'}}>
          <SectionHeader
            icon={Globe}
            title="Public Transparency Portal"
            description="Publish sanitized logs for citizen verification"
          />
          <div style={styles.sectionContent}>
            <div style={styles.crisisToggle}>
              <div style={styles.crisisInfo}>
                <div style={{
                  ...styles.crisisIcon,
                  background: transparencyEnabled
                    ? 'rgba(34, 197, 94, 0.1)'
                    : 'rgba(30, 64, 175, 0.1)',
                }}>
                  <Globe size={24} color={transparencyEnabled ? '#22C55E' : '#64748B'} />
                </div>
                <div>
                  <h3 style={{
                    ...styles.crisisTitle,
                    color: transparencyEnabled ? '#22C55E' : '#F8FAFC',
                  }}>
                    {transparencyLoading
                      ? 'Loading...'
                      : transparencyEnabled
                        ? 'Portal Active'
                        : 'Portal Disabled'}
                  </h3>
                  <p style={styles.crisisDesc}>
                    When enabled, a public URL serves a PII-redacted view of your audit log.
                    Citizens can verify AI actions without accessing private data.
                  </p>
                </div>
              </div>
              <button
                onClick={handleToggleTransparency}
                disabled={transparencyLoading || transparencyToggling}
                style={{
                  ...styles.toggleBtn,
                  background: transparencyEnabled
                    ? '#22C55E'
                    : 'rgba(30, 64, 175, 0.2)',
                  opacity: transparencyLoading || transparencyToggling ? 0.5 : 1,
                  cursor: transparencyLoading || transparencyToggling ? 'not-allowed' : 'pointer',
                }}
              >
                <span style={{
                  ...styles.toggleSwitch,
                  transform: transparencyEnabled ? 'translateX(24px)' : 'translateX(0)',
                }} />
              </button>
            </div>

            {/* Public URL Display */}
            {transparencyEnabled && transparencySlug && (
              <div style={{
                marginTop: '20px',
                padding: '16px',
                background: 'rgba(34, 197, 94, 0.06)',
                border: '1px solid rgba(34, 197, 94, 0.2)',
                borderRadius: '10px',
              }}>
                <div style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#22C55E',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: '10px',
                }}>
                  Public URL
                </div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                }}>
                  <code style={{
                    flex: 1,
                    padding: '10px 14px',
                    background: 'rgba(15, 23, 42, 0.6)',
                    border: '1px solid rgba(34, 197, 94, 0.2)',
                    borderRadius: '8px',
                    fontSize: '13px',
                    color: '#86EFAC',
                    fontFamily: 'monospace',
                  }}>
                    {typeof window !== 'undefined' ? window.location.origin : ''}/transparency/{transparencySlug}
                  </code>
                  <button
                    onClick={handleCopyTransparencyUrl}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '10px 14px',
                      background: transparencyCopied ? 'rgba(34, 197, 94, 0.15)' : 'rgba(30, 64, 175, 0.2)',
                      border: `1px solid ${transparencyCopied ? 'rgba(34, 197, 94, 0.3)' : 'rgba(30, 64, 175, 0.3)'}`,
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: transparencyCopied ? '#22C55E' : '#60A5FA',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap' as const,
                    }}
                  >
                    {transparencyCopied ? (
                      <>
                        <CheckCircle size={14} />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy size={14} />
                        Copy
                      </>
                    )}
                  </button>
                  <a
                    href={`/transparency/${transparencySlug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '10px 14px',
                      background: 'rgba(30, 64, 175, 0.2)',
                      border: '1px solid rgba(30, 64, 175, 0.3)',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: '#60A5FA',
                      textDecoration: 'none',
                      whiteSpace: 'nowrap' as const,
                    }}
                  >
                    <ExternalLink size={14} />
                    Open
                  </a>
                </div>
                <p style={{
                  fontSize: '12px',
                  color: '#64748B',
                  margin: '10px 0 0',
                  lineHeight: '1.5',
                }}>
                  All personally identifiable information (names, phone numbers, addresses, emails)
                  is automatically redacted. Only receipt IDs, timestamps, tool names, outcomes, and
                  hash proofs are visible.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Sovereign Exit — Data Portability */}
        <div style={{...styles.section, borderColor: 'rgba(30, 64, 175, 0.2)'}}>
          <SectionHeader
            icon={Shield}
            title="Sovereign Exit"
            description="Export your data or permanently delete your agency silo"
          />
          <div style={styles.sectionContent}>
            {/* Download Agency Archive */}
            <div style={styles.exitBlock}>
              <div style={styles.exitBlockHeader}>
                <Download size={20} color="#60A5FA" />
                <div>
                  <h3 style={styles.exitBlockTitle}>Download Agency Archive</h3>
                  <p style={styles.exitBlockDesc}>
                    Export your entire audit log, Set 1 baseline, and agent configuration
                    into a single AES-256-GCM encrypted archive. You will set a passphrase
                    — keep it safe, as it cannot be recovered.
                  </p>
                </div>
              </div>
              <div style={styles.exitForm}>
                <input
                  type="password"
                  placeholder="Encryption passphrase (min 8 characters)"
                  value={archivePassphrase}
                  onChange={(e) => {
                    setArchivePassphrase(e.target.value);
                    setArchiveError(null);
                  }}
                  style={styles.input}
                  disabled={archiveStatus === 'exporting'}
                />
                <button
                  onClick={handleDownloadArchive}
                  disabled={archiveStatus === 'exporting'}
                  style={{
                    ...styles.exitBtn,
                    opacity: archiveStatus === 'exporting' ? 0.6 : 1,
                    cursor: archiveStatus === 'exporting' ? 'not-allowed' : 'pointer',
                  }}
                >
                  {archiveStatus === 'exporting' ? (
                    <>
                      <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                      Exporting...
                    </>
                  ) : archiveStatus === 'done' ? (
                    <>
                      <CheckCircle size={16} color="#22C55E" />
                      Archive Downloaded
                    </>
                  ) : (
                    <>
                      <Download size={16} />
                      Download Archive
                    </>
                  )}
                </button>
              </div>
              {archiveError && (
                <div style={styles.exitError}>
                  <XCircle size={16} color="#EF4444" />
                  <span>{archiveError}</span>
                </div>
              )}
              {archiveStatus === 'done' && (
                <div style={styles.exitSuccess}>
                  <CheckCircle size={16} color="#22C55E" />
                  <span>Encrypted archive downloaded successfully. Store the file and passphrase securely.</span>
                </div>
              )}
            </div>

            {/* Divider */}
            <div style={styles.exitDivider} />

            {/* Request Permanent Deletion */}
            <div style={styles.exitBlock}>
              <div style={styles.exitBlockHeader}>
                <Trash2 size={20} color="#EF4444" />
                <div>
                  <h3 style={{...styles.exitBlockTitle, color: '#FCA5A5'}}>Request Permanent Deletion</h3>
                  <p style={styles.exitBlockDesc}>
                    Irrevocably destroy all data in your agency&apos;s audit silo. A signed
                    Certificate of Data Destruction will be issued for your records.
                    This action cannot be undone.
                  </p>
                </div>
              </div>

              {deleteStatus === 'done' ? (
                <div style={styles.exitSuccess}>
                  <CheckCircle size={16} color="#22C55E" />
                  <span>All data has been permanently destroyed. Your Certificate of Data Destruction has been downloaded.</span>
                </div>
              ) : !showDeleteDialog ? (
                <button
                  onClick={() => setShowDeleteDialog(true)}
                  style={styles.deleteTriggerBtn}
                >
                  <Trash2 size={16} />
                  Request Permanent Deletion
                </button>
              ) : (
                <div style={styles.deleteDialog}>
                  <div style={styles.deleteWarning}>
                    <AlertTriangle size={20} color="#EF4444" />
                    <span>
                      This will permanently delete all audit logs, archived files, and
                      compliance data for your agency. This cannot be reversed.
                    </span>
                  </div>
                  <label style={{...styles.label, marginTop: '16px'}}>
                    Type <span style={{fontFamily: 'monospace', color: '#EF4444'}}>PERMANENTLY DELETE ALL DATA</span> to confirm:
                  </label>
                  <input
                    type="text"
                    value={deleteConfirmation}
                    onChange={(e) => {
                      setDeleteConfirmation(e.target.value);
                      setDeleteError(null);
                    }}
                    placeholder="PERMANENTLY DELETE ALL DATA"
                    style={{...styles.input, borderColor: 'rgba(239, 68, 68, 0.3)'}}
                    disabled={deleteStatus === 'deleting'}
                  />
                  <div style={styles.deleteActions}>
                    <button
                      onClick={() => {
                        setShowDeleteDialog(false);
                        setDeleteConfirmation('');
                        setDeleteError(null);
                      }}
                      style={styles.deleteCancelBtn}
                      disabled={deleteStatus === 'deleting'}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handlePermanentDeletion}
                      disabled={deleteStatus === 'deleting' || deleteConfirmation !== 'PERMANENTLY DELETE ALL DATA'}
                      style={{
                        ...styles.deleteConfirmBtn,
                        opacity: deleteStatus === 'deleting' || deleteConfirmation !== 'PERMANENTLY DELETE ALL DATA' ? 0.5 : 1,
                        cursor: deleteStatus === 'deleting' || deleteConfirmation !== 'PERMANENTLY DELETE ALL DATA' ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {deleteStatus === 'deleting' ? (
                        <>
                          <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                          Destroying...
                        </>
                      ) : (
                        <>
                          <Trash2 size={16} />
                          Destroy All Data
                        </>
                      )}
                    </button>
                  </div>
                  {deleteError && (
                    <div style={styles.exitError}>
                      <XCircle size={16} color="#EF4444" />
                      <span>{deleteError}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div style={styles.actions}>
          <button onClick={handleSave} style={styles.saveBtn}>
            {saveConfirm ? <CheckCircle size={18} /> : <Save size={18} />}
            {saveConfirm ? 'Saved' : 'Save Changes'}
          </button>
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
    maxWidth: '900px',
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
    border: '3px solid rgba(30, 64, 175, 0.2)',
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
  section: {
    background: 'rgba(15, 23, 42, 0.6)',
    border: '1px solid rgba(30, 64, 175, 0.2)',
    borderRadius: '16px',
    marginBottom: '24px',
    overflow: 'hidden',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '20px 24px',
    borderBottom: '1px solid rgba(30, 64, 175, 0.2)',
    background: 'rgba(15, 23, 42, 0.4)',
  },
  sectionIcon: {
    width: '48px',
    height: '48px',
    background: 'rgba(30, 64, 175, 0.15)',
    borderRadius: '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: '18px',
    fontWeight: 700,
    color: '#F8FAFC',
    margin: '0 0 4px 0',
  },
  sectionDesc: {
    fontSize: '13px',
    color: '#64748B',
    margin: 0,
  },
  sectionContent: {
    padding: '24px',
  },
  formRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '20px',
    marginBottom: '20px',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  label: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#94A3B8',
  },
  input: {
    padding: '12px 16px',
    background: 'rgba(15, 23, 42, 0.6)',
    border: '1px solid rgba(30, 64, 175, 0.3)',
    borderRadius: '10px',
    fontSize: '14px',
    color: '#F8FAFC',
    outline: 'none',
  },
  select: {
    padding: '12px 16px',
    background: 'rgba(15, 23, 42, 0.6)',
    border: '1px solid rgba(30, 64, 175, 0.3)',
    borderRadius: '10px',
    fontSize: '14px',
    color: '#F8FAFC',
    outline: 'none',
    cursor: 'pointer',
  },
  rulesTable: {
    marginBottom: '20px',
  },
  rulesHeader: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 60px',
    gap: '16px',
    padding: '12px 16px',
    background: 'rgba(30, 64, 175, 0.1)',
    borderRadius: '10px 10px 0 0',
  },
  rulesHeaderCell: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  ruleRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 60px',
    gap: '16px',
    padding: '14px 16px',
    borderBottom: '1px solid rgba(30, 64, 175, 0.1)',
    alignItems: 'center',
  },
  ruleKeyword: {
    fontSize: '14px',
    color: '#60A5FA',
    fontFamily: 'monospace',
  },
  ruleDepartment: {
    fontSize: '14px',
    color: '#F8FAFC',
  },
  deleteBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '36px',
    height: '36px',
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.2)',
    borderRadius: '8px',
    color: '#EF4444',
    cursor: 'pointer',
  },
  addRuleForm: {
    display: 'flex',
    gap: '12px',
  },
  addRuleInput: {
    flex: 1,
    padding: '12px 16px',
    background: 'rgba(15, 23, 42, 0.6)',
    border: '1px solid rgba(30, 64, 175, 0.3)',
    borderRadius: '10px',
    fontSize: '14px',
    color: '#F8FAFC',
    outline: 'none',
  },
  addRuleSelect: {
    padding: '12px 16px',
    background: 'rgba(15, 23, 42, 0.6)',
    border: '1px solid rgba(30, 64, 175, 0.3)',
    borderRadius: '10px',
    fontSize: '14px',
    color: '#F8FAFC',
    outline: 'none',
    cursor: 'pointer',
    minWidth: '180px',
  },
  addRuleBtn: {
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
    whiteSpace: 'nowrap',
  },
  crisisToggle: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  crisisInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  crisisIcon: {
    width: '56px',
    height: '56px',
    background: 'rgba(239, 68, 68, 0.1)',
    borderRadius: '14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  crisisTitle: {
    fontSize: '16px',
    fontWeight: 700,
    margin: '0 0 4px 0',
  },
  crisisDesc: {
    fontSize: '13px',
    color: '#94A3B8',
    margin: 0,
    maxWidth: '400px',
  },
  toggleBtn: {
    width: '56px',
    height: '32px',
    borderRadius: '16px',
    border: 'none',
    cursor: 'pointer',
    position: 'relative',
    transition: 'background 0.2s ease',
  },
  toggleSwitch: {
    position: 'absolute',
    top: '4px',
    left: '4px',
    width: '24px',
    height: '24px',
    background: '#fff',
    borderRadius: '50%',
    transition: 'transform 0.2s ease',
  },
  crisisWarning: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginTop: '20px',
    padding: '16px',
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: '10px',
    fontSize: '14px',
    color: '#FCA5A5',
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    marginTop: '8px',
  },
  saveBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '14px 28px',
    background: '#1E40AF',
    border: 'none',
    borderRadius: '10px',
    fontSize: '15px',
    fontWeight: 600,
    color: '#fff',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },

  // ── Sovereign Exit Styles ──
  exitBlock: {
    marginBottom: '8px',
  },
  exitBlockHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '14px',
    marginBottom: '16px',
  },
  exitBlockTitle: {
    fontSize: '15px',
    fontWeight: 700,
    color: '#F8FAFC',
    margin: '0 0 4px 0',
  },
  exitBlockDesc: {
    fontSize: '13px',
    color: '#94A3B8',
    margin: 0,
    lineHeight: '1.5',
    maxWidth: '560px',
  },
  exitForm: {
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
  },
  exitBtn: {
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
    whiteSpace: 'nowrap' as const,
    transition: 'all 0.2s ease',
  },
  exitError: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginTop: '12px',
    padding: '12px 16px',
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: '8px',
    fontSize: '13px',
    color: '#FCA5A5',
  },
  exitSuccess: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginTop: '12px',
    padding: '12px 16px',
    background: 'rgba(34, 197, 94, 0.1)',
    border: '1px solid rgba(34, 197, 94, 0.3)',
    borderRadius: '8px',
    fontSize: '13px',
    color: '#86EFAC',
  },
  exitDivider: {
    height: '1px',
    background: 'rgba(30, 64, 175, 0.2)',
    margin: '24px 0',
  },
  deleteTriggerBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 20px',
    background: 'rgba(239, 68, 68, 0.15)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: '10px',
    fontSize: '14px',
    fontWeight: 600,
    color: '#EF4444',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  deleteDialog: {
    padding: '20px',
    background: 'rgba(239, 68, 68, 0.05)',
    border: '1px solid rgba(239, 68, 68, 0.2)',
    borderRadius: '12px',
  },
  deleteWarning: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    padding: '14px 16px',
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: '10px',
    fontSize: '13px',
    color: '#FCA5A5',
    lineHeight: '1.5',
  },
  deleteActions: {
    display: 'flex',
    gap: '12px',
    marginTop: '16px',
    justifyContent: 'flex-end',
  },
  deleteCancelBtn: {
    padding: '10px 20px',
    background: 'rgba(15, 23, 42, 0.6)',
    border: '1px solid rgba(30, 64, 175, 0.3)',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 600,
    color: '#94A3B8',
    cursor: 'pointer',
  },
  deleteConfirmBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 20px',
    background: '#DC2626',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 600,
    color: '#fff',
    transition: 'all 0.2s ease',
  },
};
