// @ts-nocheck
'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Phone, PhoneOff, Mic, MicOff, FileText, Clock, User, Bot, AlertCircle, Wrench, Settings, Wifi, Shield, ShieldCheck, DollarSign, Download } from 'lucide-react';
import { GOVERNMENT_TOOLS } from '@/lib/government/tools';
import { generateAndDownloadPdf } from '@/lib/pdf/generate-pdf';

// ===========================================
// CONFIGURATION — ZERO TRUST
// ===========================================
// No hardcoded fallback IDs. All tenant config
// MUST come from the authenticated setup flow
// stored in localStorage (govAgentConfig).
// If no tenant profile exists, the UI renders
// a "Critical Setup Required" screen.
// ===========================================
const MAX_DURATION = 120; // 2 minutes for government demo
const ADMIN_BYPASS_EMAIL = 'nicholas.snell2003@gmail.com';

// Human labor cost comparison for ROI calculations
const HUMAN_RECEPTIONIST_ANNUAL_COST = 95000; // $95,000 including benefits, training, turnover
const AI_RECEPTIONIST_ANNUAL_COST = 12000; // $12,000 approximate annual cost

// ===========================================
// TENANT PROFILE TYPES
// ===========================================
interface TenantProfile {
  tenant_id: string;
  agency_name: string;
  jurisdiction_state: string;
  voice_tone: string;
  vapi_assistant_id: string;
  vapi_public_key: string;
  ngrok_url: string;
  agent_nhi: string;
  policy_snapshot_hash: string;
  policy_summary: string;
}

// ===========================================
// SOVEREIGN SYSTEM PROMPT — Azure-Ready Municipal AI Training
// ===========================================
// This prompt is designed for government deployments with:
// - Zero-latency 911 emergency escalation
// - Departmental knowledge (City TV, Parks & Rec, City Clerk)
// - FOIA/HIPAA compliance awareness
// - "Constituent-First" demeanor (calm, empathetic, professional)
// - Compliance disclosure for call transparency
// ===========================================
function buildSystemPrompt(profile: TenantProfile): string {
  return `
You are SARAH, the official Sovereign AI Receptionist for ${profile.agency_name}.
You are running on FedRAMP-ready infrastructure using Azure OpenAI services.

=== COMPLIANCE DISCLOSURE (SAY THIS AT CALL START) ===
After your greeting, you MUST say: "This call is being recorded and transcribed for quality assurance and public records compliance. All personal information is automatically redacted per FOIA guidelines."

=== AGENCY CONTEXT ===
Agency: ${profile.agency_name}
Jurisdiction: ${profile.jurisdiction_state}
Tone: ${profile.voice_tone}
${profile.policy_summary ? `Policy Summary: ${profile.policy_summary}` : ''}

=== CONSTITUENT-FIRST DEMEANOR ===
You are calm, empathetic, and professional. Your goal is to SERVE the constituent efficiently:
1. Listen carefully to the caller's needs before responding
2. Speak clearly and at a measured pace — not rushed, not robotic
3. Acknowledge frustration with empathy: "I understand that's frustrating, let me help."
4. Never argue or become defensive — redirect to solutions
5. Use the caller's name when possible to personalize the interaction
6. End every call with: "Is there anything else I can help you with today?"

=== CRITICAL STYLE RULES (ANTI-ROBOTIC) ===
1. NEVER say "Certainly," "I understand," "Thank you for that information," or generic AI filler.
2. Speak naturally, like a helpful government employee who genuinely cares.
3. Keep answers concise but complete — under 3 sentences unless listing options.
4. Use natural phrases: "Sure thing," "Let me check on that," "One moment," "Got it."
5. If you don't know something, say: "Let me transfer you to someone who can help with that."

=== ZERO-LATENCY 911 EMERGENCY PROTOCOL ===
CRITICAL: If the caller mentions ANY of the following, INTERRUPT IMMEDIATELY:
- "emergency" / "911" / "help me" / "someone's hurt"
- "fire" / "burning" / "smoke"
- "heart attack" / "can't breathe" / "chest pain" / "stroke"
- "crime" / "robbery" / "assault" / "break-in" / "shooter"
- "accident" / "car crash" / "injured"
- "suicide" / "want to die" / "harm myself"

EMERGENCY RESPONSE (say EXACTLY this):
"Stop — if this is an emergency, hang up and dial 911 immediately. Emergency services can reach you faster than I can. Are you safe right now?"

If they confirm emergency: "Please hang up and dial 911 now. I'm noting this call for follow-up."
If not an emergency: "Okay, I'm glad you're safe. How can I help you today?"

=== DEPARTMENTAL KNOWLEDGE ===

📺 CITY TV / PUBLIC ACCESS:
- City TV broadcasts council meetings live on Channel 99 and streaming at cityname.gov/live
- Meeting recordings available 24 hours after broadcast
- To request airtime for community programming: submit form at City TV office or online
- Equipment loans for community productions: Tuesday-Thursday, 10 AM - 4 PM
- Live meeting schedule: City Council (1st & 3rd Monday, 6 PM), Planning Commission (2nd Tuesday, 7 PM)
- Technical issues with broadcast: report to City TV at extension 4200

🌳 PARKS & RECREATION:
- Facility reservations: book online at cityname.gov/parks or call Parks office
- Summer programs registration opens March 1st annually
- Pool hours: Memorial Day - Labor Day, 11 AM - 7 PM daily
- Sports leagues: youth soccer (spring/fall), adult softball (summer), basketball (winter)
- Community center rentals: capacity 50-200 depending on room, requires 2-week advance booking
- Trail closures and park alerts: check website or call the Parks hotline
- Special events permits: require 30-day advance notice and liability insurance

📋 CITY CLERK / PUBLIC RECORDS (FOIA):
- FOIA requests: submit in writing (email, mail, or in-person) with specific description
- Response time: 5 business days for initial response per state FOIA law
- Fees: $0.10 per page for paper copies, electronic records often free
- Vital records (birth/death certificates): available at Clerk's office, $15 per certified copy
- Business licenses: new applications take 5-10 business days to process
- Meeting minutes: available on website within 7 days of approval
- Public comment: sign up at Clerk's office before meetings or online by noon meeting day
- Notary services: available Mon-Fri, 9 AM - 4 PM, no appointment needed

=== TOOLS YOU CAN USE ===
You have access to the following tools to help callers:
- lookup_permit: Check building permit status by ID (e.g., "P-101")
- check_bus_schedule: Get next bus arrivals for a route (e.g., "Route 51B")
- check_housing_status: Check housing application waitlist position (e.g., "HA-990")
- log_service_request: Create a 311 request for potholes, trash, streetlights, etc.
- verify_resident: Verify a resident's identity using phone and PIN
- transfer_to_human: Transfer the call to a human operator when needed

ALWAYS use the appropriate tool when a caller asks about permits, schedules, or wants to report an issue.

=== GENERAL KNOWLEDGE BASE ===
- HOURS: Mon-Fri, 9:00 AM - 5:00 PM. Closed weekends and federal holidays.
- BUILDING PERMITS: Submit applications at the Building Department, 2nd floor.
- TRASH PICKUP: Residential on Wednesdays, Commercial on Thursdays.
- WATER/UTILITY BILLING: Finance Department, 1st floor, or pay online.
- PARKING TICKETS: Pay online, by mail, or at Clerk's window. Appeal within 14 days.
- TAX PAYMENTS: Due dates are March 1 and September 1. Pay online or at Finance.

=== SAMPLE DATA FOR DEMO ===
Permit IDs: P-101 (Approved), P-102 (Pending), P-103 (Rejected), P-104 (Under Review)
Bus Routes: 51B (Downtown Express), 6 (Westside Local), 15 (Airport Shuttle - Delayed 10 min)
Housing Apps: HA-990 (Position #47), HA-991 (Position #12), HA-992 (Approved - move-in ready)

=== COMPLIANCE REMINDERS ===
- All calls are logged for FOIA compliance — do not promise confidentiality
- PII (Social Security, bank accounts) is automatically redacted from transcripts
- If caller requests record deletion, explain: "Public records are retained per state law."
- Never provide legal advice — say: "I can provide information, but for legal advice please consult an attorney."

YOUR GOAL: Serve constituents efficiently, answer questions accurately, USE YOUR TOOLS, and ensure every caller feels heard and helped.
`.trim();
}

function buildGreeting(agencyName: string): string {
  // Greeting followed by compliance disclosure (as required by Sovereign protocol)
  return `${agencyName}, this is Sarah. This call is being recorded and transcribed for quality assurance and public records compliance. How can I help you today?`;
}

// ===========================================
// AZURE CONFIG TYPE
// ===========================================
interface AzureConfig {
  configured: boolean;
  provider: 'azure' | 'none';
  missingVars?: string[];
  hint?: string;
  azureConfig?: {
    resourceName: string;
    deploymentName: string;
  };
}

/**
 * Derive a filesystem-safe tenant_id from the agency name.
 * Mirrors the server-side sanitizeTenantId logic.
 */
function deriveTenantId(agencyName: string): string {
  return agencyName
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 64) || '_global';
}

// ===========================================
// SIGNAL STRENGTH COMPONENT - Always shows all 4 bars
// ===========================================
function SignalStrength({ active }) {
  const inactiveColor = '#334155';
  const activeColor = '#22c55e';

  return (
    <div style={styles.signalBars}>
      <div style={{ ...styles.signalBar, height: '6px', background: active ? activeColor : inactiveColor }} />
      <div style={{ ...styles.signalBar, height: '10px', background: active ? activeColor : inactiveColor }} />
      <div style={{ ...styles.signalBar, height: '14px', background: active ? activeColor : inactiveColor }} />
      <div style={{ ...styles.signalBar, height: '18px', background: active ? activeColor : inactiveColor }} />
    </div>
  );
}

// ===========================================
// AUDIO WAVEFORM COMPONENT
// ===========================================
function AudioWaveform({ isActive, color, label }) {
  const canvasRef = useRef(null);
  const animationRef = useRef(0);

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const barCount = 16;
      const barWidth = (canvas.width / barCount) * 0.7;

      for (let i = 0; i < barCount; i++) {
        const height = isActive
          ? (Math.sin(Date.now() / 100 + i) * 0.5 + 0.5) * canvas.height * 0.8 + 4
          : 4;
        ctx.fillStyle = color;
        ctx.fillRect(
          i * (canvas.width / barCount) + (canvas.width / barCount - barWidth) / 2,
          canvas.height - height,
          barWidth,
          height
        );
      }
      animationRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(animationRef.current);
  }, [isActive, color]);

  return (
    <div style={styles.waveformBox}>
      <span style={styles.waveformLabel}>{label}</span>
      <canvas ref={canvasRef} width={120} height={40} style={styles.waveformCanvas} />
    </div>
  );
}

// ===========================================
// TRANSCRIPT ENTRY COMPONENT
// ===========================================
function TranscriptEntry({ speaker, text, timestamp, toolCall }) {
  const isToolCall = speaker === 'tool';

  return (
    <div style={{
      ...styles.transcriptEntry,
      alignItems: speaker === 'ai' || isToolCall ? 'flex-start' : 'flex-end',
    }}>
      <div style={{
        ...styles.transcriptBubble,
        background: isToolCall
          ? 'rgba(168, 85, 247, 0.1)'
          : speaker === 'ai'
            ? 'rgba(30, 64, 175, 0.2)'
            : 'rgba(34, 197, 94, 0.1)',
        borderColor: isToolCall
          ? 'rgba(168, 85, 247, 0.3)'
          : speaker === 'ai'
            ? 'rgba(59, 130, 246, 0.3)'
            : 'rgba(34, 197, 94, 0.3)',
      }}>
        <div style={styles.transcriptHeaderRow}>
          <div style={{
            ...styles.transcriptSpeakerIcon,
            background: isToolCall
              ? 'rgba(168, 85, 247, 0.2)'
              : speaker === 'ai'
                ? 'rgba(59, 130, 246, 0.2)'
                : 'rgba(34, 197, 94, 0.2)',
            color: isToolCall ? '#A855F7' : speaker === 'ai' ? '#60A5FA' : '#22c55e',
          }}>
            {isToolCall ? <Wrench size={12} /> : speaker === 'ai' ? <Bot size={12} /> : <User size={12} />}
          </div>
          <span style={styles.transcriptSpeaker}>
            {isToolCall ? `Tool: ${toolCall}` : speaker === 'ai' ? 'Sarah (AI)' : 'Caller'}
          </span>
          <span style={styles.transcriptTime}>{timestamp}</span>
        </div>
        <p style={styles.transcriptText}>{text}</p>
      </div>
    </div>
  );
}

// ===========================================
// MAIN PAGE COMPONENT
// ===========================================
export default function GovDemoPage() {
  // Session State
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [status, setStatus] = useState('Ready to connect');
  const [timeLeft, setTimeLeft] = useState(MAX_DURATION);
  const [callFinished, setCallFinished] = useState(false);
  const [error, setError] = useState(null);

  // Audio State
  const [isMuted, setIsMuted] = useState(false);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);

  // Transcript State
  const [transcript, setTranscript] = useState([]);
  const [sessionId] = useState(() => `GOV-${Date.now().toString(36).toUpperCase()}`);

  // Tenant Profile State
  const [tenantProfile, setTenantProfile] = useState<TenantProfile | null>(null);

  // Admin Bypass State - allows unlimited demo calls for master admin
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [redactionActive, setRedactionActive] = useState(true); // Azure PII redaction status

  // Dev Mode State
  const [showDevMode, setShowDevMode] = useState(false);
  const [devNgrokUrl, setDevNgrokUrl] = useState('');

  // Azure Configuration State - checked on mount
  const [azureConfig, setAzureConfig] = useState<AzureConfig | null>(null);
  const [azureConfigLoading, setAzureConfigLoading] = useState(true);

  // Vapi instance ref
  const vapiRef = useRef(null);
  const callStartTimeRef = useRef(0);
  const messagesEndRef = useRef(null);

  // ── Load tenant profile from localStorage on mount ──
  // Also check for admin bypass via cookie or localStorage
  useEffect(() => {
    try {
      // Check for admin bypass
      const cookies = document.cookie.split(';').reduce((acc, c) => {
        const [key, val] = c.trim().split('=');
        acc[key] = val;
        return acc;
      }, {} as Record<string, string>);

      const adminEmail = cookies['gov-admin-email'] || localStorage.getItem('gov-admin-email');
      const isAdmin = cookies['gov-admin-role'] === 'master';

      if (adminEmail?.toLowerCase() === ADMIN_BYPASS_EMAIL.toLowerCase() || isAdmin) {
        setIsAdminUser(true);
        console.log('[Demo] Admin bypass activated — unlimited calls enabled');
      }

      const agentRaw = localStorage.getItem('govAgentConfig');
      const procRaw = localStorage.getItem('govProcurementData');
      const baselineRaw = localStorage.getItem('govBaselineSet1');

      if (!agentRaw) return; // No tenant config — tenantProfile stays null

      const agent = JSON.parse(agentRaw);
      const proc = procRaw ? JSON.parse(procRaw) : {};
      const baseline = baselineRaw ? JSON.parse(baselineRaw) : {};

      const agencyName = agent.profile?.agencyName || '';
      if (!agencyName) return; // Need at least agency name

      // Build a policy summary from Set 1 baseline if available
      let policySummary = '';
      if (baseline.extracted) {
        const parts: string[] = [];
        if (baseline.extracted.fteCount) parts.push(`${baseline.extracted.fteCount} FTEs`);
        if (baseline.extracted.projectedLaborCost) parts.push(`$${baseline.extracted.projectedLaborCost.toLocaleString()} labor cost`);
        if (baseline.extracted.ordinances?.length) parts.push(`${baseline.extracted.ordinances.length} ordinances`);
        if (parts.length > 0) policySummary = parts.join(', ');
      }

      setTenantProfile({
        tenant_id: deriveTenantId(agencyName),
        agency_name: agencyName,
        jurisdiction_state: agent.profile?.jurisdictionState || '',
        voice_tone: agent.profile?.voiceTone || 'Professional',
        vapi_assistant_id: agent.vapi_assistant_id || '',
        vapi_public_key: agent.vapi_public_key || '',
        ngrok_url: agent.ngrok_url || '',
        agent_nhi: proc.agent_nhi || `NHI-${deriveTenantId(agencyName).toUpperCase()}`,
        policy_snapshot_hash: proc.policy_snapshot_hash || 'NONE',
        policy_summary: policySummary,
      });
    } catch {
      // Corrupt localStorage — fall back to defaults
    }
  }, []);

  // ── Check Azure configuration on mount ──
  // Government demo REQUIRES Azure OpenAI - fail closed if not configured
  useEffect(() => {
    const checkAzureConfig = async () => {
      try {
        const res = await fetch('/api/government/azure-config');
        const data = await res.json();

        if (res.ok && data.configured) {
          setAzureConfig(data);
        } else {
          setAzureConfig({
            configured: false,
            provider: 'none',
            missingVars: data.missingVars || ['Azure OpenAI configuration'],
            hint: data.hint || 'Configure Azure OpenAI environment variables',
          });
        }
      } catch (err) {
        console.error('[Azure Config] Failed to check:', err);
        setAzureConfig({
          configured: false,
          provider: 'none',
          missingVars: ['Unable to verify Azure configuration'],
          hint: 'Network error checking Azure configuration',
        });
      } finally {
        setAzureConfigLoading(false);
      }
    };

    checkAzureConfig();
  }, []);

  // Derived
  const callDuration = MAX_DURATION - timeLeft;

  // Get the active server URL (priority: devNgrokUrl > tenant ngrok > window.location.origin)
  // Tenant identity is resolved server-side from the Vapi secret — no query params needed.
  const getServerUrl = useCallback(() => {
    const baseUrl = devNgrokUrl
      || tenantProfile?.ngrok_url
      || (typeof window !== 'undefined' ? window.location.origin : '');
    return `${baseUrl}/api/government/tools`;
  }, [devNgrokUrl, tenantProfile]);

  // Format duration
  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Get current timestamp
  const getTimestamp = useCallback(() => {
    const elapsed = Math.floor((Date.now() - callStartTimeRef.current) / 1000);
    return formatDuration(elapsed);
  }, []);

  // Add transcript entry - MERGES consecutive messages from same speaker
  const addTranscript = useCallback((role, text, toolCall) => {
    const timestamp = callStartTimeRef.current > 0 ? getTimestamp() : '00:00';

    setTranscript(prev => {
      // Check if we should merge with the previous entry
      if (prev.length > 0) {
        const lastEntry = prev[prev.length - 1];

        // Merge if same role AND not a tool call (tool calls should always be separate)
        if (lastEntry.role === role && role !== 'tool' && !toolCall) {
          // Create a new array with the last entry updated
          const updated = [...prev];
          updated[updated.length - 1] = {
            ...lastEntry,
            text: lastEntry.text + ' ' + text,
            // Keep the original timestamp
          };
          return updated;
        }
      }

      // Otherwise, create a new entry
      return [...prev, { role, text, timestamp, toolCall }];
    });
  }, [getTimestamp]);

  // Timer effect — admin bypass skips time limit
  useEffect(() => {
    if (!isSessionActive || timeLeft <= 0) return;
    const interval = setInterval(() => {
      setTimeLeft(prev => {
        // Admin users get unlimited time — timer counts UP, not down
        if (isAdminUser) {
          return prev - 1; // Still decrement for display but won't auto-end
        }
        if (prev <= 1) {
          stopSession();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isSessionActive, timeLeft, isAdminUser]);

  // Auto-scroll transcript to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  // ===========================================
  // STOP SESSION - Saves call to Firebase for FOIA compliance
  // ===========================================
  const stopSession = useCallback(async () => {
    // Calculate duration before stopping
    const finalDuration = MAX_DURATION - timeLeft;

    // NOTE: Demo calls are explicitly NOT saved to government_calls.
    // Only authenticated production calls (with a valid x-vapi-secret
    // from a provisioned tenant) are persisted for FOIA compliance.
    // Demo transcripts exist only in local component state.

    // Stop Vapi
    if (vapiRef.current) {
      try {
        vapiRef.current.stop();
      } catch (e) {
        console.error('Error stopping Vapi:', e);
      }
    }

    setIsSessionActive(false);
    setIsConnecting(false);
    setCallFinished(true);
    setStatus('Call Ended');
    setIsAiSpeaking(false);
    setIsUserSpeaking(false);
  }, [sessionId, transcript, timeLeft]);

  // ===========================================
  // START SESSION - Real Vapi Integration
  // ===========================================
  const startSession = async () => {
    // Reset state
    setTranscript([]);
    setTimeLeft(MAX_DURATION);
    setCallFinished(false);
    setError(null);
    setIsConnecting(true);
    setStatus('Initializing...');
    callStartTimeRef.current = Date.now();

    // Zero Trust: Require a tenant profile — no hardcoded fallbacks
    if (!tenantProfile) {
      setError('Critical Setup Required: No tenant profile found. Complete the agency setup flow before starting a demo call.');
      setIsConnecting(false);
      setStatus('Setup Required');
      return;
    }

    // GOVERNMENT DEMO: Require Azure OpenAI — fail closed if not configured
    if (!azureConfig?.configured) {
      setError(`Azure OpenAI is required for government demo but is not configured. Missing: ${azureConfig?.missingVars?.join(', ') || 'Azure configuration'}`);
      setIsConnecting(false);
      setStatus('Azure Configuration Required');
      return;
    }

    const publicKey = tenantProfile.vapi_public_key.trim();
    const assistantId = tenantProfile.vapi_assistant_id.trim();
    const systemPrompt = buildSystemPrompt(tenantProfile);
    const greeting = buildGreeting(tenantProfile.agency_name);

    // Validate configuration before attempting connection
    if (!publicKey || publicKey.includes('PASTE_')) {
      setError('VAPI_PUBLIC_KEY is not configured. Please add your Vapi public key to the constants at the top of the file.');
      setIsConnecting(false);
      setStatus('Configuration Error');
      return;
    }

    if (!assistantId || assistantId.includes('PASTE_')) {
      console.log('[Vapi] No assistant ID configured, will create transient assistant');
    }

    try {
      // Dynamically import Vapi SDK
      setStatus('Loading Vapi SDK...');
      const { default: Vapi } = await import('@vapi-ai/web');

      // Initialize Vapi with public key
      setStatus('Initializing Vapi...');
      console.log('[Vapi] Initializing with public key:', publicKey.substring(0, 10) + '...');

      const vapi = new Vapi(publicKey);
      vapiRef.current = vapi;

      // ===========================================
      // VAPI EVENT HANDLERS
      // ===========================================

      vapi.on('call-start', () => {
        console.log('[Vapi] Call started');
        setIsSessionActive(true);
        setIsConnecting(false);
        setStatus('Connected');
        callStartTimeRef.current = Date.now();
      });

      vapi.on('call-end', () => {
        console.log('[Vapi] Call ended');
        stopSession();
      });

      vapi.on('speech-start', () => {
        setIsAiSpeaking(true);
      });

      vapi.on('speech-end', () => {
        setIsAiSpeaking(false);
      });

      vapi.on('volume-level', (volume) => {
        // User is speaking if volume is above threshold
        setIsUserSpeaking(volume > 0.1);
      });

      vapi.on('message', (message) => {
        console.log('[Vapi] Message:', message);

        // Handle transcript messages
        if (message.type === 'transcript') {
          if (message.transcriptType === 'final' && message.transcript) {
            const role = message.role === 'assistant' ? 'ai' : 'user';
            addTranscript(role, message.transcript);
          }
        }

        // Handle function calls (tool usage)
        if (message.type === 'function-call' && message.functionCall) {
          addTranscript(
            'tool',
            `Called with: ${JSON.stringify(message.functionCall.parameters)}`,
            message.functionCall.name
          );
        }

        // Handle errors
        if (message.type === 'error') {
          console.error('[Vapi] Error message:', message);
          setError('An error occurred during the call');
        }
      });

      vapi.on('error', (error) => {
        console.error('[Vapi] Error event:', error);

        // Extract meaningful error message
        let errorMessage = 'Connection failed';
        if (error?.message) {
          errorMessage = error.message;
        } else if (typeof error === 'string') {
          errorMessage = error;
        } else if (error?.error?.message) {
          errorMessage = error.error.message;
        } else if (error?.statusCode) {
          errorMessage = `API Error (${error.statusCode}): ${error.error || 'Unknown error'}`;
        }

        // Check for common issues
        if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
          errorMessage = 'Invalid API key. Please check your VAPI_PUBLIC_KEY.';
        } else if (errorMessage.includes('404')) {
          errorMessage = 'Assistant not found. Please check your VAPI_ASSISTANT_ID.';
        } else if (errorMessage.includes('microphone') || errorMessage.includes('permission')) {
          errorMessage = 'Microphone access denied. Please allow microphone access and try again.';
        }

        setError(errorMessage);
        setIsConnecting(false);
        setStatus('Error');
      });

      // ===========================================
      // START THE CALL
      // ===========================================
      setStatus('Connecting to AI...');

      // Build the server URL for tool execution
      const serverUrl = getServerUrl();
      console.log('[Vapi] Using server URL:', serverUrl);
      console.log('[Vapi] Using assistant ID:', assistantId);

      // Start the call — tenant-aware
      const agencyLabel = tenantProfile?.agency_name || 'City Services';
      console.log(`[Vapi] Tenant: ${tenantProfile?.tenant_id || '_global'} | Agency: ${agencyLabel}`);

      // ===========================================
      // GOVERNMENT DEMO: Azure OpenAI ONLY
      // ===========================================
      // Government demo uses Azure OpenAI for FedRAMP-ready compliance.
      // Commercial demo (/demo/call) uses OpenAI.
      // Azure credentials must be configured in Vapi dashboard.
      // ===========================================

      if (assistantId && !assistantId.includes('PASTE_')) {
        // Use existing assistant WITH overrides to force our system prompt and greeting
        console.log('[Vapi] Starting GOVERNMENT call with existing assistant + Azure OpenAI...');
        await vapi.start(assistantId, {
          model: {
            provider: 'azure-openai',
            model: azureConfig.azureConfig?.deploymentName || 'gpt-4o',
            messages: [
              {
                role: 'system',
                content: systemPrompt,
              },
            ],
            tools: GOVERNMENT_TOOLS as any,
          },
          serverUrl,
          firstMessage: greeting,
        });
      } else {
        // Create a transient assistant inline with Azure OpenAI
        console.log('[Vapi] Starting GOVERNMENT call with transient assistant + Azure OpenAI...');
        await vapi.start({
          name: `Sarah - ${agencyLabel}`,
          model: {
            provider: 'azure-openai',
            model: azureConfig.azureConfig?.deploymentName || 'gpt-4o',
            messages: [
              {
                role: 'system',
                content: systemPrompt,
              },
            ],
            tools: GOVERNMENT_TOOLS as any,
          },
          voice: {
            provider: 'azure',
            voiceId: 'en-US-JennyNeural', // Azure TTS - professional, calm, authoritative
          },
          firstMessage: greeting,
          serverUrl,
        });
      }

    } catch (err) {
      console.error('[Vapi] Failed to start call:', err);

      let errorMessage = 'Failed to connect';

      // Handle specific error types
      if (err?.message?.includes('module')) {
        errorMessage = 'Vapi SDK not installed. Run: npm install @vapi-ai/web';
      } else if (err?.message?.includes('microphone') || err?.name === 'NotAllowedError') {
        errorMessage = 'Microphone access denied. Please allow microphone access in your browser.';
      } else if (err?.message?.includes('network') || err?.message?.includes('fetch')) {
        errorMessage = 'Network error. Please check your internet connection.';
      } else if (err?.message) {
        errorMessage = err.message;
      }

      setError(errorMessage);
      setIsConnecting(false);
      setStatus('Connection Failed');
    }
  };

  // Toggle mute
  const toggleMute = useCallback(() => {
    if (vapiRef.current) {
      const newMuted = !isMuted;
      vapiRef.current.setMuted(newMuted);
      setIsMuted(newMuted);
    }
  }, [isMuted]);

  // ===========================================
  // PDF EXPORT — $95k ROI Summary Generator
  // ===========================================
  const exportDemoSummaryPdf = useCallback(() => {
    if (transcript.length === 0) return;

    const agencyName = tenantProfile?.agency_name || 'Government Agency';
    const durationMinutes = Math.ceil(callDuration / 60);

    // Calculate ROI metrics
    const humanCostPerMinute = HUMAN_RECEPTIONIST_ANNUAL_COST / (52 * 40 * 60); // $0.76/min approx
    const aiCostPerMinute = AI_RECEPTIONIST_ANNUAL_COST / (52 * 40 * 60); // $0.096/min approx
    const humanCostThisCall = humanCostPerMinute * durationMinutes;
    const aiCostThisCall = aiCostPerMinute * durationMinutes;
    const savingsThisCall = humanCostThisCall - aiCostThisCall;
    const annualSavingsProjection = HUMAN_RECEPTIONIST_ANNUAL_COST - AI_RECEPTIONIST_ANNUAL_COST;

    // Build transcript text
    const transcriptText = transcript.map((entry: any) => {
      const speaker = entry.role === 'ai' ? 'SARAH (AI)' : entry.role === 'tool' ? `TOOL [${entry.toolCall}]` : 'CALLER';
      return `[${entry.timestamp}] ${speaker}: ${entry.text}`;
    }).join('\n\n');

    // Build ROI summary content
    const content = `
═══════════════════════════════════════════════════════════════
                    DEMO CALL SUMMARY REPORT
                   Azure Sovereign AI Platform
═══════════════════════════════════════════════════════════════

SESSION DETAILS
───────────────────────────────────────────────────────────────
Session ID:       ${sessionId}
Agency:           ${agencyName}
Date:             ${new Date().toLocaleDateString()}
Duration:         ${formatDuration(callDuration)} (${durationMinutes} min)
Transcript Entries: ${transcript.length}


COST ANALYSIS — HUMAN vs AI RECEPTIONIST
───────────────────────────────────────────────────────────────

                    HUMAN RECEPTIONIST         AI RECEPTIONIST
Annual Cost:        $${HUMAN_RECEPTIONIST_ANNUAL_COST.toLocaleString()}                   $${AI_RECEPTIONIST_ANNUAL_COST.toLocaleString()}
This Call Cost:     $${humanCostThisCall.toFixed(2)}                      $${aiCostThisCall.toFixed(2)}

SAVINGS THIS CALL:  $${savingsThisCall.toFixed(2)}
PROJECTED ANNUAL:   $${annualSavingsProjection.toLocaleString()} per FTE replaced

───────────────────────────────────────────────────────────────

The AI receptionist provides:
✓ 24/7 availability (no overtime, sick days, or vacations)
✓ Consistent service quality across all interactions
✓ Automatic FOIA-compliant call logging and transcription
✓ Real-time PII redaction for compliance
✓ Scalable to handle peak call volumes without additional cost


FULL TRANSCRIPT
═══════════════════════════════════════════════════════════════

${transcriptText}


═══════════════════════════════════════════════════════════════
COMPLIANCE NOTICE
This transcript was generated by the Kiri Nexus Sovereign AI Platform.
All personally identifiable information (PII) has been automatically
redacted per FOIA guidelines. This document is suitable for public
records retention.

Powered by Azure OpenAI — FedRAMP-Ready Infrastructure
═══════════════════════════════════════════════════════════════
`;

    // Generate and download PDF
    generateAndDownloadPdf(
      `Demo Call Summary - ${sessionId}`,
      content,
      `demo-summary-${sessionId}.pdf`,
      {
        agencyName,
        population: undefined,
        stateName: tenantProfile?.jurisdiction_state,
        tierName: 'Demo',
        contractValue: annualSavingsProjection,
      }
    );
  }, [transcript, tenantProfile, callDuration, sessionId]);

  // ===========================================
  // RENDER
  // ===========================================
  return (
    <div style={styles.page}>
      <div style={styles.container}>
        {/* Tenant Isolation Banner */}
        {tenantProfile && (
          <div style={styles.tenantBanner}>
            <span style={styles.tenantBannerLabel}>Environment:</span>
            <span style={styles.tenantBannerValue}>{tenantProfile.agency_name}</span>
            <span style={styles.tenantBannerSep}>|</span>
            <span style={styles.tenantBannerLabel}>Secure Silo:</span>
            <span style={styles.tenantBannerValue}>{tenantProfile.tenant_id}</span>
            <span style={styles.tenantBannerSep}>|</span>
            <span style={styles.tenantBannerLabel}>NHI:</span>
            <span style={styles.tenantBannerValue}>{tenantProfile.agent_nhi}</span>
          </div>
        )}

        {/* Header */}
        <div style={styles.header}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '20px' }}>
            <div style={styles.headerBadge}>
              <Phone size={14} />
              Live Demo
            </div>

            {/* Azure Redaction Active Indicator */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: redactionActive ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              border: `1px solid ${redactionActive ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`,
              padding: '8px 16px',
              borderRadius: '100px',
              fontSize: '12px',
              fontWeight: 600,
            }}>
              <ShieldCheck size={14} color={redactionActive ? '#22C55E' : '#EF4444'} />
              <span style={{ color: redactionActive ? '#22C55E' : '#EF4444' }}>
                Azure Redaction {redactionActive ? 'Active' : 'Inactive'}
              </span>
            </div>

            {/* Admin Bypass Badge */}
            {isAdminUser && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: 'rgba(245, 158, 11, 0.15)',
                border: '1px solid rgba(245, 158, 11, 0.4)',
                padding: '8px 16px',
                borderRadius: '100px',
                fontSize: '12px',
                fontWeight: 600,
              }}>
                <Shield size={14} color="#F59E0B" />
                <span style={{ color: '#F59E0B' }}>Admin Bypass</span>
              </div>
            )}
          </div>
          <h1 style={styles.headerTitle}>Test Your AI Agent</h1>
          <p style={styles.headerSubtitle}>
            {tenantProfile
              ? `${tenantProfile.agency_name} — Azure-powered AI with FOIA-compliant logging.`
              : 'Experience Azure-powered AI with FOIA-compliant logging.'}
          </p>
        </div>

        {/* Error Banner */}
        {error && (
          <div style={styles.errorBanner}>
            <AlertCircle size={18} />
            <span>{error}</span>
            <button onClick={() => setError(null)} style={styles.errorDismiss}>
              Dismiss
            </button>
          </div>
        )}

        {/* Critical Setup Required — blocks UI when no tenant profile */}
        {!tenantProfile && (
          <div style={styles.setupRequired}>
            <div style={styles.setupRequiredIcon}>
              <AlertCircle size={32} />
            </div>
            <h2 style={styles.setupRequiredTitle}>Critical Setup Required</h2>
            <p style={styles.setupRequiredText}>
              No tenant profile has been configured. Complete the agency setup flow to provision
              your Vapi assistant, public key, and server URL before starting a demo call.
            </p>
            <p style={styles.setupRequiredHint}>
              Navigate to the Government Setup page to configure your agency profile.
            </p>
          </div>
        )}

        <div style={{...styles.mainGrid, display: tenantProfile ? 'grid' : 'none'}}>
          {/* Call Interface */}
          <div style={styles.callPanel}>
            <div style={styles.callCard}>
              {/* Status Header */}
              <div style={styles.callStatus}>
                <div style={{
                  ...styles.statusDot,
                  background: isConnecting
                    ? '#EAB308'
                    : isSessionActive
                      ? '#22c55e'
                      : callFinished
                        ? '#64748B'
                        : '#60A5FA',
                  boxShadow: isSessionActive ? '0 0 12px rgba(34, 197, 94, 0.5)' : 'none',
                  animation: isConnecting ? 'pulse 1s infinite' : 'none',
                }} />
                <span style={styles.statusText}>
                  {isConnecting
                    ? 'Connecting...'
                    : isSessionActive
                      ? (isAiSpeaking ? 'Sarah Speaking' : isUserSpeaking ? 'Listening...' : 'Connected')
                      : status}
                </span>
                {/* Signal Strength indicator - always visible when session active */}
                {isSessionActive && (
                  <SignalStrength active={isAiSpeaking} />
                )}
                {isSessionActive && (
                  <span style={styles.callTimer}>
                    <Clock size={14} />
                    {formatDuration(callDuration)}
                  </span>
                )}
              </div>

              {/* Waveform Displays */}
              {isSessionActive && (
                <div style={styles.waveformRow}>
                  <AudioWaveform isActive={isUserSpeaking} color="#EAB308" label="You" />
                  <AudioWaveform isActive={isAiSpeaking} color="#3B82F6" label="Sarah" />
                </div>
              )}

              {/* Agent Info */}
              <div style={styles.agentInfo}>
                <span style={styles.agentName}>Sarah</span>
                <span style={styles.agentRole}>
                  {tenantProfile ? `${tenantProfile.agency_name} Assistant` : 'City Services Assistant'}
                </span>
              </div>

              {/* Sample Queries - Hidden during active call or connecting */}
              {!isSessionActive && !callFinished && !isConnecting && (
                <div style={styles.sampleQueries}>
                  <span style={styles.sampleLabel}>Try asking:</span>
                  <div style={styles.sampleList}>
                    <span style={styles.sampleItem}>&quot;What&apos;s the status of permit P-101?&quot;</span>
                    <span style={styles.sampleItem}>&quot;When&apos;s the next Route 51B bus?&quot;</span>
                    <span style={styles.sampleItem}>&quot;I need to report a pothole&quot;</span>
                    <span style={styles.sampleItem}>&quot;Check my housing application HA-990&quot;</span>
                  </div>
                </div>
              )}

              {/* Call Controls */}
              <div style={styles.callControls}>
                {!isSessionActive && !callFinished && !isConnecting ? (
                  <button onClick={startSession} style={styles.startCallBtn} className="pulse-glow">
                    <Phone size={24} />
                    Start Demo Call
                  </button>
                ) : isConnecting ? (
                  <button disabled style={{ ...styles.startCallBtn, opacity: 0.6, cursor: 'not-allowed', animation: 'none', boxShadow: 'none' }}>
                    <div style={styles.spinner} />
                    Connecting...
                  </button>
                ) : isSessionActive ? (
                  <>
                    <button
                      onClick={toggleMute}
                      style={{
                        ...styles.controlBtn,
                        background: isMuted ? 'rgba(239, 68, 68, 0.15)' : 'rgba(30, 64, 175, 0.15)',
                        borderColor: isMuted ? 'rgba(239, 68, 68, 0.3)' : 'rgba(30, 64, 175, 0.3)',
                        color: isMuted ? '#ef4444' : '#60A5FA',
                      }}
                    >
                      {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
                    </button>
                    <button onClick={stopSession} style={styles.endCallBtn}>
                      <PhoneOff size={20} />
                      End Call
                    </button>
                  </>
                ) : (
                  <button onClick={startSession} style={styles.startCallBtn} className="pulse-glow">
                    <Phone size={24} />
                    Start New Call
                  </button>
                )}
              </div>

              {/* Time Remaining */}
              {isSessionActive && (
                <div style={styles.timeRemaining}>
                  Time remaining: {formatDuration(timeLeft)}
                </div>
              )}
            </div>

            {/* Instructions - Hidden during active call */}
            {!isSessionActive && !callFinished && !isConnecting && (
              <div style={styles.instructions}>
                <h4 style={styles.instructionsTitle}>What to expect:</h4>
                <ul style={styles.instructionsList}>
                  <li>Real AI voice conversation with Sarah</li>
                  <li>Live tool execution (permits, bus times, 311 requests)</li>
                  <li>Real-time transcript generation</li>
                  <li>FOIA-compliant logging demonstration</li>
                </ul>
              </div>
            )}

            {/* Call Complete Summary with ROI */}
            {callFinished && (
              <div style={styles.completeSummary}>
                <div style={styles.completeIcon}>
                  <Phone size={24} />
                </div>
                <h4 style={styles.completeTitle}>Call Complete</h4>
                <p style={styles.completeDuration}>Duration: {formatDuration(callDuration)}</p>
                <p style={styles.completeEntries}>{transcript.length} transcript entries recorded</p>

                {/* ROI Savings Card */}
                <div style={{
                  marginTop: '20px',
                  padding: '16px',
                  background: 'rgba(34, 197, 94, 0.08)',
                  border: '1px solid rgba(34, 197, 94, 0.2)',
                  borderRadius: '12px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <DollarSign size={18} color="#22C55E" />
                    <span style={{ fontSize: '14px', fontWeight: 700, color: '#22C55E' }}>Cost Savings Analysis</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontSize: '12px', color: '#94A3B8' }}>Human Receptionist (annual):</span>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#EF4444' }}>${HUMAN_RECEPTIONIST_ANNUAL_COST.toLocaleString()}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontSize: '12px', color: '#94A3B8' }}>AI Receptionist (annual):</span>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#22C55E' }}>${AI_RECEPTIONIST_ANNUAL_COST.toLocaleString()}</span>
                  </div>
                  <div style={{ borderTop: '1px solid rgba(34, 197, 94, 0.2)', paddingTop: '8px', marginTop: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: '#F8FAFC' }}>Annual Savings:</span>
                      <span style={{ fontSize: '15px', fontWeight: 700, color: '#22C55E' }}>
                        ${(HUMAN_RECEPTIONIST_ANNUAL_COST - AI_RECEPTIONIST_ANNUAL_COST).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Export Button */}
                <button
                  onClick={exportDemoSummaryPdf}
                  style={{
                    marginTop: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    width: '100%',
                    padding: '12px 20px',
                    background: 'linear-gradient(135deg, #1E40AF 0%, #3B82F6 100%)',
                    border: 'none',
                    borderRadius: '10px',
                    color: '#fff',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <Download size={16} />
                  Download ROI Summary PDF
                </button>
              </div>
            )}
          </div>

          {/* Transcript Panel */}
          <div style={styles.transcriptPanel}>
            <div style={styles.transcriptCard}>
              <div style={styles.transcriptHeader2}>
                <FileText size={18} />
                <span style={styles.transcriptTitle}>Live Transcript Log</span>
                <span style={styles.foiaBadge}>FOIA Ready</span>
              </div>

              <div style={styles.transcriptContent}>
                {transcript.length === 0 ? (
                  <div style={styles.transcriptEmpty}>
                    <FileText size={32} color="#475569" />
                    <p>Start a call to see the live transcript.</p>
                    <p style={{ fontSize: 12, color: '#64748B' }}>
                      All conversations are automatically logged for compliance.
                    </p>
                  </div>
                ) : (
                  <div style={styles.transcriptList}>
                    {transcript.map((entry, idx) => (
                      <TranscriptEntry
                        key={idx}
                        speaker={entry.role}
                        text={entry.text}
                        timestamp={entry.timestamp}
                        toolCall={entry.toolCall}
                      />
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              {/* Transcript Footer */}
              <div style={styles.transcriptFooter}>
                <div style={styles.transcriptMeta}>
                  <span suppressHydrationWarning>Session ID: {sessionId}</span>
                  <span>|</span>
                  <span>Entries: {transcript.length}</span>
                </div>
                <button
                  onClick={exportDemoSummaryPdf}
                  style={{
                    ...styles.exportBtn,
                    opacity: transcript.length === 0 ? 0.5 : 1,
                    cursor: transcript.length === 0 ? 'not-allowed' : 'pointer',
                  }}
                  disabled={transcript.length === 0}
                >
                  <Download size={14} />
                  Export ROI PDF
                </button>
              </div>

              {/* Dev Mode Toggle & Input */}
              <div style={styles.devModeSection}>
                <button
                  onClick={() => setShowDevMode(!showDevMode)}
                  style={styles.devModeToggle}
                >
                  <Settings size={14} />
                  Dev Mode
                  <span style={{
                    ...styles.devModeIndicator,
                    background: (devNgrokUrl || tenantProfile?.ngrok_url) ? '#22c55e' : '#64748B',
                  }} />
                </button>

                {showDevMode && (
                  <div style={styles.devModePanel}>
                    <label style={styles.devModeLabel}>
                      Ngrok URL (for tool webhooks)
                    </label>
                    <input
                      type="text"
                      value={devNgrokUrl}
                      onChange={(e) => setDevNgrokUrl(e.target.value.trim())}
                      placeholder="https://abc123.ngrok-free.app"
                      style={styles.devModeInput}
                    />
                    <div style={styles.devModeInfo}>
                      <span style={{ color: '#64748B' }}>Active URL:</span>
                      <code style={styles.devModeCode}>
                        {getServerUrl()}
                      </code>
                    </div>
                    <div style={styles.devModeConfig}>
                      <span style={styles.devModeLabel}>Tenant Configuration:</span>
                      <code style={styles.devModeCode}>
                        Tenant: {tenantProfile?.tenant_id || '(not configured)'}
                      </code>
                      <code style={styles.devModeCode}>
                        Agency: {tenantProfile?.agency_name || '(not configured)'}
                      </code>
                      <code style={styles.devModeCode}>
                        NHI: {tenantProfile?.agent_nhi || '(not configured)'}
                      </code>
                      <code style={styles.devModeCode}>
                        NGROK_URL: {tenantProfile?.ngrok_url || '(not set)'}
                      </code>
                      <code style={styles.devModeCode}>
                        VAPI_PUBLIC_KEY: {tenantProfile?.vapi_public_key ? tenantProfile.vapi_public_key.substring(0, 15) + '...' : '(not set)'}
                      </code>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CSS Animations */}
      <style jsx global>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        @keyframes pulseGlow {
          0%, 100% {
            box-shadow: 0 0 20px rgba(59, 130, 246, 0.5), 0 0 40px rgba(59, 130, 246, 0.25);
          }
          50% {
            box-shadow: 0 0 30px rgba(59, 130, 246, 0.7), 0 0 60px rgba(59, 130, 246, 0.35);
          }
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        .pulse-glow {
          animation: pulseGlow 2s ease-in-out infinite;
        }

        .pulse-glow:hover {
          animation: none;
          box-shadow: 0 0 40px rgba(59, 130, 246, 0.7), 0 0 80px rgba(59, 130, 246, 0.4);
          transform: translateY(-2px);
          transition: all 0.2s ease;
        }
      `}</style>
    </div>
  );
}

// ===========================================
// STYLES - Government Navy & Blue Theme
// ===========================================
const styles = {
  // ── Tenant Isolation Banner ──
  tenantBanner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    padding: '10px 20px',
    marginBottom: '24px',
    background: 'rgba(34, 197, 94, 0.08)',
    border: '1px solid rgba(34, 197, 94, 0.3)',
    borderRadius: '10px',
    fontFamily: 'monospace',
    fontSize: '12px',
    backdropFilter: 'blur(12px)',
  },
  tenantBannerLabel: {
    color: '#64748B',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  tenantBannerValue: {
    color: '#22c55e',
    fontWeight: 700,
  },
  tenantBannerSep: {
    color: '#334155',
  },
  // ── Page Layout ──
  page: {
    minHeight: '100vh',
    paddingTop: '80px',
    background: 'radial-gradient(circle at 50% 0%, #1e3a8a 0%, #0f172a 50%, #020617 100%)',
  },
  container: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '40px 24px 80px',
  },
  header: {
    textAlign: 'center',
    marginBottom: '48px',
  },
  headerBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    background: 'rgba(30, 64, 175, 0.2)',
    border: '1px solid rgba(59, 130, 246, 0.4)',
    padding: '8px 16px',
    borderRadius: '100px',
    fontSize: '13px',
    fontWeight: 500,
    color: '#60A5FA',
    marginBottom: '20px',
  },
  headerTitle: {
    fontSize: '36px',
    fontWeight: 800,
    letterSpacing: '-0.03em',
    margin: '0 0 12px 0',
    color: '#F8FAFC',
  },
  headerSubtitle: {
    fontSize: '16px',
    color: '#94A3B8',
    margin: 0,
  },
  errorBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '16px 20px',
    background: 'rgba(239, 68, 68, 0.15)',
    border: '1px solid rgba(239, 68, 68, 0.4)',
    borderRadius: '12px',
    marginBottom: '24px',
    color: '#EF4444',
    fontSize: '14px',
    backdropFilter: 'blur(12px)',
  },
  errorDismiss: {
    marginLeft: 'auto',
    padding: '6px 12px',
    background: 'transparent',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: '6px',
    color: '#EF4444',
    fontSize: '12px',
    cursor: 'pointer',
  },
  mainGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 400px',
    gap: '32px',
  },
  callPanel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  callCard: {
    background: 'rgba(15, 23, 42, 0.75)',
    backdropFilter: 'blur(16px)',
    border: '1px solid rgba(59, 130, 246, 0.25)',
    borderRadius: '20px',
    padding: '32px',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
  },
  callStatus: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '24px',
  },
  statusDot: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    transition: 'all 0.3s ease',
  },
  statusText: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#CBD5E1',
  },
  signalBars: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: '2px',
    marginLeft: '8px',
  },
  signalBar: {
    width: '4px',
    borderRadius: '1px',
    transition: 'background 0.3s ease',
  },
  callTimer: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginLeft: 'auto',
    fontSize: '14px',
    fontWeight: 600,
    color: '#60A5FA',
    fontFamily: 'monospace',
  },
  waveformRow: {
    display: 'flex',
    justifyContent: 'center',
    gap: '32px',
    marginBottom: '24px',
  },
  waveformBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
  },
  waveformLabel: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  waveformCanvas: {
    borderRadius: '8px',
    background: 'rgba(15, 23, 42, 0.8)',
  },
  agentInfo: {
    textAlign: 'center',
    marginBottom: '24px',
  },
  agentName: {
    display: 'block',
    fontSize: '28px',
    fontWeight: 700,
    color: '#F8FAFC',
    marginBottom: '4px',
  },
  agentRole: {
    display: 'block',
    fontSize: '14px',
    color: '#64748B',
  },
  sampleQueries: {
    marginBottom: '24px',
    padding: '16px',
    background: 'rgba(30, 64, 175, 0.12)',
    borderRadius: '12px',
    border: '1px solid rgba(59, 130, 246, 0.15)',
  },
  sampleLabel: {
    display: 'block',
    fontSize: '12px',
    fontWeight: 600,
    color: '#64748B',
    marginBottom: '12px',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  sampleList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  sampleItem: {
    fontSize: '13px',
    color: '#94A3B8',
    fontStyle: 'italic',
  },
  callControls: {
    display: 'flex',
    justifyContent: 'center',
    gap: '16px',
  },
  startCallBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    padding: '22px 56px',
    background: 'linear-gradient(135deg, #1E40AF 0%, #3B82F6 100%)',
    color: '#fff',
    fontSize: '18px',
    fontWeight: 700,
    border: 'none',
    borderRadius: '16px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    boxShadow: '0 0 20px rgba(59, 130, 246, 0.5)',
  },
  spinner: {
    width: '20px',
    height: '20px',
    border: '2px solid rgba(255,255,255,0.3)',
    borderTopColor: '#fff',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  controlBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '56px',
    height: '56px',
    border: '1px solid',
    borderRadius: '14px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    background: 'transparent',
  },
  endCallBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '16px 32px',
    background: 'rgba(239, 68, 68, 0.15)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    color: '#ef4444',
    fontSize: '15px',
    fontWeight: 600,
    borderRadius: '14px',
    cursor: 'pointer',
  },
  timeRemaining: {
    textAlign: 'center',
    marginTop: '16px',
    fontSize: '13px',
    color: '#64748B',
  },
  instructions: {
    padding: '24px',
    background: 'rgba(15, 23, 42, 0.6)',
    border: '1px solid rgba(59, 130, 246, 0.2)',
    borderRadius: '14px',
    backdropFilter: 'blur(12px)',
  },
  instructionsTitle: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#CBD5E1',
    margin: '0 0 12px 0',
  },
  instructionsList: {
    margin: 0,
    paddingLeft: '20px',
    color: '#94A3B8',
    fontSize: '13px',
    lineHeight: 1.8,
  },
  completeSummary: {
    padding: '32px',
    background: 'rgba(34, 197, 94, 0.1)',
    border: '1px solid rgba(34, 197, 94, 0.25)',
    borderRadius: '14px',
    textAlign: 'center',
    backdropFilter: 'blur(12px)',
  },
  completeIcon: {
    width: '56px',
    height: '56px',
    background: 'rgba(34, 197, 94, 0.15)',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 16px',
    color: '#22c55e',
  },
  completeTitle: {
    fontSize: '18px',
    fontWeight: 700,
    color: '#22c55e',
    margin: '0 0 8px 0',
  },
  completeDuration: {
    fontSize: '14px',
    color: '#94A3B8',
    margin: '0 0 4px 0',
  },
  completeEntries: {
    fontSize: '13px',
    color: '#64748B',
    margin: 0,
  },
  transcriptPanel: {
    height: 'fit-content',
    position: 'sticky',
    top: '100px',
  },
  transcriptCard: {
    background: 'rgba(15, 23, 42, 0.75)',
    backdropFilter: 'blur(16px)',
    border: '1px solid rgba(59, 130, 246, 0.25)',
    borderRadius: '20px',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    maxHeight: 'calc(100vh - 200px)',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
  },
  transcriptHeader2: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '20px 24px',
    borderBottom: '1px solid rgba(59, 130, 246, 0.2)',
    background: 'rgba(30, 64, 175, 0.1)',
    color: '#60A5FA',
  },
  transcriptTitle: {
    fontSize: '15px',
    fontWeight: 600,
    color: '#F8FAFC',
  },
  foiaBadge: {
    marginLeft: 'auto',
    padding: '4px 10px',
    fontSize: '10px',
    fontWeight: 700,
    color: '#22c55e',
    background: 'rgba(34, 197, 94, 0.15)',
    border: '1px solid rgba(34, 197, 94, 0.35)',
    borderRadius: '100px',
    letterSpacing: '0.05em',
  },
  transcriptContent: {
    flex: 1,
    padding: '20px',
    overflowY: 'auto',
    minHeight: '300px',
  },
  transcriptEmpty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    textAlign: 'center',
    color: '#94A3B8',
    fontSize: '14px',
    gap: '12px',
  },
  transcriptList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    paddingBottom: '40px',
  },
  transcriptEntry: {
    display: 'flex',
    flexDirection: 'column',
  },
  transcriptBubble: {
    maxWidth: '95%',
    padding: '14px 16px',
    borderRadius: '12px',
    border: '1px solid',
  },
  transcriptHeaderRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '8px',
  },
  transcriptSpeakerIcon: {
    width: '20px',
    height: '20px',
    borderRadius: '6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  transcriptSpeaker: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#CBD5E1',
  },
  transcriptTime: {
    fontSize: '11px',
    color: '#64748B',
    marginLeft: 'auto',
    fontFamily: 'monospace',
  },
  transcriptText: {
    fontSize: '13px',
    lineHeight: 1.6,
    color: '#E2E8F0',
    margin: 0,
    wordBreak: 'break-word',
    whiteSpace: 'pre-wrap',
  },
  transcriptFooter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    borderTop: '1px solid rgba(59, 130, 246, 0.2)',
    background: 'rgba(15, 23, 42, 0.6)',
  },
  transcriptMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '11px',
    color: '#64748B',
    fontFamily: 'monospace',
  },
  exportBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 14px',
    background: 'rgba(30, 64, 175, 0.2)',
    border: '1px solid rgba(59, 130, 246, 0.35)',
    borderRadius: '8px',
    color: '#60A5FA',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  devModeSection: {
    borderTop: '1px solid rgba(59, 130, 246, 0.2)',
    padding: '12px 20px',
    background: 'rgba(15, 23, 42, 0.4)',
  },
  devModeToggle: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    background: 'transparent',
    border: '1px solid rgba(100, 116, 139, 0.3)',
    borderRadius: '8px',
    color: '#64748B',
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  devModeIndicator: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    marginLeft: '4px',
  },
  devModePanel: {
    marginTop: '12px',
    padding: '16px',
    background: 'rgba(15, 23, 42, 0.7)',
    border: '1px solid rgba(100, 116, 139, 0.25)',
    borderRadius: '10px',
  },
  devModeLabel: {
    display: 'block',
    fontSize: '11px',
    fontWeight: 600,
    color: '#94A3B8',
    marginBottom: '8px',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  devModeInput: {
    width: '100%',
    padding: '10px 12px',
    fontSize: '13px',
    color: '#F8FAFC',
    background: 'rgba(15, 23, 42, 0.8)',
    border: '1px solid rgba(100, 116, 139, 0.3)',
    borderRadius: '8px',
    outline: 'none',
    fontFamily: 'monospace',
  },
  devModeInfo: {
    marginTop: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    fontSize: '11px',
  },
  devModeCode: {
    padding: '8px 10px',
    background: 'rgba(34, 197, 94, 0.12)',
    border: '1px solid rgba(34, 197, 94, 0.25)',
    borderRadius: '6px',
    color: '#22c55e',
    fontFamily: 'monospace',
    fontSize: '11px',
    wordBreak: 'break-all',
    marginBottom: '4px',
  },
  devModeConfig: {
    marginTop: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  devModeHint: {
    marginTop: '8px',
    fontSize: '10px',
    color: '#64748B',
    fontStyle: 'italic',
  },
  // ── Critical Setup Required Screen ──
  setupRequired: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 40px',
    background: 'rgba(239, 68, 68, 0.08)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: '20px',
    textAlign: 'center',
    backdropFilter: 'blur(12px)',
  },
  setupRequiredIcon: {
    width: '64px',
    height: '64px',
    borderRadius: '50%',
    background: 'rgba(239, 68, 68, 0.15)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#EF4444',
    marginBottom: '24px',
  },
  setupRequiredTitle: {
    fontSize: '24px',
    fontWeight: 700,
    color: '#EF4444',
    margin: '0 0 16px 0',
  },
  setupRequiredText: {
    fontSize: '15px',
    color: '#94A3B8',
    lineHeight: 1.7,
    margin: '0 0 12px 0',
    maxWidth: '500px',
  },
  setupRequiredHint: {
    fontSize: '13px',
    color: '#64748B',
    fontStyle: 'italic',
    margin: 0,
  },
};
