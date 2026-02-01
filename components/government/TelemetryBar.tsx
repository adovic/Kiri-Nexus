'use client';

import { useState, useEffect, useRef } from 'react';
import useSWR from 'swr';

// =============================================================================
// TELEMETRY BAR — Command Center Status Strip
// =============================================================================
//
// Self-contained, high-density status bar for the Kiri Nexus Control Plane.
// Three sections in a single horizontal strip:
//
//   [LEFT]    AGENCY_ID + NODE_STATUS (pulse indicator)
//   [CENTER]  Scrolling Merkle Hash Ticker (chain head + height)
//   [RIGHT]   Real-time UTC clock + DEFCON readiness badge
//
// Data sources (self-contained SWR hooks, 5-second polling):
//   /api/government/audit-integrity?mode=witness → chain state
//   /api/health                                  → system heartbeat
//
// This component lives in components/government/ and is independent of the
// dashboard SWR cache. It manages its own polling lifecycle.
//
// NOTE: This project uses CSS-in-JS (inline style objects), not Tailwind
// utility classes. Tailwind dependencies are installed but the compiler is
// not configured (no tailwind.config.ts / postcss.config.js). All government
// components follow this pattern for consistency.
// =============================================================================

// ── Types ────────────────────────────────────────────────────────────────────

interface WitnessData {
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

interface HealthData {
  status: 'ok' | 'error';
}

interface TelemetryBarProps {
  /** Display name of the agency (e.g., "City of Pinole") */
  agencyName: string;
  /** Firestore tenant document ID */
  tenantId: string;
  /** Non-Human Identity badge (e.g., "GOV-AI-001") */
  agentNhi?: string | null;
}

// ── DEFCON Levels ────────────────────────────────────────────────────────────
//
//   DEFCON 5 — All Clear     (chain valid, system healthy)
//   DEFCON 4 — Monitoring    (chain valid, health data pending)
//   DEFCON 3 — Elevated      (system degraded, chain still intact)
//   DEFCON 2 — Critical      (chain integrity failure detected)
//   DEFCON 1 — Maximum Alert (chain broken AND system down)
//
// Color mapping follows DoD convention:
//   5=Green  4=Cyan  3=Amber  2=Orange  1=Red

type DefconLevel = 1 | 2 | 3 | 4 | 5;

interface DefconState {
  level: DefconLevel;
  label: string;
  color: string;
  glow: string;
}

const DEFCON_MAP: Record<DefconLevel, Omit<DefconState, 'level'>> = {
  5: { label: 'ALL CLEAR',   color: '#22C55E', glow: 'rgba(34, 197, 94, 0.4)' },
  4: { label: 'MONITORING',  color: '#06B6D4', glow: 'rgba(6, 182, 212, 0.4)' },
  3: { label: 'ELEVATED',    color: '#F59E0B', glow: 'rgba(245, 158, 11, 0.4)' },
  2: { label: 'CRITICAL',    color: '#F97316', glow: 'rgba(249, 115, 22, 0.4)' },
  1: { label: 'MAXIMUM',     color: '#EF4444', glow: 'rgba(239, 68, 68, 0.5)' },
};

function computeDefcon(
  witness: WitnessData | undefined,
  witnessError: unknown,
  health: HealthData | undefined,
  healthError: unknown,
): DefconState {
  const chainValid = witness?.integrity_pulse ?? null;
  const systemHealthy = health ? health.status === 'ok' : null;
  const hasWitnessError = !!witnessError;
  const hasHealthError = !!healthError;

  let level: DefconLevel;

  if (chainValid === false && (systemHealthy === false || hasHealthError)) {
    level = 1; // Chain broken + system down
  } else if (chainValid === false) {
    level = 2; // Chain integrity failure
  } else if (hasWitnessError || (systemHealthy === false || hasHealthError)) {
    level = 3; // Degraded — health or witness fetch issues
  } else if (chainValid === null || systemHealthy === null) {
    level = 4; // Data still loading
  } else {
    level = 5; // All systems nominal
  }

  return { level, ...DEFCON_MAP[level] };
}

// ── SWR Fetchers ─────────────────────────────────────────────────────────────

const fetcher = (url: string) =>
  fetch(url, { credentials: 'include' }).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });

/**
 * Witness-specific fetcher that computes real latency by comparing the
 * server_timestamp (epoch ms set right before the response was sent)
 * against the client's receive time. The delta captures true wire +
 * processing delay instead of a cosmetic timer.
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

// ── Node ID ──────────────────────────────────────────────────────────────────

function deriveNodeId(tenantId: string): string {
  return `0x${tenantId.replace(/[^a-f0-9]/gi, '').slice(0, 8).toUpperCase()}`;
}

// =============================================================================
// Sub-Components
// =============================================================================

// ── Agency & Node Status (Left Section) ──────────────────────────────────────

function AgencyPanel({
  agencyName,
  nodeId,
  nhi,
  online,
  loading,
}: {
  agencyName: string;
  nodeId: string;
  nhi: string | null;
  online: boolean;
  loading: boolean;
}) {
  return (
    <div style={s.leftPanel}>
      {/* Agency ID */}
      <div style={s.fieldRow}>
        <span style={s.fieldLabel}>AGENCY_ID</span>
        <span style={s.fieldSep}>:</span>
        <span style={s.fieldValue}>{agencyName.toUpperCase()}</span>
      </div>

      {/* Node Status */}
      <div style={s.fieldRow}>
        <span style={s.fieldLabel}>NODE_STATUS</span>
        <span style={s.fieldSep}>:</span>
        <div style={s.statusGroup}>
          {/* Pulse Indicator */}
          <div
            style={{
              ...s.pulseDot,
              background: loading ? '#64748B' : online ? '#22C55E' : '#EF4444',
              boxShadow: loading
                ? 'none'
                : online
                  ? '0 0 8px rgba(34, 197, 94, 0.7), 0 0 16px rgba(34, 197, 94, 0.3)'
                  : '0 0 8px rgba(239, 68, 68, 0.7), 0 0 16px rgba(239, 68, 68, 0.3)',
              animation: loading
                ? 'none'
                : online
                  ? 'cmdPulseGreen 2s ease-in-out infinite'
                  : 'cmdPulseRed 1s ease-in-out infinite',
            }}
          />
          <span
            style={{
              ...s.statusText,
              color: loading ? '#64748B' : online ? '#22C55E' : '#EF4444',
            }}
          >
            {loading ? 'SYNCING' : online ? 'ONLINE' : 'OFFLINE'}
          </span>
        </div>
      </div>

      {/* Node & NHI on same row */}
      <div style={s.fieldRow}>
        <span style={s.fieldLabel}>NODE</span>
        <span style={s.fieldSep}>:</span>
        <span style={s.nodeIdValue}>{nodeId}</span>
        {nhi && (
          <>
            <span style={s.fieldDivider}>|</span>
            <span style={s.fieldLabel}>NHI</span>
            <span style={s.fieldSep}>:</span>
            <span style={s.nhiValue}>{nhi}</span>
          </>
        )}
      </div>
    </div>
  );
}

// ── Merkle Hash Ticker (Center Section) ──────────────────────────────────────

function MerkleTicker({
  chainHead,
  height,
  pulse,
  hashes,
  flashActive,
}: {
  chainHead: string | null;
  height: number | null;
  pulse: boolean | null;
  hashes: string[];
  flashActive: boolean;
}) {
  const tickerRef = useRef<HTMLDivElement>(null);

  // Build the scrolling display string
  const hashDisplay = chainHead || 'AWAITING_CHAIN_SYNC';
  const heightDisplay = height !== null ? String(height) : '???';
  const pulseIcon = pulse === true ? '\u2713' : pulse === false ? '\u2717' : '\u2026';

  // Build witness hash trail for extra density
  const witnessTrail = hashes.length > 0
    ? hashes.map((h) => h.slice(0, 12)).join(' \u00B7 ')
    : '';

  const scrollText = chainHead
    ? `${hashDisplay}  \u2502  CHAIN_HEIGHT: ${heightDisplay}  \u2502  INTEGRITY: ${pulseIcon}  \u2502  ${witnessTrail}  \u2502  `
    : 'AWAITING CHAIN SYNCHRONIZATION \u2026 STANDBY \u2026 ';

  // Repeat for seamless loop
  const fullText = `${scrollText}${scrollText}`;

  return (
    <div style={s.tickerContainer}>
      {/* Header label */}
      <div style={s.tickerLabel}>
        <span
          style={{
            ...s.tickerLabelText,
            color: flashActive ? '#F59E0B' : '#60A5FA',
            textShadow: flashActive
              ? '0 0 6px rgba(245, 158, 11, 0.5)'
              : 'none',
          }}
        >
          MERKLE CHAIN
        </span>
        {flashActive && <span style={s.tickerFlashBadge}>NEW BLOCK</span>}
      </div>

      {/* Scrolling ticker */}
      <div style={s.tickerViewport}>
        <div
          ref={tickerRef}
          style={{
            ...s.tickerTrack,
            animationPlayState: chainHead ? 'running' : 'paused',
            color: flashActive ? '#F59E0B' : '#22D3EE',
            textShadow: flashActive
              ? '0 0 10px rgba(245, 158, 11, 0.5)'
              : '0 0 4px rgba(34, 211, 238, 0.2)',
          }}
        >
          {fullText}
        </div>
      </div>
    </div>
  );
}

// ── Witness Latency (Right Section — Top) ─────────────────────────────────────
//
// Replaces the cosmetic UTC clock with a real metric: the measured delay
// between the server computing the chain witness and the client receiving it.
//
//   ≤ 2000ms  → green  "Witness Latency: Xms"
//   > 2000ms  → yellow "SYNC DELAY"
//   > 5000ms  → red    "CHAIN STALLED"

const LATENCY_WARN_MS = 2_000;
const LATENCY_CRIT_MS = 5_000;

function WitnessLatency({ latencyMs }: { latencyMs: number | null }) {
  let valueText: string;
  let labelText: string;
  let color: string;

  if (latencyMs === null) {
    valueText = '---';
    labelText = 'AWAITING';
    color = '#64748B';
  } else if (latencyMs > LATENCY_CRIT_MS) {
    valueText = `${latencyMs}ms`;
    labelText = 'CHAIN STALLED';
    color = '#EF4444';
  } else if (latencyMs > LATENCY_WARN_MS) {
    valueText = `${latencyMs}ms`;
    labelText = 'SYNC DELAY';
    color = '#F59E0B';
  } else {
    valueText = `${latencyMs}ms`;
    labelText = 'WITNESS LATENCY';
    color = '#22C55E';
  }

  return (
    <div style={s.clockContainer}>
      <span
        style={{
          ...s.clockTime,
          color,
          fontSize: '14px',
          textShadow: latencyMs !== null && latencyMs > LATENCY_WARN_MS
            ? `0 0 8px ${color}66`
            : '0 0 8px rgba(226, 232, 240, 0.15)',
        }}
      >
        {valueText}
      </span>
      <span style={{ ...s.clockDate, color: latencyMs !== null && latencyMs > LATENCY_WARN_MS ? color : '#475569' }}>
        {labelText}
      </span>
    </div>
  );
}

// ── DEFCON Badge (Right Section — Bottom) ────────────────────────────────────

function DefconBadge({ defcon }: { defcon: DefconState }) {
  // Build 5-segment readiness bar
  const segments = Array.from({ length: 5 }, (_, i) => {
    const segmentLevel = 5 - i; // 5, 4, 3, 2, 1
    const isActive = segmentLevel >= defcon.level;
    return (
      <div
        key={segmentLevel}
        style={{
          width: '6px',
          height: '14px',
          borderRadius: '2px',
          background: isActive ? defcon.color : 'rgba(100, 116, 139, 0.15)',
          boxShadow: isActive ? `0 0 4px ${defcon.glow}` : 'none',
          transition: 'all 0.4s ease',
        }}
      />
    );
  });

  return (
    <div
      style={{
        ...s.defconContainer,
        borderColor: defcon.color,
        boxShadow: `0 0 8px ${defcon.glow}, inset 0 0 12px rgba(0,0,0,0.3)`,
        animation: defcon.level <= 2 ? 'cmdDefconPulse 1.5s ease-in-out infinite' : 'none',
      }}
    >
      <div style={s.defconHeader}>
        <span style={{ ...s.defconLevelLabel, color: defcon.color }}>
          DEFCON
        </span>
        <span style={{ ...s.defconLevelNumber, color: defcon.color }}>
          {defcon.level}
        </span>
      </div>
      <div style={s.defconBarRow}>{segments}</div>
      <span style={{ ...s.defconStatusLabel, color: defcon.color }}>
        {defcon.label}
      </span>
    </div>
  );
}

// =============================================================================
// TelemetryBar — Main Export
// =============================================================================

export default function TelemetryBar({
  agencyName,
  tenantId,
  agentNhi,
}: TelemetryBarProps) {
  // ── Self-contained SWR hooks (5-second polling) ────────────────────────
  const {
    data: witness,
    error: witnessError,
  } = useSWR<WitnessData>(
    '/api/government/audit-integrity?mode=witness',
    witnessFetcher,
    { refreshInterval: 5_000, revalidateOnFocus: false },
  );

  const {
    data: health,
    error: healthError,
  } = useSWR<HealthData>(
    '/api/health',
    fetcher,
    { refreshInterval: 5_000, revalidateOnFocus: false },
  );

  // ── DEFCON computation ─────────────────────────────────────────────────
  const defcon = computeDefcon(witness, witnessError, health, healthError);

  // ── Chain hash change detection → flash animation ──────────────────────
  const [flashActive, setFlashActive] = useState(false);
  const prevHashRef = useRef<string | null>(null);

  const chainHead = witness?.chain_head ?? null;

  useEffect(() => {
    if (chainHead && prevHashRef.current !== null && chainHead !== prevHashRef.current) {
      setFlashActive(true);
      const timer = setTimeout(() => setFlashActive(false), 1500);
      return () => clearTimeout(timer);
    }
    prevHashRef.current = chainHead;
  }, [chainHead]);

  // ── Derived values ─────────────────────────────────────────────────────
  const nodeId = deriveNodeId(tenantId);
  const isLoading = !witness && !witnessError && !health && !healthError;
  const isOnline = health?.status === 'ok';

  return (
    <>
      {/* Keyframe injection */}
      <style>{`
        @keyframes cmdTickerScroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes cmdPulseGreen {
          0%, 100% { opacity: 1; box-shadow: 0 0 6px rgba(34, 197, 94, 0.5); }
          50% { opacity: 0.6; box-shadow: 0 0 12px rgba(34, 197, 94, 0.8); }
        }
        @keyframes cmdPulseRed {
          0%, 100% { opacity: 1; box-shadow: 0 0 6px rgba(239, 68, 68, 0.5); }
          50% { opacity: 0.4; box-shadow: 0 0 14px rgba(239, 68, 68, 0.9); }
        }
        @keyframes cmdDefconPulse {
          0%, 100% { box-shadow: 0 0 8px var(--defcon-glow, rgba(239,68,68,0.3)); }
          50% { box-shadow: 0 0 20px var(--defcon-glow, rgba(239,68,68,0.6)); }
        }
        @keyframes cmdFlashBadge {
          0% { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes cmdScanline {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(100%); }
        }
      `}</style>

      <div style={s.bar}>
        {/* Scanline overlay for CRT aesthetic */}
        <div style={s.scanlineOverlay} />

        {/* ── LEFT: Agency + Node Status ────────────────────────────── */}
        <AgencyPanel
          agencyName={agencyName}
          nodeId={nodeId}
          nhi={agentNhi ?? null}
          online={isOnline}
          loading={isLoading}
        />

        {/* ── Separator ──────────────────────────────────────────────── */}
        <div style={s.vertSep} />

        {/* ── CENTER: Merkle Ticker ──────────────────────────────────── */}
        <MerkleTicker
          chainHead={chainHead}
          height={witness?.witness_count ?? null}
          pulse={witness?.integrity_pulse ?? null}
          hashes={witness?.witness_hashes ?? []}
          flashActive={flashActive}
        />

        {/* ── Separator ──────────────────────────────────────────────── */}
        <div style={s.vertSep} />

        {/* ── RIGHT: Witness Latency + DEFCON ───────────────────────── */}
        <div style={s.rightPanel}>
          <WitnessLatency latencyMs={witness?.witness_latency_ms ?? null} />
          <DefconBadge defcon={defcon} />
        </div>
      </div>
    </>
  );
}

// =============================================================================
// STYLES — Command Center Aesthetic
// =============================================================================
// Dark mode, monospace fonts, cyan/green accent palette,
// subtle CRT scanline overlay, glow effects on state indicators.
// =============================================================================

const s: { [key: string]: React.CSSProperties } = {
  // ── Bar Container ──────────────────────────────────────────────────────────
  bar: {
    position: 'relative',
    display: 'flex',
    alignItems: 'stretch',
    gap: 0,
    padding: '0',
    background: 'linear-gradient(180deg, #060A14 0%, #0A1020 50%, #060A14 100%)',
    border: '1px solid rgba(34, 211, 238, 0.12)',
    borderRadius: '6px',
    overflow: 'hidden',
    fontFamily:
      "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Cascadia Code', 'Consolas', monospace",
    minHeight: '72px',
    boxShadow:
      '0 0 20px rgba(6, 182, 212, 0.06), ' +
      '0 4px 16px rgba(0, 0, 0, 0.4), ' +
      'inset 0 1px 0 rgba(34, 211, 238, 0.06)',
  },

  // ── CRT Scanline Overlay ───────────────────────────────────────────────────
  scanlineOverlay: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    zIndex: 1,
    background:
      'repeating-linear-gradient(' +
      '0deg, ' +
      'transparent, ' +
      'transparent 2px, ' +
      'rgba(0, 0, 0, 0.04) 2px, ' +
      'rgba(0, 0, 0, 0.04) 4px' +
      ')',
    opacity: 0.6,
  },

  // ── Vertical Separator ─────────────────────────────────────────────────────
  vertSep: {
    width: '1px',
    alignSelf: 'stretch',
    background:
      'linear-gradient(180deg, transparent 10%, rgba(34, 211, 238, 0.2) 50%, transparent 90%)',
    flexShrink: 0,
  },

  // ── LEFT PANEL: Agency + Node ──────────────────────────────────────────────
  leftPanel: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    gap: '3px',
    padding: '10px 16px',
    minWidth: '220px',
    flexShrink: 0,
    zIndex: 2,
  },

  fieldRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    lineHeight: 1,
  },

  fieldLabel: {
    fontSize: '9px',
    fontWeight: 700,
    color: '#475569',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    whiteSpace: 'nowrap',
  },

  fieldSep: {
    fontSize: '9px',
    color: '#334155',
  },

  fieldValue: {
    fontSize: '11px',
    fontWeight: 800,
    color: '#E2E8F0',
    letterSpacing: '0.04em',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: '180px',
  },

  fieldDivider: {
    fontSize: '10px',
    color: '#1E293B',
    margin: '0 3px',
  },

  statusGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
  },

  pulseDot: {
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    flexShrink: 0,
  },

  statusText: {
    fontSize: '10px',
    fontWeight: 800,
    letterSpacing: '0.1em',
  },

  nodeIdValue: {
    fontSize: '10px',
    fontWeight: 700,
    color: '#60A5FA',
    letterSpacing: '0.04em',
  },

  nhiValue: {
    fontSize: '10px',
    fontWeight: 600,
    color: '#A78BFA',
    letterSpacing: '0.03em',
  },

  // ── CENTER PANEL: Merkle Ticker ────────────────────────────────────────────
  tickerContainer: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    gap: '4px',
    padding: '8px 12px',
    minWidth: 0,
    overflow: 'hidden',
    zIndex: 2,
  },

  tickerLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },

  tickerLabelText: {
    fontSize: '9px',
    fontWeight: 800,
    letterSpacing: '0.14em',
    transition: 'color 0.3s ease, text-shadow 0.3s ease',
  },

  tickerFlashBadge: {
    fontSize: '8px',
    fontWeight: 800,
    color: '#F59E0B',
    letterSpacing: '0.08em',
    padding: '1px 5px',
    border: '1px solid rgba(245, 158, 11, 0.4)',
    borderRadius: '3px',
    background: 'rgba(245, 158, 11, 0.1)',
    animation: 'cmdFlashBadge 1.5s ease-out forwards',
  },

  tickerViewport: {
    overflow: 'hidden',
    maskImage:
      'linear-gradient(to right, transparent, black 6%, black 94%, transparent)',
    WebkitMaskImage:
      'linear-gradient(to right, transparent, black 6%, black 94%, transparent)',
  },

  tickerTrack: {
    display: 'inline-block',
    whiteSpace: 'nowrap',
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '0.03em',
    animation: 'cmdTickerScroll 25s linear infinite',
    transition: 'color 0.3s ease, text-shadow 0.3s ease',
  },

  // ── RIGHT PANEL: Clock + DEFCON ────────────────────────────────────────────
  rightPanel: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '10px 16px',
    flexShrink: 0,
    zIndex: 2,
  },

  // ── Clock ──────────────────────────────────────────────────────────────────
  clockContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: '1px',
  },

  clockTime: {
    fontSize: '16px',
    fontWeight: 800,
    color: '#E2E8F0',
    letterSpacing: '0.06em',
    lineHeight: 1,
    textShadow: '0 0 8px rgba(226, 232, 240, 0.15)',
  },

  clockDate: {
    fontSize: '9px',
    fontWeight: 600,
    color: '#475569',
    letterSpacing: '0.06em',
    lineHeight: 1,
  },

  clockZone: {
    fontSize: '8px',
    fontWeight: 800,
    color: '#334155',
    letterSpacing: '0.16em',
    lineHeight: 1,
  },

  // ── DEFCON Badge ───────────────────────────────────────────────────────────
  defconContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '3px',
    padding: '6px 10px',
    border: '1px solid',
    borderRadius: '6px',
    background: 'rgba(0, 0, 0, 0.3)',
    minWidth: '68px',
    transition: 'all 0.4s ease',
  },

  defconHeader: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '4px',
  },

  defconLevelLabel: {
    fontSize: '8px',
    fontWeight: 800,
    letterSpacing: '0.12em',
    transition: 'color 0.4s ease',
  },

  defconLevelNumber: {
    fontSize: '16px',
    fontWeight: 900,
    lineHeight: 1,
    transition: 'color 0.4s ease',
  },

  defconBarRow: {
    display: 'flex',
    gap: '2px',
    alignItems: 'center',
  },

  defconStatusLabel: {
    fontSize: '7px',
    fontWeight: 800,
    letterSpacing: '0.14em',
    transition: 'color 0.4s ease',
    whiteSpace: 'nowrap',
  },
};
