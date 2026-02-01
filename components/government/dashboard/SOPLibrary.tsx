'use client';

import { useState, useCallback } from 'react';
import {
  FileText,
  Tv,
  Trees,
  FileArchive,
  Play,
  Check,
  X,
  ChevronRight,
  Zap,
  Shield,
  AlertTriangle,
  Bot,
  User,
  Loader2,
  Calendar,
  Cloud,
  Lock,
  Clock,
} from 'lucide-react';
import InfoBubble from '../InfoBubble';

// =============================================================================
// AGENCY BLUEPRINTS & SOP LIBRARY
// =============================================================================
// Provides pre-configured setup templates for small government departments.
// Each blueprint includes:
//   - Goal description
//   - Setup instructions with AI configuration
//   - InfoBubbles explaining HIPAA/FOIA legal protections
//   - Dry Run preview before committing changes
//
// Gold (#F59E0B) theme indicates "Small Department" optimized configurations.
// =============================================================================

// ─── Types ───────────────────────────────────────────────────────────────────

interface SetupStep {
  id: string;
  label: string;
  instruction: string;
  legalProtection: {
    what: string;
    why: string;
    missing?: string;
  };
}

interface DryRunMessage {
  role: 'user' | 'ai' | 'system';
  text: string;
}

interface Blueprint {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ElementType;
  goal: string;
  isSmallDepartment: boolean;
  setupSteps: SetupStep[];
  dryRunScenario: {
    description: string;
    sampleInput: string;
    expectedResponse: DryRunMessage[];
  };
}

// ─── Blueprint Definitions ───────────────────────────────────────────────────

const BLUEPRINTS: Blueprint[] = [
  {
    id: 'city-tv-public-access',
    title: 'City TV / Public Access SOP',
    subtitle: 'Media & Broadcast Management',
    icon: Tv,
    goal: 'Automated scheduling & FOIA management for public access broadcasting.',
    isSmallDepartment: true,
    setupSteps: [
      {
        id: 'meeting-broadcast',
        label: 'Meeting Broadcast Info',
        instruction: 'Direct calls to [Meeting Broadcast Info] for live updates on council meetings and public hearings.',
        legalProtection: {
          what: 'Public Meeting Disclosure (5 ILCS 120/)',
          why: 'Illinois Open Meetings Act requires advance notice of all public meetings. This routing ensures citizens receive accurate broadcast schedules.',
          missing: 'Failure to provide meeting info may constitute an Open Meetings Act violation.',
        },
      },
      {
        id: 'media-archive',
        label: 'Media Archive Access',
        instruction: 'Link [Media Archive] for transcript lookups and historical broadcast retrieval.',
        legalProtection: {
          what: 'FOIA Records Retention (5 ILCS 140/)',
          why: 'Public broadcast recordings are government records subject to FOIA. Archive linking ensures lawful access to historical proceedings.',
          missing: 'Disconnected archives may delay FOIA response beyond the 5-day statutory limit.',
        },
      },
    ],
    dryRunScenario: {
      description: 'Citizen calls asking about tonight\'s council meeting broadcast.',
      sampleInput: 'When is the city council meeting tonight, and can I watch it online?',
      expectedResponse: [
        { role: 'user', text: 'When is the city council meeting tonight, and can I watch it online?' },
        { role: 'ai', text: 'The City Council meeting is scheduled for tonight at 7:00 PM. You can watch it live on City TV Channel 16 or stream it online at cityname.gov/live. Would you like me to send you a reminder 15 minutes before it starts?' },
        { role: 'system', text: '[Tool: calendar_lookup] Retrieved meeting schedule from public calendar.' },
        { role: 'user', text: 'Yes, please. Also, where can I find last month\'s meeting recording?' },
        { role: 'ai', text: 'I\'ve set a reminder for 6:45 PM. For last month\'s council meeting recording, you can access our Media Archive at cityname.gov/archive. All recordings are retained for 7 years per FOIA requirements. Is there a specific agenda item you\'re looking for?' },
      ],
    },
  },
  {
    id: 'parks-rec-seasonal',
    title: 'Parks & Recreation Seasonal Peak',
    subtitle: 'Registration Surge Management',
    icon: Trees,
    goal: 'Handle registration surges without new hires during seasonal peaks.',
    isSmallDepartment: true,
    setupSteps: [
      {
        id: 'faq-field-status',
        label: 'FAQ: Field Status',
        instruction: 'Enable [FAQ: Field Status] knowledge base for real-time field condition queries.',
        legalProtection: {
          what: 'ADA Accessibility Compliance (42 U.S.C. § 12132)',
          why: 'Field status must include accessibility information for citizens with disabilities. AI responses auto-include wheelchair-accessible routes and adaptive equipment availability.',
          missing: 'Omitting accessibility info may result in ADA Title II complaints.',
        },
      },
      {
        id: 'registration-deadlines',
        label: 'Registration Deadlines',
        instruction: 'Enable [Registration Deadlines] module to auto-respond with current program enrollment windows.',
        legalProtection: {
          what: 'Equal Access Policy (Title VI)',
          why: 'Registration information must be available in multiple languages. This module triggers automatic translation for Spanish, Mandarin, and Polish callers.',
          missing: 'Language barriers may constitute discriminatory denial of services.',
        },
      },
      {
        id: 'weather-urgent',
        label: 'Weather-Related Closures',
        instruction: 'Set AI to \'Urgent\' priority for weather-related field closures and program cancellations.',
        legalProtection: {
          what: 'Public Safety Notification',
          why: 'Weather alerts are classified as urgent public safety information. Elevated priority ensures immediate citizen notification and reduces liability for injuries on closed facilities.',
          missing: 'Delayed closure notifications may expose the municipality to negligence claims.',
        },
      },
    ],
    dryRunScenario: {
      description: 'Parent calls during summer registration asking about soccer leagues and field conditions.',
      sampleInput: 'Is fall soccer registration still open? And is the field at Lincoln Park playable today?',
      expectedResponse: [
        { role: 'user', text: 'Is fall soccer registration still open? And is the field at Lincoln Park playable today?' },
        { role: 'ai', text: 'Great timing! Fall soccer registration is open until August 15th. We have openings in the U8, U10, and U12 divisions. For Lincoln Park specifically—let me check the current field status.' },
        { role: 'system', text: '[Tool: field_status_api] Queried Lincoln Park field conditions.' },
        { role: 'ai', text: 'Lincoln Park Field #2 is currently CLOSED due to overnight rain—grounds crew expects it to reopen by 3:00 PM today. Field #1 is open and playable. Would you like me to start the registration process for your child?' },
        { role: 'user', text: 'Yes, for the U10 division.' },
        { role: 'ai', text: 'Perfect! I can complete the registration over the phone. The fee is $85, which includes a uniform. I\'ll need your child\'s name, date of birth, and your preferred practice day—we have Tuesday/Thursday or Monday/Wednesday options available.' },
      ],
    },
  },
  {
    id: 'city-clerk-foia',
    title: 'City Clerk / Public Records (FOIA) Flow',
    subtitle: 'Transparency & Redaction Pipeline',
    icon: FileArchive,
    goal: 'Automated PII Redaction for transparency requests with compliance-first document handling.',
    isSmallDepartment: true,
    setupSteps: [
      {
        id: 'redaction-pipeline',
        label: 'Redaction Pipeline',
        instruction: 'Route all document inquiries through the [Redaction Pipeline] for automatic PII detection and masking.',
        legalProtection: {
          what: 'FOIA Privacy Exemptions (5 ILCS 140/7)',
          why: 'Social Security numbers, home addresses, and personal phone numbers are exempt from disclosure. The AI pipeline auto-redacts these before human review, reducing breach risk.',
          missing: 'Manual-only redaction increases risk of accidental PII disclosure.',
        },
      },
      {
        id: 'two-copy-storage',
        label: 'Two-Copy Retention',
        instruction: 'Set \'Two-Copy\' storage to 7-year retention: one redacted (public) copy and one original (sealed).',
        legalProtection: {
          what: 'Local Records Act (50 ILCS 205/)',
          why: 'Illinois mandates 7-year retention for most municipal records. Two-Copy storage preserves the unredacted original under seal for legal proceedings while serving the public redacted version.',
          missing: 'Single-copy systems may destroy evidence required for litigation holds.',
        },
      },
    ],
    dryRunScenario: {
      description: 'Citizen requests copies of building inspection reports under FOIA.',
      sampleInput: 'I need to file a FOIA request for all building inspection reports on 123 Main Street from the last two years.',
      expectedResponse: [
        { role: 'user', text: 'I need to file a FOIA request for all building inspection reports on 123 Main Street from the last two years.' },
        { role: 'ai', text: 'I can help you initiate that FOIA request right now. Building inspection reports are public records, so this is a straightforward request. Let me search our records system.' },
        { role: 'system', text: '[Tool: foia_record_search] Found 4 inspection reports for 123 Main Street (2023-2025).' },
        { role: 'ai', text: 'I\'ve located 4 inspection reports for that address. Before I can release them, our system will automatically redact any exempt information—such as inspector home contact details and Social Security numbers of property owners if present. Your official FOIA response will be ready within 5 business days as required by law. Would you like email or postal delivery?' },
        { role: 'user', text: 'Email is fine. Will I get the inspector\'s notes too?' },
        { role: 'ai', text: 'Yes, inspector notes are included as part of the official inspection record. The only information redacted will be personal identifiers—the substantive findings, violation notices, and remediation timelines will all be visible. I\'m sending a confirmation email now with your FOIA tracking number. Is there anything else you need?' },
      ],
    },
  },
];

// ─── Styles ──────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  container: {
    background: 'rgba(15, 23, 42, 0.6)',
    backdropFilter: 'blur(16px)',
    border: '1px solid rgba(59, 130, 246, 0.2)',
    borderRadius: '20px',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '24px',
    borderBottom: '1px solid rgba(59, 130, 246, 0.15)',
    background: 'rgba(30, 64, 175, 0.08)',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  title: {
    fontSize: '18px',
    fontWeight: 700,
    color: '#F8FAFC',
    margin: 0,
  },
  badge: {
    padding: '4px 12px',
    background: 'rgba(245, 158, 11, 0.15)',
    borderRadius: '100px',
    fontSize: '12px',
    fontWeight: 600,
    color: '#F59E0B',
  },
  tabsContainer: {
    display: 'flex',
    gap: '4px',
    padding: '16px 24px 0',
    borderBottom: '1px solid rgba(59, 130, 246, 0.1)',
  },
  tab: {
    padding: '12px 20px',
    background: 'transparent',
    border: 'none',
    borderBottom: '2px solid transparent',
    color: '#64748B',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    transition: 'all 0.2s ease',
  },
  tabActive: {
    color: '#F59E0B',
    borderBottomColor: '#F59E0B',
    background: 'rgba(245, 158, 11, 0.05)',
  },
  content: {
    padding: '24px',
  },
  blueprintCard: {
    background: 'rgba(15, 23, 42, 0.5)',
    border: '1px solid rgba(245, 158, 11, 0.2)',
    borderRadius: '16px',
    padding: '20px',
    marginBottom: '16px',
    transition: 'all 0.2s ease',
  },
  blueprintHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: '16px',
  },
  blueprintIcon: {
    width: '48px',
    height: '48px',
    borderRadius: '12px',
    background: 'rgba(245, 158, 11, 0.15)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#F59E0B',
    flexShrink: 0,
  },
  blueprintMeta: {
    flex: 1,
    marginLeft: '16px',
  },
  blueprintTitle: {
    fontSize: '16px',
    fontWeight: 700,
    color: '#F8FAFC',
    margin: '0 0 4px',
  },
  blueprintSubtitle: {
    fontSize: '12px',
    color: '#64748B',
    margin: 0,
  },
  goalSection: {
    background: 'rgba(245, 158, 11, 0.08)',
    border: '1px solid rgba(245, 158, 11, 0.15)',
    borderRadius: '10px',
    padding: '12px 16px',
    marginBottom: '16px',
  },
  goalLabel: {
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.1em',
    color: '#F59E0B',
    marginBottom: '6px',
  },
  goalText: {
    fontSize: '13px',
    color: '#CBD5E1',
    lineHeight: 1.5,
    margin: 0,
  },
  setupSteps: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  },
  setupStep: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    padding: '12px 16px',
    background: 'rgba(59, 130, 246, 0.05)',
    borderRadius: '10px',
    border: '1px solid rgba(59, 130, 246, 0.1)',
  },
  stepNumber: {
    width: '24px',
    height: '24px',
    borderRadius: '6px',
    background: 'rgba(59, 130, 246, 0.15)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
    fontWeight: 700,
    color: '#60A5FA',
    flexShrink: 0,
  },
  stepContent: {
    flex: 1,
  },
  stepLabel: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#F8FAFC',
    marginBottom: '4px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  stepInstruction: {
    fontSize: '12px',
    color: '#94A3B8',
    lineHeight: 1.5,
    margin: 0,
  },
  dryRunButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    width: '100%',
    padding: '14px 20px',
    marginTop: '16px',
    background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.9) 0%, rgba(217, 119, 6, 0.9) 100%)',
    border: 'none',
    borderRadius: '10px',
    color: '#0F172A',
    fontSize: '14px',
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  modalOverlay: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(0, 0, 0, 0.8)',
    backdropFilter: 'blur(8px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  modal: {
    background: '#1E293B',
    border: '1px solid rgba(245, 158, 11, 0.3)',
    borderRadius: '20px',
    width: '680px',
    maxWidth: '95vw',
    maxHeight: '90vh',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column' as const,
  },
  modalHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '20px 24px',
    borderBottom: '1px solid rgba(245, 158, 11, 0.15)',
    background: 'rgba(245, 158, 11, 0.05)',
  },
  modalTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  modalBody: {
    flex: 1,
    padding: '24px',
    overflowY: 'auto' as const,
  },
  scenarioBox: {
    background: 'rgba(59, 130, 246, 0.08)',
    border: '1px solid rgba(59, 130, 246, 0.2)',
    borderRadius: '12px',
    padding: '16px',
    marginBottom: '20px',
  },
  scenarioLabel: {
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.1em',
    color: '#60A5FA',
    marginBottom: '8px',
  },
  scenarioText: {
    fontSize: '13px',
    color: '#CBD5E1',
    margin: 0,
  },
  chatContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  },
  chatMessage: {
    display: 'flex',
    gap: '12px',
    padding: '12px 16px',
    borderRadius: '12px',
  },
  chatAvatar: {
    width: '32px',
    height: '32px',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  chatText: {
    fontSize: '13px',
    lineHeight: 1.6,
    margin: 0,
  },
  modalFooter: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    padding: '16px 24px',
    borderTop: '1px solid rgba(100, 116, 139, 0.2)',
    background: 'rgba(15, 23, 42, 0.4)',
  },
  cancelButton: {
    padding: '12px 24px',
    background: 'transparent',
    border: '1px solid rgba(100, 116, 139, 0.3)',
    borderRadius: '10px',
    color: '#94A3B8',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  applyButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 24px',
    background: 'linear-gradient(135deg, #22C55E 0%, #16A34A 100%)',
    border: 'none',
    borderRadius: '10px',
    color: '#FFFFFF',
    fontSize: '14px',
    fontWeight: 700,
    cursor: 'pointer',
  },
  legalBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '2px 8px',
    background: 'rgba(34, 197, 94, 0.15)',
    borderRadius: '100px',
    fontSize: '10px',
    fontWeight: 600,
    color: '#22C55E',
    marginLeft: '8px',
  },
};

// ─── Sub-Components ──────────────────────────────────────────────────────────

function ChatMessage({ message }: { message: DryRunMessage }) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  return (
    <div
      style={{
        ...s.chatMessage,
        background: isSystem
          ? 'rgba(168, 85, 247, 0.08)'
          : isUser
            ? 'rgba(34, 197, 94, 0.08)'
            : 'rgba(59, 130, 246, 0.08)',
        border: `1px solid ${
          isSystem
            ? 'rgba(168, 85, 247, 0.2)'
            : isUser
              ? 'rgba(34, 197, 94, 0.2)'
              : 'rgba(59, 130, 246, 0.2)'
        }`,
      }}
    >
      <div
        style={{
          ...s.chatAvatar,
          background: isSystem
            ? 'rgba(168, 85, 247, 0.15)'
            : isUser
              ? 'rgba(34, 197, 94, 0.15)'
              : 'rgba(59, 130, 246, 0.15)',
          color: isSystem ? '#A855F7' : isUser ? '#22C55E' : '#60A5FA',
        }}
      >
        {isSystem ? <Zap size={16} /> : isUser ? <User size={16} /> : <Bot size={16} />}
      </div>
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontSize: '11px',
            fontWeight: 600,
            color: isSystem ? '#A855F7' : isUser ? '#22C55E' : '#60A5FA',
            marginBottom: '4px',
          }}
        >
          {isSystem ? 'SYSTEM' : isUser ? 'Citizen (Caller)' : 'Sarah (AI Assistant)'}
        </div>
        <p
          style={{
            ...s.chatText,
            color: isSystem ? '#C4B5FD' : '#CBD5E1',
            fontFamily: isSystem ? 'monospace' : 'inherit',
            fontSize: isSystem ? '11px' : '13px',
          }}
        >
          {message.text}
        </p>
      </div>
    </div>
  );
}

function SetupStepRow({ step, index }: { step: SetupStep; index: number }) {
  return (
    <div style={s.setupStep}>
      <div style={s.stepNumber}>{index + 1}</div>
      <div style={s.stepContent}>
        <div style={s.stepLabel}>
          {step.label}
          <InfoBubble
            what={step.legalProtection.what}
            why={step.legalProtection.why}
            missing={step.legalProtection.missing}
          />
          <span style={s.legalBadge}>
            <Shield size={10} />
            PROTECTED
          </span>
        </div>
        <p style={s.stepInstruction}>{step.instruction}</p>
      </div>
    </div>
  );
}

interface DryRunModalProps {
  blueprint: Blueprint;
  onClose: () => void;
  onApply: () => void;
}

function DryRunModal({ blueprint, onClose, onApply }: DryRunModalProps) {
  const [isApplying, setIsApplying] = useState(false);
  const [applied, setApplied] = useState(false);

  const handleApply = async () => {
    setIsApplying(true);
    // Simulate configuration application
    await new Promise((resolve) => setTimeout(resolve, 1500));
    setIsApplying(false);
    setApplied(true);
    setTimeout(() => {
      onApply();
    }, 1000);
  };

  return (
    <div style={s.modalOverlay} onClick={onClose}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={s.modalHeader}>
          <div style={s.modalTitle}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: 'rgba(245, 158, 11, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#F59E0B',
              }}
            >
              <Play size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#F8FAFC' }}>
                Dry Run Preview
              </h3>
              <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748B' }}>
                {blueprint.title}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#64748B',
              cursor: 'pointer',
              padding: '4px',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div style={s.modalBody}>
          {/* Scenario Description */}
          <div style={s.scenarioBox}>
            <div style={s.scenarioLabel}>TEST SCENARIO</div>
            <p style={s.scenarioText}>{blueprint.dryRunScenario.description}</p>
          </div>

          {/* Configuration Preview */}
          <div
            style={{
              background: 'rgba(245, 158, 11, 0.08)',
              border: '1px solid rgba(245, 158, 11, 0.15)',
              borderRadius: '12px',
              padding: '16px',
              marginBottom: '20px',
            }}
          >
            <div
              style={{
                fontSize: '10px',
                fontWeight: 700,
                letterSpacing: '0.1em',
                color: '#F59E0B',
                marginBottom: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <Zap size={12} />
              CONFIGURATION TO BE APPLIED
            </div>
            {blueprint.setupSteps.map((step, idx) => (
              <div
                key={step.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 0',
                  borderBottom:
                    idx < blueprint.setupSteps.length - 1
                      ? '1px solid rgba(245, 158, 11, 0.1)'
                      : 'none',
                }}
              >
                <ChevronRight size={14} color="#F59E0B" />
                <span style={{ fontSize: '12px', color: '#CBD5E1' }}>{step.label}</span>
                <span
                  style={{
                    marginLeft: 'auto',
                    fontSize: '10px',
                    padding: '2px 8px',
                    background: 'rgba(34, 197, 94, 0.15)',
                    borderRadius: '100px',
                    color: '#22C55E',
                    fontWeight: 600,
                  }}
                >
                  ENABLED
                </span>
              </div>
            ))}
          </div>

          {/* Simulated Conversation */}
          <div>
            <div
              style={{
                fontSize: '10px',
                fontWeight: 700,
                letterSpacing: '0.1em',
                color: '#60A5FA',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <Bot size={12} />
              EXPECTED AI BEHAVIOR
            </div>
            <div style={s.chatContainer}>
              {blueprint.dryRunScenario.expectedResponse.map((msg, idx) => (
                <ChatMessage key={idx} message={msg} />
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={s.modalFooter}>
          <button style={s.cancelButton} onClick={onClose}>
            Cancel
          </button>
          <button
            style={{
              ...s.applyButton,
              opacity: isApplying || applied ? 0.8 : 1,
              cursor: isApplying || applied ? 'default' : 'pointer',
            }}
            onClick={handleApply}
            disabled={isApplying || applied}
          >
            {isApplying ? (
              <>
                <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                Applying...
              </>
            ) : applied ? (
              <>
                <Check size={16} />
                Applied Successfully
              </>
            ) : (
              <>
                <Check size={16} />
                Apply Configuration
              </>
            )}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

interface SOPLibraryProps {
  onConfigurationApplied?: (blueprintId: string) => void;
}

export default function SOPLibrary({ onConfigurationApplied }: SOPLibraryProps) {
  const [activeTab, setActiveTab] = useState<string>(BLUEPRINTS[0].id);
  const [dryRunBlueprint, setDryRunBlueprint] = useState<Blueprint | null>(null);

  const activeBlueprint = BLUEPRINTS.find((b) => b.id === activeTab) || BLUEPRINTS[0];

  const handleDryRunClick = useCallback((blueprint: Blueprint) => {
    setDryRunBlueprint(blueprint);
  }, []);

  const handleApplyConfiguration = useCallback(() => {
    if (dryRunBlueprint && onConfigurationApplied) {
      onConfigurationApplied(dryRunBlueprint.id);
    }
    setDryRunBlueprint(null);
  }, [dryRunBlueprint, onConfigurationApplied]);

  return (
    <div style={s.container}>
      {/* Header */}
      <div style={s.header}>
        <div style={s.headerLeft}>
          <FileText size={20} color="#F59E0B" />
          <h2 style={s.title}>Agency Blueprints & SOPs</h2>
          <span style={s.badge}>Small Dept. Optimized</span>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '11px',
            fontWeight: 600,
            color: '#22C55E',
            padding: '6px 12px',
            background: 'rgba(34, 197, 94, 0.1)',
            borderRadius: '6px',
          }}
        >
          <Shield size={12} />
          FOIA/HIPAA COMPLIANT
        </div>
      </div>

      {/* Tabs */}
      <div style={s.tabsContainer}>
        {BLUEPRINTS.map((blueprint) => {
          const Icon = blueprint.icon;
          const isActive = activeTab === blueprint.id;
          return (
            <button
              key={blueprint.id}
              onClick={() => setActiveTab(blueprint.id)}
              style={{
                ...s.tab,
                ...(isActive ? s.tabActive : {}),
              }}
            >
              <Icon size={16} />
              {blueprint.title.split(' ')[0]}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div style={s.content}>
        <div style={s.blueprintCard}>
          {/* Blueprint Header */}
          <div style={s.blueprintHeader}>
            <div style={s.blueprintIcon}>
              {(() => {
                const Icon = activeBlueprint.icon;
                return <Icon size={24} />;
              })()}
            </div>
            <div style={s.blueprintMeta}>
              <h3 style={s.blueprintTitle}>{activeBlueprint.title}</h3>
              <p style={s.blueprintSubtitle}>{activeBlueprint.subtitle}</p>
            </div>
            {activeBlueprint.isSmallDepartment && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  background: 'rgba(245, 158, 11, 0.15)',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  borderRadius: '100px',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#F59E0B',
                }}
              >
                <Zap size={12} />
                SMALL DEPT
              </div>
            )}
          </div>

          {/* Goal */}
          <div style={s.goalSection}>
            <div style={s.goalLabel}>OPERATIONAL GOAL</div>
            <p style={s.goalText}>{activeBlueprint.goal}</p>
          </div>

          {/* Setup Steps */}
          <div
            style={{
              fontSize: '10px',
              fontWeight: 700,
              letterSpacing: '0.1em',
              color: '#64748B',
              marginBottom: '12px',
            }}
          >
            SETUP CONFIGURATION
          </div>
          <div style={s.setupSteps}>
            {activeBlueprint.setupSteps.map((step, idx) => (
              <SetupStepRow key={step.id} step={step} index={idx} />
            ))}
          </div>

          {/* Dry Run Button */}
          <button
            style={s.dryRunButton}
            onClick={() => handleDryRunClick(activeBlueprint)}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 8px 24px rgba(245, 158, 11, 0.3)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <Play size={18} />
            Run Dry Test — Preview AI Response
          </button>
        </div>

        {/* Compliance Notice */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '14px 18px',
            background: 'rgba(34, 197, 94, 0.08)',
            border: '1px solid rgba(34, 197, 94, 0.2)',
            borderRadius: '12px',
          }}
        >
          <Lock size={18} color="#22C55E" />
          <div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#22C55E' }}>
              All Blueprints Include Legal Compliance Guardrails
            </div>
            <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>
              Each configuration step is annotated with the specific FOIA/HIPAA protection it triggers.
              Click the{' '}
              <span style={{ color: '#60A5FA' }}>?</span> icon next to any step for details.
            </div>
          </div>
        </div>
      </div>

      {/* Dry Run Modal */}
      {dryRunBlueprint && (
        <DryRunModal
          blueprint={dryRunBlueprint}
          onClose={() => setDryRunBlueprint(null)}
          onApply={handleApplyConfiguration}
        />
      )}
    </div>
  );
}
