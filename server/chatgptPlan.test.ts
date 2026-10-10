import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saveCredentials, chatgptPlanAccessToken, type ChatGPTCredentials } from './chatgptPlan';

let directory = '';
afterEach(async () => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); if (directory) await rm(directory, { recursive: true, force: true }); });
async function fixture(expired: boolean) {
  directory = await mkdtemp(join(tmpdir(), 'notehub-plan-test-'));
  const path = join(directory, 'credentials.json');
  vi.stubEnv('NOTEHUB_CHATGPT_CREDENTIALS', path);
  const credentials: ChatGPTCredentials = { email: 'owner@example.com', issuer: 'https://auth.openai.com', subject: 'owner',
    client_id: 'oaiapp_test', ext_agent_host_id: 'urn:uuid:test', access_token: 'old-access', refresh_token: 'old-refresh',
    id_token: 'identity', token_type: 'Bearer', expires_in: 3600, scopes: ['chatgpt.tokens.use.direct'],
    saved_at: new Date(Date.now() - (expired ? 7200_000 : 0)).toISOString() };
  await saveCredentials(path, credentials);
  return path;
}
describe('ChatGPT plan credentials', () => {
  it('keeps credentials private and reuses unexpired access', async () => {
    const path = await fixture(false);
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect(await chatgptPlanAccessToken()).toBe('old-access');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('serializes refreshes and atomically persists the rotated session', async () => {
    const path = await fixture(true);
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 3600 }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await Promise.all([chatgptPlanAccessToken(), chatgptPlanAccessToken()])).toEqual(['new-access', 'new-access']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].body.get('client_id')).toBe('oaiapp_test');
    expect(JSON.parse(await readFile(path, 'utf8')).refresh_token).toBe('new-refresh');
  });
  it('preserves the renewable session when renewal fails', async () => {
    const path = await fixture(true);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 401 })));
    await expect(chatgptPlanAccessToken()).rejects.toThrow('could not be renewed');
    expect(JSON.parse(await readFile(path, 'utf8')).refresh_token).toBe('old-refresh');
  });
  it('asks for reauthorization when ChatGPT revokes the session', async () => {
    await fixture(true);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'refresh_token_reused' }), { status: 400 })));
    await expect(chatgptPlanAccessToken()).rejects.toThrow('Reauthorize NoteHub to keep using');
    expect(console.error).toHaveBeenCalledWith('[chatgpt:refresh]', 400, 'refresh_token_reused');
  });
});
