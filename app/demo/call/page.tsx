'use client';

// =============================================================================
// DEMO CALL PAGE — Commercial Preview (OpenAI Only)
// =============================================================================
// This page is for the public commercial demo. It uses:
//   - LLM: OpenAI (via /api/demo/realtime)
//   - Voice: OpenAI Realtime API (WebRTC)
//
// IMPORTANT: This page NEVER uses Azure. Azure is reserved for government/HIPAA.
// The demo must work with only OPENAI_API_KEY configured.
//
// Provider Split:
//   - Demo + Commercial Preview → OpenAI (this page)
//   - Government + HIPAA        → Azure OpenAI only
// =============================================================================

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getFirebaseClient } from '../../../lib/firebase/client';
import styles from './page.module.css';

// ===========================================
// CONFIGURATION
// ===========================================
const MAX_DURATION = 90;
const MAX_DAILY_DEMOS = 999;
const THINKING_TIMEOUT_MS = 3000;
const WRAP_UP_GRACE_MS = 3000;           // Allow +3s for AI to finish when time expires

// ===========================================
// AUDIO TURN-TAKING CONFIGURATION
// ===========================================
// Calibration settings
const CALIBRATION_DURATION_MS = 1500;      // Time to measure ambient noise
const NOISE_FLOOR_MULTIPLIER = 3.0;        // speechThreshold = noiseFloor * multiplier (hardened)
const MIN_NOISE_FLOOR = 5;                 // Minimum noise floor (very quiet room)
const MAX_NOISE_FLOOR = 40;                // Maximum noise floor (noisy environment)
const MIN_SPEECH_THRESHOLD = 15;           // Minimum speech threshold
const MAX_SPEECH_THRESHOLD = 80;           // Maximum speech threshold

// Debounce settings (hardened to prevent false triggers)
const SPEECH_START_DEBOUNCE_MS = 400;      // Must speak for 400ms to count as speaking
const SPEECH_END_DEBOUNCE_MS = 1700;       // Must be silent for 1700ms to end turn (increased +300ms)

// Barge-in protection (hardened to prevent assistant cutoffs)
const BARGE_IN_THRESHOLD_MS = 800;         // User must speak for 800ms to interrupt AI (increased +150ms)

// Tail protection: ramp times for AI audio fade (prevents choppy cutoffs)
const FADE_OUT_RAMP_MS = 200;              // 200ms linear ramp down when muting AI
const FADE_IN_RAMP_MS = 150;               // 150ms linear ramp up when resuming AI
const AI_SPEAKING_MULTIPLIER = 1.6;        // Raise threshold when AI is speaking

// Hysteresis: prevent chatter by using different thresholds for start vs end
const HYSTERESIS_END_RATIO = 0.8;          // endThreshold = startThreshold * 0.8

// AI speaking detection with speech tail buffer (prevents premature cutoff)
const AI_SPEAKING_THRESHOLD = 8;           // avgLevel > 8 to count as AI speaking (was 2, too sensitive)
const AI_END_OF_TURN_TAIL_MS = 250;        // Wait 250ms of silence before marking AI as finished

// Echo/feedback detection (headphones suggestion)
const HIGH_NOISE_FLOOR_THRESHOLD = 25;     // Suggest headphones if noise floor > this
const ECHO_SPIKE_THRESHOLD = 1.8;          // Mic level spike ratio when AI speaks (echo detection)
const ECHO_DETECTION_SAMPLES = 10;         // Number of samples to track for echo detection

// ===========================================
// SENTIMENT ANALYSIS
// ===========================================
const POSITIVE_WORDS = ['great', 'wonderful', 'excellent', 'perfect', 'amazing', 'love', 'thank', 'thanks', 'happy', 'glad', 'awesome', 'fantastic', 'yes', 'absolutely', 'sure', 'definitely', 'good', 'nice', 'helpful', 'appreciate'];
const NEGATIVE_WORDS = ['problem', 'issue', 'wrong', 'bad', 'terrible', 'hate', 'angry', 'frustrated', 'annoyed', 'disappointed', 'unfortunately', 'sorry', "can't", 'cannot', "won't", 'no', 'never', 'difficult', 'confused', 'worried'];

type Sentiment = 'positive' | 'neutral' | 'negative';

function analyzeSentiment(transcript: { role: 'ai' | 'user'; text: string }[]): Sentiment {
  const recentTexts = transcript.slice(-5).map(t => t.text.toLowerCase()).join(' ');
  let pos = 0, neg = 0;
  POSITIVE_WORDS.forEach(w => { if (recentTexts.includes(w)) pos++; });
  NEGATIVE_WORDS.forEach(w => { if (recentTexts.includes(w)) neg++; });
  if (pos > neg + 1) return 'positive';
  if (neg > pos + 1) return 'negative';
  return 'neutral';
}

function getSentimentColor(s: Sentiment): string {
  return s === 'positive' ? '#22c55e' : s === 'negative' ? '#ef4444' : '#6366f1';
}

// ===========================================
// PROMPT BUILDER
// ===========================================
interface AgentConfig {
  businessName: string;
  agentName: string;
  tone: string;
  services: any[];
  goldenRules: string;
  greeting: string;
  pricing?: any;
  hours?: string;
  location?: string;
}

function buildIntelligentPrompt(data: AgentConfig): string {
  const servicesList = Array.isArray(data.services)
    ? data.services.map((s: any) => {
        if (typeof s === 'string') return `- ${s}`;
        if (s.name && s.price) return `- ${s.name}: $${s.price}`;
        if (s.name) return `- ${s.name}`;
        return `- ${JSON.stringify(s)}`;
      }).join('\n')
    : '- General services available';

  return `
You are ${data.agentName || 'Alex'}, the ${data.tone || 'friendly'} receptionist for ${data.businessName || 'our business'}.

SERVICES:
${servicesList}
${data.hours ? `\nHOURS: ${data.hours}` : ''}
${data.location ? `\nLOCATION: ${data.location}` : ''}

RULES:
${data.goldenRules || 'Be helpful.'}
`.trim();
}

// ===========================================
// BASE RECEPTIONIST SYSTEM PROMPT
// ===========================================
// Creates a fast, natural phone receptionist persona
// Optimized for: short responses, quick pacing, real phone behavior
// Target: max 24 words per response unless user asks for detail
// ===========================================
function wrapWithHumanPersona(baseContext: string, agentName: string, businessName: string): string {
  return `
=== WHO YOU ARE ===
You're ${agentName}, answering phones at ${businessName}. Sound like a real person on a busy phone line.

=== RESPONSE PATTERN (MANDATORY) ===
Every response = ONE short sentence + ONE question (if needed).
HARD LIMIT: 24 words max. Keep it short by default; expand only when asked.

Examples of good responses:
- "We're open til 10 tonight. Want to book a table?"
- "Got it, cleaning appointment. What day works for you?"
- "That's $60 for an oil change. When can you bring it in?"
- "Perfect. Tuesday at 2 for Sarah. We'll see you then!"

=== TONE: BUSY BUT KIND ===
Fast does NOT mean rude. Be warm and efficient.
USE these friendly closers: "Perfect." / "Got it." / "Sounds good." / "Great."
NEVER use: "Sure." / "Certainly." / "Absolutely." / "I'd be happy to."

=== SPEAKING STYLE ===
- Use contractions: I'm, we're, don't, can't, you'll, that's
- Ask ONE question at a time. Wait for answer. Then ask the next.
- No filler phrases. No corporate speak. Just answer and move forward.

=== BOOKING FLOW ===
Collect info one piece at a time:
1. "What day works for you?"
2. "Morning or afternoon?"
3. "And your name?"
4. Confirm: "Perfect. [Day] at [time] for [name]. See you then!"

=== PHONE FLOW ===
1. GREET → 2. LISTEN → 3. CLARIFY ("Got it—so you need...") → 4. HANDLE → 5. CONFIRM → 6. CLOSE

=== QUICK RESPONSES ===
- Unclear: "Sorry, say that again?"
- Don't know: "Let me have someone call you back. Name and number?"
- Transfer: "Let me get you to the right person. One sec."
- Wrap up: "Anything else?" (not "Is there anything else I can help you with today?")

=== WHAT NOT TO SAY ===
- No long explanations unless they specifically ask for details
- No repeating their question back ("So you're asking about...")
- No unnecessary apologies or hedging

=== IF ASKED IF YOU'RE AI ===
"I'm actually an AI assistant for ${businessName}—but I can definitely help!"

=== BUSINESS KNOWLEDGE ===
${baseContext}

=== WHEN YOU DON'T KNOW ===
Don't guess. Say: "I'm not sure on that—want me to have someone call you back?"
Then get name + number and wrap up.
`.trim();
}

// ===========================================
// COMPONENTS
// ===========================================
function ParticleField({ color }: { color: string }) {
  return (
    <div className={styles.particleField}>
      {[1,2,3,4,5,6,7,8].map(i => (
        <div key={i} className={`${styles.particle} ${styles[`particle${i}`]}`} style={{ background: color, color }} />
      ))}
    </div>
  );
}

function AudioWaveform({ stream, color, label }: { stream: MediaStream | null; color: string; label: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);

  useEffect(() => {
    if (!stream || !canvasRef.current) return;
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const analyser = audioCtx.createAnalyser();
    audioCtx.createMediaStreamSource(stream).connect(analyser);
    analyser.fftSize = 64;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const draw = () => {
      analyser.getByteFrequencyData(dataArray);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const barWidth = (canvas.width / dataArray.length) * 0.8;
      let x = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const h = (dataArray[i] / 255) * canvas.height * 0.9;
        ctx.fillStyle = color;
        ctx.fillRect(x, canvas.height - h, barWidth, h);
        x += barWidth + 2;
      }
      animationRef.current = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(animationRef.current); audioCtx.close(); };
  }, [stream, color]);

  return (
    <div className={styles.waveformContainer}>
      <span className={styles.waveformLabel}>{label}</span>
      <canvas ref={canvasRef} width={120} height={40} className={styles.waveformCanvas} />
    </div>
  );
}

function TranscriptPanel({ transcript, isVisible }: { transcript: { role: 'ai' | 'user'; text: string }[]; isVisible: boolean }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [transcript]);
  if (!isVisible || transcript.length === 0) return null;
  return (
    <div className={styles.transcriptPanel}>
      <div className={styles.transcriptHeader}>Live Transcript</div>
      <div ref={scrollRef} className={styles.transcriptBody}>
        {transcript.map((item, i) => (
          <div key={i} className={`${styles.transcriptItem} ${item.role === 'ai' ? styles.transcriptAi : styles.transcriptUser}`}>
            <span className={styles.transcriptRole}>{item.role === 'ai' ? 'AI' : 'You'}</span>
            <p className={styles.transcriptText}>{item.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function HolographicOrb({ mode, sentiment, aiStream }: { mode: 'listening' | 'speaking' | 'thinking'; sentiment: Sentiment; aiStream: MediaStream | null }) {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    if (!aiStream) return;
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const analyser = audioCtx.createAnalyser();
    audioCtx.createMediaStreamSource(aiStream).connect(analyser);
    analyser.fftSize = 256;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const update = () => {
      analyser.getByteFrequencyData(dataArray);
      const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
      setScale(1 + (avg / 255) * 0.25);
      requestAnimationFrame(update);
    };
    update();
    return () => { audioCtx.close(); };
  }, [aiStream]);

  const modeClass = mode === 'speaking' ? styles.orbSpeaking : mode === 'thinking' ? styles.orbThinking : styles.orbListening;
  const primaryColor = mode === 'speaking' ? getSentimentColor(sentiment) : mode === 'thinking' ? '#a855f7' : '#22d3ee';

  return (
    <div className={`${styles.orbContainer} ${modeClass}`}>
      <div className={styles.shockwave} style={{ borderColor: primaryColor }} />
      <div className={styles.shockwave} style={{ borderColor: primaryColor, animationDelay: '0.3s' }} />
      <div className={styles.shockwave} style={{ borderColor: primaryColor, animationDelay: '0.6s' }} />
      <div className={`${styles.orbitalRing} ${styles.ring1}`} />
      <div className={`${styles.orbitalRing} ${styles.ring2}`} />
      <div className={`${styles.orbitalRing} ${styles.ring3}`} />
      <ParticleField color={primaryColor} />
      <div className={`${styles.orbGlow} ${styles.glowOuter}`} style={{ background: primaryColor }} />
      <div className={`${styles.orbGlow} ${styles.glowMiddle}`} style={{ background: primaryColor }} />
      <div className={`${styles.orbGlow} ${styles.glowInner}`} style={{ background: primaryColor }} />
      <div className={styles.orbCore} style={{ transform: `scale(${scale})` }}>
        <div className={styles.orbHighlight} />
        <div className={styles.orbScanline} />
        <div className={styles.orbIcon}>
          {mode === 'thinking' ? (
            <div className={styles.thinkingDots}><span /><span /><span /></div>
          ) : (
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
              <path d="M19 10v2a7 7 0 01-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          )}
        </div>
      </div>
    </div>
  );
}

// ===========================================
// CALL DATA INTERFACE
// ===========================================
interface CallData {
  id: string;
  timestamp: string;
  duration: number;
  transcript: { role: 'ai' | 'user'; text: string }[];
  sentiment: Sentiment;
  bookingDetails: { name: string; time: string } | null;
  businessName: string;
  agentName: string;
}

// ===========================================
// MAIN COMPONENT
// ===========================================
export default function CallDemo() {
  const router = useRouter();
  const { db, auth } = getFirebaseClient();

  const [isSessionActive, setIsSessionActive] = useState(false);
  const [status, setStatus] = useState('Initializing...');
  const [logs, setLogs] = useState<string[]>([]);
  const [agentName, setAgentName] = useState('AI Assistant');
  const [businessName, setBusinessName] = useState('Demo Business');
  const [dataLoaded, setDataLoaded] = useState(false);
  const [timeLeft, setTimeLeft] = useState(MAX_DURATION);
  const [callFinished, setCallFinished] = useState(false);
  const [rateLimitReached, setRateLimitReached] = useState(false);
  const [endingSoon, setEndingSoon] = useState(false); // Graceful shutdown: time expired, waiting for AI to finish
  const [userStream, setUserStream] = useState<MediaStream | null>(null);
  const [aiStream, setAiStream] = useState<MediaStream | null>(null);
  const [bookingDetails, setBookingDetails] = useState<{ name: string; time: string } | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [showDebugLogs, setShowDebugLogs] = useState(false);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [transcript, setTranscript] = useState<{ role: 'ai' | 'user'; text: string }[]>([]);
  const [showTranscript, setShowTranscript] = useState(true);
  const [configError, setConfigError] = useState<{ error: string; hint?: string } | null>(null);

  // Audio calibration and turn-taking state
  const [calibrationState, setCalibrationState] = useState<'idle' | 'calibrating' | 'done'>('idle');
  const [allowBargeIn, setAllowBargeIn] = useState(true);
  const [strictBargeIn, setStrictBargeIn] = useState(true);
  const [debugMicLevel, setDebugMicLevel] = useState(0); // For debug panel display
  const [safeMode, setSafeMode] = useState(false); // Safe Mode: no interrupts at all
  const [mutingAi, setMutingAi] = useState(false); // AI audio fade-out in progress during barge-in

  // WebAudio gain pipeline for AI audio (enables smooth fade-out on barge-in)
  const aiAudioContextRef = useRef<AudioContext | null>(null);
  const aiGainNodeRef = useRef<GainNode | null>(null);
  const aiSourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const fadeOutAndCancelRef = useRef<(() => void) | null>(null); // Ref to hold the fade function

  // Headphones suggestion banner
  const [showHeadphonesTip, setShowHeadphonesTip] = useState(false);
  const [headphonesTipDismissed, setHeadphonesTipDismissed] = useState(false);

  // Audio detection refs
  const noiseFloorRef = useRef<number>(MIN_NOISE_FLOOR);
  const echoSamplesRef = useRef<{ aiSpeaking: boolean; micLevel: number }[]>([]);
  const speechThresholdRef = useRef<number>(MIN_SPEECH_THRESHOLD);
  const speechStartTimeRef = useRef<number>(0);       // When user started speaking above threshold
  const silenceStartTimeRef = useRef<number>(0);      // When user dropped below threshold
  const isUserSpeakingDebouncedRef = useRef(false);   // Debounced speech state
  const bargeInStartTimeRef = useRef<number>(0);      // When user started speaking during AI speech

  // Debug logging refs for tracking state changes
  const prevAiSpeakingRef = useRef(false);
  const currentMicLevelRef = useRef<number>(0);
  const aiAudioLevelRef = useRef<number>(0);
  const aiSpeakingStartTimeRef = useRef<number>(0);
  const assistantTextDoneTsRef = useRef<number>(0); // Timestamp when assistant text/response is complete

  // Debug logging helper for cutoff events
  const logCutoffEvent = useCallback((eventType: string, details?: Record<string, unknown>) => {
    const logData = {
      event: eventType,
      timestamp: new Date().toISOString(),
      micLevel: currentMicLevelRef.current.toFixed(1),
      noiseFloor: noiseFloorRef.current.toFixed(1),
      threshold: speechThresholdRef.current.toFixed(1),
      aiAudioLevel: aiAudioLevelRef.current.toFixed(1),
      isAiSpeaking: prevAiSpeakingRef.current,
      allowBargeIn,
      strictBargeIn,
      ...details,
    };
    console.log(`[CUTOFF DEBUG] ${eventType}:`, JSON.stringify(logData, null, 2));
    addLog(`[DEBUG] ${eventType}`);
  }, [allowBargeIn, strictBargeIn]);

  const sentiment = useMemo(() => analyzeSentiment(transcript), [transcript]);
  const mode: 'listening' | 'speaking' | 'thinking' = isAiSpeaking ? 'speaking' : isThinking ? 'thinking' : 'listening';

  const agentConfig = useRef<{ systemPrompt: string; greeting: string; businessName: string; agentName: string } | null>(null);
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const dataChannel = useRef<RTCDataChannel | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null); // Dedicated audio element for AI speech
  const audioUnlockedRef = useRef(false); // Tracks if audio was unlocked via user gesture
  const wasUserSpeakingRef = useRef(false);
  const callStartTimeRef = useRef<number>(0);
  const greetingSentRef = useRef(false);
  const audioTrackReadyRef = useRef(false);
  const lastOnTrackTsRef = useRef<number>(0); // Timestamp of last ontrack event
  const lastAudioDeltaTsRef = useRef<number>(0); // Timestamp of last response.audio.delta event

  // Audio debug state (visible in debug panel)
  const [audioDebug, setAudioDebug] = useState({
    remoteAudioReady: false,
    audioElMuted: true,
    audioElVolume: 0,
    audioElReadyState: 0,
    audioElPaused: true,
    audioElCurrentTime: 0,
    audioCtxState: 'unknown',
    lastOnTrackTs: 0,
    ontrackFired: false,
    trackKind: '',
    trackEnabled: false,
    remoteTrackCount: 0,
    playResult: 'pending',
    lastPlayAttempt: '',
    pcConnectionState: 'new',
    pcIceState: 'new',
    pcSignalingState: 'stable',
    lastAudioDeltaTs: 0,
    // Inbound-rtp stats from getStats()
    inboundAudio: 'unknown' as 'unknown' | 'YES' | 'NO',
    inboundPacketsReceived: 0,
    inboundBytesReceived: 0,
    inboundJitter: 0,
    inboundPacketsLost: 0,
    audioDiagnosis: '' as string,
  });

  // RTP stats from pc.getStats()
  const [rtpStats, setRtpStats] = useState<{
    packetsReceived: number;
    bytesReceived: number;
    jitter: number;
    packetsLost: number;
    roundTripTime: number;
  } | null>(null);

  // WebRTC error state for connection failures
  const [webrtcError, setWebrtcError] = useState<string | null>(null);

  // Audio blocked state (browser autoplay policy)
  const [audioBlocked, setAudioBlocked] = useState(false);

  // Performance metrics refs
  const metricsRef = useRef<{
    tokenFetchMs?: number;
    webrtcConnectMs?: number;
    firstResponseMs?: number;
  }>({});
  const sessionPerfStartRef = useRef<number>(0); // performance.now() at session start
  const tokenFetchStartRef = useRef<number>(0);
  const webrtcStartRef = useRef<number>(0);
  const firstResponseReceivedRef = useRef(false);

  // Timer - counts down but triggers graceful shutdown instead of hard stop
  useEffect(() => {
    if (!isSessionActive || timeLeft <= 0 || endingSoon) return;
    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          // Time expired - trigger graceful shutdown instead of hard stop
          setEndingSoon(true);
          addLog('[WRAP-UP] Time expired, waiting for AI to finish...');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isSessionActive, timeLeft, endingSoon]);

  // Poll audio element state for diagnostics
  useEffect(() => {
    if (!isSessionActive) return;

    const pollInterval = setInterval(() => {
      const a = remoteAudioRef.current;
      const pc = peerConnection.current;

      if (a) {
        setAudioDebug(prev => ({
          ...prev,
          audioElMuted: a.muted,
          audioElVolume: a.volume,
          audioElPaused: a.paused,
          audioElReadyState: a.readyState,
          audioElCurrentTime: a.currentTime,
          pcConnectionState: pc?.connectionState ?? 'new',
          pcIceState: pc?.iceConnectionState ?? 'new',
          pcSignalingState: pc?.signalingState ?? 'stable',
        }));
      }
    }, 500); // Poll every 500ms

    return () => clearInterval(pollInterval);
  }, [isSessionActive]);

  // Calibrate microphone noise floor
  const calibrateMicrophone = useCallback((stream: MediaStream): Promise<void> => {
    return new Promise((resolve) => {
      setCalibrationState('calibrating');
      addLog('Calibrating microphone...');

      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const analyser = audioCtx.createAnalyser();
      audioCtx.createMediaStreamSource(stream).connect(analyser);
      analyser.fftSize = 256;
      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const samples: number[] = [];
      const startTime = Date.now();

      const collectSamples = () => {
        if (Date.now() - startTime >= CALIBRATION_DURATION_MS) {
          // Calculate average noise floor from samples
          const avgNoise = samples.length > 0
            ? samples.reduce((a, b) => a + b, 0) / samples.length
            : MIN_NOISE_FLOOR;

          // Clamp noise floor to sane range
          const clampedNoiseFloor = Math.min(MAX_NOISE_FLOOR, Math.max(MIN_NOISE_FLOOR, avgNoise));
          noiseFloorRef.current = clampedNoiseFloor;

          // Calculate speech threshold with multiplier, clamped to range
          const rawThreshold = clampedNoiseFloor * NOISE_FLOOR_MULTIPLIER;
          speechThresholdRef.current = Math.min(MAX_SPEECH_THRESHOLD, Math.max(MIN_SPEECH_THRESHOLD, rawThreshold));

          addLog(`Calibrated: floor=${clampedNoiseFloor.toFixed(1)}, threshold=${speechThresholdRef.current.toFixed(1)}`);
          setCalibrationState('done');

          // Check for high noise floor and suggest headphones
          if (clampedNoiseFloor > HIGH_NOISE_FLOOR_THRESHOLD) {
            setShowHeadphonesTip(true);
            addLog('High noise floor detected - headphones recommended');
          }

          audioCtx.close();
          resolve();
          return;
        }

        analyser.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        samples.push(avg);
        requestAnimationFrame(collectSamples);
      };

      collectSamples();
    });
  }, []);

  // Recalibrate function for debug panel
  const recalibrateMic = useCallback(() => {
    if (userStream && isSessionActive) {
      calibrateMicrophone(userStream);
    }
  }, [userStream, isSessionActive, calibrateMicrophone]);

  // User audio detection with noise gate and debounce
  useEffect(() => {
    if (!userStream || !isSessionActive) return;

    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const analyser = audioCtx.createAnalyser();
    audioCtx.createMediaStreamSource(userStream).connect(analyser);
    analyser.fftSize = 256;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    // Update debug mic level periodically (throttled to reduce renders)
    let lastDebugUpdate = 0;
    const DEBUG_UPDATE_INTERVAL = 100; // Update debug display every 100ms

    const check = () => {
      if (!isSessionActive) return;

      analyser.getByteFrequencyData(dataArray);
      const currentLevel = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
      currentMicLevelRef.current = currentLevel; // Track for debug logging
      const now = Date.now();

      // Update debug mic level (throttled)
      if (now - lastDebugUpdate > DEBUG_UPDATE_INTERVAL) {
        setDebugMicLevel(currentLevel);
        lastDebugUpdate = now;
      }

      // HYSTERESIS: Use different thresholds for starting vs ending speech
      // This prevents chatter when mic level hovers near the threshold
      const baseThreshold = speechThresholdRef.current;
      const startThreshold = isAiSpeaking
        ? baseThreshold * AI_SPEAKING_MULTIPLIER  // Higher to start when AI speaking
        : baseThreshold;
      const endThreshold = startThreshold * HYSTERESIS_END_RATIO; // Lower to end (0.8x)

      // Echo detection: track mic levels when AI is/isn't speaking
      echoSamplesRef.current.push({ aiSpeaking: isAiSpeaking, micLevel: currentLevel });
      if (echoSamplesRef.current.length > ECHO_DETECTION_SAMPLES * 2) {
        echoSamplesRef.current.shift();

        // Calculate average mic level when AI is speaking vs not speaking
        const aiSpeakingSamples = echoSamplesRef.current.filter(s => s.aiSpeaking);
        const aiSilentSamples = echoSamplesRef.current.filter(s => !s.aiSpeaking);

        if (aiSpeakingSamples.length >= ECHO_DETECTION_SAMPLES && aiSilentSamples.length >= ECHO_DETECTION_SAMPLES) {
          const avgWhenAiSpeaking = aiSpeakingSamples.reduce((a, b) => a + b.micLevel, 0) / aiSpeakingSamples.length;
          const avgWhenAiSilent = aiSilentSamples.reduce((a, b) => a + b.micLevel, 0) / aiSilentSamples.length;

          // If mic level spikes significantly when AI speaks, likely echo/feedback
          if (avgWhenAiSilent > 0 && avgWhenAiSpeaking / avgWhenAiSilent > ECHO_SPIKE_THRESHOLD) {
            if (!headphonesTipDismissed && !showHeadphonesTip) {
              setShowHeadphonesTip(true);
              addLog('Echo detected - headphones recommended');
            }
          }
        }
      }

      // HYSTERESIS LOGIC:
      // - To START speaking: must exceed startThreshold
      // - To END speaking: must drop below endThreshold (lower) for SPEECH_END_DEBOUNCE_MS
      const isAboveStartThreshold = currentLevel > startThreshold;
      const isAboveEndThreshold = currentLevel > endThreshold;

      if (isAboveStartThreshold) {
        // User is potentially starting to speak (above startThreshold)
        silenceStartTimeRef.current = 0; // Reset silence timer - user is loud

        if (speechStartTimeRef.current === 0) {
          // Just started speaking above threshold
          speechStartTimeRef.current = now;
        }

        // Check speech debounce: must be above startThreshold for SPEECH_START_DEBOUNCE_MS
        const speechDuration = now - speechStartTimeRef.current;
        if (speechDuration >= SPEECH_START_DEBOUNCE_MS) {
          // WRAP-UP MODE: block all new user speech when call is ending
          if (endingSoon) {
            // Do nothing - call is ending, don't accept new speech
            // Let AI finish its current utterance
          }
          // SAFE MODE: completely ignore mic input while AI is speaking
          else if (safeMode && isAiSpeaking) {
            // Do nothing - safe mode blocks all interrupts
            // (Turn detection still works when AI stops speaking)
          }
          // HARDENED BARGE-IN: Only trigger if ALL conditions are met
          else if (isAiSpeaking && allowBargeIn && strictBargeIn && !safeMode) {
            // Track barge-in duration
            if (bargeInStartTimeRef.current === 0) {
              bargeInStartTimeRef.current = now;
            }
            const continuousSpeechMs = now - bargeInStartTimeRef.current;

            // STRICT: micLevel must exceed startThreshold AND speak for BARGE_IN_THRESHOLD_MS
            if (currentLevel > startThreshold && continuousSpeechMs >= BARGE_IN_THRESHOLD_MS) {
              // Log single line with all relevant values when barge-in triggers
              console.log(`[BARGE-IN CANCEL] micLevel=${currentLevel.toFixed(1)} noiseFloor=${noiseFloorRef.current.toFixed(1)} startThreshold=${startThreshold.toFixed(1)} endThreshold=${endThreshold.toFixed(1)} continuousSpeechMs=${continuousSpeechMs} isAiSpeaking=${isAiSpeaking} allowBargeIn=${allowBargeIn} strictBargeIn=${strictBargeIn}`);
              addLog(`[BARGE-IN] Interrupted AI after ${continuousSpeechMs}ms`);
              isUserSpeakingDebouncedRef.current = true;
              setIsUserSpeaking(true);

              // FADE-OUT: Don't hard-cut audio - fade out over 120ms then send cancel
              fadeOutAndCancelRef.current?.();
            }
            // Otherwise, don't interrupt yet — keep waiting
          } else if (isAiSpeaking && allowBargeIn && !strictBargeIn && !safeMode) {
            // Non-strict mode disabled for hardened config — treat as strict
            // (This path is now a no-op to prevent easy interrupts)
          } else if (!isAiSpeaking && !endingSoon) {
            // AI not speaking, normal turn-taking (but not during wrap-up)
            isUserSpeakingDebouncedRef.current = true;
            setIsUserSpeaking(true);
            bargeInStartTimeRef.current = 0; // Reset barge-in timer
          }
          // If AI is speaking and barge-in disabled (or safe mode or ending), don't set user as speaking
        }
      } else if (isAboveEndThreshold) {
        // User is between endThreshold and startThreshold (hysteresis zone)
        // If already speaking, STAY speaking (don't flip on brief dips)
        // If not speaking, don't start (need to exceed startThreshold)
        silenceStartTimeRef.current = 0; // Reset silence timer - not truly silent
        // Don't reset speechStartTimeRef - maintain speaking state if already speaking
        // Don't change isUserSpeaking state - hysteresis prevents chatter
      } else {
        // User is below endThreshold (truly silent)
        speechStartTimeRef.current = 0; // Reset speech start timer
        bargeInStartTimeRef.current = 0; // Reset barge-in timer

        if (isUserSpeakingDebouncedRef.current) {
          // User was speaking, now check silence debounce
          // Must stay below endThreshold continuously for SPEECH_END_DEBOUNCE_MS
          if (silenceStartTimeRef.current === 0) {
            silenceStartTimeRef.current = now;
          }

          const silenceDuration = now - silenceStartTimeRef.current;
          if (silenceDuration >= SPEECH_END_DEBOUNCE_MS) {
            // Silence has persisted long enough below endThreshold, end the turn
            console.log(`[SPEECH END] silenceDuration=${silenceDuration}ms micLevel=${currentLevel.toFixed(1)} endThreshold=${endThreshold.toFixed(1)}`);
            isUserSpeakingDebouncedRef.current = false;
            setIsUserSpeaking(false);
          }
          // If silence duration < SPEECH_END_DEBOUNCE_MS, stay "speaking" (wait longer)
        } else {
          // User wasn't speaking, stay silent
          setIsUserSpeaking(false);
        }
      }

      requestAnimationFrame(check);
    };

    check();
    return () => { audioCtx.close(); };
  }, [userStream, isSessionActive, isAiSpeaking, allowBargeIn, strictBargeIn, safeMode, endingSoon, showHeadphonesTip, headphonesTipDismissed, logCutoffEvent]);

  // ═══════════════════════════════════════════════════════════════════════════
  // AI SPEAKING STATE MACHINE WITH SPEECH TAIL BUFFER
  // ═══════════════════════════════════════════════════════════════════════════
  // States:
  //   IDLE      → AI is not speaking
  //   SPEAKING  → AI audio is above threshold
  //   TAIL      → AI audio dropped below threshold, waiting for tail timeout
  //
  // Transitions:
  //   IDLE → SPEAKING:     When avgLevel > AI_SPEAKING_THRESHOLD
  //   SPEAKING → TAIL:     When avgLevel drops below threshold (start tail timer)
  //   TAIL → SPEAKING:     If avgLevel rises above threshold (cancel tail timer)
  //   TAIL → IDLE:         After AI_END_OF_TURN_TAIL_MS of silence (turn complete)
  //
  // This prevents premature cutoff when AI pauses briefly between words.
  // ═══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!aiStream || !isSessionActive) return;
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const analyser = audioCtx.createAnalyser();
    audioCtx.createMediaStreamSource(aiStream).connect(analyser);
    analyser.fftSize = 256;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    // State machine variables
    type AiSpeakingState = 'IDLE' | 'SPEAKING' | 'TAIL';
    let state: AiSpeakingState = 'IDLE';
    let tailStartTime = 0;  // When we entered TAIL state

    const check = () => {
      if (!isSessionActive) return;
      analyser.getByteFrequencyData(dataArray);
      const avgLevel = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
      aiAudioLevelRef.current = avgLevel;

      const isAboveThreshold = avgLevel > AI_SPEAKING_THRESHOLD;
      const now = Date.now();
      let nowSpeaking = false;

      // State machine transitions
      switch (state) {
        case 'IDLE':
          if (isAboveThreshold) {
            // IDLE → SPEAKING: AI started speaking
            state = 'SPEAKING';
            nowSpeaking = true;
            aiSpeakingStartTimeRef.current = now;
            console.log('[AI STATE] IDLE → SPEAKING', { avgLevel: avgLevel.toFixed(1), threshold: AI_SPEAKING_THRESHOLD });
          } else {
            nowSpeaking = false;
          }
          break;

        case 'SPEAKING':
          if (isAboveThreshold) {
            // Stay in SPEAKING state
            nowSpeaking = true;
          } else {
            // SPEAKING → TAIL: Audio dropped, start tail buffer
            state = 'TAIL';
            tailStartTime = now;
            nowSpeaking = true; // Still considered speaking during tail
            console.log('[AI STATE] SPEAKING → TAIL (starting tail buffer)', { avgLevel: avgLevel.toFixed(1) });
          }
          break;

        case 'TAIL':
          if (isAboveThreshold) {
            // TAIL → SPEAKING: Audio came back, cancel tail
            state = 'SPEAKING';
            tailStartTime = 0;
            nowSpeaking = true;
            console.log('[AI STATE] TAIL → SPEAKING (tail cancelled, audio resumed)', { avgLevel: avgLevel.toFixed(1) });
          } else {
            // Check if tail timeout has elapsed
            const tailElapsed = now - tailStartTime;
            if (tailElapsed >= AI_END_OF_TURN_TAIL_MS) {
              // TAIL → IDLE: Tail complete, AI finished speaking
              state = 'IDLE';
              tailStartTime = 0;
              nowSpeaking = false;

              // Log cutoff event
              const speakingDuration = aiSpeakingStartTimeRef.current > 0
                ? now - aiSpeakingStartTimeRef.current
                : 0;
              logCutoffEvent('AI_STOPPED_SPEAKING', {
                aiAudioLevel: avgLevel.toFixed(1),
                speakingDurationMs: speakingDuration,
                tailBufferMs: AI_END_OF_TURN_TAIL_MS,
                reason: `AI audio below threshold for ${AI_END_OF_TURN_TAIL_MS}ms tail buffer`,
              });
              aiSpeakingStartTimeRef.current = 0;
              console.log('[AI STATE] TAIL → IDLE (tail complete, turn finished)', { tailElapsed, speakingDuration });
            } else {
              // Still in tail buffer, keep AI as "speaking"
              nowSpeaking = true;
            }
          }
          break;
      }

      // Only update React state if it changed
      if (prevAiSpeakingRef.current !== nowSpeaking) {
        prevAiSpeakingRef.current = nowSpeaking;
        setIsAiSpeaking(nowSpeaking);
      }

      requestAnimationFrame(check);
    };
    check();
    return () => { audioCtx.close(); };
  }, [aiStream, isSessionActive, logCutoffEvent]);

  // Thinking timeout with debug logging
  useEffect(() => {
    if (!isThinking || !isSessionActive) return;
    const timeout = setTimeout(() => {
      logCutoffEvent('THINKING_TIMEOUT', {
        timeoutMs: THINKING_TIMEOUT_MS,
        reason: 'Thinking state timed out without AI response',
      });
      setIsThinking(false);
    }, THINKING_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, [isThinking, isSessionActive, logCutoffEvent]);

  // Thinking trigger
  useEffect(() => {
    if (!isSessionActive) { setIsThinking(false); wasUserSpeakingRef.current = false; return; }
    if (isAiSpeaking) { setIsThinking(false); wasUserSpeakingRef.current = false; return; }
    if (wasUserSpeakingRef.current && !isUserSpeaking && !isAiSpeaking) setIsThinking(true);
    wasUserSpeakingRef.current = isUserSpeaking;
  }, [isSessionActive, isAiSpeaking, isUserSpeaking]);

  // Init agent config
  useEffect(() => {
    async function init() {
      const today = new Date().toDateString();
      const usage = JSON.parse(localStorage.getItem('demo_usage') || '{"count":0,"date":""}');
      if (usage.date !== today) { usage.count = 0; usage.date = today; localStorage.setItem('demo_usage', JSON.stringify(usage)); }
      if (usage.count >= MAX_DAILY_DEMOS) { setRateLimitReached(true); setStatus('Daily Limit Reached'); return; }

      setStatus('Loading Agent...');
      const tidFromUrl = new URLSearchParams(window.location.search).get('tid');
      const tenantId = tidFromUrl || auth?.currentUser?.uid || null;
      let data: any = null;

      if (db && tenantId) {
        try {
          const snap = await getDoc(doc(db, 'tenants', tenantId));
          if (snap.exists()) data = snap.data();
        } catch (e) {
          // Silently ignore Firestore errors - fallback to localStorage
        }
      }
      if (!data && tenantId) {
        const local = localStorage.getItem(`demo_config_${tenantId}`);
        if (local) data = JSON.parse(local);
      }

      if (data) {
        const bName = data.businessName || 'Demo Business';
        const aName = data.agentName || 'Alex';
        const greeting = data.greeting || 'Hi there! Thanks for calling. How can I help you today?';

        let baseContext: string;
        if (data.context && typeof data.context === 'string' && data.context.trim().length > 50) {
          baseContext = data.context;
        } else {
          baseContext = buildIntelligentPrompt({
            businessName: bName, agentName: aName, tone: data.tone || 'Friendly',
            services: data.services || [], goldenRules: data.goldenRules || '', greeting,
            pricing: data.pricing, hours: data.hours, location: data.location,
          });
        }

        const systemPrompt = wrapWithHumanPersona(baseContext, aName, bName);
        agentConfig.current = { systemPrompt, greeting, businessName: bName, agentName: aName };
        setAgentName(aName);
        setBusinessName(bName);
        setStatus('Ready to connect');
        setDataLoaded(true);
      } else {
        setStatus('Error: No config found.');
      }
    }
    init();
  }, [db, auth]);

  const addLog = (msg: string) => setLogs(prev => [`${new Date().toLocaleTimeString()}: ${msg}`, ...prev]);
  const addTranscript = useCallback((role: 'ai' | 'user', text: string) => setTranscript(prev => [...prev, { role, text }]), []);

  const toggleMute = useCallback(() => {
    if (userStream) {
      const track = userStream.getAudioTracks()[0];
      if (track) { track.enabled = !track.enabled; setIsMuted(!track.enabled); }
    }
  }, [userStream]);

  // ─────────────────────────────────────────────────────────────────────────
  // BARGE-IN FADE-OUT: Smooth transition when user interrupts AI
  // Instead of hard-cutting the audio, we:
  // 1. Set mutingAi flag
  // 2. Ramp gain to 0 over FADE_OUT_RAMP_MS (tail protection)
  // 3. After fade completes, send response.cancel to the API
  // 4. Restore gain with FADE_IN_RAMP_MS ramp for next response
  // ─────────────────────────────────────────────────────────────────────────
  const fadeOutAndCancel = useCallback(() => {
    const dc = dataChannel.current;
    const gainNode = aiGainNodeRef.current;
    const audioCtx = aiAudioContextRef.current;

    // Already muting? Skip.
    if (mutingAi) return;

    setMutingAi(true);
    console.log(`[BARGE-IN FADE] Starting ${FADE_OUT_RAMP_MS}ms fade-out...`);
    addLog('[BARGE-IN] Fade-out started');

    // Tail protection: ramp gain to 0 over FADE_OUT_RAMP_MS (not instant)
    if (gainNode && audioCtx && audioCtx.state === 'running') {
      const now = audioCtx.currentTime;
      gainNode.gain.setValueAtTime(gainNode.gain.value, now);
      gainNode.gain.linearRampToValueAtTime(0, now + FADE_OUT_RAMP_MS / 1000);
    }

    // After fade completes + small buffer, send cancel to API
    setTimeout(() => {
      // Send response.cancel to stop AI from generating more
      if (dc && dc.readyState === 'open') {
        dc.send(JSON.stringify({ type: 'response.cancel' }));
        console.log('[BARGE-IN FADE] Sent response.cancel');
        addLog('[BARGE-IN] Cancel sent to API');
      }

      // Restore gain for next response with proper ramp up
      setTimeout(() => {
        if (gainNode && audioCtx && audioCtx.state === 'running') {
          gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
          gainNode.gain.linearRampToValueAtTime(1.0, audioCtx.currentTime + FADE_IN_RAMP_MS / 1000);
        }
        setMutingAi(false);
        console.log(`[BARGE-IN FADE] Gain restored with ${FADE_IN_RAMP_MS}ms ramp`);
      }, 100);
    }, FADE_OUT_RAMP_MS + 50); // Wait for fade to complete + 50ms buffer
  }, [mutingAi]);

  // Keep the ref updated for use in effects defined before this callback
  fadeOutAndCancelRef.current = fadeOutAndCancel;

  // ─────────────────────────────────────────────────────────────────────────
  // AUDIO UNLOCK: Must run on user gesture (same click as "Start Call")
  // Creates/resumes AudioContext and plays silent buffer to unlock audio
  // ─────────────────────────────────────────────────────────────────────────
  const unlockAudio = useCallback(async () => {
    console.log('[Audio Unlock] Starting...');
    const prevState = aiAudioContextRef.current?.state || 'none';

    // Create AudioContext if not exists
    if (!aiAudioContextRef.current) {
      aiAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    const audioCtx = aiAudioContextRef.current;
    console.log(`[Audio Unlock] AudioContext state before: ${prevState} -> current: ${audioCtx.state}`);

    // Resume if suspended
    if (audioCtx.state === 'suspended') {
      try {
        await audioCtx.resume();
        console.log(`[Audio Unlock] Resumed. State now: ${audioCtx.state}`);
      } catch (e) {
        console.error('[Audio Unlock] Resume failed:', e);
      }
    }

    // Play 1-frame silent buffer to fully unlock
    try {
      const buffer = audioCtx.createBuffer(1, 1, audioCtx.sampleRate);
      const source = audioCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(audioCtx.destination);
      source.start(0);
      console.log('[Audio Unlock] Silent buffer played');
    } catch (e) {
      console.error('[Audio Unlock] Silent buffer failed:', e);
    }

    // Update debug state
    setAudioDebug(prev => ({ ...prev, audioCtxState: audioCtx.state }));

    // Also prepare the remote audio element
    if (remoteAudioRef.current) {
      remoteAudioRef.current.muted = false;
      remoteAudioRef.current.volume = 1.0;
      console.log('[Audio Unlock] Remote audio element prepared');
    }

    addLog(`[Audio] Unlocked (${prevState} -> ${audioCtx.state})`);
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // HARD AUDIO RESET: Called on response.created and first response.audio.delta
  // Ensures NO code path leaves AI muted between turns.
  // ─────────────────────────────────────────────────────────────────────────
  const hardResetAiAudio = useCallback(() => {
    const gainNode = aiGainNodeRef.current;
    const audioCtx = aiAudioContextRef.current;
    const audioEl = remoteAudioRef.current;
    const now = audioCtx?.currentTime ?? 0;

    // 1. Reset gain node - cancel any scheduled fades and set to full volume
    if (gainNode && audioCtx && audioCtx.state === 'running') {
      gainNode.gain.cancelScheduledValues(now);
      gainNode.gain.setValueAtTime(1.0, now);
    }

    // 2. Ensure audio element is NOT muted
    if (audioEl) {
      audioEl.muted = false;
      audioEl.volume = 1;
    }

    // 3. Clear muting flag (both state and any pending operations)
    setMutingAi(false);

    console.log('[HARD RESET] AI audio reset to full volume', {
      gainValue: gainNode?.gain?.value ?? 'no node',
      audioCtxState: audioCtx?.state ?? 'no ctx',
      audioElMuted: audioEl?.muted ?? 'no el',
    });
  }, []);

  // Alias for backward compatibility
  const resetGainToFull = hardResetAiAudio;

  // ─────────────────────────────────────────────────────────────────────────
  // TEST BEEP: Play a 440Hz tone to prove the browser can output audio
  // ─────────────────────────────────────────────────────────────────────────
  const playTestBeep = useCallback(() => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.value = 440; // A4 note
      gainNode.gain.value = 0.3; // Not too loud

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.3); // 300ms beep

      console.log('[Test Beep] ✓ Playing 440Hz tone');
      addLog('[Test Beep] Playing...');

      oscillator.onended = () => {
        audioCtx.close();
        addLog('[Test Beep] Done');
      };
    } catch (err) {
      console.error('[Test Beep] Failed:', err);
      addLog(`[Test Beep] FAILED: ${String(err)}`);
    }
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // FETCH RTP STATS: Get inbound audio statistics from peer connection
  // Diagnoses: packets > 0 but no playback = PLAYBACK ISSUE
  //            packets = 0 = SDP / MODEL / ICE ISSUE
  // ─────────────────────────────────────────────────────────────────────────
  const prevAudioCurrentTimeRef = useRef(0);
  const fetchRtpStats = useCallback(async () => {
    const pc = peerConnection.current;
    const audioEl = remoteAudioRef.current;

    if (!pc) {
      setAudioDebug(prev => ({
        ...prev,
        inboundAudio: 'unknown',
        audioDiagnosis: 'No peer connection',
      }));
      return;
    }

    try {
      const stats = await pc.getStats();
      let foundInbound = false;

      stats.forEach((report) => {
        if (report.type === 'inbound-rtp' && report.kind === 'audio') {
          foundInbound = true;
          const packetsReceived = report.packetsReceived ?? 0;
          const bytesReceived = report.bytesReceived ?? 0;
          const jitter = report.jitter ?? 0;
          const packetsLost = report.packetsLost ?? 0;
          const roundTripTime = report.roundTripTime ?? 0;

          // Check if audio element currentTime is advancing
          const currentTime = audioEl?.currentTime ?? 0;
          const prevTime = prevAudioCurrentTimeRef.current;
          const timeAdvancing = currentTime > prevTime;
          prevAudioCurrentTimeRef.current = currentTime;

          // Diagnosis logic
          let diagnosis = '';
          const hasPackets = packetsReceived > 0;

          if (!hasPackets) {
            diagnosis = '⚠️ SDP/MODEL/ICE ISSUE - No packets received';
          } else if (hasPackets && !timeAdvancing && currentTime === 0) {
            diagnosis = '⚠️ PLAYBACK ISSUE - Packets received but audio not playing';
          } else if (hasPackets && timeAdvancing) {
            diagnosis = '✓ Audio flowing normally';
          } else if (hasPackets && !timeAdvancing) {
            diagnosis = '⚠️ PLAYBACK STALLED - Packets received but currentTime not advancing';
          }

          console.log('[RTP Stats]', {
            packetsReceived,
            bytesReceived,
            jitter: jitter.toFixed(4),
            packetsLost,
            currentTime: currentTime.toFixed(2),
            timeAdvancing,
            diagnosis,
          });

          setRtpStats({ packetsReceived, bytesReceived, jitter, packetsLost, roundTripTime });
          setAudioDebug(prev => ({
            ...prev,
            inboundAudio: hasPackets ? 'YES' : 'NO',
            inboundPacketsReceived: packetsReceived,
            inboundBytesReceived: bytesReceived,
            inboundJitter: jitter,
            inboundPacketsLost: packetsLost,
            audioElCurrentTime: currentTime,
            audioDiagnosis: diagnosis,
          }));
        }
      });

      if (!foundInbound) {
        setRtpStats({ packetsReceived: 0, bytesReceived: 0, jitter: 0, packetsLost: 0, roundTripTime: 0 });
        setAudioDebug(prev => ({
          ...prev,
          inboundAudio: 'NO',
          inboundPacketsReceived: 0,
          inboundBytesReceived: 0,
          audioDiagnosis: '⚠️ NO INBOUND-RTP REPORT - Check ICE/SDP',
        }));
      }
    } catch (err) {
      console.error('[RTP Stats] Failed:', err);
      setAudioDebug(prev => ({
        ...prev,
        audioDiagnosis: `⚠️ Stats error: ${String(err)}`,
      }));
    }
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // POLL RTP STATS: Every 500ms while session is active
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isSessionActive) return;

    // Initial fetch
    fetchRtpStats();

    // Poll every 500ms
    const interval = setInterval(fetchRtpStats, 500);

    return () => clearInterval(interval);
  }, [isSessionActive, fetchRtpStats]);

  // ─────────────────────────────────────────────────────────────────────────
  // AUDIO INVARIANT ASSERTION: Check every 1s that audio is not secretly muted
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isSessionActive) return;

    const checkAudioInvariant = () => {
      const audioEl = remoteAudioRef.current;
      const gainNode = aiGainNodeRef.current;
      const audioCtx = aiAudioContextRef.current;

      const issues: string[] = [];

      // Check audio element state
      if (audioEl) {
        if (audioEl.muted) {
          issues.push('audioEl.muted=true');
          audioEl.muted = false;
        }
        if (audioEl.volume < 0.05) {
          issues.push(`audioEl.volume=${audioEl.volume.toFixed(2)}`);
          audioEl.volume = 1;
        }
      }

      // Check gain node state
      if (gainNode && audioCtx && audioCtx.state === 'running') {
        const currentGain = gainNode.gain.value;
        if (currentGain < 0.05) {
          issues.push(`gainNode.gain=${currentGain.toFixed(2)}`);
          gainNode.gain.cancelScheduledValues(audioCtx.currentTime);
          gainNode.gain.setValueAtTime(1.0, audioCtx.currentTime);
        }
      }

      // Log warning if any issues were found and corrected
      if (issues.length > 0) {
        console.warn(`[AUDIO INVARIANT] Corrected hidden muting: ${issues.join(', ')}`);
      }
    };

    // Initial check
    checkAudioInvariant();

    // Check every second
    const interval = setInterval(checkAudioInvariant, 1000);

    return () => clearInterval(interval);
  }, [isSessionActive]);

  // Event-driven greeting - fires once when both audio track and data channel are ready
  const tryToSendGreeting = useCallback(() => {
    // Guard: only send once
    if (greetingSentRef.current) return;

    const dc = dataChannel.current;
    const config = agentConfig.current;

    // Both conditions must be met: data channel open AND audio track ready
    if (!dc || dc.readyState !== 'open' || !config || !audioTrackReadyRef.current) {
      return;
    }

    // Send greeting immediately (no delay)
    greetingSentRef.current = true;
    dc.send(JSON.stringify({
      type: 'response.create',
      response: {
        modalities: ['text', 'audio'],
        instructions: `Say warmly: "${config.greeting}" Keep it short. Wait for response.`,
      },
    }));
    addLog('Greeting sent');
  }, []);

  // Manual greeting trigger (fallback if auto-greeting fails)
  const sendGreeting = useCallback(() => {
    const dc = dataChannel.current;
    const config = agentConfig.current;
    if (dc && dc.readyState === 'open' && config) {
      greetingSentRef.current = true; // Mark as sent to prevent double-greeting
      dc.send(JSON.stringify({
        type: 'response.create',
        response: {
          modalities: ['text', 'audio'],
          instructions: `Say warmly: "${config.greeting}" Keep it short. Wait for response.`,
        },
      }));
      addLog('Manual greeting sent');
    } else {
      addLog('Cannot send greeting - channel not ready');
    }
  }, []);

  // Save call data to localStorage
  // Uses standardized key "demo_last_call" and consistent schema
  const saveCallData = useCallback((finalTranscript: { role: 'ai' | 'user'; text: string }[], finalBooking: { name: string; time: string } | null, duration: number) => {
    const finalSentiment = analyzeSentiment(finalTranscript);
    const now = Date.now();

    // Standardized schema for demo_last_call
    const callData = {
      id: `call_${now}`,
      startedAt: new Date(callStartTimeRef.current || now).toISOString(),
      endedAt: new Date().toISOString(),
      durationSec: duration,
      transcript: finalTranscript.map(t => ({
        role: t.role === 'ai' ? 'assistant' : 'user',
        text: t.text,
        ts: new Date().toISOString(),
      })),
      booking: finalBooking ? { name: finalBooking.name, time: finalBooking.time } : null,
      sentiment: finalSentiment,
      businessName: agentConfig.current?.businessName || businessName,
      agentName: agentConfig.current?.agentName || agentName,
      // Performance metrics (if captured)
      metrics: metricsRef.current.tokenFetchMs !== undefined ? {
        tokenFetchMs: metricsRef.current.tokenFetchMs,
        webrtcConnectMs: metricsRef.current.webrtcConnectMs,
        firstResponseMs: metricsRef.current.firstResponseMs,
      } : undefined,
    };

    // Save to canonical key
    localStorage.setItem('demo_last_call', JSON.stringify(callData));

    // Also append to call history (for future use)
    const history = JSON.parse(localStorage.getItem('demo_call_history') || '[]');
    history.unshift(callData);
    if (history.length > 50) history.pop();
    localStorage.setItem('demo_call_history', JSON.stringify(history));
  }, [businessName, agentName]);

  const stopSession = useCallback(() => {
    const duration = callStartTimeRef.current > 0 ? Math.floor((Date.now() - callStartTimeRef.current) / 1000) : MAX_DURATION - timeLeft;

    // Debug log session stop
    console.log('[CUTOFF DEBUG] SESSION_STOPPED:', {
      durationSeconds: duration,
      isAiSpeaking: prevAiSpeakingRef.current,
      micLevel: currentMicLevelRef.current.toFixed(1),
      noiseFloor: noiseFloorRef.current.toFixed(1),
      threshold: speechThresholdRef.current.toFixed(1),
    });
    addLog('[DEBUG] Session stopped');

    setTranscript(currentTranscript => {
      setBookingDetails(currentBooking => {
        saveCallData(currentTranscript, currentBooking, duration);
        return currentBooking;
      });
      return currentTranscript;
    });

    peerConnection.current?.close();
    peerConnection.current = null;
    dataChannel.current?.close();
    dataChannel.current = null;
    userStream?.getTracks().forEach(t => t.stop());
    setUserStream(null);
    setAiStream(null);

    // Clean up AI audio gain pipeline
    if (aiAudioContextRef.current) {
      aiAudioContextRef.current.close().catch(() => {});
      aiAudioContextRef.current = null;
    }
    aiGainNodeRef.current = null;
    aiSourceNodeRef.current = null;
    setMutingAi(false);

    setIsSessionActive(false);
    setCallFinished(true);
    setStatus('Call Ended');
  }, [userStream, timeLeft, saveCallData]);

  // Graceful shutdown: wait for AI to finish speaking (up to WRAP_UP_GRACE_MS)
  useEffect(() => {
    if (!endingSoon || !isSessionActive) return;

    const startTime = Date.now();
    let drainCheckInterval: NodeJS.Timeout;

    const checkDrain = () => {
      const elapsed = Date.now() - startTime;
      const aiStillSpeaking = prevAiSpeakingRef.current;

      // End session if:
      // 1. AI has stopped speaking (drain complete), OR
      // 2. Grace period exceeded (force end after WRAP_UP_GRACE_MS)
      if (!aiStillSpeaking) {
        console.log(`[WRAP-UP] AI finished speaking, ending session (waited ${elapsed}ms)`);
        addLog(`[WRAP-UP] AI finished, ending call`);
        clearInterval(drainCheckInterval);
        stopSession();
      } else if (elapsed >= WRAP_UP_GRACE_MS) {
        console.log(`[WRAP-UP] Grace period exceeded (${WRAP_UP_GRACE_MS}ms), forcing end`);
        addLog(`[WRAP-UP] Grace period exceeded, ending call`);
        clearInterval(drainCheckInterval);
        stopSession();
      }
      // Otherwise, keep waiting for AI to finish
    };

    // Check immediately, then every 100ms
    checkDrain();
    drainCheckInterval = setInterval(checkDrain, 100);

    return () => clearInterval(drainCheckInterval);
  }, [endingSoon, isSessionActive, stopSession]);

  // ===========================================
  // START SESSION
  // ===========================================
  const startSession = async () => {
    if (!dataLoaded || rateLimitReached) return;

    // ─────────────────────────────────────────────────────────────────────────
    // AUDIO UNLOCK: Must happen on this user gesture (click)
    // ─────────────────────────────────────────────────────────────────────────
    await unlockAudio();

    setLogs([]);
    setTranscript([]);
    setBookingDetails(null);
    setTimeLeft(MAX_DURATION);
    setEndingSoon(false); // Reset graceful shutdown flag
    callStartTimeRef.current = Date.now();
    greetingSentRef.current = false;
    audioTrackReadyRef.current = false;
    assistantTextDoneTsRef.current = 0; // Reset assistant text done timestamp

    // Reset performance metrics
    metricsRef.current = {};
    sessionPerfStartRef.current = performance.now();
    tokenFetchStartRef.current = 0;
    webrtcStartRef.current = 0;
    firstResponseReceivedRef.current = false;

    // Reset audio debug state
    setAudioDebug({
      remoteAudioReady: false,
      audioElMuted: false,
      audioElVolume: 1,
      audioElReadyState: 0,
      audioElPaused: true,
      audioElCurrentTime: 0,
      audioCtxState: aiAudioContextRef.current?.state || 'unknown',
      lastOnTrackTs: 0,
      ontrackFired: false,
      trackKind: '',
      trackEnabled: false,
      remoteTrackCount: 0,
      playResult: 'pending',
      lastPlayAttempt: '',
      pcConnectionState: 'new',
      pcIceState: 'new',
      pcSignalingState: 'stable',
      lastAudioDeltaTs: 0,
      // Inbound-rtp stats
      inboundAudio: 'unknown',
      inboundPacketsReceived: 0,
      inboundBytesReceived: 0,
      inboundJitter: 0,
      inboundPacketsLost: 0,
      audioDiagnosis: '',
    });

    // Reset WebRTC error state
    setWebrtcError(null);

    // Reset audio blocked state
    setAudioBlocked(false);

    // Reset gain/mute state to ensure audio is NOT muted
    setMutingAi(false);
    if (aiGainNodeRef.current) {
      try {
        aiGainNodeRef.current.gain.value = 1.0;
      } catch (e) { /* ignore */ }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // AUTOPLAY COMPLIANCE: All audio unlocking MUST happen synchronously
    // in the same call stack as this user gesture (click event).
    // We unlock with an empty MediaStream, then swap srcObject in ontrack.
    // ─────────────────────────────────────────────────────────────────────────
    const audioEl = remoteAudioRef.current;
    let audioUnlocked = false;

    if (audioEl) {
      // Step 1: Configure audio element (synchronous)
      audioEl.muted = false;
      audioEl.volume = 1;
      audioEl.setAttribute('playsinline', 'true');

      // Step 2: Assign empty placeholder MediaStream (synchronous)
      // This allows us to call play() now and swap the real stream later
      const emptyStream = new MediaStream();
      audioEl.srcObject = emptyStream;

      // Step 3: Call play() in the same call stack as user gesture
      // This "unlocks" the audio element for future srcObject swaps
      try {
        await audioEl.play();
        audioUnlocked = true;
        console.log('[startSession] ✓ Audio element UNLOCKED via user gesture');
        addLog('[Audio] Unlocked via user gesture');
      } catch (playErr: any) {
        console.error('[startSession] ✗ Audio unlock FAILED:', playErr?.message || playErr);
        addLog(`[Audio] Unlock failed: ${playErr?.message || playErr}`);
        setAudioBlocked(true);
        // Continue anyway - we'll show the "tap to enable" button
      }

      console.log('[startSession] Audio element state after unlock:', {
        muted: audioEl.muted,
        volume: audioEl.volume,
        paused: audioEl.paused,
        unlocked: audioUnlocked,
      });
    } else {
      console.error('[startSession] No audio element ref!');
      addLog('[Audio] ERROR: No audio element ref');
    }

    // Step 4: Create/resume AudioContext in the same user gesture call stack
    // This ensures Web Audio API is also unlocked
    try {
      let audioCtx = aiAudioContextRef.current;
      if (!audioCtx || audioCtx.state === 'closed') {
        audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        aiAudioContextRef.current = audioCtx;
        console.log('[startSession] AudioContext created:', audioCtx.state);
      }
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
        console.log('[startSession] AudioContext resumed:', audioCtx.state);
      }
      addLog(`[Audio] AudioContext: ${audioCtx.state}`);
      setAudioDebug(prev => ({ ...prev, audioCtxState: audioCtx!.state }));
    } catch (ctxErr) {
      console.warn('[startSession] AudioContext setup failed:', ctxErr);
    }

    // Store unlock status for ontrack to check
    audioUnlockedRef.current = audioUnlocked;

    try {
      // STEP 1: Microphone
      setStatus('Requesting Mic...');
      addLog('Requesting mic...');
      const ms = await navigator.mediaDevices.getUserMedia({ audio: true });
      setUserStream(ms);
      addLog('Mic granted');

      // STEP 1b: Calibrate ambient noise
      setStatus('Calibrating...');
      await calibrateMicrophone(ms);

      // STEP 2: Fetch token from our server (OpenAI only — never Azure)
      setStatus('Connecting to AI...');
      addLog('Fetching token...');
      tokenFetchStartRef.current = performance.now();
      const tokenResp = await fetch('/api/demo/realtime');
      metricsRef.current.tokenFetchMs = Math.round(performance.now() - tokenFetchStartRef.current);

      if (!tokenResp.ok) {
        // Read response as text first, then try JSON
        const responseText = await tokenResp.text();
        let err: { error?: string; message?: string; hint?: string; configRequired?: boolean } = { error: 'Unknown' };
        try {
          err = JSON.parse(responseText);
        } catch {
          err = { error: responseText.slice(0, 500) || `Server returned ${tokenResp.status}` };
        }

        const errorMsg = err.error || err.message || `Server error ${tokenResp.status}`;
        console.error(`[Demo] Token request failed (${tokenResp.status}):`, errorMsg, err.hint || '');

        // Handle configuration error - show error card instead of throwing
        if (err.configRequired || tokenResp.status === 503) {
          setStatus('Demo Not Configured');
          addLog(`Configuration: ${errorMsg}`);
          setConfigError({ error: errorMsg, hint: err.hint });
          return; // Don't throw - let the error card render
        }

        // Handle 401 specifically
        if (tokenResp.status === 401) {
          setStatus('API Key Invalid');
          addLog(`Auth Error: ${errorMsg}`);
          setConfigError({ error: 'API authentication failed', hint: err.hint || 'Check your API key configuration' });
          return;
        }

        // Other errors - show error card
        setStatus('Connection Failed');
        addLog(`Error: ${errorMsg}`);
        setConfigError({ error: errorMsg, hint: err.hint });
        return;
      }

      const tokenData = await tokenResp.json();
      console.log('Token response:', tokenData);

      // STEP 3: Extract token safely
      const EPHEMERAL_KEY = tokenData.client_secret?.value || tokenData.client_secret;

      // Strict token validation
      if (!EPHEMERAL_KEY) {
        console.error('Cannot connect: Token is empty');
        console.error('Token response was:', tokenData);
        throw new Error('Token not found in response');
      }

      if (typeof EPHEMERAL_KEY !== 'string' || EPHEMERAL_KEY.trim() === '') {
        console.error('Cannot connect: Token is invalid (not a string or empty)');
        console.error('Token extraction failed:', tokenData);
        throw new Error('Invalid token format');
      }

      addLog(`Token: ${EPHEMERAL_KEY.substring(0, 12)}...`);

      // STEP 4: WebRTC
      webrtcStartRef.current = performance.now();
      const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      peerConnection.current = pc;

      // ─────────────────────────────────────────────────────────────────────────
      // CRITICAL: Add audio transceiver with sendrecv direction BEFORE addTrack
      // This ensures we can RECEIVE audio from OpenAI, not just send
      // ─────────────────────────────────────────────────────────────────────────
      pc.addTransceiver('audio', { direction: 'sendrecv' });
      console.log('[WebRTC] Added audio transceiver with direction: sendrecv');
      addLog('[WebRTC] Audio transceiver: sendrecv');

      // ─────────────────────────────────────────────────────────────────────────
      // ONTRACK: Attach remote audio reliably (SIMPLIFIED)
      // ─────────────────────────────────────────────────────────────────────────
      pc.ontrack = (e) => {
        const track = e.track;
        lastOnTrackTsRef.current = Date.now();

        // HARD DIAGNOSTICS: Log everything
        console.log('[ontrack] ════════════════════════════════════════════════');
        console.log('[ontrack] FIRED at', new Date().toISOString());
        console.log('[ontrack] Track:', { kind: track.kind, id: track.id, enabled: track.enabled, muted: track.muted, readyState: track.readyState });
        console.log('[ontrack] Streams:', e.streams.length);
        console.log('[ontrack] remoteAudioRef exists:', !!remoteAudioRef.current);
        console.log('[ontrack] ════════════════════════════════════════════════');

        addLog(`[ontrack] kind=${track.kind} id=${track.id.slice(0,8)} enabled=${track.enabled}`);

        // Skip non-audio tracks
        if (track.kind !== 'audio') {
          console.log('[ontrack] Skipping non-audio track');
          return;
        }

        // FORCE track enabled
        track.enabled = true;
        console.log('[ontrack] Track enabled forced to true');

        // Get or create stream
        const stream = e.streams?.[0] ?? new MediaStream([track]);
        setAiStream(stream);

        const remoteAudioCount = stream.getAudioTracks().length;
        console.log('[ontrack] Remote audio track count:', remoteAudioCount);

        // Get audio element
        const a = remoteAudioRef.current;
        if (!a) {
          console.error('[ontrack] NO AUDIO ELEMENT - cannot play!');
          addLog('[AUDIO] ERROR: No audio element ref');
          setAudioDebug(prev => ({ ...prev, ontrackFired: true, trackKind: track.kind, trackEnabled: track.enabled, playResult: 'no_element' }));
          return;
        }

        // ─────────────────────────────────────────────────────────────────────────
        // AUTOPLAY COMPLIANT: Audio was already unlocked in startSession via user gesture.
        // We ONLY swap srcObject here - NO play() call needed.
        // The audio element continues playing automatically after srcObject swap.
        // ─────────────────────────────────────────────────────────────────────────
        a.muted = false;
        a.volume = 1;

        const wasUnlocked = audioUnlockedRef.current;
        console.log('[ontrack] Audio unlock status from user gesture:', wasUnlocked);

        // Set up gain pipeline using AudioContext already created in startSession
        let finalStream = stream; // Default to direct stream
        try {
          const audioCtx = aiAudioContextRef.current;
          if (audioCtx && audioCtx.state !== 'closed') {
            // AudioContext was created in startSession - reuse it
            const source = audioCtx.createMediaStreamSource(stream);
            const gainNode = audioCtx.createGain();
            gainNode.gain.value = 1.0;
            aiGainNodeRef.current = gainNode;
            aiSourceNodeRef.current = source;
            const destination = audioCtx.createMediaStreamDestination();
            source.connect(gainNode);
            gainNode.connect(destination);
            finalStream = destination.stream; // Use gain pipeline output
            console.log('[ontrack] Gain pipeline created using existing AudioContext:', audioCtx.state);
            setAudioDebug(prev => ({ ...prev, audioCtxState: audioCtx.state }));
          } else {
            console.warn('[ontrack] No AudioContext available, using direct stream');
          }
        } catch (gainErr) {
          console.warn('[ontrack] Gain pipeline setup failed, using direct stream:', gainErr);
          // Fall back to direct stream (already set)
        }

        // SWAP srcObject - NO play() call needed!
        // The audio element was already playing (empty stream) from user gesture.
        // Swapping srcObject continues playback automatically.
        a.srcObject = finalStream;

        console.log('[ontrack] Audio element state after srcObject swap (NO play() called):', {
          srcObject: !!a.srcObject,
          muted: a.muted,
          volume: a.volume,
          paused: a.paused,
          readyState: a.readyState,
          usingGainPipeline: finalStream !== stream,
          wasUnlockedByUserGesture: wasUnlocked,
        });

        // Update debug state
        setAudioDebug(prev => ({
          ...prev,
          ontrackFired: true,
          trackKind: track.kind,
          trackEnabled: track.enabled,
          remoteAudioReady: true,
          audioElMuted: a.muted,
          audioElVolume: a.volume,
          audioElReadyState: a.readyState,
          audioElPaused: a.paused,
          lastOnTrackTs: lastOnTrackTsRef.current,
          remoteTrackCount: remoteAudioCount,
          playResult: wasUnlocked ? 'unlocked_via_gesture' : 'pending_user_tap',
          lastPlayAttempt: wasUnlocked
            ? `srcObject swapped @ ${new Date().toLocaleTimeString()} (no play() needed)`
            : `awaiting user tap @ ${new Date().toLocaleTimeString()}`,
        }));

        // If audio wasn't unlocked via user gesture, show the "tap to enable" button
        if (!wasUnlocked) {
          console.warn('[ontrack] Audio was NOT unlocked - user needs to tap to enable sound');
          addLog('[AUDIO] Tap to enable sound');
          setAudioBlocked(true);
        } else {
          addLog('[AUDIO] Stream attached (pre-unlocked)');
        }

        // Track event listeners
        track.onended = () => { console.log('[track] ended'); addLog('[track] ended'); };
        track.onmute = () => { console.log('[track] muted'); addLog('[track] muted'); };
        track.onunmute = () => { console.log('[track] unmuted'); addLog('[track] unmuted'); };

        // Mark audio ready for greeting
        audioTrackReadyRef.current = true;
        tryToSendGreeting();
      };

      // ─────────────────────────────────────────────────────────────────────────
      // ICE CONNECTION STATE: Log + handle failures
      // ─────────────────────────────────────────────────────────────────────────
      pc.oniceconnectionstatechange = () => {
        const state = pc.iceConnectionState;
        console.log('[WebRTC] ICE state:', state);
        addLog(`ICE: ${state}`);
        setAudioDebug(prev => ({ ...prev, pcIceState: state }));

        if (state === 'failed') {
          addLog('ICE failed - attempting restart');
          setWebrtcError('ICE connection failed. Try switching networks or disabling VPN.');
          pc.restartIce();
        }
        if (state === 'disconnected') {
          addLog('ICE disconnected');
        }
      };

      // ─────────────────────────────────────────────────────────────────────────
      // CONNECTION STATE: Log + handle failures
      // ─────────────────────────────────────────────────────────────────────────
      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        console.log('[WebRTC] Connection state:', state);
        addLog(`Connection: ${state}`);
        setAudioDebug(prev => ({ ...prev, pcConnectionState: state }));

        if (state === 'failed') {
          setStatus('Connection lost');
          setWebrtcError('WebRTC connection failed. This may be due to network restrictions or firewall. Try switching to a different network.');
        }
        if (state === 'connected') {
          setWebrtcError(null); // Clear any previous error
        }
      };

      // ─────────────────────────────────────────────────────────────────────────
      // SIGNALING STATE: Track for diagnostics
      // ─────────────────────────────────────────────────────────────────────────
      pc.onsignalingstatechange = () => {
        const state = pc.signalingState;
        console.log('[WebRTC] Signaling state:', state);
        setAudioDebug(prev => ({ ...prev, pcSignalingState: state }));
      };

      // Add local mic track to peer connection
      const localAudioTrack = ms.getAudioTracks()[0];
      console.log('[WebRTC] Adding local mic track:', {
        kind: localAudioTrack.kind,
        enabled: localAudioTrack.enabled,
        muted: localAudioTrack.muted,
        readyState: localAudioTrack.readyState,
        id: localAudioTrack.id,
      });
      pc.addTrack(localAudioTrack, ms);
      addLog(`[WebRTC] Local mic: enabled=${localAudioTrack.enabled}`);

      // STEP 5: Data channel
      const dc = pc.createDataChannel('oai-events');
      dataChannel.current = dc;

      dc.onopen = () => {
        addLog('Data channel open');
        // Capture WebRTC connect time
        if (webrtcStartRef.current > 0 && !metricsRef.current.webrtcConnectMs) {
          metricsRef.current.webrtcConnectMs = Math.round(performance.now() - webrtcStartRef.current);
        }
        const config = agentConfig.current;
        if (!config) return;

        dc.send(JSON.stringify({
          type: 'session.update',
          session: {
            instructions: config.systemPrompt,
            // Enforce short responses: ~24 words ≈ 40-50 tokens
            max_response_output_tokens: 60,
            tools: [{
              type: 'function',
              name: 'bookAppointment',
              description: 'Book an appointment for the caller.',
              parameters: {
                type: 'object',
                properties: {
                  name: { type: 'string', description: "Caller's name" },
                  time: { type: 'string', description: 'Appointment time' },
                  service: { type: 'string', description: 'Service requested' },
                  reason: { type: 'string', description: 'Why they want this appointment' },
                },
                required: ['time', 'reason'],
              },
            }],
            tool_choice: 'auto',
            input_audio_transcription: { model: 'whisper-1' },
          },
        }));
        addLog('Brain injected');
        // Try to send greeting (may fire here if audio already ready, or in ontrack)
        tryToSendGreeting();
      };

      dc.onerror = (e) => addLog(`DC Error: ${e}`);
      dc.onclose = () => addLog('DC Closed');

      // Track if we've done hard reset for current response (reset on response.created)
      let hardResetDoneForResponse = false;

      dc.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data);

          // ─────────────────────────────────────────────────────────────────
          // HARD AUDIO RESET ON EVERY NEW AI RESPONSE
          // Ensures NO code path leaves AI muted between turns.
          // ─────────────────────────────────────────────────────────────────
          if (event.type === 'response.created') {
            // New response starting - HARD RESET audio to full volume
            hardResetAiAudio();
            hardResetDoneForResponse = false; // Reset flag for first audio delta
            console.log('[response.created] HARD RESET - new response starting');
          }

          // Also do hard reset on FIRST audio delta (safety net)
          if (event.type === 'response.audio.delta') {
            // Track timestamp for diagnostics
            const now = Date.now();
            lastAudioDeltaTsRef.current = now;
            setAudioDebug(prev => ({ ...prev, lastAudioDeltaTs: now }));

            // UNCONDITIONAL hard reset on first audio delta of each response
            if (!hardResetDoneForResponse) {
              hardResetAiAudio();
              hardResetDoneForResponse = true;
              console.log('[response.audio.delta] HARD RESET - first audio of response');
            }
          }

          // Reset the flag when response completes (ready for next response)
          if (event.type === 'response.done') {
            hardResetDoneForResponse = false;
          }

          // ─────────────────────────────────────────────────────────────────
          // RESPONSE COMPLETION EVENTS (UI state only - no connection ops)
          // These events ONLY update UI state. They must NOT:
          // - close peer connection
          // - stop tracks
          // - pause audio element
          // - null out srcObject
          // The actual audio drain is handled by waitForAudioDrain() separately.
          // ─────────────────────────────────────────────────────────────────

          if (event.type === 'response.audio_transcript.done' && event.transcript) {
            // Capture first response time (from session start to first AI speech)
            if (!firstResponseReceivedRef.current && sessionPerfStartRef.current > 0) {
              firstResponseReceivedRef.current = true;
              metricsRef.current.firstResponseMs = Math.round(performance.now() - sessionPerfStartRef.current);
            }
            addTranscript('ai', event.transcript);

            // Record timestamp when text portion of response is complete
            // NOTE: Audio may still be playing - rely on waitForAudioDrain() for true completion
            assistantTextDoneTsRef.current = Date.now();
            console.log(`[assistant_text_done] timestamp=${assistantTextDoneTsRef.current} transcript_length=${event.transcript.length}`);
            addLog('[EVENT] assistant_text_done');
          }

          // Handle response.done - final confirmation that response generation is complete
          if (event.type === 'response.done') {
            // UI state update only - no connection operations
            assistantTextDoneTsRef.current = Date.now();
            console.log(`[assistant_text_done] response.done timestamp=${assistantTextDoneTsRef.current} status=${event.response?.status || 'unknown'}`);
            addLog('[EVENT] response.done');
            // NOTE: Audio buffer may still be draining. Do NOT stop/close anything here.
            // The graceful shutdown (waitForAudioDrain) handles actual audio completion.
          }

          // Handle output_item.done - individual output item completed
          if (event.type === 'response.output_item.done') {
            console.log(`[assistant_text_done] output_item.done type=${event.item?.type || 'unknown'}`);
            // UI state only - no connection operations
          }

          if (event.type === 'conversation.item.input_audio_transcription.completed' && event.transcript) {
            addTranscript('user', event.transcript);
          }
          if (event.type === 'response.function_call_arguments.done' && event.name === 'bookAppointment') {
            const args = JSON.parse(event.arguments);
            setBookingDetails({ name: args.name || 'Guest', time: args.time || 'TBD' });
            addTranscript('ai', `Booking confirmed for ${args.time}`);
            dc.send(JSON.stringify({
              type: 'conversation.item.create',
              item: { type: 'function_call_output', call_id: event.call_id, output: JSON.stringify({ status: 'success' }) },
            }));
            dc.send(JSON.stringify({ type: 'response.create' }));
          }
          if (event.type === 'error') {
            console.error('API Error:', event.error);
            addLog(`Error: ${event.error?.message || 'Unknown'}`);
          }
        } catch (err) { /* ignore parse errors */ }
      };

      // ─────────────────────────────────────────────────────────────────────────
      // Log transceiver directions BEFORE createOffer for debugging
      // ─────────────────────────────────────────────────────────────────────────
      const transceivers = pc.getTransceivers();
      console.log('[WebRTC] ═══════════════════════════════════════════════════════');
      console.log('[WebRTC] Transceivers BEFORE createOffer:', transceivers.length);
      transceivers.forEach((t, i) => {
        console.log(`[WebRTC] Transceiver ${i}:`, {
          mid: t.mid,
          direction: t.direction,
          currentDirection: t.currentDirection,
          senderTrack: t.sender.track ? { kind: t.sender.track.kind, enabled: t.sender.track.enabled } : null,
          receiverTrack: t.receiver.track ? { kind: t.receiver.track.kind, enabled: t.receiver.track.enabled } : null,
        });
      });
      console.log('[WebRTC] ═══════════════════════════════════════════════════════');
      addLog(`[WebRTC] ${transceivers.length} transceiver(s): ${transceivers.map(t => t.direction).join(', ')}`);

      // STEP 6: SDP Offer
      console.log('[SDP] Creating offer...');
      const offer = await pc.createOffer();
      console.log('[SDP] ✓ Offer created, length:', offer.sdp?.length);
      addLog('[SDP] Offer created');

      await pc.setLocalDescription(offer);
      console.log('[SDP] ✓ Local description set');
      addLog('[SDP] Local desc set');

      // STEP 7: SDP Exchange via server-side proxy (avoids CORS - NEVER call api.openai.com directly)
      addLog('Connecting to OpenAI...');
      console.log('[SDP] POSTing to /api/demo/sdp (server proxy)...');

      const sdpResp = await fetch('/api/demo/sdp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sdp: offer.sdp,
          ephemeralKey: EPHEMERAL_KEY,
          model: 'gpt-4o-realtime-preview-2024-12-17',
        }),
      });

      // Log response status
      console.log(`[Demo Call] SDP exchange response: ${sdpResp.status}`);

      if (!sdpResp.ok) {
        let errData: { error?: string } = {};
        try {
          errData = await sdpResp.json();
        } catch {
          errData = { error: `Server returned ${sdpResp.status}` };
        }
        console.error('SDP Failed:', sdpResp.status, errData.error);

        // Handle 401 (auth failure)
        if (sdpResp.status === 401) {
          console.error('401 Unauthorized: Ephemeral token rejected');
          setStatus('API Key Invalid');
          addLog('Error: OpenAI rejected the connection');
          setConfigError({
            error: 'API authentication failed',
            hint: 'Check .env.local and ensure OPENAI_API_KEY is set correctly',
          });
          return;
        }

        throw new Error(errData.error || `Connection failed: ${sdpResp.status}`);
      }

      const sdpData = await sdpResp.json();
      if (!sdpData.sdp) {
        throw new Error('No SDP answer received from server');
      }

      console.log('[SDP] ✓ Answer received, length:', sdpData.sdp.length);
      addLog('[SDP] Answer received');

      await pc.setRemoteDescription({ type: 'answer', sdp: sdpData.sdp });
      console.log('[SDP] ✓ Remote description set');
      addLog('[SDP] Remote desc set');

      setIsSessionActive(true);
      setStatus('Connected');
      addLog('Connected!');
      console.log('[WebRTC] ✓ Connection established, waiting for ontrack...');

    } catch (err: any) {
      console.error('Call failed:', err);
      setStatus(`Error: ${err.message}`);
      addLog(`ERROR: ${err.message}`);
      stopSession();
    }
  };

  // ===========================================
  // RENDER
  // ===========================================
  const callDuration = MAX_DURATION - timeLeft;
  const sentimentColor = getSentimentColor(sentiment);

  return (
    <div className={styles.callPage}>
      <Link href="/" className={styles.backLink}><span>←</span> Home</Link>
      <div className={styles.callContainer}>
        <div className={styles.callHeader}>
          <h1 className={styles.agentName}>{businessName}</h1>
          <p className={styles.agentSubtitle}>AI Receptionist</p>
        </div>

        <div className={styles.callCard}>
          {bookingDetails && isSessionActive && (
            <div className={styles.bookingPopup}>
              <div className={styles.bookingPopupIcon}>✓</div>
              <div className={styles.bookingPopupContent}>
                <div className={styles.bookingPopupTitle}>Appointment Confirmed</div>
                <div className={styles.bookingPopupTime}>{bookingDetails.time}</div>
              </div>
            </div>
          )}

          {/* Headphones Suggestion Banner */}
          {showHeadphonesTip && !headphonesTipDismissed && isSessionActive && (
            <div style={{
              background: 'rgba(251, 191, 36, 0.1)',
              border: '1px solid rgba(251, 191, 36, 0.3)',
              borderRadius: '8px',
              padding: '10px 14px',
              marginBottom: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px',
              fontSize: '13px',
              color: '#fbbf24',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '16px' }}>🎧</span>
                <span>Tip: Your mic may be picking up speaker audio. For best results, use headphones or lower your volume.</span>
              </div>
              <button
                onClick={() => {
                  setHeadphonesTipDismissed(true);
                  setShowHeadphonesTip(false);
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#fbbf24',
                  cursor: 'pointer',
                  padding: '4px',
                  fontSize: '16px',
                  lineHeight: 1,
                  opacity: 0.7,
                }}
                aria-label="Dismiss tip"
              >
                ×
              </button>
            </div>
          )}

          {/* Configuration Error Display */}
          {configError ? (
            <div className={styles.screenContent}>
              <div style={{
                width: 64, height: 64, borderRadius: '50%', margin: '0 auto 20px',
                background: 'rgba(239, 68, 68, 0.1)', border: '2px solid rgba(239, 68, 68, 0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
              <h3 style={{ color: '#f8fafc', marginBottom: 12 }}>Demo Not Available</h3>
              <p style={{ color: '#94a3b8', fontSize: '14px', marginBottom: 8, maxWidth: 320 }}>
                {configError.error}
              </p>
              {configError.hint && (
                <p style={{ color: '#64748b', fontSize: '12px', marginBottom: 20, maxWidth: 320, fontStyle: 'italic' }}>
                  {configError.hint}
                </p>
              )}
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 16 }}>
                <button
                  onClick={() => { setConfigError(null); startSession(); }}
                  className={styles.btnText}
                  style={{ padding: '10px 20px' }}
                >
                  Retry
                </button>
                <button
                  onClick={() => router.push('/demo/setup')}
                  className={styles.btnPrimary}
                  style={{ padding: '10px 20px' }}
                >
                  Back to Setup
                </button>
              </div>
            </div>
          ) : rateLimitReached ? (
            <div className={styles.screenContent}>
              <h3>Daily Limit Reached</h3>
              <p style={{ color: '#888', fontSize: '14px' }}>Come back tomorrow.</p>
              <button onClick={() => router.push('/signup')} className={styles.btnPrimary}>Get Unlimited</button>
            </div>
          ) : isSessionActive ? (
            <div className={styles.screenContent}>
              <div className={styles.statusBadge} style={{ borderColor: sentimentColor }}>
                <span className={styles.statusDot} style={{ background: sentimentColor }} />
                <span className={styles.statusText} style={{ color: sentimentColor }}>
                  {mode === 'speaking' ? 'AI Speaking' : mode === 'thinking' ? 'Thinking...' : 'Listening'}
                </span>
              </div>

              {/* WebRTC Error Card */}
              {webrtcError && (
                <div style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '8px',
                  padding: '12px 16px',
                  marginBottom: '16px',
                  maxWidth: '320px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <span style={{ fontSize: '18px' }}>⚠️</span>
                    <strong style={{ color: '#ef4444', fontSize: '14px' }}>WebRTC Connection Issue</strong>
                  </div>
                  <p style={{ color: '#f87171', fontSize: '12px', margin: 0, lineHeight: 1.4 }}>
                    {webrtcError}
                  </p>
                  <button
                    onClick={() => { setWebrtcError(null); stopSession(); }}
                    style={{
                      marginTop: '10px',
                      padding: '6px 12px',
                      fontSize: '11px',
                      background: 'rgba(239, 68, 68, 0.2)',
                      border: '1px solid rgba(239, 68, 68, 0.4)',
                      borderRadius: '4px',
                      color: '#f87171',
                      cursor: 'pointer',
                    }}
                  >
                    End Call & Retry
                  </button>
                </div>
              )}

              {/* Audio Blocked - Tap to enable sound */}
              {audioBlocked && (
                <button
                  onClick={() => {
                    const a = remoteAudioRef.current;
                    if (a) {
                      a.play()
                        .then(() => {
                          setAudioBlocked(false);
                          addLog('[AUDIO] Unblocked by user tap');
                        })
                        .catch(e => console.error('[AUDIO] Still blocked:', e));
                    }
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    padding: '12px 20px',
                    marginBottom: '16px',
                    background: 'rgba(34, 197, 94, 0.15)',
                    border: '2px solid rgba(34, 197, 94, 0.5)',
                    borderRadius: '8px',
                    color: '#22c55e',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    animation: 'pulse 2s ease-in-out infinite',
                  }}
                >
                  <span style={{ fontSize: '18px' }}>🔊</span>
                  Tap to enable sound
                </button>
              )}

              {/* ═══════════════════════════════════════════════════════════════════
                  PERSISTENT AUDIO DIAGNOSTICS BOX (always visible during session)
                  ═══════════════════════════════════════════════════════════════════ */}
              {isSessionActive && (
                <div style={{
                  background: 'rgba(30, 41, 59, 0.9)',
                  border: '1px solid rgba(99, 102, 241, 0.4)',
                  borderRadius: '8px',
                  padding: '12px',
                  marginBottom: '12px',
                  fontSize: '11px',
                  fontFamily: 'monospace',
                  maxWidth: '360px',
                }}>
                  <div style={{ fontWeight: 'bold', color: '#818cf8', marginBottom: '8px', borderBottom: '1px solid rgba(99, 102, 241, 0.3)', paddingBottom: '4px' }}>
                    🔊 AUDIO DIAGNOSTICS
                  </div>

                  {/* Connection States */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px', marginBottom: '8px' }}>
                    <div>
                      <span style={{ color: '#64748b' }}>PC: </span>
                      <span style={{ color: audioDebug.pcConnectionState === 'connected' ? '#22c55e' : audioDebug.pcConnectionState === 'failed' ? '#ef4444' : '#fbbf24' }}>
                        {audioDebug.pcConnectionState}
                      </span>
                    </div>
                    <div>
                      <span style={{ color: '#64748b' }}>ICE: </span>
                      <span style={{ color: audioDebug.pcIceState === 'connected' ? '#22c55e' : audioDebug.pcIceState === 'failed' ? '#ef4444' : '#fbbf24' }}>
                        {audioDebug.pcIceState}
                      </span>
                    </div>
                    <div>
                      <span style={{ color: '#64748b' }}>Sig: </span>
                      <span style={{ color: '#a5b4fc' }}>{audioDebug.pcSignalingState}</span>
                    </div>
                  </div>

                  {/* Track Info */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', marginBottom: '8px' }}>
                    <div>
                      <span style={{ color: '#64748b' }}>ontrack: </span>
                      <span style={{ color: audioDebug.ontrackFired ? '#22c55e' : '#ef4444' }}>
                        {audioDebug.ontrackFired ? '✓ Yes' : '✗ No'}
                      </span>
                    </div>
                    <div>
                      <span style={{ color: '#64748b' }}>tracks: </span>
                      <span style={{ color: audioDebug.remoteTrackCount > 0 ? '#22c55e' : '#ef4444' }}>
                        {audioDebug.remoteTrackCount}
                      </span>
                    </div>
                  </div>

                  {/* Audio Element State */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '4px', marginBottom: '8px' }}>
                    <div>
                      <span style={{ color: '#64748b' }}>muted: </span>
                      <span style={{ color: audioDebug.audioElMuted ? '#ef4444' : '#22c55e' }}>
                        {audioDebug.audioElMuted ? 'YES!' : 'no'}
                      </span>
                    </div>
                    <div>
                      <span style={{ color: '#64748b' }}>paused: </span>
                      <span style={{ color: audioDebug.audioElPaused ? '#ef4444' : '#22c55e' }}>
                        {audioDebug.audioElPaused ? 'YES!' : 'no'}
                      </span>
                    </div>
                    <div>
                      <span style={{ color: '#64748b' }}>vol: </span>
                      <span>{audioDebug.audioElVolume.toFixed(1)}</span>
                    </div>
                    <div>
                      <span style={{ color: '#64748b' }}>ready: </span>
                      <span>{audioDebug.audioElReadyState}</span>
                    </div>
                  </div>

                  {/* AudioContext & currentTime */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', marginBottom: '8px' }}>
                    <div>
                      <span style={{ color: '#64748b' }}>audioCtx: </span>
                      <span style={{ color: audioDebug.audioCtxState === 'running' ? '#22c55e' : '#fbbf24' }}>
                        {audioDebug.audioCtxState}
                      </span>
                    </div>
                    <div>
                      <span style={{ color: '#64748b' }}>time: </span>
                      <span>{audioDebug.audioElCurrentTime.toFixed(2)}s</span>
                    </div>
                  </div>

                  {/* Timestamps */}
                  <div style={{ marginBottom: '8px' }}>
                    <div>
                      <span style={{ color: '#64748b' }}>lastOnTrack: </span>
                      <span>{audioDebug.lastOnTrackTs > 0 ? new Date(audioDebug.lastOnTrackTs).toLocaleTimeString() : 'never'}</span>
                    </div>
                    <div>
                      <span style={{ color: '#64748b' }}>lastAudioDelta: </span>
                      <span style={{ color: audioDebug.lastAudioDeltaTs > 0 ? '#22c55e' : '#ef4444' }}>
                        {audioDebug.lastAudioDeltaTs > 0 ? new Date(audioDebug.lastAudioDeltaTs).toLocaleTimeString() : 'never'}
                      </span>
                    </div>
                    <div>
                      <span style={{ color: '#64748b' }}>lastPlay: </span>
                      <span style={{
                        color: audioDebug.lastPlayAttempt.includes('success') ? '#22c55e' :
                               audioDebug.lastPlayAttempt.includes('FAILED') ? '#ef4444' : '#94a3b8'
                      }}>
                        {audioDebug.lastPlayAttempt || 'pending'}
                      </span>
                    </div>
                  </div>

                  {/* ═══════════════════════════════════════════════════════════
                      INBOUND AUDIO DIAGNOSIS (auto-polling every 500ms)
                      ═══════════════════════════════════════════════════════════ */}
                  <div style={{
                    borderTop: '1px solid rgba(99, 102, 241, 0.3)',
                    paddingTop: '8px',
                    marginTop: '4px',
                  }}>
                    {/* Prominent YES/NO indicator */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      marginBottom: '6px',
                    }}>
                      <span style={{ color: '#64748b', fontWeight: 'bold' }}>Inbound Audio:</span>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontWeight: 'bold',
                        fontSize: '12px',
                        background: audioDebug.inboundAudio === 'YES'
                          ? 'rgba(34, 197, 94, 0.2)'
                          : audioDebug.inboundAudio === 'NO'
                          ? 'rgba(239, 68, 68, 0.2)'
                          : 'rgba(148, 163, 184, 0.2)',
                        color: audioDebug.inboundAudio === 'YES'
                          ? '#22c55e'
                          : audioDebug.inboundAudio === 'NO'
                          ? '#ef4444'
                          : '#94a3b8',
                      }}>
                        {audioDebug.inboundAudio}
                      </span>
                    </div>

                    {/* Diagnosis message */}
                    {audioDebug.audioDiagnosis && (
                      <div style={{
                        padding: '6px 8px',
                        marginBottom: '6px',
                        borderRadius: '4px',
                        fontSize: '10px',
                        background: audioDebug.audioDiagnosis.includes('✓')
                          ? 'rgba(34, 197, 94, 0.1)'
                          : 'rgba(239, 68, 68, 0.1)',
                        border: audioDebug.audioDiagnosis.includes('✓')
                          ? '1px solid rgba(34, 197, 94, 0.3)'
                          : '1px solid rgba(239, 68, 68, 0.3)',
                        color: audioDebug.audioDiagnosis.includes('✓') ? '#22c55e' : '#f87171',
                      }}>
                        {audioDebug.audioDiagnosis}
                      </div>
                    )}

                    {/* RTP Stats details */}
                    <div style={{ color: '#94a3b8', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px' }}>
                      <div>pkts: <span style={{ color: audioDebug.inboundPacketsReceived > 0 ? '#22c55e' : '#ef4444' }}>{audioDebug.inboundPacketsReceived}</span></div>
                      <div>bytes: <span style={{ color: audioDebug.inboundBytesReceived > 0 ? '#22c55e' : '#ef4444' }}>{audioDebug.inboundBytesReceived}</span></div>
                      <div>jitter: {audioDebug.inboundJitter.toFixed(4)}</div>
                      <div>lost: <span style={{ color: audioDebug.inboundPacketsLost > 0 ? '#fbbf24' : '#22c55e' }}>{audioDebug.inboundPacketsLost}</span></div>
                    </div>
                  </div>
                </div>
              )}

              {/* SAFE MODE badge */}
              {safeMode && (
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 10px',
                  marginTop: '8px',
                  background: 'rgba(234, 179, 8, 0.15)',
                  border: '1px solid rgba(234, 179, 8, 0.4)',
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#eab308',
                  letterSpacing: '0.5px',
                }}>
                  <span style={{ fontSize: '10px' }}>🛡️</span>
                  SAFE MODE
                </div>
              )}

              <div className={styles.waveformRow}>
                <AudioWaveform stream={userStream} color="#EAB308" label="You" />
                <AudioWaveform stream={aiStream} color={sentimentColor} label="AI" />
              </div>

              <HolographicOrb mode={mode} sentiment={sentiment} aiStream={aiStream} />

              <div className={styles.timer} style={endingSoon ? { color: '#f97316' } : undefined}>
                {endingSoon ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{
                      animation: 'pulse 1s ease-in-out infinite',
                      display: 'inline-block',
                    }}>⏳</span>
                    Wrapping up...
                  </span>
                ) : (
                  `${Math.floor(timeLeft / 60)}:${(timeLeft % 60).toString().padStart(2, '0')}`
                )}
              </div>

              <div className={styles.controls}>
                <button onClick={toggleMute} className={`${styles.btnMute} ${isMuted ? styles.btnMuteMuted : ''}`}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    {isMuted ? <><line x1="1" y1="1" x2="23" y2="23" /><path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6" /></> : <><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" /><path d="M19 10v2a7 7 0 01-14 0v-2" /></>}
                  </svg>
                </button>
                <button onClick={() => setShowTranscript(!showTranscript)} className={styles.btnMute}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </button>
                <button onClick={stopSession} className={styles.btnHangup}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.12.96.36 1.9.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.91.34 1.85.58 2.81.7A2 2 0 0122 16.92z" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                  End
                </button>
              </div>

              <button onClick={sendGreeting} className={styles.btnSecondary} style={{ marginTop: '12px', fontSize: '13px', padding: '8px 16px' }}>
                Say Hello
              </button>

              <TranscriptPanel transcript={transcript} isVisible={showTranscript} />
              {showDebugLogs && <div className={styles.debugLogs}>{logs.map((l, i) => <div key={i}>{l}</div>)}</div>}
            </div>
          ) : callFinished ? (
            <div className={`${styles.screenContent} ${styles.fadeIn}`}>
              <div className={styles.callSummary}>
                <h3 style={{ margin: 0, color: '#22c55e' }}>Call Complete</h3>
                <p style={{ color: '#888', margin: '8px 0' }}>Duration: {Math.floor(callDuration / 60)}:{(callDuration % 60).toString().padStart(2, '0')}</p>
              </div>
              {bookingDetails && (
                <div className={styles.bookingReceipt}>
                  <div className={styles.bookingReceiptHeader}><span>✅</span><span>Appointment Booked</span></div>
                  <div className={styles.bookingReceiptBody}><p>Confirmed for <strong>{bookingDetails.name}</strong> at <strong>{bookingDetails.time}</strong></p></div>
                </div>
              )}

              {/* Post-Demo Conversion Card */}
              <div style={{
                background: 'rgba(34, 211, 238, 0.08)',
                border: '1px solid rgba(34, 211, 238, 0.25)',
                borderRadius: '16px',
                padding: '24px',
                textAlign: 'center',
                marginTop: '16px',
                marginBottom: '16px',
              }}>
                <div style={{ fontSize: '32px', marginBottom: '12px' }}>💼</div>
                <h4 style={{ margin: '0 0 8px 0', color: '#F8FAFC', fontSize: '18px' }}>
                  Keep This Configuration
                </h4>
                <p style={{ color: '#94A3B8', fontSize: '14px', margin: '0 0 16px 0', lineHeight: 1.5 }}>
                  Create an account to save your AI receptionist setup and get a dedicated phone number.
                </p>
                <button
                  onClick={() => router.push('/signup')}
                  className={styles.btnPrimary}
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  Save Configuration & Sign Up
                </button>
              </div>

              <div className={styles.buttonRow}>
                <button onClick={() => router.push('/demo/dashboard')} className={styles.btnSecondary}>View Demo Summary</button>
                <button onClick={() => router.push('/pricing')} className={styles.btnText}>View Pricing</button>
                <button onClick={() => { setCallFinished(false); startSession(); }} className={styles.btnText}>Try Again</button>
              </div>
            </div>
          ) : (
            <div className={styles.screenContent}>
              <div className={styles.startIcon}>
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" />
                </svg>
              </div>
              <div className={styles.startStatus}>{status}</div>
              <button onClick={startSession} disabled={!dataLoaded} className={`${styles.btnStart} ${!dataLoaded ? styles.btnStartDisabled : ''}`}>Start Call</button>
              <p style={{ color: '#555', fontSize: '12px', marginTop: '16px' }}>90 second demo | Microphone required</p>
            </div>
          )}
        </div>

        <div className={styles.debugSection}>
          <button onClick={() => setShowDebugLogs(!showDebugLogs)} className={styles.debugToggle}>{showDebugLogs ? 'Hide' : 'Show'} Debug</button>

          {/* Calibration status indicator */}
          {calibrationState === 'done' && isSessionActive && (
            <span style={{ fontSize: '11px', color: '#22c55e', marginLeft: '8px' }}>
              Mic calibrated
            </span>
          )}

          {/* Expanded debug panel */}
          {showDebugLogs && (
            <div style={{
              marginTop: '12px',
              padding: '12px',
              background: 'rgba(0,0,0,0.3)',
              borderRadius: '8px',
              fontSize: '12px',
              color: '#94a3b8',
            }}>
              {/* Audio levels */}
              <div style={{ marginBottom: '8px' }}>
                <strong style={{ color: '#f8fafc' }}>Audio Detection:</strong>
                <div>Current Mic Level: <span style={{ color: debugMicLevel > speechThresholdRef.current ? '#22c55e' : '#94a3b8' }}>{debugMicLevel.toFixed(1)}</span></div>
                <div>Noise Floor: {noiseFloorRef.current.toFixed(1)}</div>
                <div>Start Threshold: {(isAiSpeaking ? speechThresholdRef.current * AI_SPEAKING_MULTIPLIER : speechThresholdRef.current).toFixed(1)}</div>
                <div>End Threshold: {((isAiSpeaking ? speechThresholdRef.current * AI_SPEAKING_MULTIPLIER : speechThresholdRef.current) * HYSTERESIS_END_RATIO).toFixed(1)}</div>
                <div>Calibration: {calibrationState}</div>
              </div>

              {/* Recalibrate button */}
              {isSessionActive && (
                <button
                  onClick={recalibrateMic}
                  style={{
                    padding: '4px 8px',
                    fontSize: '11px',
                    background: 'rgba(99, 102, 241, 0.2)',
                    border: '1px solid rgba(99, 102, 241, 0.4)',
                    borderRadius: '4px',
                    color: '#a5b4fc',
                    cursor: 'pointer',
                    marginBottom: '8px',
                  }}
                >
                  Recalibrate
                </button>
              )}

              {/* Audio Playback Debug - HARD DIAGNOSTICS */}
              <div style={{ marginTop: '8px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '8px' }}>
                <strong style={{ color: '#f8fafc' }}>Audio Playback:</strong>

                {/* Test Beep Button */}
                <button
                  onClick={playTestBeep}
                  style={{
                    display: 'block',
                    marginTop: '6px',
                    marginBottom: '8px',
                    padding: '6px 12px',
                    fontSize: '11px',
                    background: 'rgba(34, 197, 94, 0.2)',
                    border: '1px solid rgba(34, 197, 94, 0.4)',
                    borderRadius: '4px',
                    color: '#22c55e',
                    cursor: 'pointer',
                  }}
                >
                  🔊 Test Beep (440Hz)
                </button>

                {/* WebRTC State */}
                <div style={{ marginBottom: '4px' }}>
                  <span style={{ color: '#64748b' }}>PC State: </span>
                  <span style={{ color: audioDebug.pcConnectionState === 'connected' ? '#22c55e' : audioDebug.pcConnectionState === 'failed' ? '#ef4444' : '#fbbf24' }}>
                    {audioDebug.pcConnectionState}
                  </span>
                </div>
                <div style={{ marginBottom: '4px' }}>
                  <span style={{ color: '#64748b' }}>ICE State: </span>
                  <span style={{ color: audioDebug.pcIceState === 'connected' ? '#22c55e' : audioDebug.pcIceState === 'failed' ? '#ef4444' : '#fbbf24' }}>
                    {audioDebug.pcIceState}
                  </span>
                </div>

                {/* ontrack status */}
                <div style={{ marginBottom: '4px' }}>
                  <span style={{ color: '#64748b' }}>ontrack fired: </span>
                  <span style={{ color: audioDebug.ontrackFired ? '#22c55e' : '#ef4444' }}>
                    {audioDebug.ontrackFired ? 'Yes' : 'No'}
                  </span>
                </div>
                {audioDebug.ontrackFired && (
                  <>
                    <div style={{ marginBottom: '4px' }}>
                      <span style={{ color: '#64748b' }}>Track: </span>
                      <span>{audioDebug.trackKind} (enabled={String(audioDebug.trackEnabled)})</span>
                    </div>
                  </>
                )}

                {/* Audio Element State */}
                <div style={{ marginBottom: '4px' }}>
                  <span style={{ color: '#64748b' }}>Audio El Muted: </span>
                  <span style={{ color: audioDebug.audioElMuted ? '#ef4444' : '#22c55e' }}>
                    {audioDebug.audioElMuted ? 'YES (BAD)' : 'No'}
                  </span>
                </div>
                <div style={{ marginBottom: '4px' }}>
                  <span style={{ color: '#64748b' }}>Audio El Paused: </span>
                  <span style={{ color: audioDebug.audioElPaused ? '#ef4444' : '#22c55e' }}>
                    {audioDebug.audioElPaused ? 'YES (BAD)' : 'No'}
                  </span>
                </div>
                <div style={{ marginBottom: '4px' }}>
                  <span style={{ color: '#64748b' }}>Volume: </span>
                  <span>{audioDebug.audioElVolume.toFixed(1)}</span>
                </div>
                <div style={{ marginBottom: '4px' }}>
                  <span style={{ color: '#64748b' }}>ReadyState: </span>
                  <span>{audioDebug.audioElReadyState}</span>
                </div>
                <div style={{ marginBottom: '4px' }}>
                  <span style={{ color: '#64748b' }}>AudioCtx: </span>
                  <span style={{ color: audioDebug.audioCtxState === 'running' ? '#22c55e' : '#fbbf24' }}>
                    {audioDebug.audioCtxState}
                  </span>
                </div>
                <div style={{ marginBottom: '4px' }}>
                  <span style={{ color: '#64748b' }}>Play Result: </span>
                  <span style={{
                    color: audioDebug.playResult === 'success' ? '#22c55e' :
                           audioDebug.playResult === 'pending' ? '#94a3b8' : '#ef4444'
                  }}>
                    {audioDebug.playResult}
                  </span>
                </div>
                {audioDebug.lastOnTrackTs > 0 && (
                  <div>
                    <span style={{ color: '#64748b' }}>Last ontrack: </span>
                    <span>{new Date(audioDebug.lastOnTrackTs).toLocaleTimeString()}</span>
                  </div>
                )}
              </div>

              {/* Barge-in toggles */}
              <div style={{ marginTop: '8px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '8px' }}>
                <strong style={{ color: '#f8fafc' }}>Barge-in Settings:</strong>

                {/* Safe Mode toggle - most prominent */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  marginTop: '8px',
                  padding: '6px 8px',
                  background: safeMode ? 'rgba(234, 179, 8, 0.15)' : 'transparent',
                  borderRadius: '4px',
                  border: safeMode ? '1px solid rgba(234, 179, 8, 0.3)' : '1px solid transparent',
                }}>
                  <input
                    type="checkbox"
                    id="safeMode"
                    checked={safeMode}
                    onChange={(e) => setSafeMode(e.target.checked)}
                    style={{ marginRight: '6px' }}
                  />
                  <label htmlFor="safeMode" style={{ color: safeMode ? '#eab308' : '#94a3b8' }}>
                    Safe Mode (No Interrupt)
                  </label>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', marginTop: '4px' }}>
                  <input
                    type="checkbox"
                    id="allowBargeIn"
                    checked={allowBargeIn}
                    onChange={(e) => setAllowBargeIn(e.target.checked)}
                    style={{ marginRight: '6px' }}
                    disabled={safeMode}
                  />
                  <label htmlFor="allowBargeIn" style={{ opacity: safeMode ? 0.5 : 1 }}>Allow barge-in</label>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', marginTop: '4px' }}>
                  <input
                    type="checkbox"
                    id="strictBargeIn"
                    checked={strictBargeIn}
                    onChange={(e) => setStrictBargeIn(e.target.checked)}
                    style={{ marginRight: '6px' }}
                    disabled={!allowBargeIn || safeMode}
                  />
                  <label htmlFor="strictBargeIn" style={{ opacity: (allowBargeIn && !safeMode) ? 1 : 0.5 }}>
                    Strict barge-in ({BARGE_IN_THRESHOLD_MS}ms)
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Dedicated audio element for AI speech playback */}
      <audio
        ref={remoteAudioRef}
        autoPlay
        playsInline
        muted={false}
      />
    </div>
  );
}
