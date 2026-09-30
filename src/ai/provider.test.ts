import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AIConfigurationError, ServerAIProvider } from './provider';

vi.mock('./keyVault', () => ({ getProviderKey: vi.fn().mockResolvedValue('saved-browser-key') }));

describe('ServerAIProvider', () => {
  beforeEach(() => { vi.stubEnv('VITE_API_ORIGIN', ''); localStorage.setItem('notehub-ai-provider', 'openai'); });
  afterEach(() => { localStorage.removeItem('notehub-ai-provider'); vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it('sends context through the secure application endpoint', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ text: 'Answer', proposals: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    const response = await new ServerAIProvider().complete([{ role: 'user', content: 'Explain this' }], [{ id: 'a', type: 'text', content: 'Shadow price' }]);
    expect(response.text).toBe('Answer');
    expect(fetch).toHaveBeenCalledWith('/api/ai/complete', expect.objectContaining({ method: 'POST' }));
    const request = vi.mocked(fetch).mock.calls[0][1];
    expect(JSON.parse(String(request?.body))).toMatchObject({ provider: 'openai', providerKey: 'saved-browser-key' });
  });

  it('reports missing server credentials clearly', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'openai is not configured' }), { status: 503, headers: { 'Content-Type': 'application/json' } })));
    await expect(new ServerAIProvider().complete([{ role: 'user', content: 'Hi' }], [])).rejects.toBeInstanceOf(AIConfigurationError);
  });

  it('uses ChatGPT without sending an API key when no provider was selected', async () => {
    localStorage.removeItem('notehub-ai-provider');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ text: 'Connected' }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    await new ServerAIProvider().complete([{ role: 'user', content: 'Hi' }], []);
    const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));
    expect(body.provider).toBe('codex');
    expect(body).not.toHaveProperty('providerKey');
  });
});
