import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { chatgptPlanConfigured, chatgptPlanAccessToken, chatgptPlanArguments } from './chatgptPlan';

function codexBin() {
  if (process.env.NOTEHUB_CODEX_BIN) return process.env.NOTEHUB_CODEX_BIN;
  const onPath = spawnSync('which', ['codex'], { encoding: 'utf8' });
  if (onPath.status === 0) {
    const path = onPath.stdout.trim();
    if (path && spawnSync(path, ['--version'], { timeout: 3000 }).status === 0) return path;
  }
  const extensions = join(homedir(), '.vscode', 'extensions');
  if (existsSync(extensions)) {
    const platform = process.platform === 'darwin' ? `macos-${process.arch === 'arm64' ? 'aarch64' : 'x86_64'}` : process.platform === 'win32' ? `windows-${process.arch === 'arm64' ? 'aarch64' : 'x86_64'}` : `linux-${process.arch === 'arm64' ? 'aarch64' : 'x86_64'}`;
    for (const name of readdirSync(extensions).filter((entry) => entry.startsWith('openai.chatgpt-')).sort().reverse()) {
      const binary = join(extensions, name, 'bin', platform, process.platform === 'win32' ? 'codex.exe' : 'codex');
      if (existsSync(binary)) return binary;
    }
  }
  return 'codex';
}

export function codexAvailable() {
  if (chatgptPlanConfigured()) return codexInstalled();
  const result = spawnSync(codexBin(), ['login', 'status'], { encoding: 'utf8', timeout: 3000 });
  return result.status === 0 && /Logged in using ChatGPT/i.test(`${result.stdout}${result.stderr}`);
}

export function codexInstalled() {
  return spawnSync(codexBin(), ['--version'], { timeout: 3000 }).status === 0;
}

type RpcMessage = { id?: number; method?: string; result?: any; error?: { message?: string }; params?: any };

class CodexConnection {
  private child;
  private nextId = 1;
  private requests = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
  private completed?: (value: string) => void;
  private failed?: (error: Error) => void;
  private finalText = '';
  private terminalError?: Error;
  onNotification?: (message: RpcMessage) => void;
  onFailure?: (error: Error) => void;

  constructor(accessToken?: string) {
    this.child = spawn(codexBin(), accessToken ? chatgptPlanArguments() : ['app-server', '--stdio'], {
      stdio: ['pipe', 'pipe', 'pipe'], env: accessToken ? { ...process.env, ACCESS_TOKEN: accessToken } : process.env,
    });
    createInterface({ input: this.child.stdout }).on('line', (line) => {
      let message: RpcMessage;
      try { message = JSON.parse(line); } catch { return; }
      if (typeof message.id === 'number') {
        const pending = this.requests.get(message.id);
        if (pending) {
          this.requests.delete(message.id);
          if (message.error) pending.reject(new Error(message.error.message || 'Codex rejected the request.'));
          else pending.resolve(message.result);
        } else if (message.method) {
          // NoteHub never authorizes direct file or command changes by Codex.
          this.send({ id: message.id, error: { code: -32000, message: 'Not available in NoteHub.' } });
        }
      }
      if (message.method === 'item/completed' && message.params?.item?.type === 'agentMessage') {
        const item = message.params.item;
        if (item.phase !== 'commentary' && (item.phase === 'final_answer' || !this.finalText)) this.finalText = item.text || '';
      }
      if (message.method === 'turn/completed') {
        const turn = message.params?.turn;
        if (turn?.status === 'completed') this.completed?.(this.finalText);
        else this.failed?.(new Error(turn?.error?.message || `Codex turn ${turn?.status || 'failed'}.`));
      }
      if (message.method) this.onNotification?.(message);
    });
    this.child.stderr.resume();
    this.child.on('error', (error) => this.fail(error));
    this.child.on('exit', (code) => this.fail(new Error(`Codex stopped unexpectedly (${code ?? 'unknown'}).`)));
  }

  private fail(error: Error) {
    this.terminalError ??= error;
    for (const pending of this.requests.values()) pending.reject(error);
    this.requests.clear();
    this.failed?.(error);
    this.onFailure?.(error);
  }

  private send(message: object) { this.child.stdin.write(`${JSON.stringify(message)}\n`); }

  request(method: string, params: object = {}) {
    if (this.terminalError) return Promise.reject(this.terminalError);
    const id = this.nextId++;
    return new Promise<any>((resolve, reject) => {
      this.requests.set(id, { resolve, reject });
      this.send({ id, method, params });
    });
  }

  notify(method: string) { this.send({ method }); }

  waitForTurn() {
    if (this.terminalError) return Promise.reject(this.terminalError);
    return new Promise<string>((resolve, reject) => { this.completed = resolve; this.failed = reject; });
  }

  close(error?: Error) { if (error) this.fail(error); this.child.kill(); }
}

type LoginState = { status: 'idle' | 'pending' | 'complete' | 'failed'; verificationUrl?: string; userCode?: string; message?: string };
let loginState: LoginState = { status: 'idle' };
let loginConnection: CodexConnection | undefined;
let loginTimeout: ReturnType<typeof setTimeout> | undefined;

export function codexLoginStatus(): LoginState { return loginState; }

export async function beginCodexLogin(): Promise<LoginState> {
  if (loginState.status === 'pending') return loginState;
  loginConnection?.close();
  if (loginTimeout) clearTimeout(loginTimeout);
  const connection = await connect();
  loginConnection = connection;
  loginState = { status: 'pending' };
  connection.onFailure = (error) => {
    if (loginState.status === 'pending') loginState = { status: 'failed', message: error.message };
  };
  connection.onNotification = (message) => {
    if (message.method !== 'account/login/completed') return;
    loginState = message.params?.success ? { status: 'complete' } : { status: 'failed', message: message.params?.error || 'ChatGPT sign-in failed.' };
    if (loginTimeout) clearTimeout(loginTimeout);
    connection.close();
    loginConnection = undefined;
  };
  try {
    const result = await connection.request('account/login/start', { type: 'chatgptDeviceCode' });
    if (!result?.verificationUrl || !result?.userCode) throw new Error('Codex did not return a sign-in code.');
    loginState = { status: 'pending', verificationUrl: result.verificationUrl, userCode: result.userCode };
    loginTimeout = setTimeout(() => {
      if (loginState.status === 'pending') loginState = { status: 'failed', message: 'Sign-in timed out. Try again.' };
      connection.close();
      loginConnection = undefined;
    }, 10 * 60_000);
    return loginState;
  } catch (error) {
    connection.close();
    loginConnection = undefined;
    loginState = { status: 'failed', message: error instanceof Error ? error.message : 'Could not start ChatGPT sign-in.' };
    return loginState;
  }
}

async function connect() {
  const connection = new CodexConnection(chatgptPlanConfigured() ? await chatgptPlanAccessToken() : undefined);
  await connection.request('initialize', { clientInfo: { name: 'notehub', title: 'NoteHub', version: '0.1.0' } });
  connection.notify('initialized');
  return connection;
}

export async function listCodexModels() {
  const connection = await connect();
  try {
    const result = await connection.request('model/list', { limit: 30, includeHidden: false });
    return (result?.data ?? []).filter((item: any) => typeof item.model === 'string').map((item: any) => ({
      id: item.model as string, label: (item.displayName || item.model) as string, default: Boolean(item.isDefault),
      defaultReasoningEffort: typeof item.defaultReasoningEffort === 'string' ? item.defaultReasoningEffort : '',
      supportedReasoningEfforts: Array.isArray(item.supportedReasoningEfforts) ? item.supportedReasoningEfforts.filter((effort: any) => typeof effort?.reasoningEffort === 'string').map((effort: any) => ({ reasoningEffort: effort.reasoningEffort as string, description: typeof effort.description === 'string' ? effort.description as string : '' })) : [],
    }));
  } finally { connection.close(); }
}

export async function completeWithCodex(input: {
  prompt: string;
  images: string[];
  onProgress?: (text: string) => void;
  model?: string;
  effort?: string;
}) {
  const directory = await mkdtemp(join(tmpdir(), 'notehub-codex-'));
  let connection: CodexConnection | undefined;
  const configuredTimeout = Number(process.env.NOTEHUB_CODEX_IDLE_TIMEOUT_MS);
  const idleTimeout = Number.isFinite(configuredTimeout) && configuredTimeout > 0 ? configuredTimeout : 300_000;
  let timer: ReturnType<typeof setTimeout>;
  const resetIdleTimer = () => {
    clearTimeout(timer);
    timer = setTimeout(() => connection?.close(new Error('Codex no ha enviado actividad durante demasiado tiempo. Vuelve a intentarlo.')), idleTimeout);
  };
  resetIdleTimer();
  try {
    const imageItems: Array<{ type: 'localImage'; path: string }> = [];
    for (const [index, image] of input.images.entries()) {
      const match = image.match(/^data:image\/(png|jpeg|webp);base64,(.+)$/);
      if (!match) continue;
      const path = join(directory, `image-${index}.${match[1] === 'jpeg' ? 'jpg' : match[1]}`);
      await writeFile(path, Buffer.from(match[2], 'base64'));
      imageItems.push({ type: 'localImage', path });
    }
    connection = await connect();
    const commentary = new Map<string, string>();
    connection.onNotification = (message) => {
      resetIdleTimer(); // Reasoning, text and tool activity keep long requests alive.
      const item = message.params?.item;
      if (message.method === 'item/started' && item?.type === 'agentMessage' && item.phase === 'commentary') commentary.set(item.id, '');
      if (message.method === 'item/agentMessage/delta' && commentary.has(message.params?.itemId) && typeof message.params.delta === 'string') {
        const text = (commentary.get(message.params.itemId)! + message.params.delta).slice(-2000);
        commentary.set(message.params.itemId, text);
        input.onProgress?.(text);
      }
      if (message.method === 'item/completed' && item?.type === 'agentMessage' && item.phase === 'commentary' && typeof item.text === 'string') { input.onProgress?.(item.text); commentary.delete(item.id); }
    };
    const models = await connection.request('model/list', { limit: 30, includeHidden: false });
    const choices = (models?.data ?? []).filter((item: any) => typeof item.model === 'string');
    const selected = choices.find((item: any) => item.model === input.model) ?? choices.find((item: any) => item.model === 'gpt-6-sol') ?? choices.find((item: any) => item.isDefault) ?? choices[0];
    if (!selected) throw new Error('No Codex model is available for this ChatGPT account.');
    const supportedEfforts = Array.isArray(selected.supportedReasoningEfforts) ? selected.supportedReasoningEfforts.map((item: any) => item.reasoningEffort) : [];
    const effort = supportedEfforts.includes(input.effort) ? input.effort : selected.model === 'gpt-6-sol' && supportedEfforts.includes('low') ? 'low' : selected.defaultReasoningEffort || supportedEfforts[0];
    const started = await connection.request('thread/start', {
      model: selected.model, cwd: directory, approvalPolicy: 'never', sandbox: 'read-only',
      serviceName: 'notehub', ephemeral: true,
    });
    const threadId = started?.thread?.id;
    if (!threadId) throw new Error('Codex could not start a chat.');
    const finished = connection.waitForTurn();
    void finished.catch(() => {});
    await connection.request('turn/start', {
      threadId, input: [{ type: 'text', text: input.prompt }, ...imageItems],
      cwd: directory, approvalPolicy: 'never',
      sandboxPolicy: { type: 'readOnly' },
      model: selected.model, effort,
    });
    const text = await finished;
    if (!text.trim()) throw new Error('Codex returned an empty response.');
    return { text, model: selected.model as string };
  } finally {
    clearTimeout(timer!);
    connection?.close();
    await rm(directory, { recursive: true, force: true });
  }
}
