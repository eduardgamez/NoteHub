import { beforeEach, expect, it, vi } from 'vitest';
import { useWorkspace } from '../store/useWorkspace';
import { applyNativeAction } from './actions';
import { nativeItems } from './bridge';
vi.mock('../lib/storage', () => ({ loadWorkspace: vi.fn(), scheduleSave: vi.fn(), preserveWorkspace: vi.fn() }));
vi.mock('../sync/syncEngine', () => ({ syncEngine: { publish: vi.fn() } }));
beforeEach(() => useWorkspace.setState({ tasks: [{ id: 'reminder', title: 'Gastos', reminder: true, done: false, due: '2026-09-30', checklist: [{ id: 'check', text: 'Revisar', done: false }] }] }));
it('replays a native check idempotently instead of toggling it twice', () => {
  const action = { id: 'action', targetId: 'task:reminder', kind: 'check' as const, itemId: 'check', done: true };
  applyNativeAction(action); applyNativeAction(action);
  expect(useWorkspace.getState().tasks[0].checklist[0].done).toBe(true);
});
it('deletes a native reminder without touching other calendar entries', () => {
  applyNativeAction({ id: 'delete', targetId: 'task:reminder', kind: 'delete' });
  applyNativeAction({ id: 'delete', targetId: 'task:reminder', kind: 'delete' });
  expect(useWorkspace.getState().tasks).toEqual([]);
});
it('schedules day-only reminders at 9 local time and gives native items stable scoped IDs', () => {
  const items = nativeItems(useWorkspace.getState().tasks, []);
  expect(items[0].id).toBe('task:reminder');
  expect(new Date(items[0].due * 1000).getHours()).toBe(9);
});
it('drops malformed checklist entries instead of sending iOS data it rejects', () => {
  const tasks = [{ id: 'old', title: 'Antiguo', reminder: true, done: false, due: '2026-09-30T10:00:00Z', checklist: undefined as never }, { id: 'mixed', title: 'Mixto', reminder: true, done: false, due: '2026-09-30T11:00:00Z', checklist: [{ id: 'a', text: 'Uno' }, null, { text: 'sin id' }] as never }];
  const items = nativeItems(tasks, [{ id: 'broken', title: 'Sin fin', start: '2026-09-30T12:00:00Z', end: 'nope', color: 'green' }]);
  expect(items.map((item) => item.checklist)).toEqual([[], [{ id: 'a', text: 'Uno', done: false }], []]);
  expect(items[2]).not.toHaveProperty('end');
});
