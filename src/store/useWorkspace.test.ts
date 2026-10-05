import { beforeEach, describe, expect, it, vi } from 'vitest';
import { seedWorkspace } from '../data/seed';
import { loadWorkspace } from '../lib/storage';
import { cloudSync } from '../sync/cloudSync';
import { syncEngine } from '../sync/syncEngine';
import type { PendingProposal } from '../types';
import type { SyncOperation } from '../sync/syncEngine';

vi.mock('../lib/storage', () => ({ loadWorkspace: vi.fn(), preserveWorkspace: vi.fn().mockResolvedValue(undefined), scheduleSave: vi.fn() }));
vi.mock('../sync/syncEngine', () => ({ syncEngine: { publish: vi.fn(), subscribe: vi.fn() } }));

import { aiOpensByDefault, useWorkspace } from './useWorkspace';

describe('workspace hydration across devices', () => {
  it('starts with a blank chat while preserving history for explicit selection', async () => {
    const local = structuredClone(seedWorkspace);
    local.chatSessions = { old: { id: 'old', scope: 'global', title: 'Previous chat', createdAt: 1, updatedAt: 2 } };
    local.chatThreads = { old: [{ id: 'message', role: 'user', content: 'Previous message', createdAt: 1 }] };
    local.activeChatIds = { global: 'old' };
    vi.mocked(loadWorkspace).mockResolvedValueOnce(local);
    vi.spyOn(cloudSync, 'loadSnapshot').mockResolvedValueOnce(null);
    await useWorkspace.getState().hydrate();
    expect(useWorkspace.getState().activeChatIds).toEqual({});
    expect(useWorkspace.getState().chatThreads.old).toEqual(local.chatThreads.old);
    useWorkspace.getState().selectChatSession('global', 'old');
    expect(useWorkspace.getState().activeChatIds.global).toBe('old');
  });
  it('removes gym examples including edited versions but preserves user routines and sessions', async () => {
    const demoRoutine = { id: 'upper-a', name: 'Upper A', exercises: [{ exerciseId: 'incline-db', targetSets: 3, repRange: '6–10' }, { exerciseId: 'chest-row', targetSets: 3, repRange: '8–12' }, { exerciseId: 'lateral-raise', targetSets: 4, repRange: '10–15' }] };
    const demoWorkout = { id: 'workout-0', routineId: 'upper-a', title: 'Upper A', startedAt: '2026-01-01T18:00:00Z', endedAt: '2026-01-01T18:00:00Z', exercises: [
      { exerciseId: 'incline-db', sets: [{ id: 'incline-0-1', reps: 8, weight: 24, rir: 2, completed: true }, { id: 'incline-0-2', reps: 9, weight: 22, rir: 1, completed: true }] },
      { exerciseId: 'chest-row', sets: [{ id: 'row-0', reps: 10, weight: 45, rir: 2, completed: true }] },
      { exerciseId: 'calf-raise', sets: [{ id: 'calf-0', reps: 12, weight: 50, rir: 2, completed: true }] },
    ] };
    const local = { ...structuredClone(seedWorkspace), routines: [demoRoutine, { ...demoRoutine, id: 'mine', name: 'Mi rutina' }], workouts: [demoWorkout, ...Array.from({ length: 7 }, (_, index) => ({ ...demoWorkout, id: `workout-${index + 1}`, title: 'Ejemplo editado', endedAt: '2026-01-01T19:00:00Z' })), { ...demoWorkout, id: 'my-session', title: 'Mi sesión' }] };
    vi.mocked(loadWorkspace).mockResolvedValueOnce(local);
    vi.spyOn(cloudSync, 'loadSnapshot').mockResolvedValueOnce(null);
    await useWorkspace.getState().hydrate();
    expect(useWorkspace.getState().routines.map((item) => item.id)).toEqual(['mine']);
    expect(useWorkspace.getState().workouts.map((item) => item.id)).toEqual(['my-session']);
    useWorkspace.getState().applyRemote({ kind: 'routine.upsert', routine: demoRoutine, opId: 'legacy-demo-routine', source: 'remote', timestamp: 1 });
    useWorkspace.getState().applyRemote({ kind: 'workout.upsert', workout: demoWorkout, opId: 'legacy-demo-workout', source: 'remote', timestamp: 1 });
    expect(useWorkspace.getState().routines.map((item) => item.id)).toEqual(['mine']);
    expect(useWorkspace.getState().workouts.map((item) => item.id)).toEqual(['my-session']);
    useWorkspace.getState().applyRemote({ kind: 'routine.upsert', routine: { ...demoRoutine, name: 'Mi rutina editada' }, opId: 'edited-demo-routine', source: 'remote', timestamp: 2 });
    expect(useWorkspace.getState().routines.map((item) => item.id)).toEqual(['mine']);
    useWorkspace.getState().applyRemote({ kind: 'workout.upsert', workout: { ...demoWorkout, endedAt: '2026-01-01T19:00:00Z' }, opId: 'edited-demo-workout', source: 'remote', timestamp: 2 });
    expect(useWorkspace.getState().workouts.map((item) => item.id)).toEqual(['my-session']);
  });

  it('does not load a previous account workspace into a different account', async () => {
    const local = { ...structuredClone(seedWorkspace), syncUserId: 'previous-user', projects: [{ id: 'private-old', title: 'Old', emoji: '◇', context: [] }] };
    const remote = { ...structuredClone(seedWorkspace), syncUserId: 'current-user', projects: [{ id: 'current', title: 'Current', emoji: '◇', context: [] }] };
    vi.mocked(loadWorkspace).mockResolvedValueOnce(local);
    vi.spyOn(cloudSync, 'loadSnapshot').mockResolvedValueOnce(remote);
    vi.spyOn(cloudSync, 'sessionUserId').mockResolvedValueOnce('current-user');
    await useWorkspace.getState().hydrate();
    expect(useWorkspace.getState().projects.map((project) => project.id)).toEqual(['current']);
    expect(useWorkspace.getState().syncUserId).toBe('current-user');
  });

  it('loads the account workspace when this browser has local starter data', async () => {
    const local = structuredClone(seedWorkspace);
    const remote = structuredClone(seedWorkspace);
    remote.projects = [...remote.projects, { id: 'synced-project', title: 'Synced project', emoji: '◇', context: [] }];
    vi.mocked(loadWorkspace).mockResolvedValueOnce(local);
    vi.spyOn(cloudSync, 'loadSnapshot').mockResolvedValueOnce(remote);
    await useWorkspace.getState().hydrate();
    expect(useWorkspace.getState().projects.some((project) => project.id === 'synced-project')).toBe(true);
  });

  it('keeps existing local notes when the cloud only has starter content', async () => {
    const local = structuredClone(seedWorkspace);
    local.projects = [...local.projects, { id: 'my-project', title: 'My notes', emoji: '◇', context: [] }];
    vi.mocked(loadWorkspace).mockResolvedValueOnce(local);
    vi.spyOn(cloudSync, 'loadSnapshot').mockResolvedValueOnce(structuredClone(seedWorkspace));
    await useWorkspace.getState().hydrate();
    expect(useWorkspace.getState().projects.some((project) => project.id === 'my-project')).toBe(true);
  });
  it('does not replace local conversations and calendar entries with an older populated cloud snapshot', async () => {
    const local = structuredClone(seedWorkspace);
    local.chatThreads['latest'] = [{ id: 'latest-message', role: 'user', content: 'Latest conversation', createdAt: Date.now() }];
    local.calendarEvents.push({ id: 'latest-event', title: 'Latest event', start: '2026-09-30T10:00:00Z', end: '2026-09-30T11:00:00Z', color: 'green' });
    const remote = structuredClone(seedWorkspace);
    remote.projects.push({ id: 'old-cloud', title: 'Old populated cloud', emoji: '◇', context: [] });
    vi.mocked(loadWorkspace).mockResolvedValueOnce(local);
    vi.spyOn(cloudSync, 'loadSnapshot').mockResolvedValueOnce(remote);
    await useWorkspace.getState().hydrate();
    expect(useWorkspace.getState().chatThreads['latest'][0].id).toBe('latest-message');
    expect(useWorkspace.getState().calendarEvents.some((event) => event.id === 'latest-event')).toBe(true);
  });

});

const proposal: PendingProposal = {
  id: 'delete-proposal', threadId: 'test-thread', kind: 'file.block.delete', title: 'Delete block',
  description: 'Remove the selected block', before: 'Existing text', after: 'Block deleted',
  payload: { noteId: 'sensitivity', blockId: 'formula' }, status: 'pending', createdAt: 1,
};

describe('AI block deletion proposals', () => {
  beforeEach(() => {
    const workspace = structuredClone(seedWorkspace);
    workspace.notes.sensitivity.strokes.push({
      id: 'attached-ink', anchorBlockId: 'formula', color: '#000', width: 2,
      points: [{ x: 1, y: 1 }], bounds: { x: 1, y: 1, width: 0, height: 0 },
    });
    useWorkspace.setState({ ...workspace, selectedIds: ['formula'], pendingProposals: [{ ...proposal }], history: {}, future: {} });
  });

  it('keeps the block when rejected', () => {
    useWorkspace.getState().resolveProposal(proposal.id, 'rejected');
    const state = useWorkspace.getState();
    expect(state.notes.sensitivity.blocks.some((block) => block.id === 'formula')).toBe(true);
    expect(state.notes.sensitivity.strokes.some((stroke) => stroke.id === 'attached-ink')).toBe(true);
  });

  it('removes the block and its attached ink only after approval', () => {
    useWorkspace.getState().resolveProposal(proposal.id, 'approved');
    const state = useWorkspace.getState();
    expect(state.notes.sensitivity.blocks.some((block) => block.id === 'formula')).toBe(false);
    expect(state.notes.sensitivity.strokes.some((stroke) => stroke.id === 'attached-ink')).toBe(false);
    expect(state.selectedIds).not.toContain('formula');
    expect(state.pendingProposals[0].status).toBe('approved');
    state.undo('sensitivity');
    expect(useWorkspace.getState().notes.sensitivity.blocks.some((block) => block.id === 'formula')).toBe(true);
  });
});

describe('personal profile in chats', () => {
  beforeEach(() => useWorkspace.setState({ ...structuredClone(seedWorkspace), history: {}, future: {} }));

  it('caches a summary per chat and refreshes it after a profile edit', () => {
    const store = useWorkspace.getState();
    store.setProfileField('style', 'Respuestas cortas');
    const id = store.createChatSession('global');
    expect(store.readProfileForChat(id)).toContain('Respuestas cortas');
    expect(useWorkspace.getState().chatSessions[id].profileReadAt).toBe(useWorkspace.getState().personalProfile.updatedAt);
    store.setProfileField('style', 'Respuestas detalladas');
    expect(store.readProfileForChat(id)).toContain('Respuestas detalladas');
  });

  it('replaces existing AI memory and does not timestamp redundant writes', () => {
    const store = useWorkspace.getState();
    store.setProfileField('classes', 'Texto del usuario\n/Universidad a las 9./');
    store.applyProfileUpdates([{ field: 'classes', value: 'Universidad a las 9, excepto lunes.', replace: [{ field: 'classes', value: 'Universidad a las 9.' }] }]);
    expect(useWorkspace.getState().personalProfile.answers.classes).toBe('Texto del usuario\n/Universidad a las 9, excepto lunes./');
    const previous = useWorkspace.getState().personalProfile;
    store.applyProfileUpdates([{ field: 'notes', value: 'Universidad a las 9, excepto lunes.' }]);
    expect(useWorkspace.getState().personalProfile).toBe(previous);
  });

  it('adds an explicit AI fact and lets the user remove it', () => {
    const store = useWorkspace.getState();
    store.setProfileField('classes', 'Martes a las 10');
    store.applyProfileUpdates([{ field: 'classes', value: 'Lunes a las 9' }]);
    expect(useWorkspace.getState().personalProfile.answers.classes).toBe('Martes a las 10\n/Lunes a las 9/');
    store.setProfileField('classes', '');
    expect(useWorkspace.getState().personalProfile.answers.classes).toBe('');
  });
});

describe('block layout mutations and device replay', () => {
  beforeEach(() => useWorkspace.setState({ ...structuredClone(seedWorkspace), activeNoteId: 'sensitivity', history: {}, future: {} }));

  it('replays insertion with exactly the same row membership as local insertion', () => {
    const initial = structuredClone(useWorkspace.getState().notes.sensitivity);
    const target = initial.blocks.find((block) => !block.isTitle)!;
    const added = { ...target, id: 'new-block', layoutGroupId: undefined, layoutColumnId: undefined };
    useWorkspace.getState().insertBlockAfter(initial.id, added, target.id);
    const expected = structuredClone(useWorkspace.getState().notes.sensitivity.blocks);
    useWorkspace.setState({ notes: { ...useWorkspace.getState().notes, sensitivity: initial }, history: {} });
    useWorkspace.getState().applyRemote({ kind: 'block.upsert', noteId: initial.id, block: added, afterBlockId: target.id, opId: 'insert', source: 'other-device', timestamp: 1 });
    expect(useWorkspace.getState().notes.sensitivity.blocks).toEqual(expected);
    expect(useWorkspace.getState().history.sensitivity).toBeUndefined();
  });

  it('replays column moves with the same layout on another device', () => {
    const initial = structuredClone(useWorkspace.getState().notes.sensitivity);
    const [target, source] = initial.blocks.filter((block) => !block.isTitle);
    useWorkspace.getState().reorderBlock(initial.id, source.id, target.id, false, true);
    const expected = structuredClone(useWorkspace.getState().notes.sensitivity.blocks);
    useWorkspace.setState({ notes: { ...useWorkspace.getState().notes, sensitivity: initial }, history: {} });
    useWorkspace.getState().applyRemote({ kind: 'block.reorder', noteId: initial.id, blockId: source.id, targetId: target.id, before: false, side: true, source: 'other-device', opId: 'move', timestamp: 1 });
    expect(useWorkspace.getState().notes.sensitivity.blocks).toEqual(expected);
    expect(useWorkspace.getState().history.sensitivity).toBeUndefined();
  });

  it('keeps attached ink and supports undo/redo when moving beside a drawing', () => {
    const store = useWorkspace.getState();
    const initial = structuredClone(store.notes.sensitivity);
    const target = initial.blocks.find((block) => !block.isTitle)!;
    const source = initial.blocks.find((block) => !block.isTitle && block.id !== target.id)!;
    store.reorderBlock(initial.id, source.id, target.id, false, true);
    const moved = structuredClone(useWorkspace.getState().notes.sensitivity);
    expect(moved.blocks.find((block) => block.id === source.id)?.layoutGroupId).toBe(target.layoutGroupId ?? target.id);
    expect(moved.strokes).toEqual(initial.strokes);
    store.undo(initial.id);
    expect(useWorkspace.getState().notes.sensitivity).toEqual(initial);
    store.redo(initial.id);
    expect(useWorkspace.getState().notes.sensitivity).toEqual(moved);
  });

  it('sends undo and redo to other devices so they show the same columns', () => {
    const store = useWorkspace.getState();
    const initial = structuredClone(store.notes.sensitivity);
    const [target, source] = initial.blocks.filter((block) => !block.isTitle);
    store.reorderBlock(initial.id, source.id, target.id, false, true);
    vi.mocked(syncEngine.publish).mockClear();
    store.undo(initial.id);
    expect(syncEngine.publish).toHaveBeenCalledWith({ kind: 'note.upsert', note: initial });
    store.redo(initial.id);
    expect(vi.mocked(syncEngine.publish).mock.calls.at(-1)?.[0]).toMatchObject({ kind: 'note.upsert', note: { id: initial.id } });
  });

  it('applies the sender\'s whole layout for a move, even if this device had drifted', () => {
    const initial = structuredClone(useWorkspace.getState().notes.sensitivity);
    const [target, source] = initial.blocks.filter((block) => !block.isTitle);
    useWorkspace.getState().reorderBlock(initial.id, source.id, target.id, false, true);
    const expected = structuredClone(useWorkspace.getState().notes.sensitivity.blocks);
    const sent = vi.mocked(syncEngine.publish).mock.calls.at(-1)![0];
    const drifted = { ...initial, blocks: initial.blocks.map((block) => block.isTitle ? block : { ...block, layoutGroupId: 'stale-row', layoutColumnId: crypto.randomUUID() }) };
    useWorkspace.setState({ notes: { ...useWorkspace.getState().notes, sensitivity: drifted } });
    useWorkspace.getState().applyRemote({ ...sent, source: 'other-device', opId: 'absolute-move', timestamp: 1 } as SyncOperation);
    expect(useWorkspace.getState().notes.sensitivity.blocks.map(({ id, layoutGroupId, layoutColumnId }) => ({ id, layoutGroupId, layoutColumnId })))
      .toEqual(expected.map(({ id, layoutGroupId, layoutColumnId }) => ({ id, layoutGroupId, layoutColumnId })));
  });

  it('keeps a block in its row when an edit arrives with an older position', () => {
    const initial = structuredClone(useWorkspace.getState().notes.sensitivity);
    const [target, source] = initial.blocks.filter((block) => !block.isTitle);
    useWorkspace.getState().reorderBlock(initial.id, source.id, target.id, false, true);
    const placed = useWorkspace.getState().notes.sensitivity.blocks.find((block) => block.id === source.id)!;
    useWorkspace.getState().applyRemote({ kind: 'block.upsert', noteId: initial.id, block: { ...source, content: '<p>edited</p>' }, source: 'other-device', opId: 'stale-edit', timestamp: 2 });
    const edited = useWorkspace.getState().notes.sensitivity.blocks.find((block) => block.id === source.id)!;
    expect(edited).toMatchObject({ content: '<p>edited</p>', layoutGroupId: placed.layoutGroupId, layoutColumnId: placed.layoutColumnId });
    expect(useWorkspace.getState().history.sensitivity).toBeUndefined();
  });
});

describe('mobile project panels', () => {
  it('opens one overlay at a time on narrow screens, retaining desktop side-by-side panels', () => {
    const width = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 375 });
    useWorkspace.setState({ aiOpen: true, sidebarOpen: false });
    useWorkspace.getState().setSidebarOpen(true);
    expect(useWorkspace.getState()).toMatchObject({ sidebarOpen: true, aiOpen: false });
    useWorkspace.getState().setAiOpen(true);
    expect(useWorkspace.getState()).toMatchObject({ sidebarOpen: false, aiOpen: true });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });
    useWorkspace.getState().setSidebarOpen(true);
    expect(useWorkspace.getState()).toMatchObject({ sidebarOpen: true, aiOpen: true });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  });

  it('keeps the AI chat closed by default on touch tablets but opens it on wide desktops', () => {
    const width = window.innerWidth;
    const matchMedia = window.matchMedia;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1180 });
    window.matchMedia = ((query: string) => ({ matches: query.includes('pointer: coarse') })) as unknown as typeof window.matchMedia;
    expect(aiOpensByDefault()).toBe(false);
    window.matchMedia = ((query: string) => ({ matches: !query })) as unknown as typeof window.matchMedia;
    expect(aiOpensByDefault()).toBe(true);
    window.matchMedia = matchMedia;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  });
});


describe('AI event and reminder deletion', () => {
  const event = { id: 'event-to-delete', title: 'Universidad', start: '2026-10-01T09:00:00Z', end: '2026-10-01T10:00:00Z', color: 'green' as const };
  const task = { id: 'reminder-to-delete', title: 'Llevar apuntes', done: false, reminder: true, checklist: [] };
  const deletion = (kind: 'calendar.delete' | 'task.delete'): PendingProposal => ({
    id: kind, threadId: 'global', kind, title: 'Eliminar', description: 'Eliminar elemento consultado', after: 'Eliminado',
    payload: kind === 'calendar.delete' ? { eventId: event.id, expected: JSON.stringify(event) } : { taskId: task.id, expected: JSON.stringify(task) },
    status: 'pending', createdAt: 1,
  });
  beforeEach(() => useWorkspace.setState({ ...structuredClone(seedWorkspace), calendarEvents: [event, { ...event, id: 'other-event' }], tasks: [task, { ...task, id: 'other-task' }], pendingProposals: [deletion('calendar.delete'), deletion('task.delete')] }));

  it('removes only the exact event and reminder after approval', () => {
    const store = useWorkspace.getState();
    store.resolveProposal('calendar.delete', 'approved');
    store.resolveProposal('task.delete', 'approved');
    expect(useWorkspace.getState().calendarEvents.map((item) => item.id)).toEqual(['other-event']);
    expect(useWorkspace.getState().tasks.map((item) => item.id)).toEqual(['other-task']);
    expect(useWorkspace.getState().pendingProposals.every((item) => item.status === 'approved')).toBe(true);
  });

  it('does not mistake reordered object properties for a changed event', () => {
    useWorkspace.setState({ calendarEvents: [{ color: event.color, end: event.end, start: event.start, title: event.title, id: event.id }] });
    useWorkspace.getState().resolveProposal('calendar.delete', 'approved');
    expect(useWorkspace.getState().calendarEvents).toHaveLength(0);
    expect(useWorkspace.getState().pendingProposals[0].status).toBe('approved');
  });

  it('finishes an already satisfied deletion without removing a different event', () => {
    useWorkspace.getState().removeEvent(event.id);
    useWorkspace.getState().resolveProposal('calendar.delete', 'approved');
    expect(useWorkspace.getState().calendarEvents.map((item) => item.id)).toEqual(['other-event']);
    expect(useWorkspace.getState().pendingProposals[0].status).toBe('approved');
  });

  it('keeps rejected events and reminders', () => {
    useWorkspace.getState().resolveProposal('calendar.delete', 'rejected');
    useWorkspace.getState().resolveProposal('task.delete', 'rejected');
    expect(useWorkspace.getState().calendarEvents).toHaveLength(2);
    expect(useWorkspace.getState().tasks).toHaveLength(2);
  });

  it('does not delete an item changed since the proposal or an unknown ID', () => {
    useWorkspace.getState().updateEvent({ ...event, title: 'Cambio posterior' });
    useWorkspace.getState().resolveProposal('calendar.delete', 'approved');
    useWorkspace.getState().updateProposal('task.delete', { payload: { taskId: 'invented' } });
    useWorkspace.getState().resolveProposal('task.delete', 'approved');
    expect(useWorkspace.getState().calendarEvents).toHaveLength(2);
    expect(useWorkspace.getState().tasks).toHaveLength(2);
    expect(useWorkspace.getState().pendingProposals.every((item) => item.status === 'pending')).toBe(true);
  });
});

describe('unanswered chat message removal', () => {
  beforeEach(() => useWorkspace.setState({ ...structuredClone(seedWorkspace) }));
  it('preserves answered history and replays the same removal on another device', () => {
    const store = useWorkspace.getState(); const id = store.createChatSession('global');
    store.appendChatMessage(id, { id: 'answered-user', role: 'user', content: 'Anterior', createdAt: 1 });
    store.appendChatMessage(id, { id: 'answer', role: 'assistant', content: 'Respuesta', createdAt: 2 });
    store.appendChatMessage(id, { id: 'retry-target', role: 'user', content: 'Revisa todo', createdAt: 3 });
    store.appendChatMessage(id, { id: 'discard', role: 'user', content: 'dale', createdAt: 4 });
    const original = useWorkspace.getState().chatThreads[id];
    expect(store.removeUnansweredChatMessages(id, ['answered-user'])).toBe(false);
    expect(store.removeUnansweredChatMessages(id, ['answer', 'discard'])).toBe(false);
    expect(store.removeUnansweredChatMessages(id, ['discard'])).toBe(true);
    expect(useWorkspace.getState().chatThreads[id].map((message) => message.id)).toEqual(['answered-user', 'answer', 'retry-target']);
    useWorkspace.setState({ chatThreads: { [id]: original } });
    store.applyRemote({ kind: 'chat.messages.remove', threadId: id, messageIds: ['discard'], source: 'other-device', timestamp: 5, opId: 'removal' });
    expect(useWorkspace.getState().chatThreads[id].map((message) => message.id)).toEqual(['answered-user', 'answer', 'retry-target']);
  });
});
