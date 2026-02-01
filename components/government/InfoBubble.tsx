'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle } from 'lucide-react';

// =============================================================================
// INFO BUBBLE — Screen-Aware Portal Tooltip
// =============================================================================
// Renders the tooltip in a portal (document.body) and dynamically positions it
// based on available viewport space. Flips top/bottom and shifts horizontally
// to prevent clipping. Z-index 99999 ensures it sits above all UI layers.
//
// Usage:
//   <InfoBubble
//     what="The Merkle Root is the SHA-256 hash at the head of the audit chain."
//     why="If this changes unexpectedly, it indicates data tampering."
//     missing="No audit entries have been recorded yet."
//   />
// =============================================================================

interface InfoBubbleProps {
  what: string;
  why: string;
  missing?: string;
}

type Placement = 'above' | 'below';

const TOOLTIP_WIDTH = 280;
const ARROW_SIZE = 10;
const GAP = 10;
const VIEWPORT_PADDING = 12;

export default function InfoBubble({ what, why, missing }: InfoBubbleProps) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; arrowLeft: number; placement: Placement }>({
    top: 0,
    left: 0,
    arrowLeft: TOOLTIP_WIDTH / 2,
    placement: 'above',
  });

  // ── Calculate position from trigger rect + viewport bounds ──
  const reposition = useCallback(() => {
    if (!triggerRef.current || !tooltipRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    const tooltipHeight = tooltipRect.height;
    const scrollY = window.scrollY;
    const scrollX = window.scrollX;

    // Ideal: centered above the trigger
    let placement: Placement = 'above';
    let top = triggerRect.top + scrollY - tooltipHeight - GAP;

    // If clipping the top of the viewport, flip to below
    if (triggerRect.top - tooltipHeight - GAP < 0) {
      placement = 'below';
      top = triggerRect.bottom + scrollY + GAP;
    }

    // Horizontal: center on trigger, clamp to viewport
    const triggerCenterX = triggerRect.left + scrollX + triggerRect.width / 2;
    let left = triggerCenterX - TOOLTIP_WIDTH / 2;

    // Clamp right edge
    const viewportWidth = document.documentElement.clientWidth;
    if (left + TOOLTIP_WIDTH > viewportWidth + scrollX - VIEWPORT_PADDING) {
      left = viewportWidth + scrollX - VIEWPORT_PADDING - TOOLTIP_WIDTH;
    }
    // Clamp left edge
    if (left < scrollX + VIEWPORT_PADDING) {
      left = scrollX + VIEWPORT_PADDING;
    }

    // Arrow position relative to tooltip left edge
    const arrowLeft = Math.max(16, Math.min(TOOLTIP_WIDTH - 16, triggerCenterX - left));

    setPos({ top, left, arrowLeft, placement });
  }, []);

  // ── Open/close ──
  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  // ── Reposition on open, scroll, and resize ──
  useEffect(() => {
    if (!isOpen) return;

    // Initial positioning (needs a frame for portal to mount)
    requestAnimationFrame(reposition);

    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [isOpen, reposition]);

  // ── Close on click outside ──
  useEffect(() => {
    if (!isOpen) return;

    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        tooltipRef.current?.contains(target)
      ) {
        return;
      }
      setIsOpen(false);
    };

    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  // ── Close on Escape ──
  useEffect(() => {
    if (!isOpen) return;

    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen]);

  // ── Arrow styles based on placement ──
  const arrowStyle: React.CSSProperties =
    pos.placement === 'above'
      ? {
          position: 'absolute',
          bottom: `-${ARROW_SIZE / 2}px`,
          left: `${pos.arrowLeft}px`,
          transform: 'translateX(-50%) rotate(45deg)',
          width: `${ARROW_SIZE}px`,
          height: `${ARROW_SIZE}px`,
          background: 'rgba(15, 23, 42, 0.98)',
          borderRightWidth: '1px',
          borderRightStyle: 'solid',
          borderRightColor: 'rgba(30, 64, 175, 0.35)',
          borderBottomWidth: '1px',
          borderBottomStyle: 'solid',
          borderBottomColor: 'rgba(30, 64, 175, 0.35)',
        }
      : {
          position: 'absolute',
          top: `-${ARROW_SIZE / 2}px`,
          left: `${pos.arrowLeft}px`,
          transform: 'translateX(-50%) rotate(45deg)',
          width: `${ARROW_SIZE}px`,
          height: `${ARROW_SIZE}px`,
          background: 'rgba(15, 23, 42, 0.98)',
          borderLeftWidth: '1px',
          borderLeftStyle: 'solid',
          borderLeftColor: 'rgba(30, 64, 175, 0.35)',
          borderTopWidth: '1px',
          borderTopStyle: 'solid',
          borderTopColor: 'rgba(30, 64, 175, 0.35)',
        };

  return (
    <>
      <button
        ref={triggerRef}
        onClick={toggle}
        style={{
          ...s.trigger,
          color: isOpen ? '#60A5FA' : '#475569',
        }}
        aria-label="More information"
        aria-expanded={isOpen}
      >
        <HelpCircle size={14} />
      </button>

      {isOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={tooltipRef}
            style={{
              position: 'absolute',
              top: `${pos.top}px`,
              left: `${pos.left}px`,
              width: `${TOOLTIP_WIDTH}px`,
              padding: '14px 16px',
              background: 'rgba(15, 23, 42, 0.98)',
              backdropFilter: 'blur(12px)',
              borderWidth: '1px',
              borderStyle: 'solid',
              borderColor: 'rgba(30, 64, 175, 0.35)',
              borderRadius: '12px',
              boxShadow:
                '0 12px 40px rgba(0, 0, 0, 0.5), 0 0 20px rgba(30, 64, 175, 0.15)',
              zIndex: 99999,
            }}
          >
            {/* Arrow */}
            <div style={arrowStyle} />

            {/* WHAT */}
            <div style={s.section}>
              <span style={s.label}>WHAT</span>
              <p style={s.text}>{what}</p>
            </div>

            <div style={s.divider} />

            {/* WHY */}
            <div style={s.section}>
              <span style={s.label}>WHY IT MATTERS</span>
              <p style={s.text}>{why}</p>
            </div>

            {/* STATUS (optional) */}
            {missing && (
              <>
                <div style={s.divider} />
                <div style={s.section}>
                  <span style={{ ...s.label, color: '#F59E0B' }}>
                    IF MISSING / EXPIRED
                  </span>
                  <p style={s.text}>{missing}</p>
                </div>
              </>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const s: Record<string, React.CSSProperties> = {
  trigger: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'none',
    border: 'none',
    padding: '2px',
    cursor: 'pointer',
    transition: 'color 0.15s ease',
    flexShrink: 0,
  },
  section: {
    padding: '2px 0',
  },
  label: {
    display: 'block',
    fontSize: '9px',
    fontWeight: 800,
    letterSpacing: '0.12em',
    color: '#60A5FA',
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    marginBottom: '4px',
  },
  text: {
    margin: 0,
    fontSize: '12px',
    lineHeight: 1.5,
    color: '#CBD5E1',
  },
  divider: {
    height: '1px',
    background: 'rgba(51, 65, 85, 0.4)',
    margin: '8px 0',
  },
};
