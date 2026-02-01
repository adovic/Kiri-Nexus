'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ShieldOff,
  Shield,
  KeyRound,
  Archive,
  AlertOctagon,
  Lock,
  Trash2,
  Download,
  X,
  Loader2,
  CheckCircle,
  Clock,
  Fingerprint,
  ShieldCheck,
  Usb,
} from 'lucide-react';
import {
  isWebAuthnSupported,
  hasRegisteredKey,
  getRegistration,
  registerHardwareKey,
  verifyHardwarePresence,
  clearRegistration,
  type WebAuthnRegistration,
} from '@/lib/auth/webauthn-verification';

// =============================================================================
// OPERATIONS CONTROL — Danger Zone Panel (WebAuthn-Hardened)
// =============================================================================
// Four operational sections:
//
//   0. Hardware Key    — FIDO2 WebAuthn registration + status badge
//   1. AI Kill-Switch  — Toggle to suspend/display AI operations status
//   2. Rotate Keys     — Trigger AES-256-GCM re-key pipeline (WebAuthn-gated)
//   3. Sovereign Exit  — Modal with Data Export + Permanent Wipe (WebAuthn-gated)
//
// High-stakes actions (Rotate Keys, Sovereign Exit) require a physical
// hardware key tap via navigator.credentials.get() if a FIDO2 key has been
// registered. The AI Kill-Switch is NOT gated — emergency halt must never
// be delayed by a hardware ceremony.
// =============================================================================

// ── Types ────────────────────────────────────────────────────────────────────

interface RotationMeta {
  tenant_id: string;
  has_key: boolean;
  last_key_rotation: string | null;
  last_key_rotated_by: string | null;
}

interface Props {
  tenantId: string;
  isSuspended?: boolean;
}

// =============================================================================
// Hardware Key Panel — FIDO2 Registration & Status
// =============================================================================

function HardwareKeyPanel() {
  const [supported, setSupported] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [registration, setRegistration] = useState<WebAuthnRegistration | null>(null);
  const [registering, setRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Initialize on mount (client-only) ──
  useEffect(() => {
    setSupported(isWebAuthnSupported());
    setRegistered(hasRegisteredKey());
    setRegistration(getRegistration());
  }, []);

  const handleRegister = async () => {
    setRegistering(true);
    setError(null);

    try {
      // Use a pseudo user ID — the session identity is separate
      const userId = `sovereign-guard-${Date.now()}`;
      const displayName = 'Sovereign Guard Operator';
      const reg = await registerHardwareKey(userId, displayName);
      setRegistered(true);
      setRegistration(reg);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRegistering(false);
    }
  };

  const handleClear = () => {
    if (
      !confirm(
        'REMOVE HARDWARE KEY\n\n' +
          'This will remove the registered FIDO2 credential from this browser.\n' +
          'High-stakes operations will no longer require hardware verification.\n\n' +
          'Proceed?',
      )
    ) {
      return;
    }
    clearRegistration();
    setRegistered(false);
    setRegistration(null);
  };

  if (!supported) {
    return (
      <div style={s.hwPanel}>
        <div style={s.hwPanelInner}>
          <Fingerprint size={18} color="#64748B" />
          <div>
            <div style={{ ...s.hwTitle, color: '#64748B' }}>HARDWARE KEY UNAVAILABLE</div>
            <div style={s.hwDesc}>
              WebAuthn is not supported in this browser. Use Chrome, Edge, or Firefox with a FIDO2 security key.
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (registered && registration) {
    const regDate = new Date(registration.registeredAt).toLocaleString();
    const transports = registration.transports.length > 0
      ? registration.transports.join(', ')
      : 'unknown';

    return (
      <div style={{ ...s.hwPanel, borderColor: 'rgba(34, 197, 94, 0.2)', background: 'rgba(34, 197, 94, 0.04)' }}>
        <div style={s.hwPanelInner}>
          <div style={s.hwIconWrap}>
            <Fingerprint size={18} color="#22C55E" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ ...s.hwTitle, color: '#22C55E' }}>FIDO2 HARDWARE KEY ACTIVE</div>
            <div style={s.hwDesc}>
              High-stakes operations require a physical key tap.
            </div>
            <div style={s.hwMeta}>
              <span style={s.hwMetaItem}>Registered: {regDate}</span>
              <span style={s.hwMetaDot}>·</span>
              <span style={s.hwMetaItem}>Transport: {transports}</span>
              <span style={s.hwMetaDot}>·</span>
              <span style={s.hwMetaItem}>ID: {registration.credentialId.slice(0, 12)}…</span>
            </div>
          </div>
          <button onClick={handleClear} style={s.hwClearBtn} title="Remove hardware key">
            <X size={14} color="#64748B" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={s.hwPanel}>
      <div style={s.hwPanelInner}>
        <Usb size={18} color="#F59E0B" />
        <div style={{ flex: 1 }}>
          <div style={{ ...s.hwTitle, color: '#F59E0B' }}>NO HARDWARE KEY REGISTERED</div>
          <div style={s.hwDesc}>
            Register a FIDO2 security key to require physical presence for high-stakes operations.
          </div>
          {error && <div style={{ ...s.errorMsg, marginTop: '6px' }}>{error}</div>}
        </div>
        <button
          onClick={handleRegister}
          disabled={registering}
          style={{
            ...s.hwRegisterBtn,
            opacity: registering ? 0.5 : 1,
            cursor: registering ? 'not-allowed' : 'pointer',
          }}
        >
          {registering ? (
            <>
              <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
              TAP KEY…
            </>
          ) : (
            <>
              <Fingerprint size={14} />
              REGISTER KEY
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// AI Kill-Switch (NOT WebAuthn-gated — emergency halt must not be delayed)
// =============================================================================

function AiKillSwitch({ tenantId, isSuspended: initialSuspended }: Props) {
  const [suspended, setSuspended] = useState(initialSuspended ?? false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [eventHash, setEventHash] = useState<string | null>(null);

  useEffect(() => {
    if (initialSuspended !== undefined) {
      setSuspended(initialSuspended);
    }
  }, [initialSuspended]);

  const handleToggle = async () => {
    if (suspended) {
      // Already suspended — can't reactivate from dashboard
      return;
    }

    if (
      !confirm(
        'EMERGENCY AI KILL-SWITCH\n\n' +
          'This will IMMEDIATELY suspend all AI operations.\n' +
          'The Vapi webhook will reject all tool calls.\n' +
          'In-progress calls will be terminated.\n' +
          'Manual reactivation by an administrator is required.\n\n' +
          'Proceed?',
      )
    ) {
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessMsg(null);
    setEventHash(null);

    try {
      const res = await fetch('/api/government/tools/suspend', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirmation: 'SUSPEND ALL AI OPERATIONS',
          reason: 'EMERGENCY_GLASS_BREAK',
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setSuspended(true);
      setSuccessMsg(
        `Suspended. ID: ${data.suspend_id}` +
          (data.calls_terminated > 0
            ? ` | ${data.calls_terminated} call(s) terminated`
            : ''),
      );
      setEventHash(data.timestamped_event_hash || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={s.controlRow}>
      <div style={s.controlInfo}>
        {suspended ? (
          <ShieldOff size={20} color="#EF4444" />
        ) : (
          <Shield size={20} color="#22C55E" />
        )}
        <div>
          <div style={s.controlTitle}>AI OPERATIONS</div>
          <div style={s.controlDesc}>
            {suspended
              ? 'All AI operations are suspended. Contact an administrator to reactivate.'
              : 'Immediately halt all AI operations. Manual reactivation required.'}
          </div>
        </div>
      </div>

      <button
        onClick={handleToggle}
        disabled={loading || suspended}
        style={{
          ...s.toggleBtn,
          background: suspended
            ? 'rgba(239, 68, 68, 0.15)'
            : 'rgba(34, 197, 94, 0.12)',
          borderColor: suspended
            ? 'rgba(239, 68, 68, 0.4)'
            : 'rgba(34, 197, 94, 0.4)',
          opacity: loading ? 0.5 : 1,
          cursor: loading || suspended ? 'not-allowed' : 'pointer',
        }}
      >
        {/* Track */}
        <div
          style={{
            ...s.toggleTrack,
            background: suspended ? '#EF4444' : '#22C55E',
            justifyContent: suspended ? 'flex-start' : 'flex-end',
          }}
        >
          <div style={s.toggleThumb} />
        </div>
        <span
          style={{
            ...s.toggleLabel,
            color: suspended ? '#EF4444' : '#22C55E',
          }}
        >
          {loading ? 'SUSPENDING…' : suspended ? 'SUSPENDED' : 'ACTIVE'}
        </span>
      </button>

      {error && <div style={s.errorMsg}>{error}</div>}
      {successMsg && <div style={s.successMsg}>{successMsg}</div>}
      {eventHash && (
        <div style={s.eventHashRow}>
          <Lock size={11} color="#94A3B8" />
          <span style={s.eventHashLabel}>Event Hash:</span>
          <span style={s.eventHashValue}>{eventHash}</span>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Rotate Keys
// =============================================================================

function RotateKeys() {
  const [meta, setMeta] = useState<RotationMeta | null>(null);
  const [rotating, setRotating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [hwVerifying, setHwVerifying] = useState(false);

  // Fetch rotation metadata on mount
  const fetchMeta = useCallback(async () => {
    try {
      const res = await fetch('/api/government/tools/rotate-key', {
        credentials: 'include',
      });
      if (res.ok) {
        setMeta(await res.json());
      }
    } catch {
      // Non-fatal — metadata display is informational
    }
  }, []);

  useEffect(() => {
    fetchMeta();
  }, [fetchMeta]);

  const handleRotate = async () => {
    setError(null);

    // ── WebAuthn Gate: Require hardware presence if key is registered ──
    if (hasRegisteredKey()) {
      setHwVerifying(true);
      try {
        await verifyHardwarePresence('rotate-keys');
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setHwVerifying(false);
        return;
      }
      setHwVerifying(false);
    }

    if (
      !confirm(
        'AES-256-GCM KEY ROTATION\n\n' +
          'This will:\n' +
          '  1. Generate a new 256-bit encryption key\n' +
          '  2. Re-encrypt every audit log entry with the new key\n' +
          '  3. Atomically replace the old key on disk\n\n' +
          'The old key will be permanently destroyed.\n' +
          'Proceed?',
      )
    ) {
      return;
    }

    setRotating(true);
    setSuccess(null);

    try {
      const res = await fetch('/api/government/tools/rotate-key', {
        method: 'POST',
        credentials: 'include',
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setSuccess(
        `Rotated. ${data.entries_re_encrypted} entries re-encrypted at ${new Date(data.rotated_at).toLocaleString()}.`,
      );
      // Refresh metadata
      fetchMeta();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRotating(false);
    }
  };

  const lastRotated = meta?.last_key_rotation
    ? new Date(meta.last_key_rotation).toLocaleString()
    : 'Never';

  return (
    <div style={s.controlRow}>
      <div style={s.controlInfo}>
        <KeyRound size={20} color="#F59E0B" />
        <div>
          <div style={s.controlTitle}>AES-256-GCM KEY ROTATION</div>
          <div style={s.controlDesc}>
            Re-encrypt all audit entries with a new key. Old key is destroyed.
          </div>
          <div style={s.metaRow}>
            <Clock size={12} color="#64748B" />
            <span style={s.metaText}>
              Last Rotated: <span style={s.metaValue}>{lastRotated}</span>
            </span>
            {meta?.last_key_rotated_by && (
              <span style={s.metaText}>
                by <span style={s.metaValue}>{meta.last_key_rotated_by}</span>
              </span>
            )}
          </div>
        </div>
      </div>

      <button
        onClick={handleRotate}
        disabled={rotating || hwVerifying}
        style={{
          ...s.actionBtn,
          background: 'rgba(245, 158, 11, 0.12)',
          borderColor: 'rgba(245, 158, 11, 0.4)',
          color: '#F59E0B',
          opacity: rotating || hwVerifying ? 0.5 : 1,
          cursor: rotating || hwVerifying ? 'not-allowed' : 'pointer',
        }}
      >
        {hwVerifying ? (
          <>
            <Fingerprint size={14} />
            TAP KEY…
          </>
        ) : rotating ? (
          <>
            <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
            ROTATING…
          </>
        ) : (
          <>
            <KeyRound size={14} />
            ROTATE KEYS
          </>
        )}
      </button>

      {error && <div style={s.errorMsg}>{error}</div>}
      {success && <div style={s.successMsg}>{success}</div>}
    </div>
  );
}

// =============================================================================
// Sovereign Exit Modal (WebAuthn-gated)
// =============================================================================

function SovereignExitModal({
  tenantId,
  onClose,
}: {
  tenantId: string;
  onClose: () => void;
}) {
  // ── Export state ──
  const [passphrase, setPassphrase] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportDone, setExportDone] = useState(false);

  // ── Wipe state ──
  const [confirmText, setConfirmText] = useState('');
  const [wiping, setWiping] = useState(false);
  const [wipeError, setWipeError] = useState<string | null>(null);
  const [wipeDone, setWipeDone] = useState(false);

  // ── WebAuthn state ──
  const [hwVerifying, setHwVerifying] = useState<'export' | 'wipe' | null>(null);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // ── Request Data Export (WebAuthn-gated) ──
  const handleExport = async () => {
    if (passphrase.length < 12) {
      setExportError('Passphrase must be at least 12 characters.');
      return;
    }

    // ── WebAuthn Gate ──
    if (hasRegisteredKey()) {
      setHwVerifying('export');
      setExportError(null);
      try {
        await verifyHardwarePresence('sovereign-export');
      } catch (err) {
        setExportError(err instanceof Error ? err.message : String(err));
        setHwVerifying(null);
        return;
      }
      setHwVerifying(null);
    }

    if (
      !confirm(
        'REQUEST DATA EXPORT\n\n' +
          'This will create an AES-256-GCM encrypted archive\n' +
          'containing all agency audit data.\n\n' +
          'The archive is encrypted with your passphrase.\n' +
          'If the passphrase is lost, the archive is unrecoverable.\n\n' +
          'Proceed?',
      )
    ) {
      return;
    }

    setExporting(true);
    setExportError(null);

    try {
      const res = await fetch('/api/government/sovereign-exit/archive', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          passphrase,
          confirmation: 'PERMANENTLY DELETE ALL DATA',
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `HTTP ${res.status}`);
      }

      // Download the encrypted archive
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download =
        res.headers
          .get('Content-Disposition')
          ?.split('filename="')[1]
          ?.replace('"', '') ||
        `${tenantId}_sovereign_archive_${Date.now()}.enc`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setExportDone(true);
      setPassphrase('');
    } catch (err) {
      setExportError(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(false);
    }
  };

  // ── Permanent Wipe (WebAuthn-gated) ──
  const handleWipe = async () => {
    if (confirmText !== 'CONFIRM') {
      setWipeError('You must type CONFIRM exactly to proceed.');
      return;
    }

    // ── WebAuthn Gate ──
    if (hasRegisteredKey()) {
      setHwVerifying('wipe');
      setWipeError(null);
      try {
        await verifyHardwarePresence('sovereign-wipe');
      } catch (err) {
        setWipeError(err instanceof Error ? err.message : String(err));
        setHwVerifying(null);
        return;
      }
      setHwVerifying(null);
    }

    if (
      !confirm(
        'PERMANENT WIPE — ABSOLUTELY IRREVERSIBLE\n\n' +
          'This will:\n' +
          '  1. Crypto-shred all encryption keys\n' +
          '  2. Destroy all on-disk audit data\n' +
          '  3. Purge all Firestore records\n' +
          '  4. Generate a Certificate of Destruction\n\n' +
          'There is NO recovery after this action.\n\n' +
          'This is your FINAL confirmation. Proceed?',
      )
    ) {
      return;
    }

    setWiping(true);
    setWipeError(null);

    try {
      const res = await fetch('/api/government/sovereign-exit/delete', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirmation: 'PERMANENTLY DELETE ALL DATA',
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `HTTP ${res.status}`);
      }

      // Download the deletion certificate
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download =
        res.headers
          .get('Content-Disposition')
          ?.split('filename="')[1]
          ?.replace('"', '') ||
        `${tenantId}_deletion_certificate_${Date.now()}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setWipeDone(true);
      setConfirmText('');
    } catch (err) {
      setWipeError(err instanceof Error ? err.message : String(err));
    } finally {
      setWiping(false);
    }
  };

  return (
    // Backdrop
    <div style={s.modalBackdrop} onClick={onClose}>
      {/* Modal body — stop propagation so clicking inside doesn't close */}
      <div style={s.modalBody} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={s.modalHeader}>
          <AlertOctagon size={24} color="#EF4444" />
          <span style={s.modalTitle}>SOVEREIGN EXIT — DANGER ZONE</span>
          <button onClick={onClose} style={s.modalClose}>
            <X size={20} color="#94A3B8" />
          </button>
        </div>

        <div style={s.modalContent}>
          {/* ── Section 1: Request Data Export ─────────────────────────── */}
          <div style={s.modalSection}>
            <div style={s.modalSectionHeader}>
              <Download size={18} color="#3B82F6" />
              <span style={s.modalSectionTitle}>Request Data Export</span>
            </div>
            <p style={s.modalSectionDesc}>
              Download an AES-256-GCM encrypted archive of all agency audit data.
              The archive is encrypted with a passphrase you provide. This operation
              also triggers crypto-shredding of the on-disk data.
            </p>

            {exportDone ? (
              <div style={s.doneBox}>
                <CheckCircle size={16} color="#22C55E" />
                <span style={{ color: '#22C55E', fontWeight: 700, fontSize: '13px' }}>
                  Archive downloaded. On-disk data has been destroyed.
                </span>
              </div>
            ) : (
              <div style={s.inputGroup}>
                <label style={s.inputLabel}>
                  <Lock size={13} color="#3B82F6" />
                  Encryption Passphrase (min. 12 characters)
                </label>
                <div style={s.inputRow}>
                  <input
                    type="password"
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    placeholder="Enter encryption passphrase…"
                    style={s.textInput}
                    minLength={12}
                    disabled={exporting}
                  />
                  <button
                    onClick={handleExport}
                    disabled={exporting || passphrase.length < 12 || hwVerifying === 'export'}
                    style={{
                      ...s.submitBtn,
                      background: 'rgba(59, 130, 246, 0.15)',
                      borderColor: 'rgba(59, 130, 246, 0.4)',
                      color: '#3B82F6',
                      opacity: exporting || passphrase.length < 12 || hwVerifying === 'export' ? 0.4 : 1,
                      cursor:
                        exporting || passphrase.length < 12 || hwVerifying === 'export'
                          ? 'not-allowed'
                          : 'pointer',
                    }}
                  >
                    {hwVerifying === 'export' ? (
                      <>
                        <Fingerprint size={14} />
                        TAP KEY…
                      </>
                    ) : exporting ? (
                      <>
                        <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                        EXPORTING…
                      </>
                    ) : (
                      <>
                        <Download size={14} />
                        REQUEST EXPORT
                      </>
                    )}
                  </button>
                </div>
                {exportError && <div style={s.errorMsg}>{exportError}</div>}
              </div>
            )}
          </div>

          {/* Divider */}
          <div style={s.modalDivider} />

          {/* ── Section 2: Permanent Wipe ─────────────────────────────── */}
          <div style={s.modalSection}>
            <div style={s.modalSectionHeader}>
              <Trash2 size={18} color="#EF4444" />
              <span style={{ ...s.modalSectionTitle, color: '#EF4444' }}>
                Permanent Wipe
              </span>
            </div>
            <p style={s.modalSectionDesc}>
              <strong style={{ color: '#EF4444' }}>IRREVERSIBLE.</strong>{' '}
              Crypto-shred all encryption keys, destroy all on-disk audit data,
              purge all Firestore records, and generate a Certificate of Destruction.
              There is no recovery.
            </p>

            {wipeDone ? (
              <div style={{ ...s.doneBox, borderColor: 'rgba(239, 68, 68, 0.3)' }}>
                <CheckCircle size={16} color="#EF4444" />
                <span style={{ color: '#EF4444', fontWeight: 700, fontSize: '13px' }}>
                  All data permanently destroyed. Certificate downloaded.
                </span>
              </div>
            ) : (
              <div style={s.inputGroup}>
                <label style={s.inputLabel}>
                  <AlertOctagon size={13} color="#EF4444" />
                  <span>
                    Type{' '}
                    <code style={s.codeInline}>CONFIRM</code>{' '}
                    to enable permanent wipe
                  </span>
                </label>
                <div style={s.inputRow}>
                  <input
                    type="text"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
                    placeholder="Type CONFIRM"
                    style={{
                      ...s.textInput,
                      borderColor:
                        confirmText === 'CONFIRM'
                          ? 'rgba(239, 68, 68, 0.6)'
                          : 'rgba(100, 116, 139, 0.3)',
                      letterSpacing: '0.1em',
                      textTransform: 'uppercase',
                    }}
                    disabled={wiping}
                  />
                  <button
                    onClick={handleWipe}
                    disabled={wiping || confirmText !== 'CONFIRM' || hwVerifying === 'wipe'}
                    style={{
                      ...s.submitBtn,
                      background: 'rgba(239, 68, 68, 0.15)',
                      borderColor: 'rgba(239, 68, 68, 0.4)',
                      color: '#EF4444',
                      opacity: wiping || confirmText !== 'CONFIRM' || hwVerifying === 'wipe' ? 0.4 : 1,
                      cursor:
                        wiping || confirmText !== 'CONFIRM' || hwVerifying === 'wipe'
                          ? 'not-allowed'
                          : 'pointer',
                    }}
                  >
                    {hwVerifying === 'wipe' ? (
                      <>
                        <Fingerprint size={14} />
                        TAP KEY…
                      </>
                    ) : wiping ? (
                      <>
                        <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                        DESTROYING…
                      </>
                    ) : (
                      <>
                        <Trash2 size={14} />
                        PERMANENT WIPE
                      </>
                    )}
                  </button>
                </div>
                {wipeError && <div style={s.errorMsg}>{wipeError}</div>}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={s.modalFooter}>
          <button onClick={onClose} style={s.cancelBtn}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// OperationsControl — Composed Export
// =============================================================================

export default function OperationsControl({
  tenantId,
  isSuspended,
}: Props) {
  const [showExitModal, setShowExitModal] = useState(false);
  const [hwKeyActive, setHwKeyActive] = useState(false);

  // Check hardware key status on mount (client-only)
  useEffect(() => {
    setHwKeyActive(hasRegisteredKey());
  }, []);

  // Re-check after HardwareKeyPanel mounts/updates (via storage event)
  useEffect(() => {
    const checkKey = () => setHwKeyActive(hasRegisteredKey());
    window.addEventListener('storage', checkKey);
    // Also poll periodically in case localStorage changes in same tab
    const interval = setInterval(checkKey, 2000);
    return () => {
      window.removeEventListener('storage', checkKey);
      clearInterval(interval);
    };
  }, []);

  return (
    <>
      {/* Keyframe for Loader2 spinner */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <div style={s.dangerZone}>
        {/* Header */}
        <div style={s.dangerHeader}>
          <AlertOctagon size={22} color="#EF4444" />
          <span style={s.dangerTitle}>DANGER ZONE</span>
          {/* ── Hardware Secured Badge ── */}
          {hwKeyActive && (
            <div style={s.hwBadge}>
              <ShieldCheck size={13} color="#22C55E" />
              <span style={s.hwBadgeText}>HARDWARE SECURED</span>
            </div>
          )}
          <span style={s.dangerSubtitle}>Operations Control — Irreversible Actions</span>
        </div>

        <div style={s.dangerBody}>
          {/* ── 0. Hardware Key Registration ───────────────────────────── */}
          <HardwareKeyPanel />

          <div style={s.divider} />

          {/* ── 1. AI Kill-Switch ──────────────────────────────────────── */}
          <AiKillSwitch tenantId={tenantId} isSuspended={isSuspended} />

          <div style={s.divider} />

          {/* ── 2. Rotate Keys ─────────────────────────────────────────── */}
          <RotateKeys />

          <div style={s.divider} />

          {/* ── 3. Sovereign Exit ──────────────────────────────────────── */}
          <div style={s.controlRow}>
            <div style={s.controlInfo}>
              <Archive size={20} color="#EF4444" />
              <div>
                <div style={s.controlTitle}>SOVEREIGN EXIT</div>
                <div style={s.controlDesc}>
                  Export encrypted archive, permanently wipe all data, or both.
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowExitModal(true)}
              style={{
                ...s.actionBtn,
                background: 'rgba(239, 68, 68, 0.12)',
                borderColor: 'rgba(239, 68, 68, 0.4)',
                color: '#EF4444',
                cursor: 'pointer',
              }}
            >
              <AlertOctagon size={14} />
              ENTER DANGER ZONE
            </button>
          </div>
        </div>
      </div>

      {/* ── Sovereign Exit Modal ──────────────────────────────────────── */}
      {showExitModal && (
        <SovereignExitModal
          tenantId={tenantId}
          onClose={() => setShowExitModal(false)}
        />
      )}
    </>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const s: { [key: string]: React.CSSProperties } = {
  // ── Danger Zone Container ──────────────────────────────────────────────
  dangerZone: {
    padding: 0,
    background: 'rgba(239, 68, 68, 0.03)',
    border: '2px solid rgba(239, 68, 68, 0.4)',
    borderRadius: '16px',
    overflow: 'hidden',
  },
  dangerHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '20px 24px',
    background: 'rgba(239, 68, 68, 0.08)',
    borderBottom: '1px solid rgba(239, 68, 68, 0.2)',
  },
  dangerTitle: {
    fontSize: '16px',
    fontWeight: 800,
    color: '#EF4444',
    letterSpacing: '0.06em',
  },
  dangerSubtitle: {
    fontSize: '12px',
    color: '#94A3B8',
    marginLeft: 'auto',
  },
  dangerBody: {
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },

  // ── Control Row (shared) ───────────────────────────────────────────────
  controlRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '20px',
    flexWrap: 'wrap',
  },
  controlInfo: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '16px',
    flex: 1,
    minWidth: 0,
  },
  controlTitle: {
    fontSize: '14px',
    fontWeight: 700,
    color: '#F8FAFC',
    marginBottom: '2px',
    letterSpacing: '0.02em',
  },
  controlDesc: {
    fontSize: '12px',
    color: '#94A3B8',
    lineHeight: '1.5',
  },

  // ── Metadata row (Last Rotated) ────────────────────────────────────────
  metaRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginTop: '6px',
  },
  metaText: {
    fontSize: '11px',
    color: '#64748B',
  },
  metaValue: {
    color: '#94A3B8',
    fontWeight: 600,
    fontFamily: 'monospace',
  },

  // ── Toggle button (Kill-Switch) ────────────────────────────────────────
  toggleBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '8px 16px',
    border: '1px solid',
    borderRadius: '8px',
    flexShrink: 0,
    background: 'none',
  },
  toggleTrack: {
    width: '36px',
    height: '20px',
    borderRadius: '10px',
    display: 'flex',
    alignItems: 'center',
    padding: '2px',
    transition: 'all 0.2s ease',
  },
  toggleThumb: {
    width: '16px',
    height: '16px',
    borderRadius: '50%',
    background: '#FFFFFF',
    boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
  },
  toggleLabel: {
    fontSize: '13px',
    fontWeight: 800,
    letterSpacing: '0.06em',
    fontFamily: 'monospace',
  },

  // ── Action button (Rotate / Sovereign Exit) ────────────────────────────
  actionBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 20px',
    border: '1px solid',
    borderRadius: '8px',
    fontSize: '12px',
    fontWeight: 800,
    letterSpacing: '0.06em',
    flexShrink: 0,
    background: 'none',
  },

  // ── Divider ────────────────────────────────────────────────────────────
  divider: {
    height: '1px',
    background: 'rgba(239, 68, 68, 0.15)',
  },

  // ── Feedback messages ──────────────────────────────────────────────────
  errorMsg: {
    fontSize: '12px',
    color: '#EF4444',
    fontFamily: 'monospace',
    width: '100%',
    marginTop: '4px',
  },
  successMsg: {
    fontSize: '12px',
    color: '#22C55E',
    fontFamily: 'monospace',
    width: '100%',
    marginTop: '4px',
  },
  eventHashRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    width: '100%',
    marginTop: '6px',
    padding: '8px 10px',
    background: 'rgba(15, 23, 42, 0.6)',
    border: '1px solid rgba(100, 116, 139, 0.15)',
    borderRadius: '6px',
    overflow: 'hidden',
  },
  eventHashLabel: {
    fontSize: '10px',
    fontWeight: 700,
    color: '#94A3B8',
    letterSpacing: '0.04em',
    flexShrink: 0,
    fontFamily: 'monospace',
  },
  eventHashValue: {
    fontSize: '10px',
    fontWeight: 600,
    color: '#60A5FA',
    fontFamily: 'monospace',
    letterSpacing: '0.02em',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flex: 1,
  },

  // ── Modal ──────────────────────────────────────────────────────────────
  modalBackdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.75)',
    backdropFilter: 'blur(6px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    padding: '24px',
  },
  modalBody: {
    width: '100%',
    maxWidth: '620px',
    background: '#0F172A',
    border: '2px solid rgba(239, 68, 68, 0.5)',
    borderRadius: '16px',
    overflow: 'hidden',
    boxShadow: '0 24px 80px rgba(0, 0, 0, 0.6), 0 0 40px rgba(239, 68, 68, 0.15)',
  },
  modalHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '20px 24px',
    background: 'rgba(239, 68, 68, 0.08)',
    borderBottom: '1px solid rgba(239, 68, 68, 0.25)',
  },
  modalTitle: {
    fontSize: '16px',
    fontWeight: 800,
    color: '#EF4444',
    letterSpacing: '0.06em',
    flex: 1,
  },
  modalClose: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '6px',
  },
  modalContent: {
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  modalSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  modalSectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  modalSectionTitle: {
    fontSize: '14px',
    fontWeight: 700,
    color: '#3B82F6',
    letterSpacing: '0.02em',
  },
  modalSectionDesc: {
    fontSize: '13px',
    color: '#94A3B8',
    lineHeight: '1.6',
    margin: 0,
  },
  modalDivider: {
    height: '1px',
    background: 'rgba(100, 116, 139, 0.2)',
  },
  modalFooter: {
    display: 'flex',
    justifyContent: 'center',
    padding: '16px 24px',
    borderTop: '1px solid rgba(100, 116, 139, 0.15)',
  },

  // ── Input groups ───────────────────────────────────────────────────────
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  inputLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '12px',
    fontWeight: 600,
    color: '#94A3B8',
  },
  inputRow: {
    display: 'flex',
    gap: '10px',
  },
  textInput: {
    flex: 1,
    padding: '10px 14px',
    background: 'rgba(15, 23, 42, 0.8)',
    border: '1px solid rgba(100, 116, 139, 0.3)',
    borderRadius: '8px',
    color: '#F8FAFC',
    fontSize: '14px',
    fontFamily: 'monospace',
    outline: 'none',
  },
  submitBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 18px',
    border: '1px solid',
    borderRadius: '8px',
    fontSize: '12px',
    fontWeight: 800,
    letterSpacing: '0.04em',
    flexShrink: 0,
    background: 'none',
    whiteSpace: 'nowrap',
  },
  cancelBtn: {
    padding: '8px 24px',
    background: 'rgba(100, 116, 139, 0.1)',
    border: '1px solid rgba(100, 116, 139, 0.3)',
    borderRadius: '8px',
    color: '#94A3B8',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  codeInline: {
    padding: '2px 6px',
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.2)',
    borderRadius: '4px',
    fontFamily: 'monospace',
    fontWeight: 800,
    color: '#EF4444',
    letterSpacing: '0.08em',
    fontSize: '12px',
  },
  doneBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '12px 16px',
    background: 'rgba(34, 197, 94, 0.06)',
    border: '1px solid rgba(34, 197, 94, 0.3)',
    borderRadius: '10px',
  },

  // ── Hardware Key Panel (WebAuthn / FIDO2) ──────────────────────────────
  hwPanel: {
    padding: '16px',
    background: 'rgba(15, 23, 42, 0.5)',
    border: '1px solid rgba(100, 116, 139, 0.2)',
    borderRadius: '10px',
  },
  hwPanelInner: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '14px',
  },
  hwIconWrap: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '40px',
    height: '40px',
    borderRadius: '10px',
    flexShrink: 0,
  },
  hwTitle: {
    fontSize: '12px',
    fontWeight: 800,
    letterSpacing: '0.06em',
    margin: '0 0 4px 0',
  },
  hwDesc: {
    fontSize: '12px',
    color: '#94A3B8',
    lineHeight: '1.5',
    margin: '0 0 10px 0',
  },
  hwMeta: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px 14px',
    marginBottom: '10px',
  } as React.CSSProperties,
  hwMetaItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '11px',
    color: '#64748B',
    fontFamily: 'monospace',
  },
  hwMetaDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  hwClearBtn: {
    background: 'none',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: '6px',
    color: '#EF4444',
    fontSize: '11px',
    fontWeight: 700,
    padding: '4px 10px',
    cursor: 'pointer',
    letterSpacing: '0.04em',
  },
  hwRegisterBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    background: 'rgba(59, 130, 246, 0.1)',
    border: '1px solid rgba(59, 130, 246, 0.4)',
    borderRadius: '8px',
    color: '#60A5FA',
    fontSize: '12px',
    fontWeight: 800,
    letterSpacing: '0.04em',
    cursor: 'pointer',
    marginTop: '4px',
  },

  // ── Hardware Secured Badge ───────────────────────────────────────────────
  hwBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 10px',
    background: 'rgba(34, 197, 94, 0.08)',
    border: '1px solid rgba(34, 197, 94, 0.3)',
    borderRadius: '6px',
  },
  hwBadgeText: {
    fontSize: '10px',
    fontWeight: 800,
    color: '#22C55E',
    letterSpacing: '0.08em',
  },
};
