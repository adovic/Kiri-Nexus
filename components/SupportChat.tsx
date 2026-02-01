'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { MessageSquare, X, Send, Bot, User, Navigation, Edit3 } from 'lucide-react';
import { useOnboarding } from '@/context/OnboardingContext';

// ===========================================
// TOOL DEFINITIONS FOR CO-PILOT MODE
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
    description: "Navigate the user to a specific page in the application",
    parameters: [
      { name: "path", type: "string", description: "The path to navigate to (e.g., '/pricing', '/onboarding', '/features')", required: true }
    ]
  },
  {
    name: "updateForm",
    description: "Update a field in the onboarding form with a new value",
    parameters: [
      { name: "field", type: "string", description: "The field name to update (e.g., 'businessName', 'agentName', 'greeting')", required: true },
      { name: "value", type: "string", description: "The new value for the field", required: true }
    ]
  }
];

// ===========================================
// SYSTEM PROMPT WITH CO-PILOT CAPABILITIES
// ===========================================
const SYSTEM_PROMPT = `You are an interactive AI assistant for AI Receptionist with CO-PILOT capabilities. You can ACTIVELY HELP users by navigating them through the app and filling out their onboarding form for them.

## YOUR POWERS (TOOLS)

### 1. navigate(path)
Use this to take users directly to pages. Available paths:
- "/pricing" - Pricing page with plan comparison
- "/onboarding" - The onboarding form to set up their AI receptionist
- "/features" - Features overview
- "/how-it-works" - How the product works
- "/faq" - Frequently asked questions
- "/" - Home page

### 2. updateForm(field, value)
Use this to fill in their onboarding form. Available fields:
- **businessName** - Their company name (e.g., "Acme Dental")
- **agentName** - The AI's name (Alice, Sarah, Emma, James, Michael, David)
- **greeting** - Opening greeting script
- **tone** - Voice tone (friendly, professional, empathetic)
- **industry** - Business type (general, medical, realestate, legal, homeservices, restaurant)
- **timezone** - Their timezone (America/Los_Angeles, America/New_York, etc.)
- **address** - Physical business address
- **emergencyPhone** - Emergency contact number
- **bookingLink** - Calendly or booking URL
- **pronunciation** - How to pronounce business name phonetically
- **goldenRules** - Rules for the AI to follow

## WHEN TO USE TOOLS

1. **User provides information:** If someone says "My business is called Sunrise Bakery", USE updateForm("businessName", "Sunrise Bakery") and confirm you saved it.

2. **User asks where something is:** If they ask "Where do I see pricing?" or "Take me to pricing", USE navigate("/pricing").

3. **User wants help setting up:** If they say "Help me set up my receptionist" or "I want to get started", USE navigate("/onboarding").

4. **User gives multiple details:** Parse and save each one. "I'm John from ABC Law, we're a legal firm in New York" = updateForm businessName, industry, possibly timezone.

## RESPONSE FORMAT

When you use a tool, respond naturally AND indicate the action:
- "I've updated your business name to 'Sunrise Bakery'. What else can I help you set up?"
- "Taking you to the pricing page now..."
- "I've saved your greeting. Would you like to customize anything else?"

## GROUND TRUTH KNOWLEDGE

### AI PERSONALITIES (STACKS)
- **Velocity** (Cyan): Speed-optimized, $149-$1,699/month, $0.15/min overage
- **Presence** (Pink): Human-like warmth, $219-$2,499/month, $0.20/min overage
- **Oracle** (Purple): Advanced reasoning, $399-$4,469/month, $0.35/min overage

### PRICING TIERS
| Tier | Velocity | Presence | Oracle |
|------|----------|----------|--------|
| Foundation | $149 | $219 | $399 |
| Momentum | $299 | $439 | $789 |
| Professional | $499 | $739 | $1,319 |
| Executive | $749 | $1,099 | $1,979 |
| Corporate | $999 | $1,469 | $2,629 |
| Syndicate | $1,299 | $1,909 | $3,419 |
| Enterprise | $1,699 | $2,499 | $4,469 |

### ALL PLANS INCLUDE
- Smart Call Routing, 24/7 Availability, Call Recording & Transcripts
- Custom Greeting Scripts, Spam Call Filtering, Text Notifications

Be proactive, helpful, and use your tools to make the user's experience seamless!`;

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
  tool: 'navigate' | 'updateForm' | null;
  params: Record<string, string>;
}

// ===========================================
// SUPPORT CHAT COMPONENT
// ===========================================
export default function SupportChat() {
  const router = useRouter();
  const pathname = usePathname();
  const { updateField, getFieldValue } = useOnboarding();

  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: "Hi! I'm your AI Receptionist Co-Pilot. I can help you with questions about pricing and features, AND I can actively help you set up your AI receptionist. Try saying something like:\n\n- \"My business is called Sunrise Bakery\"\n- \"Take me to pricing\"\n- \"Help me get started\"\n\nWhat would you like to do?",
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
  // TOOL EXECUTION FUNCTIONS
  // ===========================================
  const executeNavigate = useCallback((path: string): { success: boolean; message: string } => {
    const validPaths = ['/', '/pricing', '/onboarding', '/features', '/how-it-works', '/faq'];

    // Normalize path
    let normalizedPath = path.toLowerCase().trim();
    if (!normalizedPath.startsWith('/')) {
      normalizedPath = '/' + normalizedPath;
    }

    // Map common aliases
    const pathMap: Record<string, string> = {
      '/home': '/',
      '/plans': '/pricing',
      '/setup': '/onboarding',
      '/start': '/onboarding',
      '/getstarted': '/onboarding',
      '/get-started': '/onboarding',
    };

    normalizedPath = pathMap[normalizedPath] || normalizedPath;

    if (validPaths.includes(normalizedPath) || normalizedPath.startsWith('/onboarding')) {
      router.push(normalizedPath);
      return { success: true, message: `Navigating to ${normalizedPath}...` };
    }

    return { success: false, message: `I couldn't find that page. Available pages: ${validPaths.join(', ')}` };
  }, [router]);

  const executeUpdateForm = useCallback((field: string, value: string): { success: boolean; message: string } => {
    const success = updateField(field, value);

    if (success) {
      // Generate a friendly field name
      const fieldNames: Record<string, string> = {
        businessName: 'business name',
        agentName: 'AI assistant name',
        greeting: 'opening greeting',
        tone: 'voice tone',
        industry: 'industry type',
        timezone: 'timezone',
        address: 'business address',
        emergencyPhone: 'emergency phone number',
        bookingLink: 'booking link',
        pronunciation: 'pronunciation guide',
        goldenRules: 'golden rules',
      };
      const friendlyName = fieldNames[field] || field;
      return { success: true, message: `I've updated your ${friendlyName} to "${value}".` };
    }

    return { success: false, message: `I couldn't update that field. Please try again or update it manually on the onboarding page.` };
  }, [updateField]);

  // ===========================================
  // INTELLIGENT KEYWORD PARSER
  // ===========================================
  const parseUserIntent = useCallback((input: string): ParsedToolCall => {
    const lower = input.toLowerCase();

    // Navigation patterns
    const navPatterns = [
      { pattern: /(?:take me to|go to|show me|navigate to|open)\s+(?:the\s+)?pricing/i, path: '/pricing' },
      { pattern: /(?:take me to|go to|show me|navigate to|open)\s+(?:the\s+)?onboarding/i, path: '/onboarding' },
      { pattern: /(?:take me to|go to|show me|navigate to|open)\s+(?:the\s+)?features/i, path: '/features' },
      { pattern: /(?:take me to|go to|show me|navigate to|open)\s+(?:the\s+)?faq/i, path: '/faq' },
      { pattern: /(?:take me to|go to|show me|navigate to|open)\s+(?:the\s+)?home/i, path: '/' },
      { pattern: /(?:help me|i want to|let's)\s+(?:get started|set up|setup|begin)/i, path: '/onboarding' },
      { pattern: /(?:start|begin)\s+(?:onboarding|setup|configuration)/i, path: '/onboarding' },
      { pattern: /how (?:much|do you cost|is pricing)/i, path: '/pricing' },
      { pattern: /(?:see|view|check)\s+(?:the\s+)?(?:prices|pricing|plans|costs)/i, path: '/pricing' },
    ];

    for (const { pattern, path } of navPatterns) {
      if (pattern.test(input)) {
        return { tool: 'navigate', params: { path } };
      }
    }

    // Form update patterns
    // Business name patterns
    const businessNamePatterns = [
      /(?:my (?:business|company|store|shop|clinic|office|firm) (?:is called|is named|is|name is))\s+["']?([^"'\n.!?]+)["']?/i,
      /(?:i(?:'m| am) (?:from|with|at))\s+["']?([^"'\n.!?,]+)["']?/i,
      /(?:business name[:\s]+)["']?([^"'\n.!?]+)["']?/i,
      /(?:we(?:'re| are) called)\s+["']?([^"'\n.!?]+)["']?/i,
      /(?:call (?:us|it|me))\s+["']?([^"'\n.!?]+)["']?/i,
    ];

    for (const pattern of businessNamePatterns) {
      const match = input.match(pattern);
      if (match && match[1]) {
        return { tool: 'updateForm', params: { field: 'businessName', value: match[1].trim() } };
      }
    }

    // Agent name patterns
    const agentNamePatterns = [
      /(?:name (?:the|my) (?:ai|assistant|receptionist|agent))\s+["']?(\w+)["']?/i,
      /(?:(?:ai|assistant|receptionist) (?:should be|is) (?:called|named))\s+["']?(\w+)["']?/i,
      /(?:call (?:the|my) (?:ai|assistant|receptionist))\s+["']?(\w+)["']?/i,
      /(?:use|set) (?:the name|name)\s+["']?(\w+)["']?\s+(?:for|as)/i,
    ];

    for (const pattern of agentNamePatterns) {
      const match = input.match(pattern);
      if (match && match[1]) {
        const validNames = ['alice', 'sarah', 'emma', 'james', 'michael', 'david'];
        const name = match[1].trim();
        if (validNames.includes(name.toLowerCase())) {
          return { tool: 'updateForm', params: { field: 'agentName', value: name.charAt(0).toUpperCase() + name.slice(1).toLowerCase() } };
        }
      }
    }

    // Industry patterns
    const industryPatterns = [
      { pattern: /(?:we(?:'re| are) (?:a|an)|i(?:'m| am) (?:a|an)|it's a)\s+(?:medical|dental|doctor|healthcare|clinic)/i, value: 'medical' },
      { pattern: /(?:we(?:'re| are) (?:a|an)|i(?:'m| am) (?:a|an)|it's a)\s+(?:law|legal|attorney|lawyer)/i, value: 'legal' },
      { pattern: /(?:we(?:'re| are) (?:a|an)|i(?:'m| am) (?:a|an)|it's a)\s+(?:real estate|realtor|realty)/i, value: 'realestate' },
      { pattern: /(?:we(?:'re| are) (?:a|an)|i(?:'m| am) (?:a|an)|it's a)\s+(?:restaurant|cafe|bakery|food)/i, value: 'restaurant' },
      { pattern: /(?:we(?:'re| are) (?:a|an)|i(?:'m| am) (?:a|an)|it's a)\s+(?:plumber|electrician|hvac|contractor|home service)/i, value: 'homeservices' },
    ];

    for (const { pattern, value } of industryPatterns) {
      if (pattern.test(input)) {
        return { tool: 'updateForm', params: { field: 'industry', value } };
      }
    }

    // Address patterns
    const addressMatch = input.match(/(?:(?:our|my|the) address is|we(?:'re| are) (?:located|at)|address[:\s]+)\s*["']?([^"'\n]+)["']?/i);
    if (addressMatch && addressMatch[1] && addressMatch[1].length > 5) {
      return { tool: 'updateForm', params: { field: 'address', value: addressMatch[1].trim() } };
    }

    // Phone patterns
    const phoneMatch = input.match(/(?:(?:emergency|contact) (?:number|phone)|phone[:\s]+)\s*["']?([\d\s().-]+)["']?/i);
    if (phoneMatch && phoneMatch[1] && phoneMatch[1].replace(/\D/g, '').length >= 10) {
      return { tool: 'updateForm', params: { field: 'emergencyPhone', value: phoneMatch[1].trim() } };
    }

    // Greeting patterns
    const greetingMatch = input.match(/(?:greeting (?:should be|is)|use (?:this|the) greeting)[:\s]+["']?([^"'\n]+)["']?/i);
    if (greetingMatch && greetingMatch[1]) {
      return { tool: 'updateForm', params: { field: 'greeting', value: greetingMatch[1].trim() } };
    }

    // Tone patterns
    if (/(?:use|set|make it)\s+(?:a\s+)?(?:friendly|casual)\s+(?:tone|voice)/i.test(input)) {
      return { tool: 'updateForm', params: { field: 'tone', value: 'friendly' } };
    }
    if (/(?:use|set|make it)\s+(?:a\s+)?(?:professional|formal|business)\s+(?:tone|voice)/i.test(input)) {
      return { tool: 'updateForm', params: { field: 'tone', value: 'professional' } };
    }
    if (/(?:use|set|make it)\s+(?:an?\s+)?(?:empathetic|caring|warm)\s+(?:tone|voice)/i.test(input)) {
      return { tool: 'updateForm', params: { field: 'tone', value: 'empathetic' } };
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
      // First, check for tool use intent
      const toolCall = parseUserIntent(userMessage.content);

      let toolResult: { success: boolean; message: string } | null = null;

      if (toolCall.tool === 'navigate') {
        toolResult = executeNavigate(toolCall.params.path);
      } else if (toolCall.tool === 'updateForm') {
        toolResult = executeUpdateForm(toolCall.params.field, toolCall.params.value);
      }

      // If a tool was used, respond with the result
      if (toolResult) {
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: toolResult.success
            ? `${toolResult.message}\n\nIs there anything else I can help you with?`
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

      // No tool detected, use mock response (or API call)
      try {
        const response = await fetch('/api/support', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [...messages, userMessage].map((m) => ({
              role: m.role,
              content: m.content,
            })),
            systemPrompt: SYSTEM_PROMPT,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          const assistantMessage: Message = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: data.message || data.content || "I'm sorry, I couldn't process that request.",
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, assistantMessage]);
        } else {
          throw new Error('API not available');
        }
      } catch {
        // Fallback to mock response
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: getMockResponse(userMessage.content),
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

  return (
    <>
      {/* Chat Bubble Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          ...styles.chatBubble,
          ...(isOpen ? styles.chatBubbleOpen : {}),
        }}
        aria-label={isOpen ? 'Close support chat' : 'Open support chat'}
      >
        {isOpen ? (
          <X size={24} strokeWidth={2} />
        ) : (
          <MessageSquare size={24} strokeWidth={2} />
        )}
        {!isOpen && <span style={styles.bubblePulse} />}
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div style={styles.chatWindow}>
          {/* Header */}
          <div style={styles.chatHeader}>
            <div style={styles.headerInfo}>
              <div style={styles.headerIcon}>
                <Bot size={18} strokeWidth={2} />
              </div>
              <div>
                <h3 style={styles.headerTitle}>Co-Pilot Assistant</h3>
                <span style={styles.headerStatus}>
                  <span style={styles.statusDot} />
                  Ready to Help
                </span>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              style={styles.closeBtn}
              aria-label="Close chat"
            >
              <X size={18} strokeWidth={2} />
            </button>
          </div>

          {/* Capability Badges */}
          <div style={styles.capabilityBar}>
            <span style={styles.capabilityBadge}>
              <Navigation size={12} />
              Navigate
            </span>
            <span style={styles.capabilityBadge}>
              <Edit3 size={12} />
              Fill Forms
            </span>
          </div>

          {/* Messages */}
          <div style={styles.messagesContainer}>
            {messages.map((message) => (
              <div
                key={message.id}
                style={{
                  ...styles.messageWrapper,
                  justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start',
                }}
              >
                {message.role === 'assistant' && (
                  <div style={styles.avatarBot}>
                    <Bot size={14} strokeWidth={2} />
                  </div>
                )}
                <div
                  style={{
                    ...styles.messageBubble,
                    ...(message.role === 'user' ? styles.userMessage : styles.assistantMessage),
                  }}
                >
                  {message.content}
                  {message.toolUse && (
                    <div style={styles.toolIndicator}>
                      {message.toolUse.tool === 'navigate' ? <Navigation size={12} /> : <Edit3 size={12} />}
                      <span>{message.toolUse.tool === 'navigate' ? 'Navigated' : 'Form Updated'}</span>
                    </div>
                  )}
                </div>
                {message.role === 'user' && (
                  <div style={styles.avatarUser}>
                    <User size={14} strokeWidth={2} />
                  </div>
                )}
              </div>
            ))}
            {isLoading && (
              <div style={styles.messageWrapper}>
                <div style={styles.avatarBot}>
                  <Bot size={14} strokeWidth={2} />
                </div>
                <div style={{ ...styles.messageBubble, ...styles.assistantMessage }}>
                  <span style={styles.typingIndicator}>
                    <span style={styles.typingDot} />
                    <span style={{ ...styles.typingDot, animationDelay: '0.2s' }} />
                    <span style={{ ...styles.typingDot, animationDelay: '0.4s' }} />
                  </span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div style={styles.inputContainer}>
            <input
              ref={inputRef}
              type="text"
              placeholder="Try: 'My business is Acme Dental'"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              style={styles.input}
              disabled={isLoading}
            />
            <button
              onClick={handleSendMessage}
              disabled={!inputValue.trim() || isLoading}
              style={{
                ...styles.sendBtn,
                ...(inputValue.trim() && !isLoading ? styles.sendBtnActive : {}),
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
        @keyframes supportPulse {
          0%, 100% {
            transform: scale(1);
            opacity: 0.6;
          }
          50% {
            transform: scale(1.5);
            opacity: 0;
          }
        }
        @keyframes supportGlow {
          0%, 100% {
            box-shadow: 0 0 20px rgba(6, 182, 212, 0.4), 0 8px 32px rgba(0, 0, 0, 0.3);
          }
          50% {
            box-shadow: 0 0 30px rgba(6, 182, 212, 0.6), 0 8px 32px rgba(0, 0, 0, 0.3);
          }
        }
        @keyframes typingBounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-4px); }
        }
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(20px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </>
  );
}

// ===========================================
// MOCK RESPONSE FUNCTION
// ===========================================
function getMockResponse(userInput: string): string {
  const input = userInput.toLowerCase();

  // Pricing questions
  if (input.includes('price') || input.includes('cost') || input.includes('pricing') || input.includes('how much')) {
    if (input.includes('velocity')) {
      return "Velocity pricing starts at $149/month for Foundation tier and goes up to $1,699/month for Enterprise. The overage rate is $0.15 per minute. Velocity is our best value option, optimized for speed and appointment booking.\n\nWould you like me to take you to the pricing page?";
    }
    if (input.includes('presence')) {
      return "Presence pricing starts at $219/month for Foundation tier and goes up to $2,499/month for Enterprise. The overage rate is $0.20 per minute. Presence offers human-like warmth and emotional intelligence.\n\nShall I navigate you to pricing?";
    }
    if (input.includes('oracle')) {
      return "Oracle pricing starts at $399/month for Foundation tier and goes up to $4,469/month for Enterprise. The overage rate is $0.35 per minute. Oracle is our most advanced AI with complex reasoning capabilities.\n\nWant me to show you the full pricing breakdown?";
    }
    return "Our pricing varies by AI personality:\n\n- **Velocity:** $149 - $1,699/month\n- **Presence:** $219 - $2,499/month\n- **Oracle:** $399 - $4,469/month\n\nSay \"take me to pricing\" to see the full breakdown, or tell me about your business and I can help you set up!";
  }

  // AI Personality questions
  if (input.includes('velocity')) {
    return "**Velocity** is our speed-optimized AI.\n\n- Sub-second response time\n- Best for appointment booking\n- Starting at $149/month\n\nWant me to help you get started with Velocity?";
  }
  if (input.includes('presence')) {
    return "**Presence** is our human-like AI.\n\n- Indistinguishable from human\n- Emotional intelligence\n- Starting at $219/month\n\nI can help you set up Presence - just tell me your business name!";
  }
  if (input.includes('oracle')) {
    return "**Oracle** is our advanced reasoning AI.\n\n- Complex problem solving\n- Deep analytical capabilities\n- Starting at $399/month\n\nReady to configure Oracle for your business?";
  }

  // Comparison
  if (input.includes('difference') || input.includes('compare') || input.includes('which')) {
    return "Here's a quick comparison:\n\n**Velocity** - Speed-focused, best for booking ($149+)\n**Presence** - Human-like, best for service ($219+)\n**Oracle** - Advanced reasoning, best for complex needs ($399+)\n\nTell me about your business and I'll recommend the best fit!";
  }

  // Features
  if (input.includes('feature') || input.includes('include') || input.includes('what do')) {
    return "All plans include:\n\n- Smart Call Routing\n- 24/7 Availability\n- Call Recording & Transcripts\n- Custom Greetings\n- Spam Filtering\n- Text Notifications\n\nWant to see it in action? I can help you set up a demo!";
  }

  // Help / Getting started
  if (input.includes('help') || input.includes('start') || input.includes('begin') || input.includes('setup')) {
    return "I'd love to help you get started! Here's what I can do:\n\n1. **Navigate** - Say \"take me to pricing\" or \"show me features\"\n2. **Fill forms** - Tell me \"My business is [name]\" and I'll save it\n3. **Answer questions** - Ask about pricing, features, or AI personalities\n\nWhat's your business called?";
  }

  // Default
  return "I'm your Co-Pilot assistant! I can:\n\n- Answer questions about pricing & features\n- Navigate you to any page (try \"take me to pricing\")\n- Help fill out your onboarding form (try \"My business is Acme Corp\")\n\nWhat would you like to do?";
}

// ===========================================
// STYLES
// ===========================================
const styles: { [key: string]: React.CSSProperties } = {
  chatBubble: {
    position: 'fixed',
    bottom: '24px',
    right: '24px',
    width: '60px',
    height: '60px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)',
    border: 'none',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    zIndex: 9999,
    boxShadow: '0 0 20px rgba(6, 182, 212, 0.4), 0 8px 32px rgba(0, 0, 0, 0.3)',
    animation: 'supportGlow 3s infinite ease-in-out',
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
    border: '2px solid rgba(6, 182, 212, 0.6)',
    animation: 'supportPulse 2s infinite ease-out',
  },
  chatWindow: {
    position: 'fixed',
    bottom: '100px',
    right: '24px',
    width: '380px',
    height: '560px',
    background: 'rgba(15, 23, 42, 0.95)',
    backdropFilter: 'blur(20px)',
    borderRadius: '20px',
    border: '1px solid rgba(6, 182, 212, 0.2)',
    boxShadow: '0 0 40px rgba(6, 182, 212, 0.15), 0 25px 50px rgba(0, 0, 0, 0.5)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    zIndex: 9998,
    animation: 'slideIn 0.3s ease-out',
  },
  chatHeader: {
    padding: '16px 20px',
    background: 'rgba(2, 6, 23, 0.8)',
    borderBottom: '1px solid rgba(6, 182, 212, 0.15)',
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
    background: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    boxShadow: '0 0 15px rgba(6, 182, 212, 0.3)',
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
    border: '1px solid rgba(255, 255, 255, 0.1)',
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
    background: 'rgba(6, 182, 212, 0.05)',
    borderBottom: '1px solid rgba(6, 182, 212, 0.1)',
  },
  capabilityBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 10px',
    background: 'rgba(6, 182, 212, 0.1)',
    border: '1px solid rgba(6, 182, 212, 0.2)',
    borderRadius: '100px',
    fontSize: '11px',
    fontWeight: 600,
    color: '#22d3ee',
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
    background: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)',
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
    background: 'rgba(139, 92, 246, 0.2)',
    border: '1px solid rgba(139, 92, 246, 0.3)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#a78bfa',
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
    background: 'rgba(6, 182, 212, 0.1)',
    border: '1px solid rgba(6, 182, 212, 0.2)',
    color: '#F8FAFC',
    borderBottomLeftRadius: '4px',
  },
  userMessage: {
    background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
    color: '#fff',
    borderBottomRightRadius: '4px',
  },
  toolIndicator: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginTop: '8px',
    paddingTop: '8px',
    borderTop: '1px solid rgba(34, 197, 94, 0.2)',
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
    background: '#22d3ee',
    animation: 'typingBounce 1.4s infinite ease-in-out',
  },
  inputContainer: {
    padding: '16px',
    background: 'rgba(2, 6, 23, 0.6)',
    borderTop: '1px solid rgba(6, 182, 212, 0.1)',
    display: 'flex',
    gap: '12px',
  },
  input: {
    flex: 1,
    padding: '12px 16px',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
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
    border: '1px solid rgba(255, 255, 255, 0.1)',
    color: '#64748b',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'not-allowed',
    transition: 'all 0.2s ease',
  },
  sendBtnActive: {
    background: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)',
    border: '1px solid rgba(6, 182, 212, 0.3)',
    color: '#fff',
    cursor: 'pointer',
    boxShadow: '0 0 15px rgba(6, 182, 212, 0.3)',
  },
};
