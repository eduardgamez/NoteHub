import type { ProposalKind } from '../types';
import { cloudSync } from '../sync/cloudSync';
import { getProviderKey } from './keyVault';

export type ProviderId = 'openai' | 'anthropic' | 'gemini';
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
export interface AIResponse { text: string; proposals?: ProviderProposal[] }
export interface ProviderStatus { openai: boolean; anthropic: boolean; gemini: boolean; models?: Record<ProviderId, string> }

export interface AIProvider {
  id: string;
  name: string;
  complete(messages: AIMessage[], context: AIContextItem[], options?: { global?: boolean; web?: boolean }): Promise<AIResponse>;
}

export class AIConfigurationError extends Error {}

export class ServerAIProvider implements AIProvider {
  id = 'notehub-server';
  name = 'NoteHub secure server';

  async complete(messages: AIMessage[], context: AIContextItem[], options?: { global?: boolean; web?: boolean }): Promise<AIResponse> {
    const accessToken = await cloudSync.accessToken();
    const provider = getActiveProvider();
    const providerKey = await getProviderKey(provider);
    const response = await fetch('/api/ai/complete', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
      body: JSON.stringify({ provider, providerKey, messages, context, global: options?.global, permissions: { web: options?.web } }),
    });
    const result = await response.json().catch(() => ({ error: 'The AI server returned an invalid response.' }));
    if (!response.ok) {
      const message = typeof result.error === 'string' ? result.error : 'AI request failed.';
      if (response.status === 503) throw new AIConfigurationError(message);
      throw new Error(message);
    }
    return result as AIResponse;
  }
}

export async function getProviderStatus(): Promise<ProviderStatus | null> {
  try {
    const response = await fetch('/api/ai/status');
    if (!response.ok) return null;
    const result = await response.json();
    return { ...result.providers, models: result.models } as ProviderStatus;
  } catch { return null; }
}

export function getActiveProvider(): ProviderId {
  const saved = localStorage.getItem('notehub-ai-provider');
  return saved === 'anthropic' || saved === 'gemini' ? saved : 'openai';
}

export function setActiveProvider(provider: ProviderId) { localStorage.setItem('notehub-ai-provider', provider); }
export const aiProvider: AIProvider = new ServerAIProvider();
