'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { MessageSquare, X, Send, Bot, User, Navigation, Shield, Lock } from 'lucide-react';
import { useGovAuth } from '@/context/GovAuthContext';
import { useWitness } from '@/app/government/portal/dashboard/DashboardClient';

// ===========================================
// TOOL DEFINITIONS FOR SOVEREIGN ADVISOR
// ===========================================
interface Tool {
  name: string;
  description: string;
  parameters: {
    name: string;
    type: string;
    description: string;
    required: boolean;
  }[];
}

const TOOLS: Tool[] = [
  {
    name: "navigate",
    description: "Navigate the operator to a page in the government portal",
    parameters: [
      { name: "path", type: "string", description: "The portal path (e.g., '/government/portal/dashboard', '/government/portal/analytics')", required: true }
    ]
  },
];

// ===========================================
// TYPES
// ===========================================
interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  toolUse?: {
    tool: string;
    params: Record<string, string>;
    success: boolean;
  };
}

interface ParsedToolCall {
  tool: 'navigate' | null;
  params: Record<string, string>;
}

// ===========================================
// GOVERNMENT CHAT COMPONENT
// ===========================================
export default function GovernmentChat() {
  const router = useRouter();
  const { agency, user, isAuthenticated } = useGovAuth();
  const { data: witness } = useWitness();

  // Build system prompt dynamically with live agency + witness data
  const systemPrompt = `You are the Sovereign Advisor for ${agency.name || 'this agency'}. You operate on an immutable ledger with current head ${witness?.chain_head ? witness.chain_head.slice(0, 16) + '...' : '[syncing]'}. You can see the Witness Latency is ${witness?.witness_latency_ms != null ? witness.witness_latency_ms + 'ms' : '[pending]'}. Assist the user with forensic verification.

## ROLE
You are an AI governance assistant embedded in the Kiri Nexus government portal. You help government operators navigate the system, understand audit logs, interpret analytics, maintain compliance posture, and perform forensic verification of documents and audit chain entries.

## CAPABILITIES
### 1. navigate(path)
Available portal pages:
- "/government/portal/dashboard" — Live operations dashboard
- "/government/portal/knowledge" — Knowledge base management
- "/government/portal/logs" — Call logs and transcripts
- "/government/portal/analytics" — Sovereign Intelligence analytics
- "/government/portal/documents" — Forensic Document Vault
- "/government/portal/settings" — System settings
- "/government/trust" — Live Security Proof (Trust Center) — public-facing cryptographic proof of chain integrity

## CONTEXT
- Agency: ${agency.name} (${agency.tier} — ${agency.state})
- Operator: ${user.name} (${user.role})
- Integrity Pulse: ${witness?.integrity_pulse ? 'VALID' : 'UNKNOWN'}
- Chain Depth: ${witness?.witness_count ?? '—'} entries
- Witness Latency: ${witness?.witness_latency_ms != null ? witness.witness_latency_ms + 'ms' : '—'}

## RESPONSE STYLE
Be concise, professional, and security-conscious. Reference the audit chain when relevant. Never disclose internal system architecture beyond what is visible in the portal.`;

  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: `Sovereign Advisor online. Welcome, ${user.name || 'Operator'}.\n\nI can help you:\n- Navigate the portal ("take me to analytics")\n- Explain audit chain integrity\n- View live security proof ("show me the trust center")\n- Interpret call logs and compliance data\n\nHow can I assist you?`,
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  // ===========================================
  // TOOL EXECUTION
  // ===========================================
  const executeNavigate = useCallback((path: string): { success: boolean; message: string } => {
    const validPaths = [
      '/government/portal/dashboard',
      '/government/portal/knowledge',
      '/government/portal/logs',
      '/government/portal/analytics',
      '/government/portal/documents',
      '/government/portal/settings',
      '/government/trust',
    ];

    let normalizedPath = path.toLowerCase().trim();
    if (!normalizedPath.startsWith('/')) {
      normalizedPath = '/' + normalizedPath;
    }

    // Alias mapping for natural language
    const pathMap: Record<string, string> = {
      '/dashboard': '/government/portal/dashboard',
      '/logs': '/government/portal/logs',
      '/analytics': '/government/portal/analytics',
      '/documents': '/government/portal/documents',
      '/settings': '/government/portal/settings',
      '/knowledge': '/government/portal/knowledge',
      '/calls': '/government/portal/logs',
      '/docs': '/government/portal/documents',
      '/vault': '/government/portal/documents',
      '/trust': '/government/trust',
      '/security': '/government/trust',
      '/proof': '/government/trust',
    };

    normalizedPath = pathMap[normalizedPath] || normalizedPath;

    if (validPaths.includes(normalizedPath)) {
      router.push(normalizedPath);
      return { success: true, message: `Navigating to ${normalizedPath.split('/').pop()}...` };
    }

    return { success: false, message: `Page not found. Available: ${validPaths.map(p => p.split('/').pop()).join(', ')}` };
  }, [router]);

  // ===========================================
  // INTENT PARSER
  // ===========================================
  const parseUserIntent = useCallback((input: string): ParsedToolCall => {
    // Navigation patterns
    const navPatterns = [
      { pattern: /(?:take me to|go to|show me|navigate to|open)\s+(?:the\s+)?dashboard/i, path: '/government/portal/dashboard' },
      { pattern: /(?:take me to|go to|show me|navigate to|open)\s+(?:the\s+)?(?:call )?logs/i, path: '/government/portal/logs' },
      { pattern: /(?:take me to|go to|show me|navigate to|open)\s+(?:the\s+)?analytics/i, path: '/government/portal/analytics' },
      { pattern: /(?:take me to|go to|show me|navigate to|open)\s+(?:the\s+)?(?:documents?|vault|docs)/i, path: '/government/portal/documents' },
      { pattern: /(?:take me to|go to|show me|navigate to|open)\s+(?:the\s+)?settings/i, path: '/government/portal/settings' },
      { pattern: /(?:take me to|go to|show me|navigate to|open)\s+(?:the\s+)?knowledge/i, path: '/government/portal/knowledge' },
      { pattern: /(?:view|check|see)\s+(?:the\s+)?(?:call )?logs/i, path: '/government/portal/logs' },
      { pattern: /(?:view|check|see)\s+(?:the\s+)?analytics/i, path: '/government/portal/analytics' },
      { pattern: /(?:view|check|see)\s+(?:the\s+)?(?:documents?|vault)/i, path: '/government/portal/documents' },
      { pattern: /(?:take me to|go to|show me|navigate to|open)\s+(?:the\s+)?(?:trust|security|proof)\s*(?:center|page)?/i, path: '/government/trust' },
      { pattern: /(?:view|check|see|show)\s+(?:the\s+)?(?:trust|security|live)\s*(?:center|proof|posture)/i, path: '/government/trust' },
    ];

    for (const { pattern, path } of navPatterns) {
      if (pattern.test(input)) {
        return { tool: 'navigate', params: { path } };
      }
    }

    return { tool: null, params: {} };
  }, []);

  // ===========================================
  // MESSAGE HANDLER
  // ===========================================
  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputValue.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      // Check for tool use intent
      const toolCall = parseUserIntent(userMessage.content);

      let toolResult: { success: boolean; message: string } | null = null;

      if (toolCall.tool === 'navigate') {
        toolResult = executeNavigate(toolCall.params.path);
      }

      if (toolResult) {
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: toolResult.success
            ? `${toolResult.message}\n\nAnything else, ${user.name?.split(' ')[0] || 'Operator'}?`
            : toolResult.message,
          timestamp: new Date(),
          toolUse: {
            tool: toolCall.tool!,
            params: toolCall.params,
            success: toolResult.success,
          },
        };
        setMessages((prev) => [...prev, assistantMessage]);
        setIsLoading(false);
        return;
      }

      // No tool — try API, fall back to mock
      try {
        const response = await fetch('/api/support', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            messages: [...messages, userMessage].map((m) => ({
              role: m.role,
              content: m.content,
            })),
            systemPrompt,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          const assistantMessage: Message = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: data.message || data.content || "I couldn't process that request.",
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, assistantMessage]);
        } else {
          throw new Error('API not available');
        }
      } catch {
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: getGovMockResponse(userMessage.content, witness),
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (!isAuthenticated) return null;

  return (
    <>
      {/* Chat Bubble Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          ...govStyles.chatBubble,
          ...(isOpen ? govStyles.chatBubbleOpen : {}),
        }}
        aria-label={isOpen ? 'Close advisor' : 'Open Sovereign Advisor'}
      >
        {isOpen ? (
          <X size={24} strokeWidth={2} />
        ) : (
          <Shield size={24} strokeWidth={2} />
        )}
        {!isOpen && <span style={govStyles.bubblePulse} />}
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div style={govStyles.chatWindow}>
          {/* Header */}
          <div style={govStyles.chatHeader}>
            <div style={govStyles.headerInfo}>
              <div style={govStyles.headerIcon}>
                <Shield size={18} strokeWidth={2} />
              </div>
              <div>
                <h3 style={govStyles.headerTitle}>Sovereign Advisor</h3>
                <span style={govStyles.headerStatus}>
                  <span style={govStyles.statusDot} />
                  {witness?.integrity_pulse ? 'Chain Verified' : 'Syncing...'}
                </span>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              style={govStyles.closeBtn}
              aria-label="Close chat"
            >
              <X size={18} strokeWidth={2} />
            </button>
          </div>

          {/* Secure Channel Badge + Capability Bar */}
          <div style={govStyles.capabilityBar}>
            <span style={govStyles.secureBadge}>
              <Lock size={10} />
              SECURE CHANNEL
            </span>
            <span style={govStyles.capabilityBadge}>
              <Navigation size={12} />
              Navigate
            </span>
          </div>

          {/* Messages */}
          <div style={govStyles.messagesContainer}>
            {messages.map((message) => (
              <div
                key={message.id}
                style={{
                  ...govStyles.messageWrapper,
                  justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start',
                }}
              >
                {message.role === 'assistant' && (
                  <div style={govStyles.avatarBot}>
                    <Shield size={14} strokeWidth={2} />
                  </div>
                )}
                <div
                  style={{
                    ...govStyles.messageBubble,
                    ...(message.role === 'user' ? govStyles.userMessage : govStyles.assistantMessage),
                  }}
                >
                  {message.content}
                  {message.toolUse && (
                    <div style={govStyles.toolIndicator}>
                      <Navigation size={12} />
                      <span>Navigated</span>
                    </div>
                  )}
                </div>
                {message.role === 'user' && (
                  <div style={govStyles.avatarUser}>
                    <User size={14} strokeWidth={2} />
                  </div>
                )}
              </div>
            ))}
            {isLoading && (
              <div style={govStyles.messageWrapper}>
                <div style={govStyles.avatarBot}>
                  <Shield size={14} strokeWidth={2} />
                </div>
                <div style={{ ...govStyles.messageBubble, ...govStyles.assistantMessage }}>
                  <span style={govStyles.typingIndicator}>
                    <span style={govStyles.typingDot} />
                    <span style={{ ...govStyles.typingDot, animationDelay: '0.2s' }} />
                    <span style={{ ...govStyles.typingDot, animationDelay: '0.4s' }} />
                  </span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div style={govStyles.inputContainer}>
            <input
              ref={inputRef}
              type="text"
              placeholder="Ask about compliance, logs, analytics..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              style={govStyles.input}
              disabled={isLoading}
            />
            <button
              onClick={handleSendMessage}
              disabled={!inputValue.trim() || isLoading}
              style={{
                ...govStyles.sendBtn,
                ...(inputValue.trim() && !isLoading ? govStyles.sendBtnActive : {}),
              }}
              aria-label="Send message"
            >
              <Send size={18} strokeWidth={2} />
            </button>
          </div>
        </div>
      )}

      {/* Keyframes Animation */}
      <style>{`
        @keyframes govPulse {
          0%, 100% { transform: scale(1); opacity: 0.6; }
          50% { transform: scale(1.5); opacity: 0; }
        }
        @keyframes govGlow {
          0%, 100% { box-shadow: 0 0 20px rgba(30, 64, 175, 0.5), 0 8px 32px rgba(0, 0, 0, 0.3); }
          50% { box-shadow: 0 0 30px rgba(30, 64, 175, 0.7), 0 8px 32px rgba(0, 0, 0, 0.3); }
        }
        @keyframes govTypingBounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-4px); }
        }
        @keyframes govSlideIn {
          from { opacity: 0; transform: translateY(20px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </>
  );
}

// ===========================================
// MOCK RESPONSE FUNCTION (GOV)
// ===========================================
function getGovMockResponse(
  userInput: string,
  witness: { chain_head: string; witness_count: number; integrity_pulse: boolean; witness_latency_ms: number } | undefined,
): string {
  const input = userInput.toLowerCase();

  if (input.includes('audit') || input.includes('chain') || input.includes('integrity')) {
    const head = witness?.chain_head ? witness.chain_head.slice(0, 16) + '...' : 'syncing';
    const count = witness?.witness_count ?? '—';
    const pulse = witness?.integrity_pulse ? 'VALID' : 'PENDING';
    return `Audit Chain Status:\n\n- Chain Head: ${head}\n- Depth: ${count} entries\n- Integrity Pulse: ${pulse}\n- Latency: ${witness?.witness_latency_ms ?? '—'}ms\n\nThe chain is cryptographically verified using SHA-256 with genesis anchor. All entries are append-only.\n\nSay "show me the trust center" for full cryptographic proof.`;
  }

  if (input.includes('trust') || input.includes('security posture') || input.includes('proof')) {
    const head = witness?.chain_head ? witness.chain_head.slice(0, 16) + '...' : 'syncing';
    const pulse = witness?.integrity_pulse ? 'VERIFIED' : 'PENDING';
    return `Live Security Proof (Trust Center):\n\n- Chain Integrity: ${pulse}\n- Chain Head: ${head}\n- Depth: ${witness?.witness_count ?? '—'} entries\n- Witness Latency: ${witness?.witness_latency_ms ?? '—'}ms\n\nThe Trust Center provides public-facing cryptographic proof that every system action is immutably recorded. It performs a full O(n) SHA-256 chain verification and displays live results.\n\nSay "take me to trust center" to view the live proof page.`;
  }

  if (input.includes('compliance') || input.includes('foia') || input.includes('sovereign')) {
    return "Your compliance posture is managed through the Forensic Document Vault and the immutable audit chain. Every system action is logged with a SHA-256 hash linked to the previous entry.\n\nFor public-facing cryptographic proof, visit the Trust Center.\n\nSay \"take me to documents\" to inspect the vault, or \"show me the trust center\" for live proof.";
  }

  if (input.includes('call') || input.includes('log')) {
    return "Call logs are available in the Call Logs section with full transcripts and metadata. Each call record is anchored to the audit chain for tamper-evident storage.\n\nSay \"take me to logs\" to review.";
  }

  if (input.includes('analytic') || input.includes('metric') || input.includes('data')) {
    return "The Sovereign Intelligence engine aggregates call data in real time from Firestore. Every chart carries a Forensic Verification badge confirming chain integrity at render time.\n\nSay \"take me to analytics\" to view.";
  }

  if (input.includes('help') || input.includes('what can')) {
    return "I can assist with:\n\n- Portal navigation (\"take me to dashboard\")\n- Audit chain status and integrity queries\n- Live security proof via the Trust Center\n- Compliance posture assessment\n- Call log and analytics interpretation\n\nWhat do you need?";
  }

  if (input.includes('document') || input.includes('vault') || input.includes('download')) {
    return "The Forensic Document Vault stores all government documents with SHA-256 hash verification. Each document can be independently verified against its stored hash.\n\nSay \"take me to documents\" to access the vault.";
  }

  return "I'm the Sovereign Advisor for this portal. I can help you navigate, check audit chain integrity, explain compliance data, or show you the live security proof.\n\nTry:\n- \"What's the audit chain status?\"\n- \"Take me to analytics\"\n- \"Show me the trust center\"\n- \"Explain compliance posture\"";
}

// ===========================================
// STYLES — Government Navy Theme
// ===========================================
const govStyles: { [key: string]: React.CSSProperties } = {
  chatBubble: {
    position: 'fixed',
    bottom: '24px',
    right: '24px',
    width: '60px',
    height: '60px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #1E40AF 0%, #3B82F6 100%)',
    border: 'none',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    zIndex: 9999,
    boxShadow: '0 0 20px rgba(30, 64, 175, 0.5), 0 8px 32px rgba(0, 0, 0, 0.3)',
    animation: 'govGlow 3s infinite ease-in-out',
    transition: 'transform 0.2s ease',
  },
  chatBubbleOpen: {
    background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
    animation: 'none',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
  },
  bubblePulse: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: '50%',
    borderWidth: '2px',
    borderStyle: 'solid',
    borderColor: 'rgba(30, 64, 175, 0.6)',
    animation: 'govPulse 2s infinite ease-out',
  },
  chatWindow: {
    position: 'fixed',
    bottom: '100px',
    right: '24px',
    width: '380px',
    height: '560px',
    background: 'rgba(15, 23, 42, 0.97)',
    backdropFilter: 'blur(20px)',
    borderRadius: '20px',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'rgba(30, 64, 175, 0.3)',
    boxShadow: '0 0 40px rgba(30, 64, 175, 0.15), 0 25px 50px rgba(0, 0, 0, 0.5)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    zIndex: 9998,
    animation: 'govSlideIn 0.3s ease-out',
  },
  chatHeader: {
    padding: '16px 20px',
    background: 'rgba(2, 6, 23, 0.9)',
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'rgba(30, 64, 175, 0.25)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  headerIcon: {
    width: '40px',
    height: '40px',
    borderRadius: '12px',
    background: 'linear-gradient(135deg, #1E40AF 0%, #3B82F6 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    boxShadow: '0 0 15px rgba(30, 64, 175, 0.4)',
  },
  headerTitle: {
    margin: 0,
    fontSize: '16px',
    fontWeight: 600,
    color: '#F8FAFC',
  },
  headerStatus: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '12px',
    color: '#22c55e',
  },
  statusDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: '#22c55e',
    boxShadow: '0 0 8px rgba(34, 197, 94, 0.6)',
  },
  closeBtn: {
    width: '32px',
    height: '32px',
    borderRadius: '8px',
    background: 'rgba(255, 255, 255, 0.05)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'rgba(255, 255, 255, 0.1)',
    color: '#94A3B8',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  capabilityBar: {
    display: 'flex',
    gap: '8px',
    padding: '10px 16px',
    background: 'rgba(30, 64, 175, 0.05)',
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'rgba(30, 64, 175, 0.15)',
  },
  secureBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    padding: '4px 10px',
    background: 'rgba(34, 197, 94, 0.1)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'rgba(34, 197, 94, 0.25)',
    borderRadius: '100px',
    fontSize: '10px',
    fontWeight: 700,
    color: '#22C55E',
    letterSpacing: '0.06em',
  },
  capabilityBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 10px',
    background: 'rgba(30, 64, 175, 0.1)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'rgba(30, 64, 175, 0.25)',
    borderRadius: '100px',
    fontSize: '11px',
    fontWeight: 600,
    color: '#60A5FA',
  },
  messagesContainer: {
    flex: 1,
    padding: '16px',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  messageWrapper: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: '8px',
  },
  avatarBot: {
    width: '28px',
    height: '28px',
    borderRadius: '8px',
    background: 'linear-gradient(135deg, #1E40AF 0%, #3B82F6 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    flexShrink: 0,
  },
  avatarUser: {
    width: '28px',
    height: '28px',
    borderRadius: '8px',
    background: 'rgba(96, 165, 250, 0.15)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'rgba(96, 165, 250, 0.3)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#60A5FA',
    flexShrink: 0,
  },
  messageBubble: {
    maxWidth: '75%',
    padding: '12px 16px',
    borderRadius: '16px',
    fontSize: '14px',
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap',
  },
  assistantMessage: {
    background: 'rgba(30, 64, 175, 0.12)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'rgba(30, 64, 175, 0.25)',
    color: '#F8FAFC',
    borderBottomLeftRadius: '4px',
  },
  userMessage: {
    background: 'linear-gradient(135deg, #1E40AF 0%, #2563EB 100%)',
    color: '#fff',
    borderBottomRightRadius: '4px',
  },
  toolIndicator: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginTop: '8px',
    paddingTop: '8px',
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: 'rgba(34, 197, 94, 0.2)',
    fontSize: '11px',
    fontWeight: 600,
    color: '#22c55e',
  },
  typingIndicator: {
    display: 'flex',
    gap: '4px',
    padding: '4px 0',
  },
  typingDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: '#60A5FA',
    animation: 'govTypingBounce 1.4s infinite ease-in-out',
  },
  inputContainer: {
    padding: '16px',
    background: 'rgba(2, 6, 23, 0.7)',
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: 'rgba(30, 64, 175, 0.15)',
    display: 'flex',
    gap: '12px',
  },
  input: {
    flex: 1,
    padding: '12px 16px',
    background: 'rgba(255, 255, 255, 0.05)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: '12px',
    color: '#F8FAFC',
    fontSize: '14px',
    outline: 'none',
    transition: 'border-color 0.2s ease',
  },
  sendBtn: {
    width: '44px',
    height: '44px',
    borderRadius: '12px',
    background: 'rgba(255, 255, 255, 0.05)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'rgba(255, 255, 255, 0.1)',
    color: '#64748b',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'not-allowed',
    transition: 'all 0.2s ease',
  },
  sendBtnActive: {
    background: 'linear-gradient(135deg, #1E40AF 0%, #3B82F6 100%)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'rgba(30, 64, 175, 0.4)',
    color: '#fff',
    cursor: 'pointer',
    boxShadow: '0 0 15px rgba(30, 64, 175, 0.4)',
  },
};
