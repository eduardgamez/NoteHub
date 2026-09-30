import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cloudSync } from './cloudSync';
import type { SyncOperation } from './syncEngine';
const db = vi.hoisted(() => new Map<string, unknown>());
vi.mock('idb-keyval', () => ({ get: vi.fn(async (key: string) => db.get(key)), set: vi.fn(async (key: string, value: unknown) => { db.set(key, value); }) }));
beforeEach(() => db.clear());

afterEach(() => cloudSync._setClientForTests(null));

describe('device session persistence', () => {
  it('recognizes the persisted session without requiring a user validation request', async () => {
    const getUser = vi.fn().mockRejectedValue(new Error('Offline'));
    const getSession = vi.fn().mockResolvedValue({ data: { session: { user: { email: 'person@example.com' } } } });
    cloudSync._setClientForTests({ auth: { getSession, getUser } } as unknown as SupabaseClient);
    expect(await cloudSync.status()).toEqual({ configured: true, connected: true, email: 'person@example.com' });
    expect(getUser).not.toHaveBeenCalled();
  });

  it('signs out only the current device', async () => {
    const signOut = vi.fn().mockResolvedValue({ error: null });
    cloudSync._setClientForTests({ auth: { signOut } } as unknown as SupabaseClient);
    await cloudSync.signOut();
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('reports a failed sign out instead of showing success', async () => {
    const error = new Error('Could not sign out');
    cloudSync._setClientForTests({ auth: { signOut: vi.fn().mockResolvedValue({ error }) } } as unknown as SupabaseClient);
    await expect(cloudSync.signOut()).rejects.toThrow(error);
  });
});

describe('ordered recovery', () => {
  it('reads every page of operations instead of stopping at the server row limit', async () => {
    const pages = [Array.from({ length: 500 }, (_, index) => ({ payload: { opId: String(index) } })), [{ payload: { opId: 'last' } }]];
    const query = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), range: vi.fn().mockImplementation(async () => ({ data: pages.shift(), error: null })) };
    query.select.mockReturnValue(query); query.eq.mockReturnValue(query); query.order.mockReturnValue(query);
    cloudSync._setClientForTests({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user' } } }) }, from: vi.fn().mockReturnValue(query) } as unknown as SupabaseClient);
    const result = await cloudSync.operationHistory();
    expect(result).toHaveLength(501);
    expect(result.at(-1)?.opId).toBe('last');
    expect(query.range.mock.calls).toEqual([[0, 499], [500, 999]]);
    expect(query.order).toHaveBeenCalledWith('created_at', { ascending: true });
    expect(query.order).toHaveBeenCalledWith('id', { ascending: true });
  });
});

describe('durable operation queue', () => {
  it('keeps edits added during a flush until they are individually acknowledged', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const insert = vi.fn().mockImplementationOnce(async () => { await gate; return { error: null }; }).mockResolvedValue({ error: null });
    cloudSync._setClientForTests({ auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: 'owner' } } } }), getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'owner' } } }) }, from: vi.fn().mockReturnValue({ insert }) } as unknown as SupabaseClient);
    const operation = { kind: 'task.remove', taskId: 'one', opId: 'one', source: 'device', timestamp: 1 } as SyncOperation;
    const first = cloudSync.publish(operation);
    await vi.waitFor(() => expect(insert).toHaveBeenCalledOnce());
    const second = cloudSync.publish({ ...operation, opId: 'two' });
    await vi.waitFor(() => expect((db.get('notehub-cloud-operation-queue-v1') as SyncOperation[])?.length).toBe(2));
    release(); await Promise.all([first, second]);
    expect(insert.mock.calls.map(([row]) => row.operation_id)).toEqual(['one', 'two']);
    expect(db.get('notehub-cloud-operation-queue-v1')).toEqual([]);
  });
  it('does not upload another account’s offline edits when switching accounts', async () => {
    const old = { kind: 'task.remove', taskId: 'private', opId: 'old', source: 'device', timestamp: 1, userId: 'old-owner' } as SyncOperation;
    db.set('notehub-cloud-operation-queue-v1', [old]);
    const insert = vi.fn().mockResolvedValue({ error: null });
    cloudSync._setClientForTests({ auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: 'current-owner' } } } }), getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'current-owner' } } }) }, from: vi.fn().mockReturnValue({ insert }) } as unknown as SupabaseClient);
    await cloudSync.publish({ ...old, opId: 'new', userId: 'current-owner' });
    expect(insert).toHaveBeenCalledOnce();
    expect(insert.mock.calls[0][0].operation_id).toBe('new');
    expect(db.get('notehub-cloud-operation-queue-v1')).toEqual([old]);
  });
});
