import { beforeEach, describe, expect, it, vi } from 'vitest';
import { seedWorkspace } from '../data/seed';
import { loadWorkspace } from '../lib/storage';
import { cloudSync } from '../sync/cloudSync';
import type { PendingProposal } from '../types';

vi.mock('../lib/storage', () => ({ loadWorkspace: vi.fn(), scheduleSave: vi.fn() }));
vi.mock('../sync/syncEngine', () => ({ syncEngine: { publish: vi.fn(), subscribe: vi.fn() } }));

import { useWorkspace } from './useWorkspace';

describe('workspace hydration across devices', () => {
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
