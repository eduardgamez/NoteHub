import { isDemoRoutine, isDemoWorkout } from '../gym/demoData';
import { deletionSnapshotMatches, deletionSnapshotHasId } from '../ai/deletionProposal';
import { create } from 'zustand';
import { seedWorkspace } from '../data/seed';
import { loadWorkspace, preserveWorkspace, scheduleSave } from '../lib/storage';
import { syncEngine, type SyncOperation } from '../sync/syncEngine';
import { cloudSync } from '../sync/cloudSync';
import { makeBlock } from '../lib/blockFactory';
import { applyLayout, insertInLayout, layoutOf, moveInLayout } from '../lib/blockLayout';
import { ensureTitleBlock, titleFromBlock } from '../lib/noteTitle';
import { isStarterWorkspace } from '../lib/starterWorkspace';
import { updateAIProfile, migrateAIProfileText, profileSummary, validProfileUpdates } from '../ai/personalProfile';
import type {
  AITextSelection, AppView, CalendarEvent, CanvasBlock, ChatMessageRecord, ChatSession, Exercise, Folder, FolderContext, InkStroke,
  Note, PendingProposal, ProfileField, ProfileUpdate, Project, Routine, Task, ToolMode, Workout, WorkspaceStateData,
} from '../types';

interface WorkspaceStore extends WorkspaceStateData {
  hydrated: boolean;
  activeView: AppView;
  activeProjectId: string;
  selectedIds: string[];
  activeBlockId: string | null;
  tool: ToolMode;
  inkWidth: number;
  inkColor: string;
  aiOpen: boolean;
  aiTextSelection: AITextSelection | null;
  sidebarOpen: boolean;
  history: Record<string, Note[]>;
  future: Record<string, Note[]>;
  setActiveNote: (id: string) => void;
  openProject: (id: string) => void;
  addProject: (project: Project) => void;
  updateProject: (project: Project) => void;
  removeProject: (id: string) => void;
  addFolder: (folder: Folder) => void;
  updateFolder: (folder: Folder) => void;
  duplicateFolder: (id: string) => void;
  removeFolder: (id: string) => void;
  addNote: (note: Note) => void;
  renameNote: (id: string, title: string) => void;
  duplicateNote: (id: string) => void;
  removeNote: (id: string) => void;
  setActiveView: (view: AppView) => void;
  setTool: (tool: ToolMode) => void;
  setInkWidth: (width: number) => void;
  setInkColor: (color: string) => void;
  setAiOpen: (open: boolean) => void;
  setAiTextSelection: (selection: AITextSelection | null) => void;
  setSidebarOpen: (open: boolean) => void;
  selectBlock: (id: string, additive?: boolean) => void;
  setActiveBlockId: (id: string | null) => void;
  clearSelection: () => void;
  checkpoint: (noteId: string) => void;
  undo: (noteId: string) => void;
  redo: (noteId: string) => void;
  upsertBlock: (noteId: string, block: CanvasBlock, broadcast?: boolean, recordHistory?: boolean) => void;
  insertBlockAfter: (noteId: string, block: CanvasBlock, afterBlockId?: string | null, broadcast?: boolean, recordHistory?: boolean) => void;
  reorderBlock: (noteId: string, blockId: string, targetId: string, before: boolean, side?: boolean, broadcast?: boolean, recordHistory?: boolean, row?: boolean) => void;
  removeSelectedBlocks: () => void;
  copySelectedBlocks: () => void;
  pasteBlocks: () => void;
  addStroke: (noteId: string, stroke: InkStroke, broadcast?: boolean, recordHistory?: boolean) => void;
  moveStrokes: (noteId: string, strokeIds: string[], dx: number, dy: number, broadcast?: boolean, recordHistory?: boolean) => void;
  removeStroke: (noteId: string, strokeId: string, broadcast?: boolean) => void;
  clearStrokes: (noteId: string, broadcast?: boolean) => void;
  setContextItem: (projectId: string, item: FolderContext) => void;
  removeContextItem: (projectId: string, itemId: string) => void;
  setFolderContextItem: (folderId: string, item: FolderContext) => void;
  removeFolderContextItem: (folderId: string, itemId: string) => void;
  addEvent: (event: CalendarEvent) => void;
  updateEvent: (event: CalendarEvent) => void;
  removeEvent: (id: string) => void;
  addTask: (task: Task) => void;
  updateTask: (task: Task) => void;
  removeTask: (id: string) => void;
  toggleTask: (id: string) => void;
  toggleTaskItem: (taskId: string, itemId: string) => void;
  addWorkout: (workout: Workout) => void;
  updateWorkout: (workout: Workout) => void;
  addExercise: (exercise: Exercise) => void;
  upsertRoutine: (routine: Routine) => void;
  removeRoutine: (id: string) => void;
  removeWorkout: (id: string) => void;
  removeUnansweredChatMessages: (threadId: string, messageIds: string[]) => boolean;
  appendChatMessage: (threadId: string, message: ChatMessageRecord) => void;
  createChatSession: (scope: string) => string;
  selectChatSession: (scope: string, sessionId: string) => void;
  deleteChatSession: (sessionId: string) => void;
  setChatSessionModel: (sessionId: string, model: string) => void;
  readProfileForChat: (sessionId: string) => string;
  setProfileField: (field: ProfileField | 'notes', value: string) => void;
  applyProfileUpdates: (updates: ProfileUpdate[]) => void;
  enqueueProposals: (proposals: PendingProposal[]) => void;
  updateProposal: (id: string, changes: Partial<Pick<PendingProposal, 'title' | 'description' | 'before' | 'after' | 'payload'>>) => void;
  resolveProposal: (id: string, resolution: 'approved' | 'rejected') => void;
  hydrate: () => Promise<void>;
  finishSyncRecovery: () => void;
  applyRemote: (operation: SyncOperation, rememberOnly?: boolean, force?: boolean) => void;
}

let blockClipboard: CanvasBlock[] = [];
const escapedTitle = (title: string) => title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function folderTreeIds(folders: Folder[], rootId: string) {
  const ids = new Set([rootId]);
  let size = 0;
  while (size !== ids.size) {
    size = ids.size;
    folders.forEach((folder) => { if (folder.parentId && ids.has(folder.parentId)) ids.add(folder.id); });
  }
  return ids;
}

function copiedNote(note: Note, title = note.title, folderId = note.folderId): Note {
  const ids = new Map(note.blocks.map((block) => [block.id, crypto.randomUUID()]));
  return {
    ...structuredClone(note), id: crypto.randomUUID(), title, folderId, updatedAt: Date.now(),
    blocks: note.blocks.map((block) => ({ ...structuredClone(block), id: ids.get(block.id)!, layoutGroupId: block.layoutGroupId ? ids.get(block.layoutGroupId) ?? block.layoutGroupId : undefined, layoutColumnId: block.layoutColumnId ? ids.get(block.layoutColumnId) ?? block.layoutColumnId : undefined, content: block.isTitle ? `<h1>${escapedTitle(title)}</h1>` : block.content })),
    strokes: note.strokes.map((stroke) => ({ ...structuredClone(stroke), id: crypto.randomUUID(), anchorBlockId: stroke.anchorBlockId ? ids.get(stroke.anchorBlockId) : undefined })),
  };
}
const demoEventIds = new Set(['cal-lecture', 'cal-gym', 'cal-study', 'cal-architecture']);
const demoTaskIds = new Set(['task-io', 'reminder-leaving', 'task-review']);
const demoTemplateIds = new Set(['template-university']);

export const workspaceDataFrom = (state: WorkspaceStore): WorkspaceStateData => ({
  version: state.version,
  syncReceipts: state.syncReceipts,
  syncHistoryReady: state.syncHistoryReady,
  syncUserId: state.syncUserId,
  projects: state.projects,
  folders: state.folders,
  notes: state.notes,
  activeNoteId: state.activeNoteId,
  calendarEvents: state.calendarEvents,
  tasks: state.tasks,
  reminderTemplates: state.reminderTemplates,
  exercises: state.exercises,
  routines: state.routines,
  workouts: state.workouts,
  chatThreads: state.chatThreads,
  chatSessions: state.chatSessions,
  activeChatIds: state.activeChatIds,
  pendingProposals: state.pendingProposals,
  personalProfile: state.personalProfile,
});

function persist(state: WorkspaceStore) { scheduleSave(workspaceDataFrom(state)); }

function migrate(stored: Partial<WorkspaceStateData>): WorkspaceStateData {
  const chatThreads = stored.chatThreads ?? {};
  const chatSessions = { ...(stored.chatSessions ?? {}) };
  const sourceProfile = stored.personalProfile ?? seedWorkspace.personalProfile;
  const personalProfile = {
    ...sourceProfile,
    answers: Object.fromEntries(Object.entries(sourceProfile.answers ?? {}).map(([field, value]) => [field, migrateAIProfileText(value)])),
    notes: migrateAIProfileText(sourceProfile.notes ?? ''),
  };
  if (JSON.stringify(personalProfile) !== JSON.stringify(sourceProfile)) {
    for (const [id, session] of Object.entries(chatSessions)) {
      chatSessions[id] = { ...session, profileSummary: undefined, profileReadAt: undefined };
    }
  }
  for (const [id, messages] of Object.entries(chatThreads)) {
    if (!messages.length || chatSessions[id]) continue;
    const first = messages[0];
    chatSessions[id] = {
      id, scope: id === 'global' ? 'global' : id.startsWith('project:') ? id : 'global',
      title: messages.find((message) => message.role === 'user')?.content.slice(0, 60) ?? 'Chat',
      createdAt: first.createdAt, updatedAt: messages.at(-1)?.createdAt ?? first.createdAt,
    };
  }
  const activeChatIds = { ...(stored.activeChatIds ?? {}) };
  for (const scope of new Set(Object.values(chatSessions).map((session) => session.scope))) {
    if (chatSessions[activeChatIds[scope]]?.scope === scope) continue;
    activeChatIds[scope] = Object.values(chatSessions).filter((session) => session.scope === scope).sort((a, b) => b.updatedAt - a.updatedAt)[0].id;
  }
  return {
    ...seedWorkspace,
    ...stored,
    version: 3,
    projects: stored.projects ?? seedWorkspace.projects,
    folders: stored.folders ?? seedWorkspace.folders,
    notes: Object.fromEntries(Object.entries(stored.notes ?? seedWorkspace.notes).map(([id, note]) => [id, ensureTitleBlock({ ...note, strokes: note.strokes ?? [], blocks: note.blocks ?? [] })])),
    calendarEvents: (stored.calendarEvents ?? seedWorkspace.calendarEvents).filter((event) => !demoEventIds.has(event.id)),
    tasks: (stored.tasks ?? seedWorkspace.tasks).filter((task) => !demoTaskIds.has(task.id)),
    reminderTemplates: (stored.reminderTemplates ?? seedWorkspace.reminderTemplates).filter((template) => !demoTemplateIds.has(template.id)),
    exercises: stored.exercises ?? seedWorkspace.exercises,
    routines: (stored.routines ?? seedWorkspace.routines).filter((routine) => !isDemoRoutine(routine)),
    workouts: (stored.workouts ?? seedWorkspace.workouts).filter((workout) => !isDemoWorkout(workout)),
    chatThreads,
    chatSessions,
    activeChatIds,
    pendingProposals: stored.pendingProposals ?? [],
    personalProfile,
  };
}

function withCheckpoint(state: WorkspaceStore, noteId: string) {
  return {
    history: { ...state.history, [noteId]: [...(state.history[noteId] ?? []).slice(-49), structuredClone(state.notes[noteId])] },
    future: { ...state.future, [noteId]: [] },
  };
}

export const useWorkspace = create<WorkspaceStore>((set, get) => ({
  ...seedWorkspace,
  notes: Object.fromEntries(Object.entries(seedWorkspace.notes).map(([id, note]) => [id, ensureTitleBlock(note)])),
  hydrated: false,
  activeView: 'calendar',
  activeProjectId: seedWorkspace.notes[seedWorkspace.activeNoteId].projectId,
  selectedIds: [],
  activeBlockId: null,
  tool: 'select',
  inkWidth: 2.5,
  inkColor: '#4d8f80',
  aiOpen: false,
  aiTextSelection: null,
  sidebarOpen: true,
  history: {},
  future: {},

  setActiveNote(id) {
    const note = get().notes[id];
    if (!note) return;
    set({ activeNoteId: id, activeProjectId: note.projectId, activeView: 'note', sidebarOpen: window.innerWidth > 820, selectedIds: [], activeBlockId: null, aiTextSelection: null });
    persist(get());
  },
  openProject(id) {
    if (id === 'gym') { set({ activeProjectId: id, activeView: 'gym', selectedIds: [], activeBlockId: null, aiTextSelection: null }); return; }
    const first = Object.values(get().notes).find((note) => note.projectId === id);
    set({ activeProjectId: id, activeNoteId: first?.id ?? get().activeNoteId, activeView: first ? 'note' : 'project', aiOpen: window.innerWidth > 820, sidebarOpen: window.innerWidth > 820, selectedIds: [], activeBlockId: null, aiTextSelection: null });
  },
  addProject(project) { set((state) => ({ projects: [...state.projects, project] })); persist(get()); syncEngine.publish({ kind: 'project.upsert', project }); },
  updateProject(project) { set((state) => ({ projects: state.projects.map((item) => item.id === project.id ? project : item) })); persist(get()); syncEngine.publish({ kind: 'project.upsert', project }); },
  removeProject(id) {
    if (id === 'gym') return;
    set((state) => {
      const notes = Object.fromEntries(Object.entries(state.notes).filter(([, note]) => note.projectId !== id));
      return { projects: state.projects.filter((project) => project.id !== id), folders: state.folders.filter((folder) => folder.projectId !== id), notes, activeNoteId: notes[state.activeNoteId] ? state.activeNoteId : Object.keys(notes)[0] ?? '', activeView: state.activeProjectId === id ? 'calendar' : state.activeView, activeProjectId: state.activeProjectId === id ? '' : state.activeProjectId };
    });
    persist(get()); syncEngine.publish({ kind: 'project.remove', projectId: id });
  },
  addFolder(folder) { set((state) => ({ folders: [...state.folders, folder] })); persist(get()); syncEngine.publish({ kind: 'folder.upsert', folder }); },
  updateFolder(folder) { set((state) => ({ folders: state.folders.map((item) => item.id === folder.id ? folder : item) })); persist(get()); syncEngine.publish({ kind: 'folder.upsert', folder }); },
  duplicateFolder(id) {
    const state = get();
    const original = state.folders.find((folder) => folder.id === id);
    if (!original) return;
    const descendants = folderTreeIds(state.folders, id);
    const sourceFolders = state.folders.filter((folder) => descendants.has(folder.id));
    const ids = new Map(sourceFolders.map((folder) => [folder.id, crypto.randomUUID()]));
    const copies = sourceFolders.map((folder) => ({ ...structuredClone(folder), id: ids.get(folder.id)!, title: folder.id === id ? `${folder.title} copy` : folder.title, parentId: folder.id === id ? folder.parentId : ids.get(folder.parentId!) }));
    const noteCopies = Object.values(state.notes).filter((note) => note.folderId && descendants.has(note.folderId)).map((note) => copiedNote(note, note.title, ids.get(note.folderId!)));
    set((current) => ({ folders: [...current.folders, ...copies], notes: { ...current.notes, ...Object.fromEntries(noteCopies.map((note) => [note.id, note])) } }));
    persist(get());
    copies.forEach((folder) => syncEngine.publish({ kind: 'folder.upsert', folder }));
    noteCopies.forEach((note) => syncEngine.publish({ kind: 'note.upsert', note }));
  },
  removeFolder(id) {
    const state = get();
    if (!state.folders.some((folder) => folder.id === id)) return;
    const ids = folderTreeIds(state.folders, id);
    set((current) => {
      const notes = Object.fromEntries(Object.entries(current.notes).filter(([, note]) => !note.folderId || !ids.has(note.folderId)));
      const activeRemoved = !notes[current.activeNoteId];
      const nextNote = Object.values(notes).find((note) => note.projectId === current.activeProjectId);
      return { folders: current.folders.filter((folder) => !ids.has(folder.id)), notes, activeNoteId: activeRemoved ? nextNote?.id ?? '' : current.activeNoteId, activeView: activeRemoved && current.activeView === 'note' ? nextNote ? 'note' : 'project' : current.activeView, selectedIds: activeRemoved ? [] : current.selectedIds, activeBlockId: activeRemoved ? null : current.activeBlockId };
    });
    persist(get()); syncEngine.publish({ kind: 'folder.remove', folderId: id });
  },
  addNote(note) { const titledNote = ensureTitleBlock(note); set((state) => ({ notes: { ...state.notes, [note.id]: titledNote }, activeNoteId: note.id, activeProjectId: note.projectId, activeView: 'note', sidebarOpen: window.innerWidth > 820, selectedIds: [], activeBlockId: null, aiTextSelection: null })); persist(get()); syncEngine.publish({ kind: 'note.upsert', note: titledNote }); },
  renameNote(id, title) {
    const note = get().notes[id];
    if (!note || !title.trim()) return;
    const renamed = { ...note, title: title.trim(), updatedAt: Date.now(), blocks: note.blocks.map((block) => block.isTitle ? { ...block, content: `<h1>${escapedTitle(title.trim())}</h1>` } : block) };
    set((state) => ({ notes: { ...state.notes, [id]: renamed } }));
    persist(get()); syncEngine.publish({ kind: 'note.upsert', note: renamed });
  },
  duplicateNote(id) { const note = get().notes[id]; if (note) get().addNote(copiedNote(note, `${note.title} copy`)); },
  removeNote(id) {
    if (!get().notes[id]) return;
    set((state) => {
      const notes = { ...state.notes }; delete notes[id];
      const activeRemoved = state.activeNoteId === id;
      const nextNote = Object.values(notes).find((note) => note.projectId === state.activeProjectId);
      return { notes, activeNoteId: activeRemoved ? nextNote?.id ?? '' : state.activeNoteId, activeView: activeRemoved && state.activeView === 'note' ? nextNote ? 'note' : 'project' : state.activeView, selectedIds: activeRemoved ? [] : state.selectedIds, activeBlockId: activeRemoved ? null : state.activeBlockId };
    });
    persist(get()); syncEngine.publish({ kind: 'note.remove', noteId: id });
  },
  setActiveView(activeView) { set((state) => ({ activeView, selectedIds: [], activeBlockId: null, aiTextSelection: activeView === 'note' ? state.aiTextSelection : null })); },
  setTool(tool) { set({ tool }); },
  setInkWidth(inkWidth) { set({ inkWidth }); },
  setInkColor(inkColor) { set({ inkColor }); },
  setAiOpen(aiOpen) { set({ aiOpen, ...(aiOpen && window.innerWidth <= 820 ? { sidebarOpen: false } : {}) }); },
  setAiTextSelection(aiTextSelection) { set({ aiTextSelection }); },
  setSidebarOpen(sidebarOpen) { set({ sidebarOpen, ...(sidebarOpen && window.innerWidth <= 820 ? { aiOpen: false } : {}) }); },
  selectBlock(id, additive = false) {
    set((state) => ({ selectedIds: additive ? (state.selectedIds.includes(id) ? state.selectedIds.filter((item) => item !== id) : [...state.selectedIds, id]) : [id] }));
  },
  setActiveBlockId(activeBlockId) { set({ activeBlockId }); },
  clearSelection() { set({ selectedIds: [], activeBlockId: null }); },
  checkpoint(noteId) { set((state) => withCheckpoint(state, noteId)); },
  undo(noteId) {
    const state = get();
    const stack = state.history[noteId] ?? [];
    const previous = stack.at(-1);
    if (!previous) return;
    set({
      notes: { ...state.notes, [noteId]: previous },
      history: { ...state.history, [noteId]: stack.slice(0, -1) },
      future: { ...state.future, [noteId]: [...(state.future[noteId] ?? []), structuredClone(state.notes[noteId])] },
      selectedIds: [], activeBlockId: null,
    });
    persist(get());
    // Other devices must show the same restored document.
    syncEngine.publish({ kind: 'note.upsert', note: previous });
  },
  redo(noteId) {
    const state = get();
    const stack = state.future[noteId] ?? [];
    const next = stack.at(-1);
    if (!next) return;
    set({
      notes: { ...state.notes, [noteId]: next },
      future: { ...state.future, [noteId]: stack.slice(0, -1) },
      history: { ...state.history, [noteId]: [...(state.history[noteId] ?? []), structuredClone(state.notes[noteId])] },
      selectedIds: [], activeBlockId: null,
    });
    persist(get());
    syncEngine.publish({ kind: 'note.upsert', note: next });
  },
  upsertBlock(noteId, block, broadcast = true, recordHistory = true) {
    set((state) => {
      const note = state.notes[noteId];
      const exists = note.blocks.some((item) => item.id === block.id);
      // Editing a block never moves it: rows and columns change only through
      // insertBlockAfter/reorderBlock, so a stale copy cannot undo a move.
      const blocks = exists ? note.blocks.map((item) => item.id === block.id ? { ...block, layoutGroupId: item.layoutGroupId, layoutColumnId: item.layoutColumnId } : item) : [...note.blocks, block];
      return {
        ...(recordHistory ? withCheckpoint(state, noteId) : {}),
        notes: { ...state.notes, [noteId]: { ...note, title: block.isTitle ? titleFromBlock(block.content) : note.title, blocks, updatedAt: Date.now() } },
      };
    });
    persist(get());
    if (broadcast) syncEngine.publish({ kind: 'block.upsert', noteId, block });
  },
  insertBlockAfter(noteId, block, afterBlockId, broadcast = true, recordHistory = true) {
    const note = get().notes[noteId];
    if (!note || note.blocks.some((item) => item.id === block.id)) return;
    const blocks = insertInLayout(note.blocks, block, afterBlockId);
    set((state) => ({
      ...(recordHistory ? withCheckpoint(state, noteId) : {}),
      notes: { ...state.notes, [noteId]: { ...state.notes[noteId], blocks, updatedAt: Date.now() } },
    }));
    persist(get());
    if (broadcast) syncEngine.publish({ kind: 'block.upsert', noteId, block, ...(afterBlockId ? { afterBlockId } : {}) });
  },
  reorderBlock(noteId, blockId, targetId, before, side = false, broadcast = true, recordHistory = true, row = false) {
    const note = get().notes[noteId];
    if (!note) return;
    const next = moveInLayout(note.blocks, blockId, targetId, before, side, row);
    if (next === note.blocks || next.every((item, index) => item.id === note.blocks[index].id && (item.layoutGroupId ?? item.id) === (note.blocks[index].layoutGroupId ?? note.blocks[index].id) && (item.layoutColumnId ?? item.id) === (note.blocks[index].layoutColumnId ?? note.blocks[index].id))) return;
    set((state) => ({
      ...(recordHistory ? withCheckpoint(state, noteId) : {}),
      notes: { ...state.notes, [noteId]: { ...state.notes[noteId], blocks: next, updatedAt: Date.now() } },
    }));
    persist(get());
    // The resulting layout travels with the move, so every device ends up with
    // exactly these rows and columns even if its copy had drifted.
    if (broadcast) syncEngine.publish({ kind: 'block.reorder', noteId, blockId, targetId, before, side, row, layout: layoutOf(next) });
  },
  removeSelectedBlocks() {
    const { activeNoteId, selectedIds } = get();
    const removableIds = selectedIds.filter((id) => !get().notes[activeNoteId]?.blocks.find((block) => block.id === id)?.isTitle);
    if (!removableIds.length) return;
    set((state) => ({
      ...withCheckpoint(state, activeNoteId), selectedIds: [], activeBlockId: removableIds.includes(state.activeBlockId ?? '') ? null : state.activeBlockId,
      notes: { ...state.notes, [activeNoteId]: { ...state.notes[activeNoteId], blocks: state.notes[activeNoteId].blocks.filter((block) => !removableIds.includes(block.id)), updatedAt: Date.now() } },
    }));
    removableIds.forEach((blockId) => syncEngine.publish({ kind: 'block.remove', noteId: activeNoteId, blockId }));
    persist(get());
  },
  copySelectedBlocks() {
    const { notes, activeNoteId, selectedIds } = get();
    blockClipboard = notes[activeNoteId].blocks.filter((block) => selectedIds.includes(block.id)).map((block) => structuredClone(block));
  },
  pasteBlocks() {
    if (!blockClipboard.length) return;
    const { activeNoteId } = get();
    get().checkpoint(activeNoteId);
    const ids = new Map(blockClipboard.map((block) => [block.id, crypto.randomUUID()]));
    const groups = new Map<string, string>();
    const columns = new Map<string, string>();
    const copies = blockClipboard.map((block) => {
      const oldGroup = block.layoutGroupId ?? block.id;
      const oldColumn = `${oldGroup}:${block.layoutColumnId ?? block.id}`;
      if (!groups.has(oldGroup)) groups.set(oldGroup, crypto.randomUUID());
      if (!columns.has(oldColumn)) columns.set(oldColumn, crypto.randomUUID());
      return { ...structuredClone(block), id: ids.get(block.id)!, layoutGroupId: groups.get(oldGroup), layoutColumnId: columns.get(oldColumn), isTitle: false, x: block.x + 32, y: block.y + 32 };
    });
    copies.forEach((block) => get().upsertBlock(activeNoteId, block, true, false));
    set({ selectedIds: copies.map((block) => block.id) });
    blockClipboard = copies;
  },
  addStroke(noteId, stroke, broadcast = true, recordHistory = true) {
    set((state) => ({
      ...(recordHistory ? withCheckpoint(state, noteId) : {}),
      notes: { ...state.notes, [noteId]: { ...state.notes[noteId], strokes: [...state.notes[noteId].strokes, stroke], updatedAt: Date.now() } },
    }));
    persist(get());
    if (broadcast) syncEngine.publish({ kind: 'stroke.add', noteId, stroke });
  },
  moveStrokes(noteId, strokeIds, dx, dy, broadcast = true, recordHistory = true) {
    if (!strokeIds.length || (!dx && !dy)) return;
    const selected = new Set(strokeIds);
    set((state) => ({
      ...(recordHistory ? withCheckpoint(state, noteId) : {}),
      notes: { ...state.notes, [noteId]: { ...state.notes[noteId], strokes: state.notes[noteId].strokes.map((stroke) => selected.has(stroke.id) ? {
        ...stroke,
        points: stroke.points.map((point) => ({ ...point, x: point.x + dx, y: point.y + dy })),
        bounds: { ...stroke.bounds, x: stroke.bounds.x + dx, y: stroke.bounds.y + dy },
      } : stroke), updatedAt: Date.now() } },
    }));
    persist(get());
    if (broadcast) syncEngine.publish({ kind: 'stroke.move', noteId, strokeIds, dx, dy });
  },
  removeStroke(noteId, strokeId, broadcast = true) {
    set((state) => ({
      ...withCheckpoint(state, noteId),
      notes: { ...state.notes, [noteId]: { ...state.notes[noteId], strokes: state.notes[noteId].strokes.filter((stroke) => stroke.id !== strokeId), updatedAt: Date.now() } },
    }));
    persist(get());
    if (broadcast) syncEngine.publish({ kind: 'stroke.remove', noteId, strokeId });
  },
  clearStrokes(noteId, broadcast = true) {
    set((state) => ({
      ...withCheckpoint(state, noteId),
      notes: { ...state.notes, [noteId]: { ...state.notes[noteId], strokes: [], updatedAt: Date.now() } },
    }));
    persist(get());
    if (broadcast) syncEngine.publish({ kind: 'stroke.clear', noteId });
  },
  setContextItem(projectId, item) {
    set((state) => ({ projects: state.projects.map((project) => project.id === projectId ? { ...project, context: project.context.some((entry) => entry.id === item.id) ? project.context.map((entry) => entry.id === item.id ? item : entry) : [...project.context, item] } : project) }));
    persist(get());
    syncEngine.publish({ kind: 'context.upsert', projectId, item });
  },
  removeContextItem(projectId, itemId) {
    set((state) => ({ projects: state.projects.map((project) => project.id === projectId ? { ...project, context: project.context.filter((item) => item.id !== itemId) } : project) }));
    persist(get());
    syncEngine.publish({ kind: 'context.remove', projectId, itemId });
  },
  setFolderContextItem(folderId, item) {
    set((state) => ({ folders: state.folders.map((folder) => folder.id === folderId ? { ...folder, context: folder.context.some((entry) => entry.id === item.id) ? folder.context.map((entry) => entry.id === item.id ? item : entry) : [...folder.context, item] } : folder) }));
    persist(get());
    syncEngine.publish({ kind: 'folder-context.upsert', folderId, item });
  },
  removeFolderContextItem(folderId, itemId) {
    set((state) => ({ folders: state.folders.map((folder) => folder.id === folderId ? { ...folder, context: folder.context.filter((item) => item.id !== itemId) } : folder) }));
    persist(get());
    syncEngine.publish({ kind: 'folder-context.remove', folderId, itemId });
  },
  addEvent(event) { set((state) => ({ calendarEvents: [...state.calendarEvents, event] })); persist(get()); syncEngine.publish({ kind: 'event.upsert', event }); },
  updateEvent(event) { set((state) => ({ calendarEvents: state.calendarEvents.map((item) => item.id === event.id ? event : item) })); persist(get()); syncEngine.publish({ kind: 'event.upsert', event }); },
  removeEvent(id) { set((state) => ({ calendarEvents: state.calendarEvents.filter((event) => event.id !== id) })); persist(get()); syncEngine.publish({ kind: 'event.remove', eventId: id }); },
  addTask(task) { set((state) => ({ tasks: [...state.tasks, task] })); persist(get()); syncEngine.publish({ kind: 'task.upsert', task }); },
  updateTask(task) { set((state) => ({ tasks: state.tasks.map((item) => item.id === task.id ? task : item) })); persist(get()); syncEngine.publish({ kind: 'task.upsert', task }); },
  removeTask(id) { set((state) => ({ tasks: state.tasks.filter((item) => item.id !== id) })); persist(get()); syncEngine.publish({ kind: 'task.remove', taskId: id }); },
  toggleTask(id) { set((state) => ({ tasks: state.tasks.map((task) => task.id === id ? { ...task, done: !task.done } : task) })); persist(get()); const task = get().tasks.find((item) => item.id === id); if (task) syncEngine.publish({ kind: 'task.upsert', task }); },
  toggleTaskItem(taskId, itemId) { set((state) => ({ tasks: state.tasks.map((task) => task.id === taskId ? { ...task, checklist: task.checklist.map((item) => item.id === itemId ? { ...item, done: !item.done } : item) } : task) })); persist(get()); const task = get().tasks.find((item) => item.id === taskId); if (task) syncEngine.publish({ kind: 'task.upsert', task }); },
  addWorkout(workout) { set((state) => ({ workouts: [...state.workouts, workout] })); persist(get()); syncEngine.publish({ kind: 'workout.upsert', workout }); },
  updateWorkout(workout) { set((state) => ({ workouts: state.workouts.map((item) => item.id === workout.id ? workout : item) })); persist(get()); syncEngine.publish({ kind: 'workout.upsert', workout }); },
  upsertRoutine(routine) { set((state) => ({ routines: state.routines.some((item) => item.id === routine.id) ? state.routines.map((item) => item.id === routine.id ? routine : item) : [...state.routines, routine] })); persist(get()); syncEngine.publish({ kind: 'routine.upsert', routine }); },
  removeRoutine(id) { set((state) => ({ routines: state.routines.filter((item) => item.id !== id) })); persist(get()); syncEngine.publish({ kind: 'routine.remove', routineId: id }); },
  removeWorkout(id) { set((state) => ({ workouts: state.workouts.filter((item) => item.id !== id) })); persist(get()); syncEngine.publish({ kind: 'workout.remove', workoutId: id }); },
  addExercise(exercise) { set((state) => ({ exercises: [...state.exercises, exercise] })); persist(get()); syncEngine.publish({ kind: 'exercise.upsert', exercise }); },
  createChatSession(scope) {
    const id = crypto.randomUUID();
    const now = Date.now();
    const session: ChatSession = { id, scope, title: 'New chat', createdAt: now, updatedAt: now };
    set((state) => ({ chatSessions: { ...state.chatSessions, [id]: session }, activeChatIds: { ...state.activeChatIds, [scope]: id } }));
    persist(get()); syncEngine.publish({ kind: 'chat.session.upsert', session });
    return id;
  },
  selectChatSession(scope, sessionId) {
    if (get().chatSessions[sessionId]?.scope !== scope) return;
    set((state) => ({ activeChatIds: { ...state.activeChatIds, [scope]: sessionId } }));
    persist(get());
  },
  deleteChatSession(sessionId) {
    const session = get().chatSessions[sessionId];
    if (!session) return;
    set((state) => {
      const chatSessions = { ...state.chatSessions };
      const chatThreads = { ...state.chatThreads };
      delete chatSessions[sessionId];
      delete chatThreads[sessionId];
      const activeChatIds = { ...state.activeChatIds };
      if (activeChatIds[session.scope] === sessionId) {
        delete activeChatIds[session.scope];
      }
      return { chatSessions, chatThreads, activeChatIds, pendingProposals: state.pendingProposals.filter((proposal) => proposal.threadId !== sessionId) };
    });
    persist(get()); syncEngine.publish({ kind: 'chat.session.remove', sessionId });
  },
  setChatSessionModel(sessionId, model) {
    const session = get().chatSessions[sessionId];
    if (!session || session.model === model) return;
    const updated = { ...session, model };
    set((state) => ({ chatSessions: { ...state.chatSessions, [sessionId]: updated } }));
    persist(get()); syncEngine.publish({ kind: 'chat.session.upsert', session: updated });
  },
  readProfileForChat(sessionId) {
    const state = get();
    const session = state.chatSessions[sessionId];
    if (!session) return '';
    if (session.profileSummary !== undefined && session.profileReadAt === state.personalProfile.updatedAt) return session.profileSummary;
    const summary = profileSummary(state.personalProfile);
    const updated = { ...session, profileSummary: summary, profileReadAt: state.personalProfile.updatedAt };
    set((current) => ({ chatSessions: { ...current.chatSessions, [sessionId]: updated } }));
    persist(get()); syncEngine.publish({ kind: 'chat.session.upsert', session: updated });
    return summary;
  },
  setProfileField(field, value) {
    set((state) => ({ personalProfile: field === 'notes'
      ? { ...state.personalProfile, notes: value, updatedAt: Math.max(Date.now(), state.personalProfile.updatedAt + 1) }
      : { ...state.personalProfile, answers: { ...state.personalProfile.answers, [field]: value }, updatedAt: Math.max(Date.now(), state.personalProfile.updatedAt + 1) } }));
    persist(get()); syncEngine.publish({ kind: 'profile.upsert', profile: get().personalProfile });
  },
  applyProfileUpdates(updates) {
    const accepted = validProfileUpdates(updates);
    if (!accepted.length) return;
    const previous = get().personalProfile;
    set((state) => {
      const profile = updateAIProfile(state.personalProfile, accepted);
      const changed = JSON.stringify(profile) !== JSON.stringify(state.personalProfile);
      return changed ? { personalProfile: { ...profile, updatedAt: Math.max(Date.now(), state.personalProfile.updatedAt + 1) } } : state;
    });
    if (get().personalProfile === previous) return;
    persist(get()); syncEngine.publish({ kind: 'profile.upsert', profile: get().personalProfile });
  },
  removeUnansweredChatMessages(threadId, messageIds) {
    const messages = get().chatThreads[threadId] ?? [];
    const lastAnswer = messages.reduce((last, message, index) => message.role === 'assistant' ? index : last, -1);
    const ids = new Set(messageIds);
    if (!ids.size || [...ids].some((id) => !messages.some((message, index) => message.id === id && message.role === 'user' && index > lastAnswer))) return false;
    set((state) => ({ chatThreads: { ...state.chatThreads, [threadId]: messages.filter((message) => !ids.has(message.id)) } }));
    persist(get()); syncEngine.publish({ kind: 'chat.messages.remove', threadId, messageIds: [...ids] });
    return true;
  },
  appendChatMessage(threadId, message) {
    const session = get().chatSessions[threadId];
    if (!session) return;
    const updated = { ...session, title: message.role === 'user' && session.title === 'New chat' ? message.content.trim().slice(0, 60) || 'New chat' : session.title, updatedAt: message.createdAt };
    set((state) => ({ chatThreads: { ...state.chatThreads, [threadId]: [...(state.chatThreads[threadId] ?? []), message] }, chatSessions: { ...state.chatSessions, [threadId]: updated } }));
    persist(get());
    syncEngine.publish({ kind: 'chat.session.upsert', session: updated });
    syncEngine.publish({ kind: 'chat.message', threadId, message });
  },
  enqueueProposals(proposals) { set((state) => ({ pendingProposals: [...state.pendingProposals, ...proposals] })); persist(get()); proposals.forEach((proposal) => syncEngine.publish({ kind: 'proposal.upsert', proposal })); },
  updateProposal(id, changes) { set((state) => ({ pendingProposals: state.pendingProposals.map((item) => item.id === id ? { ...item, ...changes } : item) })); persist(get()); const proposal = get().pendingProposals.find((item) => item.id === id); if (proposal) syncEngine.publish({ kind: 'proposal.upsert', proposal }); },
  resolveProposal(id, resolution) {
    const proposal = get().pendingProposals.find((item) => item.id === id);
    if (!proposal || proposal.status !== 'pending') return;
    if (resolution === 'approved') {
      if (proposal.kind === 'context.update') {
        const { projectId, fieldId, label, value } = proposal.payload;
        if (typeof projectId === 'string' && typeof label === 'string' && typeof value === 'string') get().setContextItem(projectId, { id: typeof fieldId === 'string' ? fieldId : crypto.randomUUID(), label, value });
      }
      if (proposal.kind === 'calendar.delete' || proposal.kind === 'task.delete') {
        const event = proposal.kind === 'calendar.delete';
        const targetId = event ? proposal.payload.eventId : proposal.payload.taskId;
        const target = event ? get().calendarEvents.find((item) => item.id === targetId) : get().tasks.find((item) => item.id === targetId);
        if (typeof targetId !== 'string') return;
        if (!target) {
          // The requested deletion has already happened; finish this proposal without touching another item.
          if (!deletionSnapshotHasId(proposal.payload.expected, targetId)) return;
        } else {
          if (typeof proposal.payload.expected === 'string' && !deletionSnapshotMatches(proposal.payload.expected, target)) return;
          if (event) get().removeEvent(targetId); else get().removeTask(targetId);
        }
      }
      if (proposal.kind === 'calendar.create') {
        const { title, start, end, projectId } = proposal.payload;
        if (typeof title === 'string' && typeof start === 'string' && typeof end === 'string') get().addEvent({ id: crypto.randomUUID(), title, start, end, projectId: typeof projectId === 'string' ? projectId : undefined, color: 'green' });
      }
      if (proposal.kind === 'task.create') {
        const { title, due, projectId, reminder, checklist } = proposal.payload;
        if (typeof title === 'string' && title.trim()) get().addTask({ id: crypto.randomUUID(), title: title.trim(), done: false, due: typeof due === 'string' ? due : undefined, projectId: typeof projectId === 'string' ? projectId : undefined, reminder: reminder === true, checklist: Array.isArray(checklist) ? checklist.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map((text) => ({ id: crypto.randomUUID(), text: text.trim(), done: false })) : [] });
      }
      if (proposal.kind === 'file.update') {
        const { noteId, blockId, content } = proposal.payload;
        if (typeof noteId === 'string' && typeof blockId === 'string' && typeof content === 'string') {
          const block = get().notes[noteId]?.blocks.find((item) => item.id === blockId);
          if (block) get().upsertBlock(noteId, { ...block, content });
        }
      }
      if (proposal.kind === 'file.block.create') {
        const { noteId, content } = proposal.payload;
        if (typeof noteId === 'string' && typeof content === 'string' && content.trim() && get().notes[noteId]) {
          const note = get().notes[noteId];
          const lastBlock = note.blocks.at(-1);
          get().upsertBlock(noteId, { ...makeBlock('text', lastBlock?.x ?? 120, lastBlock ? lastBlock.y + lastBlock.height + 30 : 100), content });
        }
      }
      if (proposal.kind === 'file.block.delete') {
        const { noteId, blockId } = proposal.payload;
        if (typeof noteId === 'string' && typeof blockId === 'string' && get().notes[noteId]?.blocks.some((item) => item.id === blockId && !item.isTitle)) {
          const removedStrokes = get().notes[noteId].strokes.filter((stroke) => stroke.anchorBlockId === blockId);
          set((state) => {
            const note = state.notes[noteId];
            return {
              ...withCheckpoint(state, noteId),
              selectedIds: state.activeNoteId === noteId ? state.selectedIds.filter((selectedId) => selectedId !== blockId) : state.selectedIds,
              activeBlockId: state.activeNoteId === noteId && state.activeBlockId === blockId ? null : state.activeBlockId,
              notes: { ...state.notes, [noteId]: { ...note, blocks: note.blocks.filter((item) => item.id !== blockId), strokes: note.strokes.filter((stroke) => stroke.anchorBlockId !== blockId), updatedAt: Date.now() } },
            };
          });
          syncEngine.publish({ kind: 'block.remove', noteId, blockId });
          removedStrokes.forEach((stroke) => syncEngine.publish({ kind: 'stroke.remove', noteId, strokeId: stroke.id }));
        }
      }
      if (proposal.kind === 'file.create') {
        const { projectId, folderId, title, content } = proposal.payload;
        if (typeof projectId === 'string' && projectId !== 'gym' && get().projects.some((project) => project.id === projectId) && typeof title === 'string' && title.trim() && typeof content === 'string') {
          const validFolder = typeof folderId === 'string' && get().folders.some((folder) => folder.id === folderId && folder.projectId === projectId) ? folderId : undefined;
          get().addNote({ id: crypto.randomUUID(), title: title.trim(), emoji: '◇', projectId, folderId: validFolder, updatedAt: Date.now(), blocks: content.trim() ? [{ ...makeBlock('text', 120, 100), content }] : [], strokes: [] });
        }
      }
    }
    set((state) => ({ pendingProposals: state.pendingProposals.map((item) => item.id === id ? { ...item, status: resolution } : item) }));
    persist(get());
    const resolved = get().pendingProposals.find((item) => item.id === id); if (resolved) syncEngine.publish({ kind: 'proposal.upsert', proposal: resolved });
  },
  async hydrate() {
    try {
      const stored = await loadWorkspace();
      if (stored) await preserveWorkspace(stored).catch(() => {});
      const remote = await cloudSync.loadSnapshot().catch(() => null);
      const userId = await cloudSync.sessionUserId().catch(() => undefined);
      const localData = stored && (!userId || !stored.syncUserId || stored.syncUserId === userId) ? migrate(stored) : null;
      const remoteData = remote ? migrate(remote) : null;
      const keepLocal = Boolean(localData && !isStarterWorkspace(localData));
      const data = keepLocal ? localData! : remoteData ?? localData ?? { ...seedWorkspace, notes: Object.fromEntries(Object.entries(seedWorkspace.notes).map(([id, note]) => [id, ensureTitleBlock(note)])) };
      set({ ...data, activeChatIds: {}, syncUserId: userId ?? data.syncUserId, activeProjectId: data.notes[data.activeNoteId]?.projectId ?? data.projects[0]?.id ?? '', hydrated: true });
      const source = stored ?? remote;
      const hadDemoItems = Boolean(source?.calendarEvents?.some((event) => demoEventIds.has(event.id))
        || source?.tasks?.some((task) => demoTaskIds.has(task.id))
        || source?.reminderTemplates?.some((template) => demoTemplateIds.has(template.id))
        || source?.routines?.some(isDemoRoutine) || source?.workouts?.some(isDemoWorkout));
      if (!remote || keepLocal || hadDemoItems) persist(get());
    } catch { set({ hydrated: true }); }
  },
  finishSyncRecovery() { set({ syncHistoryReady: true }); persist(get()); },
  applyRemote(operation, rememberOnly = false, force = false) {
    const known = get().syncReceipts?.includes(operation.opId);
    if (known && !force) return;
    if (!known) set((state) => ({ syncReceipts: [...(state.syncReceipts ?? []), operation.opId] }));
    if (rememberOnly) { persist(get()); return; }
    if (operation.kind === 'profile.upsert' && operation.profile.updatedAt >= get().personalProfile.updatedAt) set({ personalProfile: {
      ...operation.profile,
      answers: Object.fromEntries(Object.entries(operation.profile.answers).map(([field, value]) => [field, migrateAIProfileText(value)])),
      notes: migrateAIProfileText(operation.profile.notes),
    } });
    if (operation.kind === 'project.upsert') set((state) => ({ projects: state.projects.some((item) => item.id === operation.project.id) ? state.projects.map((item) => item.id === operation.project.id ? operation.project : item) : [...state.projects, operation.project] }));
    if (operation.kind === 'project.remove') set((state) => {
      const notes = Object.fromEntries(Object.entries(state.notes).filter(([, note]) => note.projectId !== operation.projectId));
      return { projects: state.projects.filter((project) => project.id !== operation.projectId), folders: state.folders.filter((folder) => folder.projectId !== operation.projectId), notes, activeNoteId: notes[state.activeNoteId] ? state.activeNoteId : Object.keys(notes)[0] ?? '', activeView: state.activeProjectId === operation.projectId ? 'calendar' : state.activeView, activeProjectId: state.activeProjectId === operation.projectId ? '' : state.activeProjectId };
    });
    if (operation.kind === 'folder.upsert') set((state) => ({ folders: state.folders.some((folder) => folder.id === operation.folder.id) ? state.folders.map((folder) => folder.id === operation.folder.id ? operation.folder : folder) : [...state.folders, operation.folder] }));
    if (operation.kind === 'folder.remove') set((state) => {
      const ids = folderTreeIds(state.folders, operation.folderId);
      const notes = Object.fromEntries(Object.entries(state.notes).filter(([, note]) => !note.folderId || !ids.has(note.folderId)));
      const activeRemoved = !notes[state.activeNoteId];
      const nextNote = Object.values(notes).find((note) => note.projectId === state.activeProjectId);
      return { folders: state.folders.filter((folder) => !ids.has(folder.id)), notes, activeNoteId: activeRemoved ? nextNote?.id ?? '' : state.activeNoteId, activeView: activeRemoved && state.activeView === 'note' ? nextNote ? 'note' : 'project' : state.activeView, selectedIds: activeRemoved ? [] : state.selectedIds, activeBlockId: activeRemoved ? null : state.activeBlockId };
    });
    if (operation.kind === 'note.upsert') set((state) => ({ notes: { ...state.notes, [operation.note.id]: ensureTitleBlock(operation.note) } }));
    if (operation.kind === 'note.remove') set((state) => {
      const notes = { ...state.notes }; delete notes[operation.noteId];
      const activeRemoved = state.activeNoteId === operation.noteId;
      const nextNote = Object.values(notes).find((note) => note.projectId === state.activeProjectId);
      return { notes, activeNoteId: activeRemoved ? nextNote?.id ?? '' : state.activeNoteId, activeView: activeRemoved && state.activeView === 'note' ? nextNote ? 'note' : 'project' : state.activeView, selectedIds: activeRemoved ? [] : state.selectedIds, activeBlockId: activeRemoved ? null : state.activeBlockId };
    });
    if (operation.kind === 'block.upsert') {
      const note = get().notes[operation.noteId];
      if (note?.blocks.some((block) => block.id === operation.block.id)) get().upsertBlock(operation.noteId, operation.block, false, false);
      else get().insertBlockAfter(operation.noteId, operation.block, operation.afterBlockId, false, false);
    }
    if (operation.kind === 'block.reorder' && operation.layout) set((state) => state.notes[operation.noteId] ? { notes: { ...state.notes, [operation.noteId]: { ...state.notes[operation.noteId], blocks: applyLayout(state.notes[operation.noteId].blocks, operation.layout!), updatedAt: Date.now() } } } : state);
    else if (operation.kind === 'block.reorder') get().reorderBlock(operation.noteId, operation.blockId, operation.targetId, operation.before, operation.side, false, false, operation.row);
    if (operation.kind === 'stroke.add') get().addStroke(operation.noteId, operation.stroke, false, false);
    if (operation.kind === 'stroke.move') get().moveStrokes(operation.noteId, operation.strokeIds, operation.dx, operation.dy, false, false);
    if (operation.kind === 'stroke.clear') set((state) => ({ notes: { ...state.notes, [operation.noteId]: { ...state.notes[operation.noteId], strokes: [] } } }));
    if (operation.kind === 'stroke.remove') set((state) => ({ notes: { ...state.notes, [operation.noteId]: { ...state.notes[operation.noteId], strokes: state.notes[operation.noteId].strokes.filter((stroke) => stroke.id !== operation.strokeId) } } }));
    if (operation.kind === 'block.remove') set((state) => ({ activeBlockId: state.activeNoteId === operation.noteId && state.activeBlockId === operation.blockId ? null : state.activeBlockId, notes: { ...state.notes, [operation.noteId]: { ...state.notes[operation.noteId], blocks: state.notes[operation.noteId].blocks.filter((block) => block.id !== operation.blockId) } } }));
    if (operation.kind === 'context.upsert') set((state) => ({ projects: state.projects.map((project) => project.id === operation.projectId ? { ...project, context: project.context.some((item) => item.id === operation.item.id) ? project.context.map((item) => item.id === operation.item.id ? operation.item : item) : [...project.context, operation.item] } : project) }));
    if (operation.kind === 'context.remove') set((state) => ({ projects: state.projects.map((project) => project.id === operation.projectId ? { ...project, context: project.context.filter((item) => item.id !== operation.itemId) } : project) }));
    if (operation.kind === 'folder-context.upsert') set((state) => ({ folders: state.folders.map((folder) => folder.id === operation.folderId ? { ...folder, context: folder.context.some((item) => item.id === operation.item.id) ? folder.context.map((item) => item.id === operation.item.id ? operation.item : item) : [...folder.context, operation.item] } : folder) }));
    if (operation.kind === 'folder-context.remove') set((state) => ({ folders: state.folders.map((folder) => folder.id === operation.folderId ? { ...folder, context: folder.context.filter((item) => item.id !== operation.itemId) } : folder) }));
    if (operation.kind === 'event.upsert' && !demoEventIds.has(operation.event.id)) set((state) => ({ calendarEvents: state.calendarEvents.some((item) => item.id === operation.event.id) ? state.calendarEvents.map((item) => item.id === operation.event.id ? operation.event : item) : [...state.calendarEvents, operation.event] }));
    if (operation.kind === 'event.remove') set((state) => ({ calendarEvents: state.calendarEvents.filter((event) => event.id !== operation.eventId) }));
    if (operation.kind === 'task.upsert' && !demoTaskIds.has(operation.task.id)) set((state) => ({ tasks: state.tasks.some((item) => item.id === operation.task.id) ? state.tasks.map((item) => item.id === operation.task.id ? operation.task : item) : [...state.tasks, operation.task] }));
    if (operation.kind === 'task.remove') set((state) => ({ tasks: state.tasks.filter((item) => item.id !== operation.taskId) }));
    if (operation.kind === 'routine.upsert' && !isDemoRoutine(operation.routine)) set((state) => ({ routines: state.routines.some((item) => item.id === operation.routine.id) ? state.routines.map((item) => item.id === operation.routine.id ? operation.routine : item) : [...state.routines, operation.routine] }));
    if (operation.kind === 'routine.remove') set((state) => ({ routines: state.routines.filter((item) => item.id !== operation.routineId) }));
    if (operation.kind === 'workout.remove') set((state) => ({ workouts: state.workouts.filter((item) => item.id !== operation.workoutId) }));
    if (operation.kind === 'workout.upsert' && !isDemoWorkout(operation.workout)) set((state) => ({ workouts: state.workouts.some((item) => item.id === operation.workout.id) ? state.workouts.map((item) => item.id === operation.workout.id ? operation.workout : item) : [...state.workouts, operation.workout] }));
    if (operation.kind === 'exercise.upsert') set((state) => ({ exercises: state.exercises.some((item) => item.id === operation.exercise.id) ? state.exercises.map((item) => item.id === operation.exercise.id ? operation.exercise : item) : [...state.exercises, operation.exercise] }));
    if (operation.kind === 'chat.session.upsert') set((state) => ({ chatSessions: { ...state.chatSessions, [operation.session.id]: operation.session } }));
    if (operation.kind === 'chat.session.remove') set((state) => {
      const chatSessions = { ...state.chatSessions }, chatThreads = { ...state.chatThreads }, activeChatIds = { ...state.activeChatIds };
      const scope = chatSessions[operation.sessionId]?.scope;
      delete chatSessions[operation.sessionId]; delete chatThreads[operation.sessionId];
      if (scope && activeChatIds[scope] === operation.sessionId) delete activeChatIds[scope];
      return { chatSessions, chatThreads, activeChatIds, pendingProposals: state.pendingProposals.filter((proposal) => proposal.threadId !== operation.sessionId) };
    });
    if (operation.kind === 'chat.messages.remove') set((state) => ({ chatThreads: { ...state.chatThreads, [operation.threadId]: (state.chatThreads[operation.threadId] ?? []).filter((message) => !operation.messageIds.includes(message.id)) } }));
    if (operation.kind === 'chat.message') set((state) => state.chatSessions[operation.threadId] ? ({ chatThreads: { ...state.chatThreads, [operation.threadId]: (state.chatThreads[operation.threadId] ?? []).some((message) => message.id === operation.message.id) ? state.chatThreads[operation.threadId] : [...(state.chatThreads[operation.threadId] ?? []), operation.message] } }) : state);
    if (operation.kind === 'proposal.upsert') set((state) => ({ pendingProposals: state.pendingProposals.some((item) => item.id === operation.proposal.id) ? state.pendingProposals.map((item) => item.id === operation.proposal.id ? operation.proposal : item) : [...state.pendingProposals, operation.proposal] }));
    // Undo now syncs, so it must not restore a copy that predates another
    // device's change to this document and erase that change everywhere.
    const changedNote = 'noteId' in operation ? operation.noteId : operation.kind === 'note.upsert' ? operation.note.id : undefined;
    if (changedNote && (get().history[changedNote] || get().future[changedNote])) set((state) => {
      const history = { ...state.history }, future = { ...state.future };
      delete history[changedNote]; delete future[changedNote];
      return { history, future };
    });
    persist(get());
  },
}));
