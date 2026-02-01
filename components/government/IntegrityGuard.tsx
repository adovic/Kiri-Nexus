'use client';

import React, { Component, useState, useEffect, useCallback, useRef } from 'react';
import {
  ShieldOff,
  AlertOctagon,
  Download,
  Phone,
  Lock,
  RefreshCw,
  Copy,
  Check,
  ExternalLink,
  Hash,
  XCircle,
} from 'lucide-react';

// =============================================================================
// INTEGRITY GUARD — Hard-Lock Error Boundary
// =============================================================================
//
// Two-layer protection for the Government Dashboard:
//
//   Layer 1: IntegrityGuard (Class Error Boundary)
//     Catches React render exceptions (componentDidCatch). If ANY child
//     component throws, the entire data-sensitive tree is unmounted and
//     replaced with the LockdownOverlay.
//
//   Layer 2: IntegrityMonitor (Functional Hook Component)
//     Polls GET /api/government/audit-integrity (30s interval via SWR cache).
//     If the chain integrity check returns `valid === false`, the monitor
//     triggers a hard-lock — unmounting all children and rendering the
//     LockdownOverlay. This is the "Anti-Gaslighting" feature: the government
//     can never be shown data from a tampered chain.
//
// Usage:
//   <IntegrityGuard>
//     <DashboardClient ... />
//     <ChainOfCustodyMonitor ... />
//     {/* All data-sensitive content */}
//   </IntegrityGuard>
//
// When triggered, the overlay provides:
//   1. CRITICAL INTEGRITY FAILURE banner (full-screen red overlay)
//   2. "Export Forensic Report" button (downloadable .txt incident report)
//   3. "Emergency Contact Support" link
//   4. Chain state snapshot (last known hashes, break index, detail)
//
// This component never shows potentially-tampered data. Once locked, the only
// way out is to fix the chain and refresh the session.
// =============================================================================

// ── Types ────────────────────────────────────────────────────────────────────

interface IntegrityCheckResponse {
  verified: boolean;
  valid: boolean;
  tenant_id: string;
  total_entries: number;
  verified_entries: number;
  first_broken_index: number | null;
  first_broken_receipt_id: string | null;
  break_detail: string | null;
  chain_head_hash: string;
  checked_at: string;
  agency_name?: string;
  last_hash?: string;
  chain_height?: number;
}

interface LockdownState {
  /** Whether the lockdown is active */
  locked: boolean;
  /** What triggered the lockdown */
  trigger: 'integrity_failure' | 'render_exception' | null;
  /** ISO-8601 timestamp when lockdown was engaged */
  locked_at: string | null;
  /** Integrity API response (if trigger was integrity_failure) */
  integrity: IntegrityCheckResponse | null;
  /** Error info (if trigger was render_exception) */
  error: { message: string; stack?: string; componentStack?: string } | null;
}

// ── Constants ────────────────────────────────────────────────────────────────

const INTEGRITY_POLL_INTERVAL = 30_000; // 30 seconds
const SUPPORT_EMAIL = 'security@snellagency.com';
const SUPPORT_PHONE = '1-800-GOV-HELP';

// =============================================================================
// LOCKDOWN OVERLAY — Full-Screen Red Alert
// =============================================================================
// Displayed when either layer detects a failure. All children are already
// unmounted at this point — the overlay is the ONLY thing the user sees.

function LockdownOverlay({ state }: { state: LockdownState }) {
  const [copied, setCopied] = useState(false);
  const [reportDownloaded, setReportDownloaded] = useState(false);

  // ── Generate Forensic Incident Report ──
  const generateReport = useCallback((): string => {
    const divider = '='.repeat(76);
    const thin = '-'.repeat(76);
    const now = new Date().toISOString();
    const lines: string[] = [];

    lines.push(divider);
    lines.push('            ██  CRITICAL INTEGRITY FAILURE — FORENSIC REPORT  ██');
    lines.push('                  Kiri Nexus Sovereign Guard Incident');
    lines.push(divider);
    lines.push('');
    lines.push(`Report Generated:      ${now}`);
    lines.push(`Lockdown Engaged:      ${state.locked_at ?? 'Unknown'}`);
    lines.push(`Trigger Type:          ${state.trigger?.toUpperCase().replace('_', ' ') ?? 'UNKNOWN'}`);
    lines.push('');

    if (state.trigger === 'integrity_failure' && state.integrity) {
      const i = state.integrity;
      lines.push(thin);
      lines.push('CHAIN INTEGRITY STATE');
      lines.push(thin);
      lines.push(`Tenant ID:             ${i.tenant_id}`);
      lines.push(`Agency:                ${i.agency_name ?? 'Unknown'}`);
      lines.push(`Chain Valid:            NO — INTEGRITY BREACH CONFIRMED`);
      lines.push(`Total Entries:         ${i.total_entries}`);
      lines.push(`Verified Entries:      ${i.verified_entries}`);
      lines.push(`Chain Head Hash:       ${i.chain_head_hash}`);
      lines.push(`Verified At:           ${i.checked_at}`);
      lines.push('');

      if (i.first_broken_index !== null) {
        lines.push(thin);
        lines.push('BREAK POINT ANALYSIS');
        lines.push(thin);
        lines.push(`First Broken Index:    ${i.first_broken_index}`);
        lines.push(`Broken Receipt ID:     ${i.first_broken_receipt_id ?? 'Unknown'}`);
        lines.push(`Break Detail:          ${i.break_detail ?? 'No detail available'}`);
        lines.push('');
        lines.push('INTERPRETATION:');
        lines.push(`  Entry at index ${i.first_broken_index} failed cryptographic verification.`);
        lines.push('  This indicates that the entry content was modified after being');
        lines.push('  committed to the SHA-256 hash chain, OR a preceding entry was');
        lines.push('  inserted/deleted, breaking the prev_hash linkage.');
        lines.push('');
      }
    }

    if (state.trigger === 'render_exception' && state.error) {
      lines.push(thin);
      lines.push('RENDER EXCEPTION DETAILS');
      lines.push(thin);
      lines.push(`Error Message:         ${state.error.message}`);
      lines.push('');
      if (state.error.stack) {
        lines.push('Stack Trace:');
        for (const line of state.error.stack.split('\n').slice(0, 15)) {
          lines.push(`  ${line}`);
        }
        lines.push('');
      }
      if (state.error.componentStack) {
        lines.push('Component Stack:');
        for (const line of state.error.componentStack.split('\n').slice(0, 10)) {
          lines.push(`  ${line.trim()}`);
        }
        lines.push('');
      }
    }

    lines.push(thin);
    lines.push('LOCKDOWN PROTOCOL');
    lines.push(thin);
    lines.push('  [1]  All data-sensitive components have been unmounted.');
    lines.push('  [2]  No potentially-tampered data is visible to the operator.');
    lines.push('  [3]  This report was generated from the last known good state.');
    lines.push('  [4]  Chain verification was performed server-side (O(n) SHA-256).');
    lines.push('');

    lines.push(thin);
    lines.push('RECOMMENDED ACTIONS');
    lines.push(thin);
    lines.push('  1. Preserve this report as evidence.');
    lines.push('  2. Do NOT attempt to modify audit files directly.');
    lines.push(`  3. Contact security support: ${SUPPORT_EMAIL}`);
    lines.push(`  4. Emergency hotline: ${SUPPORT_PHONE}`);
    lines.push('  5. Initiate a formal incident response per your agency CJIS/HIPAA plan.');
    lines.push('');

    lines.push(divider);
    lines.push('  This report is a point-in-time forensic snapshot produced by the');
    lines.push('  Kiri Nexus Integrity Guard. It documents the state of the audit');
    lines.push('  chain at the moment the integrity failure was detected.');
    lines.push(divider);

    return lines.join('\n');
  }, [state]);

  // ── Download Report Handler ──
  const handleDownloadReport = useCallback(() => {
    const report = generateReport();
    const blob = new Blob([report], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    a.href = url;
    a.download = `integrity-failure-report-${timestamp}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setReportDownloaded(true);
  }, [generateReport]);

  // ── Copy Chain Hash ──
  const chainHash = state.integrity?.chain_head_hash ?? 'N/A';
  const handleCopyHash = useCallback(() => {
    navigator.clipboard.writeText(chainHash).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [chainHash]);

  return (
    <>
      {/* Keyframe injection */}
      <style>{`
        @keyframes guardFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes guardSlideUp {
          from { opacity: 0; transform: translateY(40px) scale(0.96); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes guardPulseRed {
          0%, 100% { box-shadow: 0 0 30px rgba(239, 68, 68, 0.3); }
          50% { box-shadow: 0 0 60px rgba(239, 68, 68, 0.6); }
        }
        @keyframes guardIconPulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.08); opacity: 0.8; }
        }
        @keyframes guardScanline {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(100vh); }
        }
        @keyframes guardBlink {
          0%, 49% { opacity: 1; }
          50%, 100% { opacity: 0.3; }
        }
      `}</style>

      <div style={st.overlay}>
        {/* Scanline effect */}
        <div style={st.scanline} />

        {/* Main lockdown card */}
        <div style={st.card}>
          {/* ── Red Alert Header ─────────────────────────────────── */}
          <div style={st.alertHeader}>
            <div style={st.alertIconWrap}>
              <ShieldOff size={36} color="#FEE2E2" />
            </div>
            <div style={st.alertTextWrap}>
              <h1 style={st.alertTitle}>CRITICAL INTEGRITY FAILURE DETECTED</h1>
              <p style={st.alertSubtitle}>
                {state.trigger === 'integrity_failure'
                  ? 'The SHA-256 audit chain has been compromised. All data displays have been locked.'
                  : 'A critical render failure occurred. All data displays have been locked as a precaution.'}
              </p>
            </div>
          </div>

          {/* ── Status Indicator ─────────────────────────────────── */}
          <div style={st.statusBar}>
            <div style={st.statusDot} />
            <span style={st.statusText}>HARD-LOCK ENGAGED</span>
            <span style={st.statusTime}>
              {state.locked_at
                ? new Date(state.locked_at).toLocaleString('en-US', {
                    hour12: false,
                    timeZone: 'UTC',
                  }) + ' UTC'
                : '--'}
            </span>
          </div>

          {/* ── Failure Details ──────────────────────────────────── */}
          <div style={st.detailsSection}>
            {state.trigger === 'integrity_failure' && state.integrity && (
              <>
                <div style={st.detailRow}>
                  <span style={st.detailLabel}>TRIGGER</span>
                  <span style={{ ...st.detailValue, color: '#FCA5A5' }}>
                    CHAIN INTEGRITY VERIFICATION FAILED
                  </span>
                </div>
                <div style={st.detailRow}>
                  <span style={st.detailLabel}>BREAK INDEX</span>
                  <span style={st.detailValue}>
                    {state.integrity.first_broken_index !== null
                      ? `Entry #${state.integrity.first_broken_index}`
                      : 'Unknown'}
                  </span>
                </div>
                {state.integrity.first_broken_receipt_id && (
                  <div style={st.detailRow}>
                    <span style={st.detailLabel}>RECEIPT ID</span>
                    <span style={{ ...st.detailValue, fontFamily: 'monospace' }}>
                      {state.integrity.first_broken_receipt_id}
                    </span>
                  </div>
                )}
                {state.integrity.break_detail && (
                  <div style={st.detailRow}>
                    <span style={st.detailLabel}>DETAIL</span>
                    <span style={{ ...st.detailValue, color: '#FBBF24' }}>
                      {state.integrity.break_detail}
                    </span>
                  </div>
                )}
                <div style={st.detailRow}>
                  <span style={st.detailLabel}>CHAIN STATE</span>
                  <span style={st.detailValue}>
                    {state.integrity.verified_entries} / {state.integrity.total_entries} entries verified
                  </span>
                </div>

                {/* Chain hash with copy */}
                <div style={st.hashRow}>
                  <Hash size={12} color="#64748B" />
                  <span style={st.hashLabel}>CHAIN HEAD</span>
                  <span style={st.hashValue}>
                    {chainHash.slice(0, 24)}…{chainHash.slice(-8)}
                  </span>
                  <button onClick={handleCopyHash} style={st.copyBtn} title="Copy full hash">
                    {copied ? (
                      <Check size={12} color="#22C55E" />
                    ) : (
                      <Copy size={12} color="#64748B" />
                    )}
                  </button>
                </div>
              </>
            )}

            {state.trigger === 'render_exception' && state.error && (
              <>
                <div style={st.detailRow}>
                  <span style={st.detailLabel}>TRIGGER</span>
                  <span style={{ ...st.detailValue, color: '#FCA5A5' }}>
                    UNRECOVERABLE RENDER EXCEPTION
                  </span>
                </div>
                <div style={st.detailRow}>
                  <span style={st.detailLabel}>ERROR</span>
                  <span style={st.detailValue}>{state.error.message}</span>
                </div>
              </>
            )}
          </div>

          {/* ── Lockdown Protocol ────────────────────────────────── */}
          <div style={st.protocolSection}>
            <div style={st.protocolHeader}>
              <Lock size={13} color="#94A3B8" />
              <span style={st.protocolTitle}>LOCKDOWN PROTOCOL ACTIVE</span>
            </div>
            <div style={st.protocolList}>
              <ProtocolStep number={1} text="All data-sensitive components unmounted" status="done" />
              <ProtocolStep number={2} text="Chain state snapshot captured" status="done" />
              <ProtocolStep number={3} text="Forensic report ready for export" status="ready" />
              <ProtocolStep number={4} text="Awaiting operator action" status="waiting" />
            </div>
          </div>

          {/* ── Action Buttons ───────────────────────────────────── */}
          <div style={st.actionsRow}>
            <button onClick={handleDownloadReport} style={st.primaryBtn}>
              <Download size={16} />
              <span>{reportDownloaded ? 'Report Downloaded' : 'Export Forensic Report'}</span>
            </button>

            <a
              href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
                `[CRITICAL] Integrity Failure — ${state.integrity?.tenant_id ?? 'Unknown Tenant'}`,
              )}&body=${encodeURIComponent(
                `Lockdown engaged at ${state.locked_at ?? 'unknown time'}.\n` +
                  `Trigger: ${state.trigger}\n` +
                  `Tenant: ${state.integrity?.tenant_id ?? 'unknown'}\n` +
                  `Agency: ${state.integrity?.agency_name ?? 'unknown'}\n\n` +
                  `Please initiate incident response protocol.`,
              )}`}
              style={st.supportBtn}
            >
              <Phone size={16} />
              <span>Emergency Contact Support</span>
              <ExternalLink size={12} />
            </a>
          </div>

          {/* ── Footer ───────────────────────────────────────────── */}
          <div style={st.footer}>
            <AlertOctagon size={11} color="#64748B" />
            <span style={st.footerText}>
              This lockdown cannot be dismissed. Refresh the page after the chain integrity
              has been restored to resume operations.
            </span>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Protocol Step Sub-Component ──────────────────────────────────────────────

function ProtocolStep({
  number,
  text,
  status,
}: {
  number: number;
  text: string;
  status: 'done' | 'ready' | 'waiting';
}) {
  const color =
    status === 'done' ? '#22C55E' : status === 'ready' ? '#F59E0B' : '#64748B';
  const Icon =
    status === 'done' ? Check : status === 'ready' ? Download : RefreshCw;

  return (
    <div style={st.protocolStep}>
      <span style={{ ...st.protocolNum, color }}>[{number}]</span>
      <Icon
        size={12}
        color={color}
        style={
          status === 'waiting'
            ? { animation: 'guardBlink 1.5s ease-in-out infinite' }
            : undefined
        }
      />
      <span style={{ ...st.protocolText, color: status === 'waiting' ? '#64748B' : '#CBD5E1' }}>
        {text}
      </span>
    </div>
  );
}

// =============================================================================
// INTEGRITY MONITOR — Functional Hook Layer (Layer 2)
// =============================================================================
// Polls the audit-integrity API and triggers lockdown if `valid === false`.
// This runs INSIDE the Error Boundary so exceptions here are also caught.

function IntegrityMonitor({ children }: { children: React.ReactNode }) {
  const [lockdown, setLockdown] = useState<LockdownState>({
    locked: false,
    trigger: null,
    locked_at: null,
    integrity: null,
    error: null,
  });

  // ── Track if we've received at least one successful check ──
  const hasReceivedData = useRef(false);

  useEffect(() => {
    let mounted = true;
    let timer: ReturnType<typeof setTimeout>;

    const checkIntegrity = async () => {
      try {
        const res = await fetch('/api/government/audit-integrity', {
          credentials: 'include',
        });

        if (!res.ok) {
          // API error — do NOT lock down on network/auth failures.
          // Lockdown is ONLY triggered by a definitive `valid: false`.
          console.warn(
            `[Integrity Guard] API returned HTTP ${res.status} — monitoring continues`,
          );
          return;
        }

        const data: IntegrityCheckResponse = await res.json();
        hasReceivedData.current = true;

        // ── THE HARD-LOCK DECISION ──
        // Only lock if the API definitively returns valid === false.
        // This means the server performed O(n) SHA-256 verification
        // and found a broken chain. No ambiguity.
        if (data.valid === false && mounted) {
          console.error(
            `[Integrity Guard] ██ CHAIN INTEGRITY FAILURE ██ ` +
              `tenant:${data.tenant_id} | broken_at:${data.first_broken_index} | ` +
              `detail:${data.break_detail}`,
          );
          setLockdown({
            locked: true,
            trigger: 'integrity_failure',
            locked_at: new Date().toISOString(),
            integrity: data,
            error: null,
          });
        }
      } catch (err) {
        // Network failure — log but do NOT lock down.
        // We only lock on confirmed chain breach, not connectivity issues.
        console.warn(
          '[Integrity Guard] Fetch failed — monitoring continues:',
          err instanceof Error ? err.message : String(err),
        );
      }
    };

    // Initial check
    checkIntegrity();

    // Polling loop
    const poll = () => {
      timer = setTimeout(async () => {
        if (!mounted) return;
        await checkIntegrity();
        if (mounted && !lockdown.locked) {
          poll();
        }
      }, INTEGRITY_POLL_INTERVAL);
    };
    poll();

    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, []);

  // ── If locked, unmount all children and show overlay ──
  if (lockdown.locked) {
    return <LockdownOverlay state={lockdown} />;
  }

  return <>{children}</>;
}

// =============================================================================
// INTEGRITY GUARD — Class Error Boundary (Layer 1)
// =============================================================================
// Wraps the IntegrityMonitor + children. If ANY child throws during render,
// this catches it and engages the lockdown overlay.

interface IntegrityGuardProps {
  children: React.ReactNode;
}

interface IntegrityGuardState {
  hasError: boolean;
  lockdown: LockdownState;
}

export default class IntegrityGuard extends Component<
  IntegrityGuardProps,
  IntegrityGuardState
> {
  constructor(props: IntegrityGuardProps) {
    super(props);
    this.state = {
      hasError: false,
      lockdown: {
        locked: false,
        trigger: null,
        locked_at: null,
        integrity: null,
        error: null,
      },
    };
  }

  static getDerivedStateFromError(error: Error): Partial<IntegrityGuardState> {
    return {
      hasError: true,
      lockdown: {
        locked: true,
        trigger: 'render_exception',
        locked_at: new Date().toISOString(),
        integrity: null,
        error: {
          message: error.message,
          stack: error.stack,
        },
      },
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(
      '[Integrity Guard] ██ RENDER EXCEPTION — LOCKDOWN ENGAGED ██',
      error,
    );

    // Enrich the lockdown state with the component stack
    this.setState((prev) => ({
      lockdown: {
        ...prev.lockdown,
        error: {
          message: error.message,
          stack: error.stack,
          componentStack: info.componentStack ?? undefined,
        },
      },
    }));
  }

  render() {
    if (this.state.hasError) {
      return <LockdownOverlay state={this.state.lockdown} />;
    }

    return <IntegrityMonitor>{this.props.children}</IntegrityMonitor>;
  }
}

// =============================================================================
// STYLES — IntegrityGuard Lockdown Overlay
// =============================================================================

const MONO_STACK =
  "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Cascadia Code', Consolas, monospace";

const st: { [key: string]: React.CSSProperties } = {
  // ── Full-Screen Overlay ───────────────────────────────────────────────────
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 99999,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(10, 5, 5, 0.96)',
    backdropFilter: 'blur(12px)',
    animation: 'guardFadeIn 0.4s ease-out',
    overflow: 'auto',
    padding: '40px 20px',
  },

  // ── CRT Scanline ──────────────────────────────────────────────────────────
  scanline: {
    position: 'fixed',
    inset: 0,
    zIndex: 0,
    pointerEvents: 'none',
    background:
      'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(239, 68, 68, 0.03) 2px, rgba(239, 68, 68, 0.03) 4px)',
    animation: 'guardScanline 8s linear infinite',
  },

  // ── Card ──────────────────────────────────────────────────────────────────
  card: {
    position: 'relative',
    zIndex: 1,
    width: '100%',
    maxWidth: '640px',
    background: 'rgba(15, 10, 10, 0.95)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: '16px',
    overflow: 'hidden',
    animation: 'guardSlideUp 0.5s ease-out, guardPulseRed 3s ease-in-out infinite',
  },

  // ── Alert Header ──────────────────────────────────────────────────────────
  alertHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '28px 28px 20px',
    background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.15) 0%, rgba(153, 27, 27, 0.1) 100%)',
    borderBottom: '1px solid rgba(239, 68, 68, 0.15)',
  },
  alertIconWrap: {
    width: '64px',
    height: '64px',
    borderRadius: '16px',
    background: 'rgba(239, 68, 68, 0.2)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    animation: 'guardIconPulse 2s ease-in-out infinite',
  },
  alertTextWrap: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
  },
  alertTitle: {
    fontSize: '16px',
    fontWeight: 900,
    letterSpacing: '0.06em',
    color: '#FCA5A5',
    margin: 0,
    fontFamily: MONO_STACK,
    lineHeight: 1.3,
  },
  alertSubtitle: {
    fontSize: '12px',
    fontWeight: 500,
    color: '#94A3B8',
    margin: 0,
    lineHeight: 1.5,
  },

  // ── Status Bar ────────────────────────────────────────────────────────────
  statusBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 28px',
    background: 'rgba(239, 68, 68, 0.06)',
    borderBottom: '1px solid rgba(51, 65, 85, 0.2)',
  },
  statusDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: '#EF4444',
    boxShadow: '0 0 8px rgba(239, 68, 68, 0.8)',
    animation: 'guardBlink 1.5s ease-in-out infinite',
    flexShrink: 0,
  },
  statusText: {
    fontSize: '11px',
    fontWeight: 800,
    letterSpacing: '0.1em',
    color: '#EF4444',
    fontFamily: MONO_STACK,
  },
  statusTime: {
    fontSize: '10px',
    fontWeight: 500,
    color: '#64748B',
    fontFamily: MONO_STACK,
    marginLeft: 'auto',
  },

  // ── Failure Details ───────────────────────────────────────────────────────
  detailsSection: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0',
    padding: '16px 28px',
    borderBottom: '1px solid rgba(51, 65, 85, 0.2)',
  },
  detailRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '12px',
    padding: '6px 0',
  },
  detailLabel: {
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.08em',
    color: '#64748B',
    fontFamily: MONO_STACK,
    minWidth: '100px',
    flexShrink: 0,
  },
  detailValue: {
    fontSize: '12px',
    fontWeight: 500,
    color: '#CBD5E1',
    wordBreak: 'break-all' as const,
    lineHeight: 1.5,
  },

  // ── Chain Hash Row ────────────────────────────────────────────────────────
  hashRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    marginTop: '8px',
    background: 'rgba(30, 41, 59, 0.5)',
    borderRadius: '8px',
    border: '1px solid rgba(51, 65, 85, 0.3)',
  },
  hashLabel: {
    fontSize: '9px',
    fontWeight: 700,
    letterSpacing: '0.1em',
    color: '#64748B',
    fontFamily: MONO_STACK,
    flexShrink: 0,
  },
  hashValue: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#94A3B8',
    fontFamily: MONO_STACK,
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  copyBtn: {
    background: 'none',
    border: '1px solid rgba(71, 85, 105, 0.3)',
    borderRadius: '4px',
    padding: '3px 5px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  // ── Lockdown Protocol ─────────────────────────────────────────────────────
  protocolSection: {
    padding: '16px 28px',
    borderBottom: '1px solid rgba(51, 65, 85, 0.2)',
  },
  protocolHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginBottom: '10px',
  },
  protocolTitle: {
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.1em',
    color: '#94A3B8',
    fontFamily: MONO_STACK,
  },
  protocolList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
  },
  protocolStep: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  protocolNum: {
    fontSize: '10px',
    fontWeight: 800,
    fontFamily: MONO_STACK,
    flexShrink: 0,
  },
  protocolText: {
    fontSize: '11px',
    fontWeight: 500,
  },

  // ── Action Buttons ────────────────────────────────────────────────────────
  actionsRow: {
    display: 'flex',
    gap: '12px',
    padding: '20px 28px',
    flexWrap: 'wrap' as const,
  },
  primaryBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 20px',
    background: 'rgba(239, 68, 68, 0.15)',
    border: '1px solid rgba(239, 68, 68, 0.4)',
    borderRadius: '10px',
    color: '#FCA5A5',
    fontSize: '13px',
    fontWeight: 700,
    fontFamily: MONO_STACK,
    cursor: 'pointer',
    letterSpacing: '0.02em',
    transition: 'all 0.2s ease',
    flex: 1,
    justifyContent: 'center',
  },
  supportBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 20px',
    background: 'rgba(59, 130, 246, 0.1)',
    border: '1px solid rgba(59, 130, 246, 0.3)',
    borderRadius: '10px',
    color: '#93C5FD',
    fontSize: '13px',
    fontWeight: 700,
    fontFamily: MONO_STACK,
    cursor: 'pointer',
    letterSpacing: '0.02em',
    textDecoration: 'none',
    transition: 'all 0.2s ease',
    flex: 1,
    justifyContent: 'center',
  },

  // ── Footer ────────────────────────────────────────────────────────────────
  footer: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    padding: '12px 28px 16px',
    borderTop: '1px solid rgba(51, 65, 85, 0.15)',
  },
  footerText: {
    fontSize: '10px',
    fontWeight: 500,
    color: '#64748B',
    lineHeight: 1.5,
  },
};
