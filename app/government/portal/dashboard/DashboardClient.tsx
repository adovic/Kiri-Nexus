'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import useSWR, { mutate } from 'swr';
import {
  Phone,
  Wrench,
  Clock,
  Activity,
  Fingerprint,
  Radio,
  ChevronRight,
  Hash,
  ShieldCheck,
} from 'lucide-react';
import IntegrityCertificate from '@/components/government/IntegrityCertificate';
import InfoBubble from '@/components/government/InfoBubble';
import SearchPanel from './SearchPanel';
import { getFirebaseClient } from '@/lib/firebase/client';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  type DocumentData,
} from 'firebase/firestore';
import type { User as FirebaseUser } from 'firebase/auth';

// =============================================================================
// DASHBOARD CLIENT — Live Control Plane Feed
// =============================================================================
// SWR-powered data layer + real-time Firestore call feed.
//
// Data sources:
//   useSWR('/api/health')                         → System status
//   useSWR('/api/government/audit-integrity')      → Chain integrity
//   useSWR('/api/government/raio-checkin?...')      → RAIO status
//   Firestore onSnapshot('government_calls')       → Live call feed
//
// SWR cache keys are shared with TelemetryBar — when a new call arrives,
// we call mutate('/api/government/audit-integrity') to trigger a
// revalidation that both this component and TelemetryBar will see.
// =============================================================================

// ── SWR Fetcher ──────────────────────────────────────────────────────────────

const swrFetcher = (url: string) =>
  fetch(url, { credentials: 'include' }).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });

// ── Shared Types ─────────────────────────────────────────────────────────────

export interface IntegrityData {
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
}

export interface WitnessData {
  chain_head: string;
  witness_count: number;
  integrity_pulse: boolean;
  witness_hashes: string[];
  checked_at: string;
  tenant_id: string;
  /** Epoch ms set by the server immediately before responding */
  server_timestamp: number;
  /** Client-computed latency: client_received_at - server_timestamp (ms) */
  witness_latency_ms: number;
}

export interface HealthData {
  status: 'ok' | 'error';
}

export interface RaioStatusData {
  authorized: boolean;
  expired: boolean;
  days_remaining: number;
  days_since_checkin: number;
  verdict: string;
  latest_entry: {
    entry_id: string;
    raio_user_id: string;
    timestamp: string;
    merkle_root_hash: string;
    authorization_window: { from: string; until: string };
  } | null;
  ledger_integrity: { valid: boolean; total_entries: number };
  // ── Certification fields (v2) ──
  certification_status: 'ACTIVE' | 'GRACE_PERIOD' | 'EXPIRED';
  days_until_expiry: number;
  recertification_required: boolean;
  last_audit_timestamp: string | null;
  certification_window_days: number;
  grace_period_days: number;
  governance_synced: boolean;
  governance_last_sync: string | null;
}

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

// ── SWR Hook Exports (shared with page.tsx) ──────────────────────────────────
// These are standard useSWR calls with refreshInterval. Because SWR
// deduplicates by key, any component in the React tree that calls useSWR
// with the same key will share the same cached response.

export function useHealth() {
  return useSWR<HealthData>('/api/health', swrFetcher, {
    refreshInterval: 15_000,
    revalidateOnFocus: false,
  });
}

export function useIntegrity() {
  return useSWR<IntegrityData>(
    '/api/government/audit-integrity',
    swrFetcher,
    { refreshInterval: 30_000, revalidateOnFocus: false },
  );
}

/**
 * Witness-specific fetcher: records client receive time and diffs against
 * server_timestamp to produce a real witness_latency_ms measurement.
 */
const witnessFetcher = async (url: string): Promise<WitnessData> => {
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const clientReceivedAt = Date.now();
  const data = await res.json();
  const serverTs: number = data.server_timestamp ?? clientReceivedAt;
  const witness_latency_ms = Math.max(0, clientReceivedAt - serverTs);
  return { ...data, witness_latency_ms };
};

export function useWitness() {
  return useSWR<WitnessData>(
    '/api/government/audit-integrity?mode=witness',
    witnessFetcher,
    { refreshInterval: 10_000, revalidateOnFocus: false },
  );
}

export function useRaio(tenantId: string | null) {
  const key = tenantId
    ? `/api/government/raio-checkin?tenant_id=${encodeURIComponent(tenantId)}`
    : null;
  return useSWR<RaioStatusData>(key, swrFetcher, {
    refreshInterval: 60_000,
    revalidateOnFocus: false,
  });
}

// ── Props ────────────────────────────────────────────────────────────────────

interface DashboardClientProps {
  tenantData: DocumentData;
  tenantId: string;
  firebaseUser: FirebaseUser;
}

// ── Call Feed Entry with slide-in animation ──────────────────────────────────

const FEED_LIMIT = 15;

function CallFeedEntry({
  call,
  isNew,
  onVerify,
}: {
  call: CallRecord;
  isNew: boolean;
  onVerify: (call: CallRecord) => void;
}) {
  const dur = call.duration ?? 0;
  const mins = Math.floor(dur / 60);
  const secs = dur % 60;
  const timeStr = `${mins}m ${secs.toString().padStart(2, '0')}s`;

  const ts = call.timestamp
    ? new Date(call.timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '--:--';

  const statusColor =
    call.status === 'completed' ? '#22C55E' : '#F59E0B';

  return (
    <div
      style={{
        ...c.feedEntry,
        animation: isNew ? 'slideInFeed 0.4s ease-out' : 'none',
      }}
    >
      <div style={c.feedDot}>
        <div
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: statusColor,
            boxShadow: `0 0 6px ${statusColor}`,
          }}
        />
      </div>

      <div style={c.feedBody}>
        <div style={c.feedTopRow}>
          <span style={c.feedSessionId}>
            <Hash size={11} color="#60A5FA" />
            {call.sessionId?.slice(0, 12) ?? call.id.slice(0, 12)}
          </span>
          <span style={c.feedTimestamp}>{ts}</span>
        </div>

        <div style={c.feedMeta}>
          <span style={c.feedChip}>
            <Clock size={10} />
            {timeStr}
          </span>
          <span style={c.feedChip}>
            <Wrench size={10} />
            {call.toolsUsed?.length ?? 0} tools
          </span>
          <span style={c.feedChip}>
            <Radio size={10} />
            {call.transcriptCount ?? call.transcript?.length ?? 0} turns
          </span>
          <span
            style={{
              ...c.feedStatus,
              color: statusColor,
              borderColor: statusColor,
            }}
          >
            {call.status?.toUpperCase() ?? 'UNKNOWN'}
          </span>
        </div>
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation();
          onVerify(call);
        }}
        style={c.verifyBtn}
        title="Verify chain-of-custody"
      >
        <ShieldCheck size={12} />
        Verify
      </button>

      <ChevronRight size={14} color="#334155" style={{ flexShrink: 0 }} />
    </div>
  );
}

// =============================================================================
// DashboardClient — Main Export
// =============================================================================

export default function DashboardClient({
  tenantData,
  tenantId,
  firebaseUser,
}: DashboardClientProps) {
  // ── SWR data feeds ──────────────────────────────────────────────────
  const { data: integrity } = useIntegrity();

  // ── Verification modal state ────────────────────────────────────────
  const [verifyCall, setVerifyCall] = useState<CallRecord | null>(null);

  // ── Forensic search state ────────────────────────────────────────────
  const [filteredCalls, setFilteredCalls] = useState<CallRecord[]>([]);
  const searchReady = useRef(false);
  const handleFilterChange = useCallback((filtered: CallRecord[]) => {
    searchReady.current = true;
    setFilteredCalls(filtered);
  }, []);

  // ── Firestore call feed (real-time) ─────────────────────────────────
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const knownIdsRef = useRef<Set<string>>(new Set());
  const isFirstSnapshot = useRef(true);

  // Track chain hash changes → signal TelemetryBar via SWR cache mutation
  const prevHashRef = useRef<string | null>(null);

  useEffect(() => {
    if (integrity?.chain_head_hash && prevHashRef.current !== null) {
      if (integrity.chain_head_hash !== prevHashRef.current) {
        // Chain mutated — revalidate both full and witness caches
        mutate('/api/government/audit-integrity');
        mutate('/api/government/audit-integrity?mode=witness');
      }
    }
    prevHashRef.current = integrity?.chain_head_hash ?? null;
  }, [integrity?.chain_head_hash]);

  // ── Firestore real-time listener (tenant-scoped) ────────────────────
  useEffect(() => {
    const { db } = getFirebaseClient();
    if (!db) return;

    // SECURITY: Filter by tenant_id to enforce tenant isolation.
    // Only call records belonging to this tenant will be returned.
    const q = query(
      collection(db, 'government_calls'),
      where('tenant_id', '==', firebaseUser.uid),
      orderBy('timestamp', 'desc'),
      limit(FEED_LIMIT),
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const records: CallRecord[] = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...(doc.data() as Omit<CallRecord, 'id'>),
        }));

        // Detect genuinely new entries (not present in previous snapshot)
        if (isFirstSnapshot.current) {
          // First load — populate known set, no animations
          records.forEach((r) => knownIdsRef.current.add(r.id));
          isFirstSnapshot.current = false;
        } else {
          const freshIds = new Set<string>();
          for (const r of records) {
            if (!knownIdsRef.current.has(r.id)) {
              freshIds.add(r.id);
              knownIdsRef.current.add(r.id);
            }
          }
          if (freshIds.size > 0) {
            setNewIds(freshIds);
            // New call → revalidate both full integrity and witness caches
            mutate('/api/government/audit-integrity');
            mutate('/api/government/audit-integrity?mode=witness');
            // Clear "new" flags after animation completes
            setTimeout(() => setNewIds(new Set()), 500);
          }
        }

        setCalls(records);
      },
      (err) => {
        console.error('[DashboardClient] Call feed error:', err);
      },
    );

    return () => unsubscribe();
  }, [firebaseUser.uid]);

  // ── Display calls: filtered if search is active, raw otherwise ──────
  const displayCalls = searchReady.current ? filteredCalls : calls;

  // ── Tenant context ──────────────────────────────────────────────────
  const agencyName =
    tenantData.agency_name ?? tenantData.name ?? 'Unnamed Agency';
  const jurisdiction =
    tenantData.jurisdiction_state ?? tenantData.state ?? '';
  const nodeId = tenantId
    ? `0x${tenantId.replace(/[^a-f0-9]/gi, '').slice(0, 8).toUpperCase()}`
    : '0x--------';
  const agentNhi = tenantData.agent_nhi ?? null;

  // ── Format label: "Pinole, CA" or "Agency Name" ────────────────────
  const locationLabel = jurisdiction
    ? `${agencyName}, ${jurisdiction}`
    : agencyName;

  return (
    <>
      {/* Keyframes */}
      <style>{`
        @keyframes slideInFeed {
          0% { opacity: 0; transform: translateX(-20px); }
          100% { opacity: 1; transform: translateX(0); }
        }
      `}</style>

      {/* ── Tenant Context Banner ──────────────────────────────────────── */}
      <div style={c.contextBar}>
        <div style={c.contextLeft}>
          <Fingerprint size={16} color="#A78BFA" />
          <span style={c.contextAgency}>{locationLabel}</span>
          <div style={c.contextSep} />
          <span style={{ ...c.contextNode, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            Node <span style={c.contextNodeId}>{nodeId}</span>
            <InfoBubble
              what="The Node ID is a truncated hex representation of the tenant's Firestore document ID. It identifies this specific agency deployment."
              why="Useful for debugging and support — reference this ID when reporting issues."
            />
          </span>
          {agentNhi && (
            <>
              <div style={c.contextSep} />
              <span style={{ ...c.contextNhi, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                NHI {agentNhi}
                <InfoBubble
                  what="Non-Human Identity (NHI) — a unique identifier assigned to the AI agent operating on behalf of this agency."
                  why="Per RAIO M-26-04, AI systems acting in government contexts must carry an NHI badge for accountability and auditability."
                  missing="No NHI badge assigned. This may indicate the agent has not been provisioned through the RAIO workflow."
                />
              </span>
            </>
          )}
        </div>
        <div style={c.contextRight}>
          <Activity size={12} color="#22C55E" />
          <span style={c.contextLive}>LIVE</span>
        </div>
      </div>

      {/* ── Forensic Search Panel ────────────────────────────────────────── */}
      <SearchPanel
        calls={calls}
        integrityData={integrity ?? null}
        onFilterChange={handleFilterChange}
        tenantId={tenantId}
        agencyName={agencyName}
      />

      {/* ── Live Call Feed ──────────────────────────────────────────────── */}
      <div style={c.feedContainer}>
        <div style={c.feedHeader}>
          <Phone size={16} color="#60A5FA" />
          <span style={{ ...c.feedTitle, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            Live Call Feed
            <InfoBubble
              what="A real-time stream of citizen calls handled by the AI receptionist. Each entry shows session ID, duration, tools used, and verification status."
              why="Provides immediate operational visibility. Every call is recorded in the audit chain and can be individually verified for chain-of-custody."
              missing="No calls have been received yet. Calls will appear here in real-time as citizens interact with the AI."
            />
          </span>
          <span style={c.feedCount}>
            {displayCalls.length !== calls.length
              ? `${displayCalls.length} of ${calls.length} records`
              : `${calls.length} record${calls.length !== 1 ? 's' : ''}`}
          </span>
        </div>

        <div style={c.feedList}>
          {displayCalls.length === 0 ? (
            <div style={c.feedEmpty}>
              <Phone size={24} color="#334155" />
              <span>
                {calls.length === 0
                  ? 'No call records yet. Incoming calls will appear here in real-time.'
                  : 'No records match the current filters.'}
              </span>
            </div>
          ) : (
            displayCalls.map((call) => (
              <CallFeedEntry
                key={call.id}
                call={call}
                isNew={newIds.has(call.id)}
                onVerify={setVerifyCall}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Integrity Certificate Modal ────────────────────────────────── */}
      <IntegrityCertificate
        isOpen={!!verifyCall}
        onClose={() => setVerifyCall(null)}
        callId={verifyCall?.id ?? ''}
        sessionId={verifyCall?.sessionId ?? ''}
        callTimestamp={verifyCall?.timestamp ?? ''}
        toolsUsed={verifyCall?.toolsUsed ?? []}
        duration={verifyCall?.duration ?? 0}
        status={verifyCall?.status ?? 'unknown'}
      />
    </>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const c: { [key: string]: React.CSSProperties } = {
  // ── Tenant Context Banner ──────────────────────────────────────────────
  contextBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 16px',
    background: 'rgba(15, 23, 42, 0.7)',
    border: '1px solid rgba(167, 139, 250, 0.15)',
    borderRadius: '10px',
    marginBottom: '24px',
  },
  contextLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  contextAgency: {
    fontSize: '13px',
    fontWeight: 700,
    color: '#F8FAFC',
    letterSpacing: '0.02em',
  },
  contextSep: {
    width: '1px',
    height: '14px',
    background: 'rgba(100, 116, 139, 0.3)',
  },
  contextNode: {
    fontSize: '12px',
    color: '#94A3B8',
  },
  contextNodeId: {
    fontFamily: 'monospace',
    fontWeight: 700,
    color: '#60A5FA',
    letterSpacing: '0.04em',
  },
  contextNhi: {
    fontSize: '11px',
    fontFamily: 'monospace',
    fontWeight: 600,
    color: '#A78BFA',
    letterSpacing: '0.03em',
  },
  contextRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  contextLive: {
    fontSize: '11px',
    fontWeight: 800,
    color: '#22C55E',
    letterSpacing: '0.1em',
    fontFamily: 'monospace',
  },

  // ── Feed Container ─────────────────────────────────────────────────────
  feedContainer: {
    background: 'rgba(15, 23, 42, 0.6)',
    border: '1px solid rgba(30, 64, 175, 0.2)',
    borderRadius: '16px',
    overflow: 'hidden',
    marginBottom: '40px',
  },
  feedHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '16px 20px',
    borderBottom: '1px solid rgba(30, 64, 175, 0.15)',
  },
  feedTitle: {
    fontSize: '14px',
    fontWeight: 700,
    color: '#F8FAFC',
    letterSpacing: '0.02em',
    flex: 1,
  },
  feedCount: {
    fontSize: '12px',
    color: '#64748B',
    fontFamily: 'monospace',
  },
  feedList: {
    maxHeight: '400px',
    overflowY: 'auto',
  },
  feedEmpty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '10px',
    padding: '40px 20px',
    fontSize: '13px',
    color: '#475569',
    textAlign: 'center',
  },

  // ── Feed Entry ─────────────────────────────────────────────────────────
  feedEntry: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 20px',
    borderBottom: '1px solid rgba(30, 64, 175, 0.08)',
    transition: 'background 0.15s ease',
  },
  feedDot: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '20px',
  },
  feedBody: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  feedTopRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  feedSessionId: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '13px',
    fontWeight: 700,
    color: '#E2E8F0',
    fontFamily: 'monospace',
    letterSpacing: '0.02em',
  },
  feedTimestamp: {
    fontSize: '11px',
    color: '#64748B',
    fontFamily: 'monospace',
  },
  feedMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
  },
  feedChip: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '11px',
    color: '#94A3B8',
  },
  feedStatus: {
    fontSize: '10px',
    fontWeight: 800,
    letterSpacing: '0.06em',
    padding: '2px 6px',
    border: '1px solid',
    borderRadius: '4px',
    fontFamily: 'monospace',
  },
  verifyBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 10px',
    background: 'rgba(167, 139, 250, 0.08)',
    border: '1px solid rgba(167, 139, 250, 0.25)',
    borderRadius: '6px',
    color: '#A78BFA',
    fontSize: '11px',
    fontWeight: 700,
    fontFamily: 'monospace',
    letterSpacing: '0.04em',
    cursor: 'pointer',
    flexShrink: 0,
    transition: 'all 0.15s ease',
  },
};
