import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
const directory = await mkdtemp(join(tmpdir(), 'notehub-progress-test-'));
const binary = join(directory, 'codex');
await writeFile(binary, `#!${process.execPath}
const readline = require('node:readline');
if (process.argv[2] !== 'app-server') { console.log('Logged in using ChatGPT'); process.exit(0); }
const send = (value) => process.stdout.write(JSON.stringify(value) + '\\n');
readline.createInterface({ input: process.stdin }).on('line', (line) => {
 const request = JSON.parse(line);
 if (!request.id) return;
 let result = {};
 if (request.method === 'model/list') result = { data: [{ model: 'gpt-6-sol', displayName: 'Codex test', isDefault: true, defaultReasoningEffort: 'high', supportedReasoningEfforts: [{ reasoningEffort: 'low' }, { reasoningEffort: 'high' }] }] };
 if (request.method === 'thread/start') result = { thread: { id: 'test-thread' } };
 send({ id: request.id, result });
 if (request.method === 'turn/start') {
  require('node:assert/strict').equal(request.params.model, 'gpt-6-sol');
  require('node:assert/strict').equal(request.params.effort, 'low');
  const quiet = request.params.input[0].text.includes('quiet-test');
  const activity = quiet ? undefined : setInterval(() => send({ method: 'item/reasoning/textDelta', params: { delta: 'test activity' } }), 400);
  if (!quiet) setTimeout(() => send({ method: 'item/completed', params: { item: { type: 'agentMessage', phase: 'commentary', text: 'Estoy comprobando la información disponible.' } } }), 100);
  if (!quiet) setTimeout(() => send({ method: 'item/completed', params: { item: { type: 'agentMessage', phase: 'commentary', text: 'Ahora estoy contrastando los datos.' } } }), 700);
  setTimeout(() => {
   clearInterval(activity);
   send({ method: 'item/completed', params: { item: { type: 'agentMessage', phase: 'final_answer', text: JSON.stringify({ text: 'Respuesta terminada en segundo plano.', proposals: [] }) } } });
   send({ method: 'turn/completed', params: { turn: { status: 'completed' } } });
  }, 4000);
 }
});
`, { mode: 0o755 });
const broker = spawn(resolve('node_modules/.bin/tsx'), ['server/index.ts'], { env: { ...process.env, NOTEHUB_API_PORT: '8789', NOTEHUB_CODEX_IDLE_TIMEOUT_MS: '1500', NOTEHUB_REQUIRE_AUTH: 'false', NOTEHUB_WEB_ORIGIN: 'http://127.0.0.1:5189', NOTEHUB_CODEX_BIN: binary }, stdio: ['ignore', 'ignore', 'pipe'] });
broker.stderr.on('data', (data) => process.stderr.write(data));
const web = spawn('npm', ['run', 'dev:web', '--', '--host', '127.0.0.1', '--port', '5189', '--strictPort'], { env: { ...process.env, VITE_API_ORIGIN: 'http://127.0.0.1:8789' }, stdio: 'ignore' });
let browser;
try {
 for (let attempt = 0; ; attempt++) {
  try { if ((await fetch('http://127.0.0.1:8789/api/health')).ok) break; } catch {}
  if (attempt > 50) throw new Error('Test broker did not start');
  await new Promise((resolve) => setTimeout(resolve, 200));
 }
 browser = await chromium.launch();
 const page = await browser.newPage();
 await page.addInitScript(() => {
  localStorage.setItem('notehub-ai-provider', 'codex');
  const nativeFetch = window.fetch;
  window.fetch = (input, options) => nativeFetch(typeof input === 'string' && input.startsWith('/api/') ? `http://127.0.0.1:8789${input}` : input, options);
 });
 for (let attempt = 0; ; attempt++) {
  try { await page.goto('http://127.0.0.1:5189'); break; } catch (error) { if (attempt >= 25) throw error; await new Promise((resolve) => setTimeout(resolve, 200)); }
 }
 await page.locator('.project-tile').first().waitFor();
 await page.getByText('Using Codex test · Low', { exact: true }).waitFor();
 const completionRequest = page.waitForRequest((request) => request.url().endsWith('/api/ai/complete') && request.method() === 'POST');
 await page.locator('.home-ai textarea').fill('Revisa mis datos');
 await page.getByRole('button', { name: 'Send', exact: true }).click();
 const payload = (await completionRequest).postDataJSON();
 assert.equal(payload.model, 'gpt-6-sol');
 assert.equal(payload.effort, 'low');
 await page.getByText('Estoy comprobando la información disponible.', { exact: true }).waitFor({ timeout: 10000 }).catch(async (error) => { console.log('Chat error:', await page.locator('.ai-error').textContent().catch(() => 'none')); throw error; });
 await page.getByText('Ahora estoy contrastando los datos.', { exact: true }).waitFor();
 assert.equal(await page.locator('.chat-progress p').count(), 1);
 assert.equal(await page.getByText('Estoy comprobando la información disponible.', { exact: true }).count(), 0);
 await page.getByRole('button', { name: 'Settings', exact: true }).click();
 await page.getByRole('button', { name: 'NoteHub home', exact: true }).click();
 await page.getByText('Ahora estoy contrastando los datos.', { exact: true }).waitFor();
 assert.equal(await page.getByRole('button', { name: 'Send', exact: true }).isDisabled(), true);
 await page.getByRole('button', { name: 'Settings', exact: true }).click();
 // Let the response finish while the chat panel is unmounted.
 await page.waitForTimeout(4500);
 await page.getByRole('button', { name: 'NoteHub home', exact: true }).click();
 await page.getByText('Respuesta terminada en segundo plano.', { exact: true }).waitFor();
 assert.equal(await page.getByRole('button', { name: 'Send', exact: true }).isEnabled(), true);
 assert.equal(await page.locator('.chat-progress').count(), 0);
 assert.equal(await page.locator('.message.assistant').count(), 1);
 await page.locator('.home-ai textarea').fill('quiet-test');
 await page.getByRole('button', { name: 'Send', exact: true }).click();
 await page.getByRole('button', { name: 'Settings', exact: true }).click();
 await page.waitForTimeout(2200);
 await page.getByRole('button', { name: 'NoteHub home', exact: true }).click();
 await page.getByText('Codex no ha enviado actividad durante demasiado tiempo. Vuelve a intentarlo.', { exact: true }).waitFor();
 assert.equal(await page.getByRole('button', { name: 'Send', exact: true }).isEnabled(), true);
 console.log('Background chat passed with real broker and simulated Codex: live commentary, remount, duplicate prevention and completion while hidden.');
} finally { await browser?.close(); broker.kill('SIGTERM'); web.kill('SIGTERM'); await rm(directory, { recursive: true, force: true }); }
