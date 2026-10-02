import { createClient, type EmailOtpType, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import { get, set } from 'idb-keyval';
import type { SyncOperation } from './syncEngine';
import type { WorkspaceStateData } from '../types';
import { isStarterWorkspace } from '../lib/starterWorkspace';
import { isNativeIOS } from '../native/bridge';
import { deviceAuthStorage } from './authDevice';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const publishableKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined;
const QUEUE_KEY = 'notehub-cloud-operation-queue-v1';
let client: SupabaseClient | null = url && publishableKey ? createClient(url, publishableKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, ...(isNativeIOS() ? { storage: deviceAuthStorage } : {}) },
}) : null;
let channel: RealtimeChannel | null = null;
let receiver: ((operation: SyncOperation) => void) | null = null;
let replayHistory: ((operations: SyncOperation[]) => void) | null = null;
let localReplay: ((operation: SyncOperation) => void) | null = null;
let snapshotTimer: number | undefined;
let snapshotSource: (() => WorkspaceStateData) | undefined;

export interface CloudSyncStatus { configured: boolean; connected: boolean; email?: string }

let queueWrites = Promise.resolve();
function updateQueue(update: (pending: SyncOperation[]) => SyncOperation[]) {
  const write = queueWrites.catch(() => {}).then(async () => set(QUEUE_KEY, update(await get<SyncOperation[]>(QUEUE_KEY) ?? [])));
  queueWrites = write;
  return write;
}
async function queue(operation: SyncOperation) {
  await updateQueue((pending) => pending.some((item) => item.opId === operation.opId) ? pending : [...pending, operation]);
}
let flushing: Promise<void> | null = null;
async function flush() {
  if (flushing) { await flushing; return flush(); }
  flushing = flushPending();
  try { await flushing; } finally { flushing = null; }
}
async function flushPending() {
  if (!client) return;
  const { data: { user } } = await client.auth.getUser();
  if (!user) return;
  await queueWrites;
  const pending = await get<SyncOperation[]>(QUEUE_KEY) ?? [];
  if (!pending.length) return;
  const sent = new Set<string>();
  for (const operation of pending.filter((item) => !item.userId || item.userId === user.id)) {
    const { error } = await client.from('workspace_operations').insert({ user_id: user.id, operation_id: operation.opId, client_id: operation.source, payload: operation });
    if (!error || error.code === '23505') sent.add(operation.opId);
    else break;
  }
  await updateQueue((items) => items.filter((item) => !sent.has(item.opId)));
}
async function subscribe() {
  if (!client || !receiver) return;
  const { data: { user } } = await client.auth.getUser();
  if (!user) return;
  const owner = snapshotSource?.()?.syncUserId;
  if (owner && owner !== user.id) return;
  if (channel) await client.removeChannel(channel);
  let recovering = true;
  const buffered: SyncOperation[] = [];
  // Buffer live changes until ordered history has been applied.
  channel = client.channel(`workspace:${user.id}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'workspace_operations', filter: `user_id=eq.${user.id}` }, (message) => { const operation = (message.new as { payload: SyncOperation }).payload; if (recovering) buffered.push(operation); else receiver?.(operation); }).subscribe();
  const historical = await cloudSync.operationHistory();
  if (replayHistory) replayHistory(historical);
  else historical.forEach((operation) => receiver?.(operation));
  recovering = false;
  buffered.forEach((operation) => receiver?.(operation));
  await queueWrites;
  // Unsynchronized local edits are newer than the server history and must remain visible.
  (await get<SyncOperation[]>(QUEUE_KEY) ?? []).filter((operation) => !operation.userId || operation.userId === user.id).forEach((operation) => (localReplay ?? receiver)?.(operation));
  await flush();
}

export const cloudSync = {
  configured: Boolean(client),
  async start(onOperation: (operation: SyncOperation) => void, getSnapshot?: () => WorkspaceStateData, onLocalReplay?: (operation: SyncOperation) => void, onHistory?: (operations: SyncOperation[]) => void) {
    snapshotSource = getSnapshot;
    receiver = onOperation; localReplay = onLocalReplay ?? null; replayHistory = onHistory ?? null;
    if (!client) return () => undefined;
    const resync = () => {
      void subscribe().then(() => { if (getSnapshot) cloudSync.scheduleSnapshot(getSnapshot()); }).catch((error) => console.warn('Workspace recovery is waiting for a connection.', error));
    };
    window.addEventListener('online', resync);
    client.auth.onAuthStateChange(() => { window.setTimeout(resync, 0); });
    await subscribe();
    if (getSnapshot) cloudSync.scheduleSnapshot(getSnapshot());
  },
  async publish(operation: SyncOperation) {
    if (!client) return;
    // Queue before requesting authentication: an offline auth request must not lose the edit.
    await queue({ ...operation, userId: operation.userId ?? await cloudSync.sessionUserId() });
    if (navigator.onLine) await flush().catch(() => {});
  },
  async status(): Promise<CloudSyncStatus> {
    if (!client) return { configured: false, connected: false };
    const { data: { session } } = await client.auth.getSession();
    return { configured: true, connected: Boolean(session), email: session?.user.email };
  },
  async sessionUserId(): Promise<string | undefined> {
    if (!client) return undefined;
    const { data } = await client.auth.getSession();
    return data.session?.user.id;
  },
  async accessToken(): Promise<string | undefined> {
    if (!client) return undefined;
    const { data } = await client.auth.getSession();
    return data.session?.access_token;
  },
  async sendEmailCode(email: string) {
    if (!client) throw new Error('Supabase is not configured.');
    const { error } = await client.auth.signInWithOtp({ email: email.trim() });
    if (error) throw error;
  },
  async verifyEmailCode(email: string, token: string) {
    if (!client) throw new Error('Supabase is not configured.');
    const { error } = await client.auth.verifyOtp({ email: email.trim(), token: token.trim(), type: 'email' });
    if (error) throw error;
  },
  async verifyEmailLink(link: string) {
    if (!client || !url) throw new Error('Supabase is not configured.');
    let confirmation: URL;
    try { confirmation = new URL(link.trim()); }
    catch { throw new Error('Paste the complete link from the email.'); }
    if (confirmation.origin !== new URL(url).origin || confirmation.pathname !== '/auth/v1/verify') throw new Error('This is not a NoteHub sign-in link.');
    const token_hash = confirmation.searchParams.get('token_hash') ?? confirmation.searchParams.get('token');
    const type = confirmation.searchParams.get('type');
    if (!token_hash || !type || !['email', 'signup', 'magiclink'].includes(type)) throw new Error('This email link is incomplete.');
    const { error } = await client.auth.verifyOtp({ token_hash, type: type as EmailOtpType });
    if (error) throw error;
  },
  async setPassword(password: string) {
    if (!client) throw new Error('Supabase is not configured.');
    const { error } = await client.auth.updateUser({ password });
    if (error) throw error;
  },
  async signInWithPassword(email: string, password: string) {
    if (!client) throw new Error('Supabase is not configured.');
    const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
  },
  async signOut() {
    if (!client) return;
    const { error } = await client.auth.signOut({ scope: 'local' });
    if (error) throw error;
    window.clearTimeout(snapshotTimer);
    if (channel) { await client.removeChannel(channel); channel = null; }
  },
  async loadSnapshot(): Promise<WorkspaceStateData | null> {
    if (!client) return null;
    const { data: { user } } = await client.auth.getUser(); if (!user) return null;
    const { data } = await client.from('workspace_snapshots').select('data').eq('user_id', user.id).maybeSingle();
    return (data?.data as WorkspaceStateData | undefined) ?? null;
  },
  async operationHistory(): Promise<SyncOperation[]> {
    if (!client) return [];
    const { data: { user } } = await client.auth.getUser();
    if (!user) return [];
    const result: SyncOperation[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await client.from('workspace_operations').select('payload').eq('user_id', user.id).order('created_at', { ascending: true }).order('id', { ascending: true }).range(offset, offset + 499);
      if (error) throw error;
      result.push(...(data ?? []).map((row) => row.payload as SyncOperation));
      if (!data || data.length < 500) return result;
    }
  },
  scheduleSnapshot(data: WorkspaceStateData) {
    if (!client) return;
    window.clearTimeout(snapshotTimer);
    if (isStarterWorkspace(data)) return;
    snapshotTimer = window.setTimeout(async () => {
      if (!client) return;
      const { data: { user } } = await client.auth.getUser(); if (!user) return;
      if (data.syncUserId && data.syncUserId !== user.id) return;
      await client.from('workspace_snapshots').upsert({ user_id: user.id, data, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    }, 10000);
  },
  _setClientForTests(value: SupabaseClient | null) { client = value; },
};
