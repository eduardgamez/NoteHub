import { readProgressStream } from './progressStream';
import type { ProfileUpdate, ProposalKind } from '../types';
import { cloudSync } from '../sync/cloudSync';
import { getProviderKey } from './keyVault';

export type ProviderId = 'openai' | 'anthropic' | 'gemini' | 'codex';
export interface AIContextItem { id: string; type: string; content: string }
export interface AIMessage { role: 'user' | 'assistant'; content: string }
export interface ProviderProposal {
  kind: ProposalKind;
  title: string;
  description: string;
  before?: string;
  after: string;
  payload: Record<string, unknown>;
}
export interface AIResponse { text: string; proposals?: ProviderProposal[]; profileUpdates?: ProfileUpdate[]; readFiles?: string[]; readBlocks?: string[]; readInk?: string[]; readWorkspace?: Array<'calendar' | 'tasks' | 'gym' | 'context' | 'profile'>; searchWeb?: boolean; model?: string; sources?: Array<{ title: string; url: string }> }
export interface GeminiModelOption { id: string; label: string; profile: 'fast' | 'reasoning' }
export interface CodexModelOption { id: string; label: string; default: boolean; defaultReasoningEffort: string; supportedReasoningEfforts: Array<{ reasoningEffort: string; description: string }> }
export interface ProviderStatus { openai: boolean; anthropic: boolean; gemini: boolean; codex: boolean; codexInstalled?: boolean; models?: Record<ProviderId, string> }
export interface CodexLoginState { status: 'idle' | 'pending' | 'complete' | 'failed'; verificationUrl?: string; userCode?: string; message?: string }

export interface AIProvider {
  id: string;
  name: string;
  complete(messages: AIMessage[], context: AIContextItem[], options?: { global?: boolean; web?: boolean; purpose?: 'transcribe'; model?: string; thinking?: 'standard' | 'extended'; effort?: string; onProgress?: (text: string) => void }): Promise<AIResponse>;
}

export class AIConfigurationError extends Error {}
export class AIUnavailableError extends Error {}
export class AIQuotaError extends Error {}

export class ServerAIProvider implements AIProvider {
  id = 'notehub-server';
  name = 'NoteHub secure server';

  async complete(messages: AIMessage[], context: AIContextItem[], options?: { global?: boolean; web?: boolean; purpose?: 'transcribe'; model?: string; thinking?: 'standard' | 'extended'; effort?: string; onProgress?: (text: string) => void }): Promise<AIResponse> {
    const accessToken = await cloudSync.accessToken();
    const provider = getActiveProvider();
    const providerKey = provider === 'codex' ? undefined : await getProviderKey(provider);
    const response = await fetch('/api/ai/complete', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
      body: JSON.stringify({ provider, providerKey, messages, context, global: options?.global, permissions: { web: options?.web }, purpose: options?.purpose, model: options?.model, thinking: options?.thinking, effort: options?.effort, stream: provider === 'codex' && Boolean(options?.onProgress) }),
    });
    if (response.ok && response.headers.get('content-type')?.includes('text/event-stream')) return readProgressStream(response, options?.onProgress);
    const result = await response.json().catch(() => ({ error: 'The AI server returned an invalid response.' }));
    if (!response.ok) {
      const message = typeof result.error === 'string' ? result.error : 'AI request failed.';
      if (provider === 'gemini' && (response.status === 429 || /"code"\s*:\s*429|current quota|RESOURCE_EXHAUSTED/i.test(message))) throw new AIQuotaError(message);
      if (response.status === 503 && result.code === 'MODEL_BUSY') throw new AIUnavailableError(message);
      if (response.status === 503) throw new AIConfigurationError(message);
      throw new Error(message);
    }
    return result as AIResponse;
  }
}

export async function getGeminiModels(): Promise<GeminiModelOption[]> {
  const providerKey = await getProviderKey('gemini');
  const accessToken = await cloudSync.accessToken();
  const response = await fetch('/api/ai/models', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
    body: JSON.stringify({ provider: 'gemini', providerKey }),
  });
  if (!response.ok) throw new Error('Could not load Gemini models.');
  const result = await response.json();
  return Array.isArray(result.models) ? result.models.filter((item: GeminiModelOption) => typeof item.id === 'string' && (item.profile === 'fast' || item.profile === 'reasoning')) : [];
}

export async function getCodexModels(): Promise<CodexModelOption[]> {
  const accessToken = await cloudSync.accessToken();
  const response = await fetch('/api/ai/codex/models', { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} });
  if (!response.ok) throw new Error('Could not load Codex models.');
  const result = await response.json();
  return Array.isArray(result.models) ? result.models.filter((item: CodexModelOption) => typeof item.id === 'string') : [];
}

export async function getProviderStatus(checkCodex = false): Promise<ProviderStatus | null> {
  try {
    const response = await fetch(checkCodex ? '/api/ai/status?codex=1' : '/api/ai/status');
    if (!response.ok) return null;
    const result = await response.json();
    return { ...result.providers, codexInstalled: result.codexInstalled, models: result.models } as ProviderStatus;
  } catch { return null; }
}

export async function beginCodexLogin(): Promise<CodexLoginState> {
  const accessToken = await cloudSync.accessToken();
  const response = await fetch('/api/ai/codex/login', { method: 'POST', headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Could not start ChatGPT sign-in.');
  return result as CodexLoginState;
}

export async function getCodexLoginStatus(): Promise<CodexLoginState> {
  const accessToken = await cloudSync.accessToken();
  const response = await fetch('/api/ai/codex/login', { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} });
  if (!response.ok) throw new Error('Could not check ChatGPT sign-in.');
  return response.json() as Promise<CodexLoginState>;
}

export function getActiveProvider(): ProviderId {
  const saved = localStorage.getItem('notehub-ai-provider');
  return saved === 'anthropic' || saved === 'gemini' || saved === 'codex' ? saved : 'openai';
}

export function setActiveProvider(provider: ProviderId) { localStorage.setItem('notehub-ai-provider', provider); }
export const aiProvider: AIProvider = new ServerAIProvider();
