import { create } from 'zustand';
import { seedWorkspace } from '../data/seed';
import { loadWorkspace, scheduleSave } from '../lib/storage';
import { syncEngine, type SyncOperation } from '../sync/syncEngine';
import type { CanvasBlock, InkStroke, ToolMode, WorkspaceStateData } from '../types';

interface WorkspaceStore extends WorkspaceStateData {
  hydrated: boolean;
  selectedIds: string[];
  tool: ToolMode;
  aiOpen: boolean;
  sidebarOpen: boolean;
  setActiveNote: (id: string) => void;
  setTool: (tool: ToolMode) => void;
  setAiOpen: (open: boolean) => void;
  setSidebarOpen: (open: boolean) => void;
  selectBlock: (id: string, additive?: boolean) => void;
  clearSelection: () => void;
  upsertBlock: (noteId: string, block: CanvasBlock, broadcast?: boolean) => void;
  removeSelectedBlocks: () => void;
  addStroke: (noteId: string, stroke: InkStroke, broadcast?: boolean) => void;
  clearStrokes: (noteId: string, broadcast?: boolean) => void;
  hydrate: () => Promise<void>;
  applyRemote: (operation: SyncOperation) => void;
}

function persist(state: WorkspaceStore) {
  scheduleSave({ projects: state.projects, notes: state.notes, activeNoteId: state.activeNoteId });
}

export const useWorkspace = create<WorkspaceStore>((set, get) => ({
  ...seedWorkspace,
  hydrated: false,
  selectedIds: [],
  tool: 'select',
  aiOpen: true,
  sidebarOpen: true,

  setActiveNote(id) {
    set({ activeNoteId: id, selectedIds: [] });
    persist(get());
  },
  setTool(tool) { set({ tool }); },
  setAiOpen(aiOpen) { set({ aiOpen }); },
  setSidebarOpen(sidebarOpen) { set({ sidebarOpen }); },
  selectBlock(id, additive = false) {
    set((state) => ({ selectedIds: additive ? (state.selectedIds.includes(id) ? state.selectedIds.filter((item) => item !== id) : [...state.selectedIds, id]) : [id] }));
  },
  clearSelection() { set({ selectedIds: [] }); },
  upsertBlock(noteId, block, broadcast = true) {
    set((state) => {
      const note = state.notes[noteId];
      const exists = note.blocks.some((item) => item.id === block.id);
      const blocks = exists ? note.blocks.map((item) => item.id === block.id ? block : item) : [...note.blocks, block];
      return { notes: { ...state.notes, [noteId]: { ...note, blocks, updatedAt: Date.now() } } };
    });
    persist(get());
    if (broadcast) syncEngine.publish({ kind: 'block.upsert', noteId, block });
  },
  removeSelectedBlocks() {
    const { activeNoteId, selectedIds } = get();
    if (!selectedIds.length) return;
    set((state) => ({
      selectedIds: [],
      notes: { ...state.notes, [activeNoteId]: { ...state.notes[activeNoteId], blocks: state.notes[activeNoteId].blocks.filter((block) => !selectedIds.includes(block.id)), updatedAt: Date.now() } },
    }));
    selectedIds.forEach((blockId) => syncEngine.publish({ kind: 'block.remove', noteId: activeNoteId, blockId }));
    persist(get());
  },
  addStroke(noteId, stroke, broadcast = true) {
    set((state) => ({ notes: { ...state.notes, [noteId]: { ...state.notes[noteId], strokes: [...state.notes[noteId].strokes, stroke], updatedAt: Date.now() } } }));
    persist(get());
    if (broadcast) syncEngine.publish({ kind: 'stroke.add', noteId, stroke });
  },
  clearStrokes(noteId, broadcast = true) {
    set((state) => ({ notes: { ...state.notes, [noteId]: { ...state.notes[noteId], strokes: [], updatedAt: Date.now() } } }));
    persist(get());
    if (broadcast) syncEngine.publish({ kind: 'stroke.clear', noteId });
  },
  async hydrate() {
    try {
      const stored = await loadWorkspace();
      if (stored) set({ ...stored, hydrated: true });
      else set({ hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },
  applyRemote(operation) {
    if (operation.kind === 'block.upsert') get().upsertBlock(operation.noteId, operation.block, false);
    if (operation.kind === 'stroke.add') get().addStroke(operation.noteId, operation.stroke, false);
    if (operation.kind === 'stroke.clear') get().clearStrokes(operation.noteId, false);
    if (operation.kind === 'block.remove') {
      set((state) => ({ notes: { ...state.notes, [operation.noteId]: { ...state.notes[operation.noteId], blocks: state.notes[operation.noteId].blocks.filter((block) => block.id !== operation.blockId) } } }));
      persist(get());
    }
  },
}));
