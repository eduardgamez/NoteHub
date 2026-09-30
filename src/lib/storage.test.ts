import { beforeEach, expect, it, vi } from 'vitest';
import type { WorkspaceStateData } from '../types';
const db = vi.hoisted(() => new Map<string, unknown>());
vi.mock('idb-keyval', () => ({ get: vi.fn(async (key: string) => db.get(key)), set: vi.fn(async (key: string, value: unknown) => { await new Promise((resolve) => setTimeout(resolve, 2)); db.set(key, value); }) }));
vi.mock('../sync/cloudSync', () => ({ cloudSync: { scheduleSnapshot: vi.fn() } }));
import { loadWorkspace, saveWorkspace, workspaceBackups } from './storage';
beforeEach(() => db.clear());
it('keeps the latest save when several writes overlap and preserves the previous workspace', async () => {
 const old = { chatMessages: { chat: [{ id: 'old' }] } } as unknown as WorkspaceStateData;
 const latest = { chatMessages: { chat: [{ id: 'new' }] } } as unknown as WorkspaceStateData;
 db.set('notehub-workspace-v1', old);
 await Promise.all([saveWorkspace(old), saveWorkspace(latest)]);
 expect(await loadWorkspace()).toEqual(latest);
 expect((await workspaceBackups())[0].data).toEqual(old);
});
