import { afterEach, describe, expect, it, vi } from 'vitest';
import { AIConfigurationError, ServerAIProvider } from './provider';

vi.mock('./keyVault', () => ({ getProviderKey: vi.fn().mockResolvedValue('saved-browser-key') }));

describe('ServerAIProvider', () => {
  afterEach(() => vi.restoreAllMocks());

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
});
