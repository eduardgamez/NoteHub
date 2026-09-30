import { createServer } from 'node:http';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { saveCredentials, type ChatGPTCredentials } from '../server/chatgptPlan';

// Local OAuth only. Never copy the desktop Codex login or print OAuth tokens.
const directory = join(homedir(), '.config', 'notehub');
const destination = join(directory, 'chatgpt.json');
await mkdir(directory, { recursive: true, mode: 0o700 });
let hostId: string;
try { hostId = (await readFile(join(directory, 'host-id'), 'utf8')).trim(); }
catch {
  hostId = `urn:uuid:${randomUUID()}`;
  await writeFile(join(directory, 'host-id'), hostId, { mode: 0o600, flag: 'wx' });
}
let saved: ChatGPTCredentials | undefined;
try { saved = JSON.parse(await readFile(destination, 'utf8')); } catch { /* First authorization. */ }
const state = randomBytes(32).toString('base64url');
const nonce = randomBytes(32).toString('base64url');
const verifier = randomBytes(48).toString('base64url');
const clientId = saved?.client_id || 'dynamic_agent_client';
let redirectUri = '';
let processing = false;
const server = createServer(async (request, response) => {
  const callback = new URL(request.url || '/', redirectUri);
  if (callback.pathname !== '/auth/callback') { response.writeHead(404).end(); return; }
  if (callback.searchParams.get('state') !== state) { response.writeHead(400).end('Invalid authorization state.'); return; }
  if (processing) { response.writeHead(409).end('Authorization already processing.'); return; }
  processing = true;
  try {
    if (callback.searchParams.has('error')) throw new Error('ChatGPT authorization was declined.');
    const issuedId = callback.searchParams.get('client_id') || (saved ? clientId : '');
    if (!issuedId.startsWith('oaiapp_') || (saved && issuedId !== clientId)) throw new Error('Unexpected ChatGPT registration.');
    const code = callback.searchParams.get('code');
    if (!code) throw new Error('Authorization code missing.');
    const exchange = await fetch('https://auth.openai.com/api/accounts/oauth/token', {
      method: 'POST', signal: AbortSignal.timeout(30_000), headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', client_id: issuedId,
        code, code_verifier: verifier, redirect_uri: redirectUri, resource: 'https://api.openai.com/v1' }),
    });
    if (!exchange.ok) throw new Error('ChatGPT authorization exchange failed. Start again.');
    const tokens = await exchange.json();
    const { payload } = await jwtVerify(tokens.id_token, createRemoteJWKSet(new URL('https://auth.openai.com/.well-known/jwks.json')), {
      issuer: 'https://auth.openai.com', audience: issuedId, requiredClaims: ['exp', 'sub', 'nonce'],
    });
    if (payload.nonce !== nonce || !payload.sub || (saved && payload.sub !== saved.subject)) throw new Error('ChatGPT account validation failed.');
    const scopes = typeof tokens.scope === 'string' ? tokens.scope.split(' ') : [];
    if (!scopes.includes('chatgpt.tokens.use.direct') || !tokens.access_token || !tokens.refresh_token || !Number.isFinite(tokens.expires_in)) {
      throw new Error('ChatGPT plan permission was not granted.');
    }
    await saveCredentials(destination, { email: typeof payload.email === 'string' ? payload.email : '',
      issuer: 'https://auth.openai.com', subject: payload.sub, client_id: issuedId, ext_agent_host_id: hostId,
      access_token: tokens.access_token, refresh_token: tokens.refresh_token, id_token: tokens.id_token,
      token_type: 'Bearer', expires_in: tokens.expires_in, scopes, saved_at: new Date().toISOString() });
    response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }).end('NoteHub conectado a ChatGPT. Puedes cerrar esta pestaña.');
    console.log('ChatGPT autorizado. Credenciales guardadas de forma privada en ~/.config/notehub/chatgpt.json.');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Authorization failed.';
    response.writeHead(400, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' }).end(message);
    console.error(message);
    process.exitCode = 1;
  } finally { clearTimeout(timeout); server.close(); }
});
await new Promise<void>((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Local callback listener unavailable.');
redirectUri = `http://127.0.0.1:${address.port}/auth/callback`;
const authorization = new URL('https://auth.openai.com/api/accounts/authorize');
authorization.search = new URLSearchParams({ client_id: clientId, ext_agent_host_id: hostId,
  ...(saved ? { id_token_hint: saved.id_token, login_hint: saved.email } : { agent_name_hint: 'NoteHub' }),
  response_type: 'code', redirect_uri: redirectUri,
  scope: 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct',
  resource: 'https://api.openai.com/v1', state, nonce, code_challenge_method: 'S256',
  code_challenge: createHash('sha256').update(verifier).digest('base64url'),
}).toString();
// Store the browser handoff privately because returning URLs contain an ID-token hint.
await writeFile(join(directory, 'authorization-url'), authorization.toString(), { mode: 0o600 });
console.log('Autorización preparada. Abre de forma local la URL guardada en ~/.config/notehub/authorization-url.');
const timeout = setTimeout(() => { console.error('Authorization timed out.'); process.exitCode = 1; server.close(); }, 10 * 60_000);
