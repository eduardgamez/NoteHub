// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import type { SyncOperation } from './syncEngine';
import type { WorkspaceStateData } from '../types';
const cloud = vi.hoisted(() => ({ start: vi.fn(), publish: vi.fn() }));
vi.mock('./cloudSync', () => ({ cloudSync: cloud }));
beforeEach(() => { vi.resetModules(); cloud.start.mockReset().mockResolvedValue(undefined); cloud.publish.mockReset().mockResolvedValue(undefined); });
const move = { kind: 'stroke.move', noteId: 'note', strokeIds: ['ink'], dx: 20, dy: 0, opId: 'move', source: 'old-device', timestamp: 1 } as SyncOperation;
it('does not replay old drawing movement during migration even if a new local edit has a receipt', async () => {
 const { syncEngine } = await import('./syncEngine');
 const listener = vi.fn(), done = vi.fn();
 const unsubscribe = syncEngine.subscribe(listener, () => ({ syncReceipts: ['new-edit'] } as WorkspaceStateData), done);
 const history = cloud.start.mock.calls[0][3];
 history([move, { kind: 'event.remove', eventId: 'old', opId: 'remove', source: 'old-device', timestamp: 2 }]);
 expect(listener).toHaveBeenNthCalledWith(1, move, true);
 expect(listener.mock.calls[1][1]).toBe(false);
 expect(done).toHaveBeenCalledOnce(); unsubscribe();
});
it('skips received operations and applies genuinely new changes after recovery', async () => {
 const { syncEngine } = await import('./syncEngine');
 const listener = vi.fn();
 const unsubscribe = syncEngine.subscribe(listener, () => ({ syncReceipts: ['received'], syncHistoryReady: true } as WorkspaceStateData));
 cloud.start.mock.calls[0][3]([{ ...move, opId: 'received' }, move]);
 expect(listener).toHaveBeenCalledExactlyOnceWith(move, false); unsubscribe();
});
it('reapplies pending local replacements after history without moving a drawing twice', async () => {
 const { syncEngine } = await import('./syncEngine');
 const listener = vi.fn();
 const unsubscribe = syncEngine.subscribe(listener);
 const pending = cloud.start.mock.calls[0][2];
 pending(move);
 expect(listener).toHaveBeenLastCalledWith(move, false, false);
 const removal = { kind: 'event.remove', eventId: 'event', opId: 'pending', source: 'device', timestamp: 1 };
 pending(removal);
 expect(listener).toHaveBeenLastCalledWith(removal, false, true); unsubscribe();
});

it('ignores broadcasts belonging to another signed-in account', async () => {
 const { syncEngine } = await import('./syncEngine');
 const listener = vi.fn();
 const unsubscribe = syncEngine.subscribe(listener, () => ({ syncUserId: 'my-user' } as WorkspaceStateData));
 cloud.start.mock.calls[0][0]({ ...move, userId: 'another-user' });
 expect(listener).not.toHaveBeenCalled(); unsubscribe();
});
