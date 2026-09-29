import { createClient, type EmailOtpType, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import { get, set } from 'idb-keyval';
import type { SyncOperation } from './syncEngine';
import type { WorkspaceStateData } from '../types';
import { isStarterWorkspace } from '../lib/starterWorkspace';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const publishableKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined;
const QUEUE_KEY = 'notehub-cloud-operation-queue-v1';
let client: SupabaseClient | null = url && publishableKey ? createClient(url, publishableKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null;
let channel: RealtimeChannel | null = null;
let receiver: ((operation: SyncOperation) => void) | null = null;
let snapshotTimer: number | undefined;

export interface CloudSyncStatus { configured: boolean; connected: boolean; email?: string }

async function queue(operation: SyncOperation) {
  const pending = await get<SyncOperation[]>(QUEUE_KEY) ?? [];
  await set(QUEUE_KEY, [...pending.slice(-999), operation]);
}

async function flush() {
  if (!client) return;
  const { data: { user } } = await client.auth.getUser();
  if (!user) return;
  const pending = await get<SyncOperation[]>(QUEUE_KEY) ?? [];
  if (!pending.length) return;
  const { error } = await client.from('workspace_operations').insert(pending.map((operation) => ({ user_id: user.id, operation_id: operation.opId, client_id: operation.source, payload: operation })));
  if (!error) await set(QUEUE_KEY, []);
}

async function subscribe() {
  if (!client || !receiver) return;
  const { data: { user } } = await client.auth.getUser();
  if (!user) return;
  if (channel) await client.removeChannel(channel);
  const { data: snapshot } = await client.from('workspace_snapshots').select('updated_at').eq('user_id', user.id).maybeSingle();
  let history = client.from('workspace_operations').select('payload').eq('user_id', user.id).order('created_at', { ascending: true }).limit(5000);
  if (snapshot?.updated_at) history = history.gt('created_at', snapshot.updated_at);
  const { data: historical } = await history;
  historical?.forEach((row) => receiver?.(row.payload as SyncOperation));
  channel = client.channel(`workspace:${user.id}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'workspace_operations', filter: `user_id=eq.${user.id}` }, (message) => receiver?.((message.new as { payload: SyncOperation }).payload)).subscribe();
  await flush();
}

export const cloudSync = {
  configured: Boolean(client),
  async start(onOperation: (operation: SyncOperation) => void, getSnapshot?: () => WorkspaceStateData) {
    receiver = onOperation;
    if (!client) return () => undefined;
    const resync = () => {
      void subscribe().then(() => { if (getSnapshot) cloudSync.scheduleSnapshot(getSnapshot()); });
    };
    window.addEventListener('online', resync);
    await subscribe();
    if (getSnapshot) cloudSync.scheduleSnapshot(getSnapshot());
    client.auth.onAuthStateChange(resync);
  },
  async publish(operation: SyncOperation) {
    if (!client) return;
    const { data: { user } } = await client.auth.getUser();
    if (!user || !navigator.onLine) { await queue(operation); return; }
    const { error } = await client.from('workspace_operations').insert({ user_id: user.id, operation_id: operation.opId, client_id: operation.source, payload: operation });
    if (error) await queue(operation);
  },
  async status(): Promise<CloudSyncStatus> {
    if (!client) return { configured: false, connected: false };
    const { data: { user } } = await client.auth.getUser();
    return { configured: true, connected: Boolean(user), email: user?.email };
  },
  async accessToken(): Promise<string | undefined> {
    if (!client) return undefined;
    const { data } = await client.auth.getSession();
    return data.session?.access_token;
  },
  async sendEmailCode(email: string) {
    if (!client) throw new Error('Supabase is not configured.');
    const { error } = await client.auth.signInWithOtp({ email });
    if (error) throw error;
  },
  async verifyEmailCode(email: string, token: string) {
    if (!client) throw new Error('Supabase is not configured.');
    const { error } = await client.auth.verifyOtp({ email, token, type: 'email' });
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
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
  },
  async signOut() { if (client) await client.auth.signOut(); },
  async loadSnapshot(): Promise<WorkspaceStateData | null> {
    if (!client) return null;
    const { data: { user } } = await client.auth.getUser(); if (!user) return null;
    const { data } = await client.from('workspace_snapshots').select('data').eq('user_id', user.id).maybeSingle();
    return (data?.data as WorkspaceStateData | undefined) ?? null;
  },
  scheduleSnapshot(data: WorkspaceStateData) {
    if (!client) return;
    window.clearTimeout(snapshotTimer);
    if (isStarterWorkspace(data)) return;
    snapshotTimer = window.setTimeout(async () => {
      if (!client) return;
      const { data: { user } } = await client.auth.getUser(); if (!user) return;
      await client.from('workspace_snapshots').upsert({ user_id: user.id, data, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    }, 10000);
  },
  _setClientForTests(value: SupabaseClient | null) { client = value; },
};
