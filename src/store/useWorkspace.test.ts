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

  it('adds an explicit AI fact and lets the user remove it', () => {
    const store = useWorkspace.getState();
    store.setProfileField('classes', 'Martes a las 10');
    store.applyProfileUpdates([{ field: 'classes', value: 'Lunes a las 9' }]);
    expect(useWorkspace.getState().personalProfile.answers.classes).toBe('Martes a las 10\n/Lunes a las 9/');
    store.setProfileField('classes', '');
    expect(useWorkspace.getState().personalProfile.answers.classes).toBe('');
  });
});
