// =============================================================================
// AZURE AI SERVICES — Enterprise Government Abstraction Layer
// =============================================================================
// This module provides interface-level support for Azure OpenAI and Azure AI
// Speech services. When migrating from consumer OpenAI, swap the implementation
// behind these interfaces — no call-site changes required.
//
// Environment Variables (set when Azure keys are provisioned):
//   AZURE_OPENAI_ENDPOINT    — e.g., https://<resource>.openai.azure.com
//   AZURE_OPENAI_API_KEY     — API key for Azure OpenAI resource
//   AZURE_OPENAI_DEPLOYMENT  — Deployment name (e.g., gpt-4o-gov)
//   AZURE_OPENAI_API_VERSION — API version (e.g., 2024-06-01)
//   AZURE_SPEECH_KEY         — Azure AI Speech service key
//   AZURE_SPEECH_REGION      — Azure region (e.g., eastus2)
// =============================================================================

// ── Types ────────────────────────────────────────────────────────────────────

export interface AzureOpenAIConfig {
  endpoint: string;
  apiKey: string;
  deploymentName: string;
  apiVersion: string;
}

export interface AzureSpeechConfig {
  subscriptionKey: string;
  region: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionRequest {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  topP?: number;
}

export interface ChatCompletionResponse {
  id: string;
  content: string;
  finishReason: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface SpeechToTextRequest {
  audioData: Buffer | ArrayBuffer;
  language?: string;
  format?: 'simple' | 'detailed';
}

export interface SpeechToTextResponse {
  text: string;
  confidence: number;
  duration: number;
  language: string;
}

export interface TextToSpeechRequest {
  text: string;
  voice?: string;
  outputFormat?: string;
}

export interface TextToSpeechResponse {
  audioData: ArrayBuffer;
  contentType: string;
}

// ── Provider Detection ───────────────────────────────────────────────────────

export type AIProvider = 'azure' | 'openai';

/**
 * Determines which AI provider is configured.
 * Azure takes priority if its endpoint is set.
 */
export function getActiveProvider(): AIProvider {
  if (process.env.AZURE_OPENAI_ENDPOINT && process.env.AZURE_OPENAI_API_KEY) {
    return 'azure';
  }
  return 'openai';
}

// ── Azure OpenAI Client ──────────────────────────────────────────────────────

export function getAzureOpenAIConfig(): AzureOpenAIConfig | null {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const deploymentName = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o-gov';
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-06-01';

  if (!endpoint || !apiKey) return null;

  return { endpoint, apiKey, deploymentName, apiVersion };
}

/**
 * Call Azure OpenAI Chat Completions endpoint.
 * Falls back to consumer OpenAI if Azure is not configured.
 */
export async function chatCompletion(
  request: ChatCompletionRequest
): Promise<ChatCompletionResponse> {
  const azureConfig = getAzureOpenAIConfig();

  if (azureConfig) {
    return azureChatCompletion(azureConfig, request);
  }

  // Fallback to consumer OpenAI
  return openAIChatCompletion(request);
}

async function azureChatCompletion(
  config: AzureOpenAIConfig,
  request: ChatCompletionRequest
): Promise<ChatCompletionResponse> {
  const url = `${config.endpoint}/openai/deployments/${config.deploymentName}/chat/completions?api-version=${config.apiVersion}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': config.apiKey,
    },
    body: JSON.stringify({
      messages: request.messages,
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens ?? 2048,
      top_p: request.topP ?? 0.95,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Azure OpenAI error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const choice = data.choices?.[0];

  return {
    id: data.id,
    content: choice?.message?.content || '',
    finishReason: choice?.finish_reason || 'unknown',
    usage: {
      promptTokens: data.usage?.prompt_tokens || 0,
      completionTokens: data.usage?.completion_tokens || 0,
      totalTokens: data.usage?.total_tokens || 0,
    },
  };
}

async function openAIChatCompletion(
  request: ChatCompletionRequest
): Promise<ChatCompletionResponse> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('No AI provider configured (OPENAI_API_KEY or AZURE_OPENAI_* required)');

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: request.messages,
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens ?? 2048,
      top_p: request.topP ?? 0.95,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const choice = data.choices?.[0];

  return {
    id: data.id,
    content: choice?.message?.content || '',
    finishReason: choice?.finish_reason || 'unknown',
    usage: {
      promptTokens: data.usage?.prompt_tokens || 0,
      completionTokens: data.usage?.completion_tokens || 0,
      totalTokens: data.usage?.total_tokens || 0,
    },
  };
}

// ── Azure AI Speech ──────────────────────────────────────────────────────────

export function getAzureSpeechConfig(): AzureSpeechConfig | null {
  const subscriptionKey = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;

  if (!subscriptionKey || !region) return null;

  return { subscriptionKey, region };
}

/**
 * Speech-to-Text via Azure AI Speech service.
 * Returns null if Azure Speech is not configured.
 */
export async function speechToText(
  request: SpeechToTextRequest
): Promise<SpeechToTextResponse | null> {
  const config = getAzureSpeechConfig();
  if (!config) return null;

  const language = request.language || 'en-US';
  const url = `https://${config.region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=${language}`;

  // Convert to Uint8Array for fetch compatibility
  const audioBytes = request.audioData instanceof ArrayBuffer
    ? new Uint8Array(request.audioData)
    : new Uint8Array(request.audioData.buffer, request.audioData.byteOffset, request.audioData.byteLength);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': config.subscriptionKey,
      'Content-Type': 'audio/wav',
      'Accept': 'application/json',
    },
    body: audioBytes as unknown as BodyInit,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Azure Speech STT error (${response.status}): ${errText}`);
  }

  const data = await response.json();

  return {
    text: data.DisplayText || data.Text || '',
    confidence: data.NBest?.[0]?.Confidence || 0,
    duration: data.Duration || 0,
    language,
  };
}

/**
 * Text-to-Speech via Azure AI Speech service.
 * Returns null if Azure Speech is not configured.
 */
export async function textToSpeech(
  request: TextToSpeechRequest
): Promise<TextToSpeechResponse | null> {
  const config = getAzureSpeechConfig();
  if (!config) return null;

  const voice = request.voice || 'en-US-JennyNeural';
  const outputFormat = request.outputFormat || 'audio-24khz-48kbitrate-mono-mp3';
  const url = `https://${config.region}.tts.speech.microsoft.com/cognitiveservices/v1`;

  const ssml = `
    <speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>
      <voice name='${voice}'>${escapeXml(request.text)}</voice>
    </speak>
  `;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': config.subscriptionKey,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': outputFormat,
    },
    body: ssml,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Azure Speech TTS error (${response.status}): ${errText}`);
  }

  const audioData = await response.arrayBuffer();

  return {
    audioData,
    contentType: 'audio/mpeg',
  };
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
