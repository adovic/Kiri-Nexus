'use client';

import { useState, useEffect, useRef } from 'react';
import { Shield, ShieldOff, Activity, Hash } from 'lucide-react';
import { useHealth, useWitness } from './DashboardClient';

// =============================================================================
// TELEMETRY BAR — High-Density Status Strip
// =============================================================================
// Three sub-components rendered in a single horizontal bar:
//
//   [DefconStatus]  |  [PulseMonitor]  |  [MerkleHashTicker]
//
// Data sources (SWR — shared cache with DashboardClient):
//   useWitness()  → chain_head, witness_count, integrity_pulse (10s polling)
//   useHealth()   → system heartbeat
//
// When a new call record is added in DashboardClient, it calls
// mutate('/api/government/audit-integrity?mode=witness'), which
// triggers SWR revalidation here. The MerkleHashTicker detects
// the hash change and plays a "refresh" flash animation.
// =============================================================================

// =============================================================================
// MerkleHashTicker — Scrolling monospace hash with refresh flash
// =============================================================================

function MerkleHashTicker({
  hash,
  height,
  flashActive,
}: {
  hash: string | null;
  height: number | null;
  flashActive: boolean;
}) {
  const tickerRef = useRef<HTMLDivElement>(null);

  // Build display string: repeat the hash for seamless scroll loop
  const display = hash
    ? `${hash}  ·  CHAIN HEIGHT ${height ?? '?'}  ·  ${hash}  ·  CHAIN HEIGHT ${height ?? '?'}  ·  `
    : 'AWAITING CHAIN SYNC …';

  return (
    <div style={s.tickerContainer}>
      <Hash
        size={12}
        color={flashActive ? '#F59E0B' : '#60A5FA'}
        style={{
          flexShrink: 0,
          transition: 'color 0.3s ease',
        }}
      />
      <div style={s.tickerViewport}>
        <div
          ref={tickerRef}
          style={{
            ...s.tickerTrack,
            animationPlayState: hash ? 'running' : 'paused',
            color: flashActive ? '#F59E0B' : '#60A5FA',
            textShadow: flashActive
              ? '0 0 8px rgba(245, 158, 11, 0.6)'
              : 'none',
            transition: 'color 0.3s ease, text-shadow 0.3s ease',
          }}
        >
          {display}
        </div>
      </div>
      {flashActive && (
        <span style={s.refreshBadge}>REFRESH</span>
      )}
    </div>
  );
}

// =============================================================================
// PulseMonitor — System Heartbeat Sparkline
// =============================================================================

const SPARKLINE_BARS = 12;

function PulseMonitor({ healthy, error }: { healthy: boolean | null; error: string | null }) {
  const isUp = healthy === true;
  const isDown = healthy === false || !!error;
  const isLoading = healthy === null && !error;

  // Bar heights simulate a heartbeat EKG pattern
  const pattern = [3, 5, 4, 8, 14, 6, 3, 7, 14, 5, 4, 3];

  return (
    <div style={s.pulseContainer}>
      <Activity size={12} color={isUp ? '#22C55E' : isDown ? '#EF4444' : '#64748B'} style={{ flexShrink: 0 }} />
      <span style={{ ...s.pulseLabel, color: isUp ? '#22C55E' : isDown ? '#EF4444' : '#64748B' }}>
        {isUp ? 'HEARTBEAT' : isDown ? 'FLATLINE' : 'SYNCING'}
      </span>
      <div style={s.sparklineRow}>
        {pattern.slice(0, SPARKLINE_BARS).map((h, i) => (
          <div
            key={i}
            style={{
              width: '3px',
              height: `${h}px`,
              borderRadius: '1px',
              background: isUp
                ? '#22C55E'
                : isDown
                  ? '#EF4444'
                  : '#334155',
              opacity: isLoading ? 0.3 : 1,
              animation: isUp
                ? `barPulse 1.2s ease-in-out ${i * 0.1}s infinite`
                : isDown
                  ? `barFlatline 0.8s ease-in-out ${i * 0.06}s infinite`
                  : 'none',
            }}
          />
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// DefconStatus — Sovereign Readiness Badge
// =============================================================================

function DefconStatus({ valid, loading }: { valid: boolean | null; loading: boolean }) {
  const isVerified = valid === true;
  const isBreach = valid === false;

  if (loading) {
    return (
      <div style={{ ...s.defconBadge, borderColor: 'rgba(100, 116, 139, 0.3)', background: 'rgba(100, 116, 139, 0.06)' }}>
        <Shield size={13} color="#64748B" />
        <span style={{ ...s.defconText, color: '#64748B' }}>VERIFYING</span>
      </div>
    );
  }

  if (isBreach) {
    return (
      <div
        style={{
          ...s.defconBadge,
          borderColor: 'rgba(239, 68, 68, 0.6)',
          background: 'rgba(239, 68, 68, 0.1)',
          animation: 'defconPulse 1.5s ease-in-out infinite',
        }}
      >
        <ShieldOff size={13} color="#EF4444" />
        <span style={{ ...s.defconText, color: '#EF4444' }}>INTEGRITY BREACH</span>
      </div>
    );
  }

  return (
    <div
      style={{
        ...s.defconBadge,
        borderColor: 'rgba(34, 197, 94, 0.3)',
        background: 'rgba(34, 197, 94, 0.06)',
      }}
    >
      <Shield size={13} color="#22C55E" />
      <span style={{ ...s.defconText, color: '#22C55E' }}>
        {isVerified ? 'SOVEREIGN READY' : 'UNKNOWN'}
      </span>
    </div>
  );
}

// =============================================================================
// TelemetryBar — Composed Export
// =============================================================================

export default function TelemetryBar() {
  const { data: witnessData, error: witnessError } = useWitness();
  const { data: healthData, error: healthError } = useHealth();

  // ── Chain hash change detection → flash animation ──────────────────
  const [flashActive, setFlashActive] = useState(false);
  const prevHashRef = useRef<string | null>(null);

  const chainHash = witnessData?.chain_head ?? null;

  useEffect(() => {
    if (chainHash && prevHashRef.current !== null && chainHash !== prevHashRef.current) {
      // Hash changed → trigger flash
      setFlashActive(true);
      const timer = setTimeout(() => setFlashActive(false), 1200);
      return () => clearTimeout(timer);
    }
    prevHashRef.current = chainHash;
  }, [chainHash]);

  // ── Derived values ─────────────────────────────────────────────────
  const chainValid = witnessData?.integrity_pulse ?? null;
  const chainHeight = witnessData?.witness_count ?? null;
  const integrityLoading = !witnessData && !witnessError;

  const systemHealthy = healthData
    ? healthData.status === 'ok'
    : null;

  return (
    <>
      {/* Keyframe injection — scoped to TelemetryBar animations */}
      <style>{`
        @keyframes tickerScroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes barPulse {
          0%, 100% { opacity: 0.4; transform: scaleY(0.7); }
          50% { opacity: 1; transform: scaleY(1); }
        }
        @keyframes barFlatline {
          0%, 100% { opacity: 0.3; transform: scaleY(0.2); }
          50% { opacity: 0.8; transform: scaleY(0.4); }
        }
        @keyframes defconPulse {
          0%, 100% { box-shadow: 0 0 4px rgba(239, 68, 68, 0.3); }
          50% { box-shadow: 0 0 16px rgba(239, 68, 68, 0.7); }
        }
        @keyframes refreshFlash {
          0% { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>

      <div style={s.bar}>
        {/* Left: Sovereign Readiness */}
        <DefconStatus valid={chainValid} loading={integrityLoading} />

        {/* Separator */}
        <div style={s.separator} />

        {/* Center: System Heartbeat */}
        <PulseMonitor healthy={systemHealthy} error={healthError ?? null} />

        {/* Separator */}
        <div style={s.separator} />

        {/* Right: Merkle Hash Ticker */}
        <MerkleHashTicker
          hash={chainHash}
          height={chainHeight}
          flashActive={flashActive}
        />
      </div>
    </>
  );
}

// =============================================================================
// STYLES — TelemetryBar
// =============================================================================

const s: { [key: string]: React.CSSProperties } = {
  // ── Bar container ──────────────────────────────────────────────────────
  bar: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '10px 16px',
    background: 'rgba(15, 23, 42, 0.8)',
    border: '1px solid rgba(30, 64, 175, 0.15)',
    borderRadius: '10px',
    marginBottom: '24px',
    backdropFilter: 'blur(8px)',
    overflow: 'hidden',
  },

  // ── Separator ──────────────────────────────────────────────────────────
  separator: {
    width: '1px',
    height: '20px',
    background: 'rgba(100, 116, 139, 0.25)',
    flexShrink: 0,
  },

  // ── DefconStatus ───────────────────────────────────────────────────────
  defconBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 10px',
    border: '1px solid',
    borderRadius: '6px',
    flexShrink: 0,
    whiteSpace: 'nowrap',
  },
  defconText: {
    fontSize: '11px',
    fontWeight: 800,
    letterSpacing: '0.08em',
    fontFamily: 'monospace',
  },

  // ── PulseMonitor ───────────────────────────────────────────────────────
  pulseContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flexShrink: 0,
  },
  pulseLabel: {
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.1em',
    fontFamily: 'monospace',
    whiteSpace: 'nowrap',
  },
  sparklineRow: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: '2px',
    height: '16px',
  },

  // ── MerkleHashTicker ───────────────────────────────────────────────────
  tickerContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
  },
  tickerViewport: {
    flex: 1,
    overflow: 'hidden',
    maskImage: 'linear-gradient(to right, transparent, black 8%, black 92%, transparent)',
    WebkitMaskImage: 'linear-gradient(to right, transparent, black 8%, black 92%, transparent)',
  },
  tickerTrack: {
    display: 'inline-block',
    whiteSpace: 'nowrap',
    fontFamily: 'monospace',
    fontSize: '11px',
    fontWeight: 600,
    color: '#60A5FA',
    letterSpacing: '0.04em',
    animation: 'tickerScroll 20s linear infinite',
  },
  refreshBadge: {
    fontSize: '9px',
    fontWeight: 800,
    color: '#F59E0B',
    letterSpacing: '0.1em',
    fontFamily: 'monospace',
    padding: '2px 5px',
    border: '1px solid rgba(245, 158, 11, 0.4)',
    borderRadius: '4px',
    background: 'rgba(245, 158, 11, 0.1)',
    flexShrink: 0,
    animation: 'refreshFlash 1.2s ease-out forwards',
  },
};
