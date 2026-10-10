import { readFile, writeFile, mkdir, rename, chmod } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

export type ChatGPTCredentials = {
  email: string; issuer: string; subject: string; client_id: string;
  ext_agent_host_id: string; id_token: string; access_token: string;
  refresh_token: string; token_type: string; expires_in: number;
  scopes: string[]; saved_at: string;
};

export async function saveCredentials(path: string, credentials: ChatGPTCredentials) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(credentials), { mode: 0o600 });
  await chmod(temporary, 0o600);
  await rename(temporary, path);
}

export function chatgptPlanConfigured() {
  return Boolean(process.env.NOTEHUB_CHATGPT_CREDENTIALS && existsSync(process.env.NOTEHUB_CHATGPT_CREDENTIALS));
}

let refreshing: Promise<string> | undefined;
const terminalRefreshErrors = new Set(['invalid_grant', 'invalid_refresh_token', 'token_expired', 'refresh_token_expired',
  'refresh_token_invalidated', 'refresh_token_reused', 'invalid_client']);

export async function chatgptPlanAccessToken(): Promise<string> {
  // One server process owns this session; serialize rotating refresh tokens.
  if (refreshing) return refreshing;
  refreshing = readOrRefresh();
  try { return await refreshing; } finally { refreshing = undefined; }
}

async function readOrRefresh() {
  const path = process.env.NOTEHUB_CHATGPT_CREDENTIALS;
  if (!path) throw new Error('ChatGPT plan credentials are not configured.');
  const credentials: ChatGPTCredentials = JSON.parse(await readFile(path, 'utf8'));
  if (!credentials.client_id?.startsWith('oaiapp_') || !credentials.scopes?.includes('chatgpt.tokens.use.direct')) {
    throw new Error('Authorize NoteHub to use your ChatGPT plan first.');
  }
  if (Date.parse(credentials.saved_at) + credentials.expires_in * 1000 > Date.now() + 120_000) return credentials.access_token;
  const response = await fetch('https://auth.openai.com/api/accounts/oauth/token', {
    method: 'POST', signal: AbortSignal.timeout(30_000),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', client_id: credentials.client_id,
      refresh_token: credentials.refresh_token, resource: 'https://api.openai.com/v1' }),
  });
  if (!response.ok) {
    // Log only the OAuth error code, never tokens, so a failed renewal can be diagnosed.
    const failure = await response.json().catch(() => ({}));
    const code = typeof failure.error === 'string' ? failure.error : typeof failure.error?.code === 'string' ? failure.error.code : '';
    console.error('[chatgpt:refresh]', response.status, code);
    if (terminalRefreshErrors.has(code)) throw new Error('ChatGPT disconnected NoteHub. Reauthorize NoteHub to keep using your ChatGPT plan.');
    throw new Error('ChatGPT connection could not be renewed. Reauthorize NoteHub if the problem persists.');
  }
  const tokens = await response.json();
  const scopes = typeof tokens.scope === 'string' ? tokens.scope.split(' ') : credentials.scopes;
  if (!tokens.access_token || !Number.isFinite(tokens.expires_in) || !scopes.includes('chatgpt.tokens.use.direct')) {
    throw new Error('ChatGPT did not grant plan access.');
  }
  await saveCredentials(path, { ...credentials, access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || credentials.refresh_token,
    id_token: tokens.id_token || credentials.id_token, expires_in: tokens.expires_in,
    scopes, saved_at: new Date().toISOString() });
  return tokens.access_token as string;
}

export function chatgptPlanArguments() {
  return ['app-server', '--listen', 'stdio://',
    '-c', 'model_provider="openai_chatgpt_plan"',
    '-c', 'model_providers.openai_chatgpt_plan.name="ChatGPT plan"',
    '-c', 'model_providers.openai_chatgpt_plan.base_url="https://api.openai.com/v1"',
    '-c', 'model_providers.openai_chatgpt_plan.env_key="ACCESS_TOKEN"',
    '-c', 'model_providers.openai_chatgpt_plan.wire_api="responses"',
    '-c', 'model_providers.openai_chatgpt_plan.requires_openai_auth=false',
    '-c', 'model_providers.openai_chatgpt_plan.supports_websockets=false'];
}
