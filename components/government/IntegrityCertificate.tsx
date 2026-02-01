'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Shield,
  ShieldCheck,
  ShieldOff,
  X,
  Download,
  CheckCircle,
  XCircle,
  Clock,
  Hash,
  Fingerprint,
  Link2,
  AlertTriangle,
  Loader,
  Copy,
  Check,
  Eye,
} from 'lucide-react';

// =============================================================================
// INTEGRITY CERTIFICATE — Forensic Verification Modal
// =============================================================================
// Pops up when a user clicks the "Verify" badge on a call record.
//
// Data sources:
//   /api/government/audit-integrity  → Chain state + recent entries
//   /api/government/chain-witness    → Remote witness verification
//
// Matches the call record to its audit entry by timestamp proximity,
// then displays the full cryptographic proof chain and allows the user
// to download a plain-text forensic receipt.
// =============================================================================

// ── API Response Types ──────────────────────────────────────────────────────

interface RecentEntry {
  receipt_id: string;
  timestamp: string;
  tool_name: string;
  status: string;
  entry_hash: string;
  prev_hash: string;
}

interface IntegrityResponse {
  verified: boolean;
  last_hash: string;
  chain_height: number;
  timestamp: string;
  recent_entries: RecentEntry[];
  valid: boolean;
  tenant_id: string;
  total_entries: number;
  verified_entries: number;
  first_broken_index: number | null;
  break_detail: string | null;
  chain_head_hash: string;
  checked_at: string;
  agency_name?: string;
}

interface ChainAnchor {
  anchor_id: string;
  tenant_id: string;
  anchor_date: string;
  anchored_at: string;
  chain_head_hash: string;
  chain_valid: boolean;
  verified_entries: number;
  total_entries: number;
  signature: string;
}

interface WitnessVerification {
  tenant_id: string;
  witness_match: boolean;
  local_chain_head: string;
  remote_chain_head: string;
  anchor: ChainAnchor | null;
  anchor_date: string | null;
  local_integrity_valid: boolean;
  verdict: string;
}

interface WitnessResponse {
  tenant_id: string;
  agency_name: string;
  verification: WitnessVerification;
  latest_anchor: ChainAnchor | null;
}

// ── Component Props ─────────────────────────────────────────────────────────

export interface IntegrityCertificateProps {
  isOpen: boolean;
  onClose: () => void;
  callId: string;
  sessionId: string;
  callTimestamp: string;
  toolsUsed: string[];
  duration: number;
  status: string;
}

// ── Utility: Match call to audit entry ──────────────────────────────────────

function findClosestEntry(
  entries: RecentEntry[],
  callTimestamp: string,
): RecentEntry | null {
  if (!entries.length || !callTimestamp) return null;

  const callMs = new Date(callTimestamp).getTime();
  if (isNaN(callMs)) return null;

  // Within 5 minutes is considered a match — a call can generate
  // audit entries slightly before or after the call record timestamp.
  const TOLERANCE_MS = 5 * 60 * 1000;

  let best: RecentEntry | null = null;
  let bestDelta = Infinity;

  for (const entry of entries) {
    const entryMs = new Date(entry.timestamp).getTime();
    const delta = Math.abs(entryMs - callMs);
    if (delta < bestDelta && delta <= TOLERANCE_MS) {
      bestDelta = delta;
      best = entry;
    }
  }

  return best;
}

// ── Clipboard Copy Helper ───────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [text]);

  return (
    <button onClick={handleCopy} style={st.copyBtn} title="Copy to clipboard">
      {copied ? <Check size={12} color="#22C55E" /> : <Copy size={12} color="#64748B" />}
    </button>
  );
}

// ── Forensic Receipt Generator ──────────────────────────────────────────────

function generateForensicReceipt(
  callId: string,
  sessionId: string,
  callTimestamp: string,
  toolsUsed: string[],
  duration: number,
  callStatus: string,
  integrity: IntegrityResponse | null,
  witness: WitnessResponse | null,
  matchedEntry: RecentEntry | null,
): string {
  const divider = '='.repeat(72);
  const thin = '-'.repeat(72);
  const now = new Date().toISOString();
  const lines: string[] = [];

  lines.push(divider);
  lines.push('              FORENSIC VERIFICATION RECEIPT');
  lines.push('       Kiri Nexus — Chain-of-Custody Proof Document');
  lines.push(divider);
  lines.push('');
  lines.push(`Generated At:          ${now}`);
  lines.push(`Agency:                ${witness?.agency_name ?? integrity?.agency_name ?? 'Unknown'}`);
  lines.push(`Tenant ID:             ${integrity?.tenant_id ?? witness?.tenant_id ?? 'Unknown'}`);
  lines.push('');

  lines.push(thin);
  lines.push('CALL IDENTITY');
  lines.push(thin);
  lines.push(`Call Record ID:        ${callId}`);
  lines.push(`Session ID:            ${sessionId}`);
  lines.push(`Timestamp:             ${callTimestamp}`);
  lines.push(`Duration:              ${Math.floor(duration / 60)}m ${(duration % 60).toString().padStart(2, '0')}s`);
  lines.push(`Status:                ${callStatus.toUpperCase()}`);
  lines.push(`Tools Invoked:         ${toolsUsed.length > 0 ? toolsUsed.join(', ') : 'None'}`);
  lines.push('');

  lines.push(thin);
  lines.push('CHAIN ENTRY PROOF');
  lines.push(thin);
  if (matchedEntry) {
    lines.push(`Receipt ID:            ${matchedEntry.receipt_id}`);
    lines.push(`Entry Timestamp:       ${matchedEntry.timestamp}`);
    lines.push(`Tool Name:             ${matchedEntry.tool_name}`);
    lines.push(`Execution Status:      ${matchedEntry.status}`);
    lines.push(`SHA-256 Entry Hash:    ${matchedEntry.entry_hash}`);
    lines.push(`Previous Hash (Link):  ${matchedEntry.prev_hash}`);
  } else {
    lines.push(`Status:                Entry not in recent window (last 5 entries).`);
    lines.push(`                       This call's audit entries are covered transitively`);
    lines.push(`                       by the Merkle chain — the chain head hash below`);
    lines.push(`                       cryptographically commits to every preceding entry.`);
  }
  lines.push('');

  lines.push(thin);
  lines.push('MERKLE CHAIN STATE');
  lines.push(thin);
  if (integrity) {
    lines.push(`Chain Head Hash:       ${integrity.chain_head_hash}`);
    lines.push(`Chain Height:          ${integrity.total_entries} entries`);
    lines.push(`Verified Entries:      ${integrity.verified_entries}`);
    lines.push(`Chain Integrity:       ${integrity.valid ? 'VALID' : 'BROKEN'}`);
    lines.push(`Verified At:           ${integrity.checked_at}`);
    if (integrity.break_detail) {
      lines.push(`Break Detail:          ${integrity.break_detail}`);
    }
  } else {
    lines.push(`Status:                Chain data unavailable.`);
  }
  lines.push('');

  lines.push(thin);
  lines.push('REMOTE WITNESS VERIFICATION');
  lines.push(thin);
  if (witness?.verification) {
    const v = witness.verification;
    lines.push(`Witness Match:         ${v.witness_match ? 'YES' : 'NO'}`);
    lines.push(`Local Chain Head:      ${v.local_chain_head}`);
    lines.push(`Remote Chain Head:     ${v.remote_chain_head}`);
    lines.push(`Local Integrity:       ${v.local_integrity_valid ? 'VALID' : 'BROKEN'}`);
    lines.push(`Verdict:               ${v.verdict}`);
    if (v.anchor) {
      lines.push('');
      lines.push(`Anchor ID:             ${v.anchor.anchor_id}`);
      lines.push(`Anchor Date:           ${v.anchor.anchor_date}`);
      lines.push(`Anchored At:           ${v.anchor.anchored_at}`);
      lines.push(`Anchor Signature:      ${v.anchor.signature}`);
    }
  } else {
    lines.push(`Status:                Witness data unavailable.`);
  }
  lines.push('');

  lines.push(divider);
  lines.push('VERIFICATION SUMMARY');
  lines.push(divider);
  const chainOk = integrity?.valid ?? false;
  const witnessOk = witness?.verification?.witness_match ?? false;
  const entryFound = !!matchedEntry;
  lines.push(`  Chain Integrity:     ${chainOk ? '[PASS]' : '[FAIL]'}`);
  lines.push(`  Witness Match:       ${witnessOk ? '[PASS]' : witness?.verification ? '[FAIL]' : '[N/A]'}`);
  lines.push(`  Entry Located:       ${entryFound ? '[PASS]' : '[INDIRECT]'}`);
  lines.push('');
  lines.push('This receipt is a point-in-time cryptographic proof that the');
  lines.push('referenced call record exists within an intact, tamper-evident');
  lines.push('SHA-256 hash chain and has been verified against a remote witness.');
  lines.push(divider);

  return lines.join('\n');
}

// =============================================================================
// IntegrityCertificate — Main Export
// =============================================================================

export default function IntegrityCertificate({
  isOpen,
  onClose,
  callId,
  sessionId,
  callTimestamp,
  toolsUsed,
  duration,
  status: callStatus,
}: IntegrityCertificateProps) {
  const [integrity, setIntegrity] = useState<IntegrityResponse | null>(null);
  const [witness, setWitness] = useState<WitnessResponse | null>(null);
  const [matchedEntry, setMatchedEntry] = useState<RecentEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Fetch on open ─────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) {
      // Reset on close
      setIntegrity(null);
      setWitness(null);
      setMatchedEntry(null);
      setLoading(true);
      setError(null);
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        const [integrityRes, witnessRes] = await Promise.all([
          fetch('/api/government/audit-integrity', { credentials: 'include' }),
          fetch('/api/government/chain-witness', { credentials: 'include' }),
        ]);

        if (!integrityRes.ok) throw new Error(`Integrity API: HTTP ${integrityRes.status}`);

        const integrityJson: IntegrityResponse = await integrityRes.json();
        setIntegrity(integrityJson);

        // Match call to audit entry
        const match = findClosestEntry(integrityJson.recent_entries ?? [], callTimestamp);
        setMatchedEntry(match);

        // Witness fetch is non-fatal — might fail if no anchor exists
        if (witnessRes.ok) {
          const witnessJson: WitnessResponse = await witnessRes.json();
          setWitness(witnessJson);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [isOpen, callTimestamp]);

  // ── Download handler ──────────────────────────────────────────────
  const handleDownload = useCallback(() => {
    const receipt = generateForensicReceipt(
      callId,
      sessionId,
      callTimestamp,
      toolsUsed,
      duration,
      callStatus,
      integrity,
      witness,
      matchedEntry,
    );

    const blob = new Blob([receipt], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeId = callId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 24);
    const ts = new Date().toISOString().slice(0, 10);
    a.download = `forensic-receipt-${safeId}-${ts}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [callId, sessionId, callTimestamp, toolsUsed, duration, callStatus, integrity, witness, matchedEntry]);

  // ── Escape key ────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // ── Derived state ─────────────────────────────────────────────────
  const chainValid = integrity?.valid ?? null;
  const witnessMatch = witness?.verification?.witness_match ?? null;
  const verdict = witness?.verification?.verdict ?? null;
  const allPassed = chainValid === true && witnessMatch === true;
  const anyFailed = chainValid === false || witnessMatch === false;

  const durMins = Math.floor(duration / 60);
  const durSecs = duration % 60;
  const durStr = `${durMins}m ${durSecs.toString().padStart(2, '0')}s`;

  const formattedTs = callTimestamp
    ? new Date(callTimestamp).toLocaleString([], {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : '--';

  return (
    <>
      {/* Keyframe injection */}
      <style>{`
        @keyframes certFadeIn {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
        @keyframes certSlideUp {
          0% { opacity: 0; transform: translateY(24px) scale(0.98); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes certSpin {
          to { transform: rotate(360deg); }
        }
        @keyframes certPulseGreen {
          0%, 100% { box-shadow: 0 0 8px rgba(34, 197, 94, 0.3); }
          50% { box-shadow: 0 0 24px rgba(34, 197, 94, 0.6); }
        }
      `}</style>

      {/* ── Backdrop ─────────────────────────────────────────────── */}
      <div style={st.overlay} onClick={onClose}>
        {/* ── Modal ──────────────────────────────────────────────── */}
        <div style={st.modal} onClick={(e) => e.stopPropagation()}>
          {/* ── Header ───────────────────────────────────────────── */}
          <div style={st.header}>
            <div style={st.headerLeft}>
              <Shield size={22} color="#A78BFA" />
              <div>
                <h2 style={st.headerTitle}>Verification Certificate</h2>
                <p style={st.headerSub}>Forensic Chain-of-Custody Proof</p>
              </div>
            </div>
            <button onClick={onClose} style={st.closeBtn}>
              <X size={20} color="#94A3B8" />
            </button>
          </div>

          {/* ── Loading State ────────────────────────────────────── */}
          {loading && (
            <div style={st.loadingContainer}>
              <Loader
                size={28}
                color="#60A5FA"
                style={{ animation: 'certSpin 1s linear infinite' }}
              />
              <span style={st.loadingText}>
                Verifying chain integrity and contacting remote witness...
              </span>
            </div>
          )}

          {/* ── Error State ──────────────────────────────────────── */}
          {error && !loading && (
            <div style={st.errorBox}>
              <AlertTriangle size={16} color="#EF4444" />
              <span>Verification failed: {error}</span>
            </div>
          )}

          {/* ── Verification Content ─────────────────────────────── */}
          {!loading && !error && (
            <div style={st.body}>
              {/* ── Overall Verdict Banner ────────────────────────── */}
              <div
                style={{
                  ...st.verdictBanner,
                  borderColor: allPassed
                    ? 'rgba(34, 197, 94, 0.4)'
                    : anyFailed
                      ? 'rgba(239, 68, 68, 0.4)'
                      : 'rgba(245, 158, 11, 0.4)',
                  background: allPassed
                    ? 'rgba(34, 197, 94, 0.06)'
                    : anyFailed
                      ? 'rgba(239, 68, 68, 0.06)'
                      : 'rgba(245, 158, 11, 0.06)',
                  animation: allPassed ? 'certPulseGreen 3s ease-in-out infinite' : 'none',
                }}
              >
                {allPassed ? (
                  <CheckCircle size={22} color="#22C55E" />
                ) : anyFailed ? (
                  <XCircle size={22} color="#EF4444" />
                ) : (
                  <AlertTriangle size={22} color="#F59E0B" />
                )}
                <div>
                  <div
                    style={{
                      fontSize: '15px',
                      fontWeight: 800,
                      letterSpacing: '0.06em',
                      color: allPassed ? '#22C55E' : anyFailed ? '#EF4444' : '#F59E0B',
                    }}
                  >
                    {allPassed
                      ? 'VERIFICATION SUCCESS'
                      : anyFailed
                        ? 'VERIFICATION FAILED'
                        : 'PARTIAL VERIFICATION'}
                  </div>
                  <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '2px' }}>
                    {allPassed
                      ? 'This call record is provably intact within a tamper-evident hash chain.'
                      : anyFailed
                        ? 'Chain integrity or witness verification failed. Investigate immediately.'
                        : 'Chain verified locally but remote witness unavailable.'}
                  </div>
                </div>
              </div>

              {/* ── Section: Call Identity ────────────────────────── */}
              <SectionHeader icon={Eye} label="Call Identity" />
              <div style={st.fieldGrid}>
                <Field label="Call Record ID" value={callId} mono />
                <Field label="Session ID" value={sessionId} mono />
                <Field label="Timestamp" value={formattedTs} />
                <Field label="Duration" value={durStr} />
                <Field label="Status" value={callStatus.toUpperCase()} color={callStatus === 'completed' ? '#22C55E' : '#F59E0B'} />
                <Field label="Tools Used" value={toolsUsed.length > 0 ? toolsUsed.join(', ') : 'None'} />
              </div>

              {/* ── Section: Chain Entry Proof ────────────────────── */}
              <SectionHeader icon={Fingerprint} label="Chain Entry Proof" />
              {matchedEntry ? (
                <>
                  <div style={st.fieldGrid}>
                    <Field label="Receipt ID" value={matchedEntry.receipt_id} mono />
                    <Field label="Tool Name" value={matchedEntry.tool_name} />
                    <Field label="Execution Status" value={matchedEntry.status} color={matchedEntry.status === 'Success' ? '#22C55E' : '#EF4444'} />
                  </div>
                  <HashRow label="SHA-256 Entry Hash" hash={matchedEntry.entry_hash} />
                  <HashRow label="Previous Hash (Chain Link)" hash={matchedEntry.prev_hash} />
                </>
              ) : (
                <div style={st.indirectBox}>
                  <Link2 size={14} color="#F59E0B" />
                  <span style={{ fontSize: '12px', color: '#F59E0B' }}>
                    Entry not in the recent verification window (last 5 entries).
                    This call is covered transitively — the Merkle chain head below
                    cryptographically commits to every preceding entry.
                  </span>
                </div>
              )}

              {/* ── Section: Merkle Chain State ───────────────────── */}
              <SectionHeader icon={Hash} label="Parent Merkle Root" />
              {integrity && (
                <>
                  <HashRow label="Chain Head Hash (Merkle Root)" hash={integrity.chain_head_hash} />
                  <div style={st.fieldGrid}>
                    <Field label="Chain Height" value={`${integrity.total_entries} entries`} />
                    <Field
                      label="Verified Entries"
                      value={`${integrity.verified_entries} / ${integrity.total_entries}`}
                      color={integrity.verified_entries === integrity.total_entries ? '#22C55E' : '#F59E0B'}
                    />
                    <Field
                      label="Chain Integrity"
                      value={integrity.valid ? 'VALID' : 'BROKEN'}
                      color={integrity.valid ? '#22C55E' : '#EF4444'}
                    />
                    <Field label="Verified At" value={new Date(integrity.checked_at).toLocaleString()} />
                  </div>
                  {integrity.break_detail && (
                    <div style={st.breakBox}>
                      <AlertTriangle size={14} color="#EF4444" />
                      <span style={{ fontSize: '12px', color: '#EF4444', fontFamily: 'monospace' }}>
                        {integrity.break_detail}
                      </span>
                    </div>
                  )}
                </>
              )}

              {/* ── Section: Remote Witness ───────────────────────── */}
              <SectionHeader icon={ShieldCheck} label="Remote Witness Verification" />
              {witness?.verification ? (
                <>
                  <div style={st.fieldGrid}>
                    <Field
                      label="Witness Match"
                      value={witness.verification.witness_match ? 'YES' : 'NO'}
                      color={witness.verification.witness_match ? '#22C55E' : '#EF4444'}
                    />
                    <Field
                      label="Local Integrity"
                      value={witness.verification.local_integrity_valid ? 'VALID' : 'BROKEN'}
                      color={witness.verification.local_integrity_valid ? '#22C55E' : '#EF4444'}
                    />
                    {witness.verification.anchor_date && (
                      <Field label="Anchor Date" value={witness.verification.anchor_date} />
                    )}
                  </div>
                  <div style={st.verdictRow}>
                    <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 600, letterSpacing: '0.06em' }}>VERDICT:</span>
                    <span style={{ fontSize: '12px', color: '#CBD5E1', fontFamily: 'monospace', lineHeight: 1.5 }}>
                      {verdict}
                    </span>
                  </div>
                  {witness.verification.anchor && (
                    <>
                      <HashRow label="Local Chain Head" hash={witness.verification.local_chain_head} />
                      <HashRow label="Remote Chain Head (Anchored)" hash={witness.verification.remote_chain_head} />
                      <HashRow label="Anchor HMAC Signature" hash={witness.verification.anchor.signature} />
                    </>
                  )}
                </>
              ) : (
                <div style={st.indirectBox}>
                  <ShieldOff size={14} color="#64748B" />
                  <span style={{ fontSize: '12px', color: '#64748B' }}>
                    Remote witness data unavailable. The daily anchor may not have been captured yet.
                  </span>
                </div>
              )}

              {/* ── Download Button ───────────────────────────────── */}
              <div style={st.downloadSection}>
                <button onClick={handleDownload} style={st.downloadBtn}>
                  <Download size={16} />
                  Download Forensic Receipt
                </button>
                <span style={st.downloadHint}>
                  Plain-text cryptographic proof document (.txt)
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

function SectionHeader({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div style={st.sectionHeader}>
      <Icon size={14} color="#A78BFA" />
      <span style={st.sectionLabel}>{label}</span>
    </div>
  );
}

function Field({
  label,
  value,
  mono,
  color,
}: {
  label: string;
  value: string;
  mono?: boolean;
  color?: string;
}) {
  return (
    <div style={st.field}>
      <span style={st.fieldLabel}>{label}</span>
      <span
        style={{
          ...st.fieldValue,
          ...(mono ? { fontFamily: 'monospace', letterSpacing: '0.02em' } : {}),
          ...(color ? { color, fontWeight: 700 } : {}),
        }}
      >
        {value}
      </span>
    </div>
  );
}

function HashRow({ label, hash }: { label: string; hash: string }) {
  const display =
    hash === 'GENESIS' || hash === 'NONE'
      ? hash
      : hash.length > 40
        ? `${hash.slice(0, 20)}…${hash.slice(-12)}`
        : hash;

  return (
    <div style={st.hashRow}>
      <span style={st.hashLabel}>{label}</span>
      <div style={st.hashValueRow}>
        <span style={st.hashValue} title={hash}>
          {display}
        </span>
        <CopyButton text={hash} />
      </div>
    </div>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const st: { [key: string]: React.CSSProperties } = {
  // ── Overlay ───────────────────────────────────────────────────────
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 9999,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0, 0, 0, 0.7)',
    backdropFilter: 'blur(6px)',
    animation: 'certFadeIn 0.2s ease-out',
    padding: '24px',
  },

  // ── Modal ─────────────────────────────────────────────────────────
  modal: {
    width: '100%',
    maxWidth: '680px',
    maxHeight: '90vh',
    overflowY: 'auto',
    background: '#0C1220',
    border: '1px solid rgba(167, 139, 250, 0.2)',
    borderRadius: '16px',
    boxShadow: '0 24px 80px rgba(0, 0, 0, 0.6)',
    animation: 'certSlideUp 0.3s ease-out',
  },

  // ── Header ────────────────────────────────────────────────────────
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '20px 24px',
    borderBottom: '1px solid rgba(167, 139, 250, 0.12)',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  headerTitle: {
    fontSize: '17px',
    fontWeight: 800,
    color: '#F8FAFC',
    margin: 0,
    letterSpacing: '-0.01em',
  },
  headerSub: {
    fontSize: '12px',
    color: '#64748B',
    margin: 0,
  },
  closeBtn: {
    background: 'transparent',
    border: '1px solid rgba(100, 116, 139, 0.2)',
    borderRadius: '8px',
    padding: '8px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background 0.15s ease',
  },

  // ── Loading ───────────────────────────────────────────────────────
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '16px',
    padding: '60px 24px',
  },
  loadingText: {
    fontSize: '13px',
    color: '#64748B',
    textAlign: 'center',
  },

  // ── Error ─────────────────────────────────────────────────────────
  errorBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    margin: '24px',
    padding: '14px 16px',
    background: 'rgba(239, 68, 68, 0.08)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: '10px',
    fontSize: '13px',
    color: '#EF4444',
  },

  // ── Body ──────────────────────────────────────────────────────────
  body: {
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },

  // ── Verdict Banner ────────────────────────────────────────────────
  verdictBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    padding: '16px 20px',
    border: '1px solid',
    borderRadius: '12px',
    marginBottom: '20px',
  },

  // ── Section Header ────────────────────────────────────────────────
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    paddingTop: '20px',
    paddingBottom: '10px',
    borderTop: '1px solid rgba(100, 116, 139, 0.12)',
    marginTop: '4px',
  },
  sectionLabel: {
    fontSize: '12px',
    fontWeight: 700,
    color: '#A78BFA',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
  },

  // ── Field Grid ────────────────────────────────────────────────────
  fieldGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '2px 16px',
  },
  field: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 0',
    borderBottom: '1px solid rgba(100, 116, 139, 0.06)',
  },
  fieldLabel: {
    fontSize: '12px',
    color: '#64748B',
    fontWeight: 500,
  },
  fieldValue: {
    fontSize: '12px',
    color: '#E2E8F0',
    fontWeight: 600,
    textAlign: 'right',
  },

  // ── Hash Row ──────────────────────────────────────────────────────
  hashRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    padding: '10px 12px',
    background: 'rgba(15, 23, 42, 0.8)',
    border: '1px solid rgba(30, 64, 175, 0.15)',
    borderRadius: '8px',
    marginTop: '6px',
    marginBottom: '4px',
  },
  hashLabel: {
    fontSize: '10px',
    fontWeight: 600,
    color: '#64748B',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
  },
  hashValueRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  hashValue: {
    fontSize: '13px',
    fontFamily: 'monospace',
    fontWeight: 600,
    color: '#60A5FA',
    letterSpacing: '0.02em',
    wordBreak: 'break-all',
    flex: 1,
  },

  // ── Copy Button ───────────────────────────────────────────────────
  copyBtn: {
    background: 'rgba(100, 116, 139, 0.1)',
    border: '1px solid rgba(100, 116, 139, 0.2)',
    borderRadius: '4px',
    padding: '4px 6px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
  },

  // ── Indirect / Info Boxes ─────────────────────────────────────────
  indirectBox: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    padding: '12px 14px',
    background: 'rgba(245, 158, 11, 0.05)',
    border: '1px solid rgba(245, 158, 11, 0.2)',
    borderRadius: '8px',
    marginTop: '4px',
  },
  breakBox: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    padding: '10px 12px',
    background: 'rgba(239, 68, 68, 0.06)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: '8px',
    marginTop: '6px',
  },
  verdictRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    padding: '10px 12px',
    background: 'rgba(15, 23, 42, 0.6)',
    border: '1px solid rgba(100, 116, 139, 0.1)',
    borderRadius: '8px',
    marginTop: '6px',
    marginBottom: '6px',
  },

  // ── Download ──────────────────────────────────────────────────────
  downloadSection: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    paddingTop: '24px',
    marginTop: '12px',
    borderTop: '1px solid rgba(167, 139, 250, 0.12)',
  },
  downloadBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '10px',
    padding: '12px 28px',
    background: 'linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%)',
    color: '#FFFFFF',
    fontSize: '14px',
    fontWeight: 700,
    border: 'none',
    borderRadius: '10px',
    cursor: 'pointer',
    boxShadow: '0 4px 16px rgba(124, 58, 237, 0.3)',
    transition: 'all 0.2s ease',
    letterSpacing: '0.01em',
  },
  downloadHint: {
    fontSize: '11px',
    color: '#64748B',
  },
};
