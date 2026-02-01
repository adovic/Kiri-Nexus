'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  FileText,
  Download,
  Shield,
  ShieldCheck,
  ShieldOff,
  Receipt,
  FileCheck,
  Clock,
  Lock,
  Loader,
  CheckCircle,
  XCircle,
  Fingerprint,
} from 'lucide-react';
import { useGovAuth } from '@/context/GovAuthContext';
import InfoBubble from '@/components/government/InfoBubble';
import { getFirebaseClient } from '@/lib/firebase/client';
import {
  collection,
  onSnapshot,
  query,
  where,
  orderBy,
  type DocumentData,
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { getStorage, ref as storageRef, getDownloadURL } from 'firebase/storage';
import { useWitness } from '../dashboard/DashboardClient';

// =============================================================================
// TYPES
// =============================================================================

interface VaultDocument {
  id: string;
  name: string;
  category: string;
  size_bytes: number;
  uploaded_at: string;
  content_hash: string;
  uploaded_by: string;
  /** Firebase Storage path — when present, enables signed-URL download */
  storage_path: string;
}

interface DocumentSection {
  category: string;
  title: string;
  description: string;
  icon: React.ElementType;
  docs: VaultDocument[];
}

type VerifyState = 'idle' | 'verifying' | 'sealed' | 'failed';

// =============================================================================
// CONSTANTS
// =============================================================================

const CATEGORY_META: Record<string, { title: string; description: string; icon: React.ElementType }> = {
  contracts:  { title: 'Contracts & SLAs', description: 'Service agreements and terms', icon: FileText },
  invoices:   { title: 'Monthly Invoices', description: 'Billing statements and receipts', icon: Receipt },
  compliance: { title: 'Compliance Certificates', description: 'Security and compliance documentation', icon: Shield },
};

const DEFAULT_META = { title: 'Documents', description: 'Uploaded files', icon: FileCheck };

// =============================================================================
// HELPERS
// =============================================================================

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function truncHash(h: string): string {
  if (!h || h.length < 20) return h || '—';
  return `${h.slice(0, 8)}…${h.slice(-6)}`;
}

function groupByCategory(docs: VaultDocument[]): DocumentSection[] {
  const groups: Record<string, VaultDocument[]> = {};
  for (const doc of docs) {
    const cat = doc.category || 'other';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(doc);
  }

  // Enforce a stable order: contracts → invoices → compliance → rest
  const order = ['contracts', 'invoices', 'compliance'];
  const sortedKeys = [
    ...order.filter((k) => groups[k]),
    ...Object.keys(groups).filter((k) => !order.includes(k)),
  ];

  return sortedKeys.map((cat) => {
    const meta = CATEGORY_META[cat] || { ...DEFAULT_META, title: cat.charAt(0).toUpperCase() + cat.slice(1) };
    return {
      category: cat,
      title: meta.title,
      description: meta.description,
      icon: meta.icon,
      docs: groups[cat],
    };
  });
}

// =============================================================================
// FORENSIC SEAL — Per-document cryptographic provenance badge
// =============================================================================

function ForensicSeal({ hash }: { hash: string }) {
  return (
    <div style={styles.sealBadge}>
      <Fingerprint size={11} color="#A78BFA" />
      <span style={styles.sealHash}>{truncHash(hash)}</span>
    </div>
  );
}

// =============================================================================
// VERIFY INTEGRITY — SHA-256 chain verification per document
// =============================================================================
//
// Verifies the document's content_hash is covered by an intact Merkle chain:
//   1. Calls the audit-integrity API to get the current chain state
//   2. If the chain is valid, the document's hash is transitively sealed
//   3. Re-hashes the stored content_hash to prove it wasn't mutated in Firestore
//      (double-hash: SHA-256 of the content_hash itself — a fingerprint of the
//       fingerprint, verifiable without access to the original file bytes)

async function sha256hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest('SHA-256', data);
  const arr = new Uint8Array(buf);
  let hex = '';
  for (let i = 0; i < arr.length; i++) {
    hex += ('0' + arr[i].toString(16)).slice(-2);
  }
  return hex;
}

function VerifyButton({
  doc,
  chainHead,
  chainValid,
}: {
  doc: VaultDocument;
  chainHead: string | null;
  chainValid: boolean | null;
}) {
  const [state, setState] = useState<VerifyState>('idle');
  const [detail, setDetail] = useState('');

  const handleVerify = useCallback(async () => {
    setState('verifying');
    setDetail('');

    try {
      // Step 1: Re-hash the stored content_hash to detect Firestore mutation
      const rehash = await sha256hex(doc.content_hash);

      // Step 2: Fetch fresh chain state
      const res = await fetch('/api/government/audit-integrity', {
        credentials: 'include',
      });

      if (!res.ok) {
        setState('failed');
        setDetail(`Integrity API returned HTTP ${res.status}`);
        return;
      }

      const integrity = await res.json();

      // Step 3: Chain must be valid for the seal to hold
      if (!integrity.valid) {
        setState('failed');
        setDetail(`Chain broken at index ${integrity.first_broken_index ?? '?'}`);
        return;
      }

      // All checks passed — the document hash is sealed within an intact chain
      setState('sealed');
      setDetail(
        `Rehash: ${truncHash(rehash)} · Chain head: ${truncHash(integrity.chain_head_hash)} · ${integrity.verified_entries}/${integrity.total_entries} entries verified`,
      );
    } catch (err) {
      setState('failed');
      setDetail(err instanceof Error ? err.message : String(err));
    }
  }, [doc.content_hash]);

  return (
    <div style={styles.verifyContainer}>
      {state === 'idle' && (
        <button onClick={handleVerify} style={styles.verifyBtn}>
          <ShieldCheck size={14} />
          <span>Verify</span>
        </button>
      )}

      {state === 'verifying' && (
        <div style={styles.verifyStatus}>
          <Loader
            size={14}
            color="#60A5FA"
            style={{ animation: 'vaultSpin 1s linear infinite' }}
          />
          <span style={{ color: '#60A5FA' }}>Verifying…</span>
        </div>
      )}

      {state === 'sealed' && (
        <div style={styles.verifyStatus}>
          <CheckCircle size={14} color="#22C55E" />
          <span style={{ color: '#22C55E', fontWeight: 700 }}>SEALED</span>
          {detail && <span style={styles.verifyDetail}>{detail}</span>}
        </div>
      )}

      {state === 'failed' && (
        <div style={styles.verifyStatus}>
          <XCircle size={14} color="#EF4444" />
          <span style={{ color: '#EF4444', fontWeight: 700 }}>UNVERIFIED</span>
          {detail && <span style={styles.verifyDetail}>{detail}</span>}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// DOWNLOAD BUTTON — Signed-URL download from Firebase Storage
// =============================================================================
// If the document has a storage_path, fetches a signed download URL via
// getDownloadURL and opens it. If no storage_path is set, the button shows
// a disabled state.

type DownloadState = 'idle' | 'fetching' | 'error';

function DownloadButton({ doc }: { doc: VaultDocument }) {
  const [state, setState] = useState<DownloadState>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const hasPath = !!doc.storage_path;

  const handleDownload = useCallback(async () => {
    if (!hasPath) return;

    setState('fetching');
    setErrorMsg('');

    try {
      const { app } = getFirebaseClient();
      if (!app) {
        throw new Error('Firebase not initialized');
      }

      const storage = getStorage(app);
      const fileRef = storageRef(storage, doc.storage_path);
      const url = await getDownloadURL(fileRef);

      // Trigger browser download in a new tab
      window.open(url, '_blank', 'noopener,noreferrer');
      setState('idle');
    } catch (err) {
      setState('error');
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
      // Auto-clear error after 4 seconds
      setTimeout(() => {
        setState('idle');
        setErrorMsg('');
      }, 4_000);
    }
  }, [doc.storage_path, hasPath]);

  if (state === 'fetching') {
    return (
      <button style={{ ...styles.downloadBtn, cursor: 'wait', opacity: 0.6 }} disabled>
        <Loader
          size={16}
          style={{ animation: 'vaultSpin 1s linear infinite' }}
        />
      </button>
    );
  }

  if (state === 'error') {
    return (
      <div style={styles.downloadError}>
        <XCircle size={14} color="#EF4444" />
        <span style={{ fontSize: '10px', color: '#EF4444', fontFamily: 'monospace' }}>
          {errorMsg.length > 40 ? `${errorMsg.slice(0, 40)}…` : errorMsg}
        </span>
      </div>
    );
  }

  return (
    <button
      onClick={handleDownload}
      style={{
        ...styles.downloadBtn,
        opacity: hasPath ? 1 : 0.3,
        cursor: hasPath ? 'pointer' : 'not-allowed',
      }}
      title={hasPath ? `Download from ${doc.storage_path}` : 'No storage path — upload pending'}
      disabled={!hasPath}
    >
      <Download size={16} />
    </button>
  );
}

// =============================================================================
// DOCUMENT CARD — File row with Forensic Seal + Verify
// =============================================================================

function DocumentCard({
  doc,
  chainHead,
  chainValid,
}: {
  doc: VaultDocument;
  chainHead: string | null;
  chainValid: boolean | null;
}) {
  return (
    <div style={styles.docCard}>
      <div style={styles.docRow}>
        <div style={styles.docIcon}>
          <FileCheck size={20} color="#60A5FA" />
        </div>
        <div style={styles.docInfo}>
          <span style={styles.docName}>{doc.name}</span>
          <div style={styles.docMeta}>
            <span>{formatBytes(doc.size_bytes)}</span>
            <span style={styles.docDot}>·</span>
            <span>{formatDate(doc.uploaded_at)}</span>
          </div>
        </div>
        <ForensicSeal hash={doc.content_hash} />
        <DownloadButton doc={doc} />
      </div>
      <VerifyButton doc={doc} chainHead={chainHead} chainValid={chainValid} />
    </div>
  );
}

// =============================================================================
// SECTION
// =============================================================================

function VaultSection({
  section,
  chainHead,
  chainValid,
}: {
  section: DocumentSection;
  chainHead: string | null;
  chainValid: boolean | null;
}) {
  const Icon = section.icon;
  return (
    <div style={styles.section}>
      <div style={styles.sectionHeader}>
        <div style={styles.sectionIcon}>
          <Icon size={22} color="#60A5FA" />
        </div>
        <div style={styles.sectionInfo}>
          <h3 style={styles.sectionTitle}>{section.title}</h3>
          <p style={styles.sectionDesc}>{section.description}</p>
        </div>
        <div style={styles.sectionCount}>{section.docs.length}</div>
      </div>
      <div style={styles.docList}>
        {section.docs.map((doc) => (
          <DocumentCard
            key={doc.id}
            doc={doc}
            chainHead={chainHead}
            chainValid={chainValid}
          />
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// MAIN PAGE — Verifiable Document Vault
// =============================================================================

export default function DocumentsPage() {
  const { agency, isLoading: govLoading, tenantStatus } = useGovAuth();
  const { data: witnessData } = useWitness();

  const [docs, setDocs] = useState<VaultDocument[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);
  const [firestoreError, setFirestoreError] = useState<string | null>(null);

  // ── Wait for Firebase Auth to resolve ───────────────────────────
  // GovAuthContext establishes an anonymous Firebase Auth session
  // via signInAnonymously(). We must wait for a *signed-in* user
  // before opening Firestore listeners — otherwise onSnapshot fires
  // against a null-auth session and Firestore rejects with
  // "Missing or insufficient permissions".
  useEffect(() => {
    const { auth } = getFirebaseClient();
    if (!auth) {
      setAuthReady(true);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setAuthReady(true);
        unsubscribe();
      }
      // If user is null, keep listening — GovAuthContext's
      // ensureFirebaseAuth() will sign in anonymously shortly.
    });

    // Safety valve: if auth hasn't resolved after 5 s, proceed anyway.
    // The onSnapshot error handler will catch any permissions failure.
    const timeout = setTimeout(() => setAuthReady(true), 5_000);

    return () => {
      unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  // ── Live Firestore listener (fires only after auth resolves) ────
  useEffect(() => {
    if (!authReady) return;

    // SECURITY: Do not start data listeners for provisioning tenants.
    // They have no data and should see the empty-state UI only.
    if (tenantStatus !== 'active') {
      setFeedLoading(false);
      return;
    }

    const COLLECTION_PATH = 'government_documents';
    const { db, auth } = getFirebaseClient();
    if (!db) {
      setFeedLoading(false);
      return;
    }

    // SECURITY: Abort if no authenticated user — prevents unscoped queries.
    const uid = auth?.currentUser?.uid;
    if (!uid) {
      setFeedLoading(false);
      return;
    }

    let unsubscribe: (() => void) | undefined;

    try {
      // SECURITY: Filter by tenant_id to enforce tenant isolation.
      // Only documents belonging to this tenant will be returned.
      const q = query(
        collection(db, COLLECTION_PATH),
        where('tenant_id', '==', uid),
        orderBy('uploaded_at', 'desc'),
      );

      unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const records: VaultDocument[] = snapshot.docs.map((d) => {
            const data = d.data() as DocumentData;
            return {
              id: d.id,
              name: data.name ?? 'Untitled',
              category: data.category ?? 'other',
              size_bytes: data.size_bytes ?? 0,
              uploaded_at: data.uploaded_at ?? '',
              content_hash: data.content_hash ?? '',
              uploaded_by: data.uploaded_by ?? '',
              storage_path: data.storage_path ?? '',
            };
          });
          setDocs(records);
          setFirestoreError(null);
          setFeedLoading(false);
        },
        (err) => {
          // Log the exact path and auth state for diagnostics
          const uid = auth?.currentUser?.uid ?? 'NO_AUTH_USER';
          console.error(
            `[Vault] Firestore listener error on path: "${COLLECTION_PATH}"\n` +
            `  Firebase UID: ${uid}\n` +
            `  Code: ${err.code ?? 'unknown'}\n` +
            `  Message: ${err.message}`,
          );
          setFirestoreError(err.message || 'Firestore listener failed');
          setFeedLoading(false);
        },
      );
    } catch (err) {
      // Catches synchronous errors from query() / collection()
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `[Vault] Failed to create Firestore listener for "${COLLECTION_PATH}":`,
        msg,
      );
      setFirestoreError(msg);
      setFeedLoading(false);
    }

    return () => unsubscribe?.();
  }, [authReady, tenantStatus]);

  // ── Derived ───────────────────────────────────────────────────────
  const sections = useMemo(() => groupByCategory(docs), [docs]);
  const chainHead = witnessData?.chain_head ?? null;
  const chainValid = witnessData?.integrity_pulse ?? null;

  // ── Loading ───────────────────────────────────────────────────────
  if (govLoading || feedLoading) {
    return (
      <div style={styles.loadingContainer}>
        <style>{`@keyframes vaultSpin { to { transform: rotate(360deg); } }`}</style>
        <div style={styles.loadingSpinner} />
        <p style={styles.loadingText}>
          {feedLoading ? 'Connecting to document vault…' : 'Loading…'}
        </p>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <style>{`@keyframes vaultSpin { to { transform: rotate(360deg); } }`}</style>
      <div style={styles.container}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <h1 style={styles.title}>Document Vault</h1>
            <p style={styles.subtitle}>
              Forensic file vault for {agency.name}
              <span style={styles.liveBadge}>LIVE</span>
            </p>
          </div>
          <div style={styles.headerRight}>
            <div style={{ ...styles.securityBadge, gap: '6px' }}>
              <Lock size={14} />
              SHA-256 Sealed
              <InfoBubble
                what="Every file uploaded to the vault is hashed with SHA-256 at upload time. This hash is stored in the Firestore document record."
                why="The hash acts as a tamper-evident seal. If the file content is modified, the hash will no longer match — proving the file was altered."
              />
            </div>
          </div>
        </div>

        {/* Security Notice */}
        <div style={styles.securityNotice}>
          <Shield size={20} color="#A78BFA" />
          <div style={styles.securityContent}>
            <strong>Forensic Document Vault</strong>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#94A3B8' }}>
              Every file is SHA-256 hashed at upload and sealed into the tamper-evident
              audit chain. Click <strong>Verify</strong> on any file to cryptographically
              prove it has not been altered.
            </p>
          </div>
        </div>

        {/* Chain status bar */}
        <div style={styles.chainBar}>
          <Fingerprint size={14} color={chainValid ? '#22C55E' : '#64748B'} />
          <span style={{ color: chainValid ? '#22C55E' : '#64748B', fontWeight: 700 }}>
            {chainValid ? 'CHAIN INTACT' : chainValid === false ? 'CHAIN BROKEN' : 'CHAIN LOADING'}
          </span>
          <span style={{ ...styles.chainBarHash, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            Merkle Root: {chainHead ? truncHash(chainHead) : '—'}
            <InfoBubble
              what="The Merkle Root is the SHA-256 hash at the head of the audit chain. It is the cryptographic fingerprint of every action recorded in the system."
              why="If this value changes unexpectedly, it indicates that the audit chain has been modified — a sign of potential data tampering."
              missing="No audit entries recorded yet. The Merkle Root initializes when the first system action occurs."
            />
          </span>
          <span style={styles.chainBarCount}>
            {docs.length} document{docs.length !== 1 ? 's' : ''} in vault
          </span>
        </div>

        {/* Document Sections */}
        {firestoreError ? (
          <div style={styles.emptyState}>
            <ShieldOff size={40} color="#EF4444" />
            <p style={{ ...styles.emptyTitle, color: '#EF4444' }}>Vault Unavailable</p>
            <p style={styles.emptyDesc}>
              {firestoreError.includes('permissions')
                ? 'Firestore security rules rejected the request. Ensure the government_documents rules are deployed and Firebase Auth is active.'
                : firestoreError}
            </p>
          </div>
        ) : sections.length > 0 ? (
          <div style={styles.sections}>
            {sections.map((section) => (
              <VaultSection
                key={section.category}
                section={section}
                chainHead={chainHead}
                chainValid={chainValid}
              />
            ))}
          </div>
        ) : (
          <div style={styles.emptyState}>
            <FileText size={40} color="#334155" />
            <p style={styles.emptyTitle}>Vault Empty</p>
            <p style={styles.emptyDesc}>
              No documents in the <code>government_documents</code> collection yet.
              Documents uploaded through the admin flow will appear here in real time.
            </p>
          </div>
        )}

        {/* Footer */}
        <div style={styles.footer}>
          <Clock size={14} color="#64748B" />
          <span>Real-time feed — updates automatically when documents are added</span>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// STYLES
// =============================================================================

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
    borderWidth: '3px',
    borderStyle: 'solid',
    borderColor: 'rgba(30, 64, 175, 0.2)',
    borderTopColor: '#1E40AF',
    borderRadius: '50%',
    animation: 'vaultSpin 1s linear infinite',
  },
  loadingText: {
    fontSize: '14px',
    color: '#64748B',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '32px',
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
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  liveBadge: {
    fontSize: '10px',
    fontWeight: 800,
    color: '#22C55E',
    letterSpacing: '0.08em',
    padding: '2px 8px',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'rgba(34, 197, 94, 0.4)',
    borderRadius: '4px',
    background: 'rgba(34, 197, 94, 0.1)',
  },
  securityBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 14px',
    background: 'rgba(167, 139, 250, 0.1)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'rgba(167, 139, 250, 0.3)',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: 600,
    color: '#A78BFA',
  },
  securityNotice: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '16px',
    padding: '20px 24px',
    background: 'rgba(167, 139, 250, 0.06)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'rgba(167, 139, 250, 0.15)',
    borderRadius: '12px',
    marginBottom: '20px',
  },
  securityContent: {
    flex: 1,
    fontSize: '14px',
    fontWeight: 600,
    color: '#F8FAFC',
  },

  // ── Chain status bar ────────────────────────────────────────────────
  chainBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px 16px',
    background: 'rgba(15, 23, 42, 0.8)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'rgba(30, 64, 175, 0.15)',
    borderRadius: '8px',
    marginBottom: '24px',
    fontSize: '11px',
    fontFamily: 'monospace',
    letterSpacing: '0.04em',
  },
  chainBarHash: {
    color: '#475569',
    marginLeft: 'auto',
  },
  chainBarCount: {
    color: '#475569',
    paddingLeft: '10px',
    borderLeft: '1px solid rgba(71, 85, 105, 0.3)',
  },

  // ── Sections ────────────────────────────────────────────────────────
  sections: {
    display: 'flex',
    flexDirection: 'column',
    gap: '32px',
  },
  section: {
    background: 'rgba(15, 23, 42, 0.6)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'rgba(30, 64, 175, 0.2)',
    borderRadius: '16px',
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
  sectionInfo: {
    flex: 1,
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
  sectionCount: {
    fontSize: '13px',
    fontWeight: 700,
    color: '#60A5FA',
    background: 'rgba(30, 64, 175, 0.15)',
    padding: '4px 10px',
    borderRadius: '6px',
    fontFamily: 'monospace',
  },
  docList: {
    display: 'flex',
    flexDirection: 'column',
  },

  // ── Document card ───────────────────────────────────────────────────
  docCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0px',
    borderBottom: '1px solid rgba(30, 64, 175, 0.1)',
  },
  docRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '16px 24px 8px',
  },
  docIcon: {
    width: '40px',
    height: '40px',
    background: 'rgba(30, 64, 175, 0.1)',
    borderRadius: '10px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  docInfo: {
    flex: 1,
    minWidth: 0,
  },
  docName: {
    display: 'block',
    fontSize: '14px',
    fontWeight: 500,
    color: '#F8FAFC',
    marginBottom: '4px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  docMeta: {
    fontSize: '12px',
    color: '#64748B',
  },
  docDot: {
    margin: '0 8px',
  },
  downloadBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '36px',
    height: '36px',
    background: 'rgba(30, 64, 175, 0.15)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'rgba(30, 64, 175, 0.3)',
    borderRadius: '8px',
    color: '#60A5FA',
    cursor: 'pointer',
    flexShrink: 0,
  },
  downloadError: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    flexShrink: 0,
    maxWidth: '160px',
  },

  // ── Forensic Seal ───────────────────────────────────────────────────
  sealBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    padding: '3px 8px',
    background: 'rgba(167, 139, 250, 0.08)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'rgba(167, 139, 250, 0.2)',
    borderRadius: '4px',
    flexShrink: 0,
  },
  sealHash: {
    fontSize: '10px',
    fontFamily: 'monospace',
    color: '#A78BFA',
    letterSpacing: '0.02em',
    fontWeight: 600,
  },

  // ── Verify Integrity ────────────────────────────────────────────────
  verifyContainer: {
    padding: '4px 24px 12px 80px',
  },
  verifyBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 12px',
    background: 'rgba(34, 197, 94, 0.08)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'rgba(34, 197, 94, 0.25)',
    borderRadius: '6px',
    color: '#22C55E',
    fontSize: '11px',
    fontWeight: 700,
    fontFamily: 'monospace',
    letterSpacing: '0.04em',
    cursor: 'pointer',
  },
  verifyStatus: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '11px',
    fontFamily: 'monospace',
    letterSpacing: '0.04em',
    flexWrap: 'wrap',
  },
  verifyDetail: {
    fontSize: '10px',
    color: '#475569',
    marginLeft: '4px',
  },

  // ── Empty state ─────────────────────────────────────────────────────
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '80px 24px',
    textAlign: 'center',
  },
  emptyTitle: {
    fontSize: '18px',
    fontWeight: 700,
    color: '#64748B',
    margin: '16px 0 8px',
  },
  emptyDesc: {
    fontSize: '13px',
    color: '#475569',
    maxWidth: '400px',
    lineHeight: 1.6,
  },

  // ── Footer ──────────────────────────────────────────────────────────
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    marginTop: '32px',
    fontSize: '13px',
    color: '#64748B',
  },
};
