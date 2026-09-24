import { create } from 'zustand';
import { seedWorkspace } from '../data/seed';
import { loadWorkspace, scheduleSave } from '../lib/storage';
import { syncEngine, type SyncOperation } from '../sync/syncEngine';
import { cloudSync } from '../sync/cloudSync';
import type {
  AppView, CalendarEvent, CanvasBlock, ChatMessageRecord, Exercise, FolderContext, InkStroke,
  Note, PendingProposal, Project, Task, ToolMode, Workout, WorkspaceStateData,
} from '../types';

interface WorkspaceStore extends WorkspaceStateData {
  hydrated: boolean;
  activeView: AppView;
  selectedIds: string[];
  tool: ToolMode;
  inkWidth: number;
  aiOpen: boolean;
  sidebarOpen: boolean;
  history: Record<string, Note[]>;
  future: Record<string, Note[]>;
  setActiveNote: (id: string) => void;
  addProject: (project: Project) => void;
  addNote: (note: Note) => void;
  setActiveView: (view: AppView) => void;
  setTool: (tool: ToolMode) => void;
  setInkWidth: (width: number) => void;
  setAiOpen: (open: boolean) => void;
  setSidebarOpen: (open: boolean) => void;
  selectBlock: (id: string, additive?: boolean) => void;
  clearSelection: () => void;
  checkpoint: (noteId: string) => void;
  undo: (noteId: string) => void;
  redo: (noteId: string) => void;
  upsertBlock: (noteId: string, block: CanvasBlock, broadcast?: boolean, recordHistory?: boolean) => void;
  removeSelectedBlocks: () => void;
  copySelectedBlocks: () => void;
  pasteBlocks: () => void;
  addStroke: (noteId: string, stroke: InkStroke, broadcast?: boolean, recordHistory?: boolean) => void;
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
  appendChatMessage: (threadId: string, message: ChatMessageRecord) => void;
  enqueueProposals: (proposals: PendingProposal[]) => void;
  updateProposal: (id: string, changes: Partial<Pick<PendingProposal, 'title' | 'description' | 'after' | 'payload'>>) => void;
  resolveProposal: (id: string, resolution: 'approved' | 'rejected') => void;
  hydrate: () => Promise<void>;
  applyRemote: (operation: SyncOperation) => void;
}

let blockClipboard: CanvasBlock[] = [];

export const workspaceDataFrom = (state: WorkspaceStore): WorkspaceStateData => ({
  version: state.version,
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
  pendingProposals: state.pendingProposals,
});

function persist(state: WorkspaceStore) { scheduleSave(workspaceDataFrom(state)); }

function migrate(stored: Partial<WorkspaceStateData>): WorkspaceStateData {
  return {
    ...seedWorkspace,
    ...stored,
    version: 2,
    projects: stored.projects ?? seedWorkspace.projects,
    folders: stored.folders ?? seedWorkspace.folders,
    notes: Object.fromEntries(Object.entries(stored.notes ?? seedWorkspace.notes).map(([id, note]) => [id, { ...note, strokes: note.strokes ?? [], blocks: note.blocks ?? [] }])),
    calendarEvents: stored.calendarEvents ?? seedWorkspace.calendarEvents,
    tasks: stored.tasks ?? seedWorkspace.tasks,
    reminderTemplates: stored.reminderTemplates ?? seedWorkspace.reminderTemplates,
    exercises: stored.exercises ?? seedWorkspace.exercises,
    routines: stored.routines ?? seedWorkspace.routines,
    workouts: stored.workouts ?? seedWorkspace.workouts,
    chatThreads: stored.chatThreads ?? {},
    pendingProposals: stored.pendingProposals ?? [],
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
  hydrated: false,
  activeView: 'calendar',
  selectedIds: [],
  tool: 'select',
  inkWidth: 2.5,
  aiOpen: false,
  sidebarOpen: true,
  history: {},
  future: {},

  setActiveNote(id) {
    set({ activeNoteId: id, activeView: 'note', selectedIds: [] });
    persist(get());
  },
  addProject(project) { set((state) => ({ projects: [...state.projects, project] })); persist(get()); syncEngine.publish({ kind: 'project.upsert', project }); },
  addNote(note) { set((state) => ({ notes: { ...state.notes, [note.id]: note }, activeNoteId: note.id, activeView: 'note' })); persist(get()); syncEngine.publish({ kind: 'note.upsert', note }); },
  setActiveView(activeView) { set({ activeView, selectedIds: [] }); },
  setTool(tool) { set({ tool }); },
  setInkWidth(inkWidth) { set({ inkWidth }); },
  setAiOpen(aiOpen) { set({ aiOpen }); },
  setSidebarOpen(sidebarOpen) { set({ sidebarOpen }); },
  selectBlock(id, additive = false) {
    set((state) => ({ selectedIds: additive ? (state.selectedIds.includes(id) ? state.selectedIds.filter((item) => item !== id) : [...state.selectedIds, id]) : [id] }));
  },
  clearSelection() { set({ selectedIds: [] }); },
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
      selectedIds: [],
    });
    persist(get());
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
      selectedIds: [],
    });
    persist(get());
  },
  upsertBlock(noteId, block, broadcast = true, recordHistory = true) {
    set((state) => {
      const note = state.notes[noteId];
      const exists = note.blocks.some((item) => item.id === block.id);
      const blocks = exists ? note.blocks.map((item) => item.id === block.id ? block : item) : [...note.blocks, block];
      return {
        ...(recordHistory ? withCheckpoint(state, noteId) : {}),
        notes: { ...state.notes, [noteId]: { ...note, blocks, updatedAt: Date.now() } },
      };
    });
    persist(get());
    if (broadcast) syncEngine.publish({ kind: 'block.upsert', noteId, block });
  },
  removeSelectedBlocks() {
    const { activeNoteId, selectedIds } = get();
    if (!selectedIds.length) return;
    set((state) => ({
      ...withCheckpoint(state, activeNoteId), selectedIds: [],
      notes: { ...state.notes, [activeNoteId]: { ...state.notes[activeNoteId], blocks: state.notes[activeNoteId].blocks.filter((block) => !selectedIds.includes(block.id)), updatedAt: Date.now() } },
    }));
    selectedIds.forEach((blockId) => syncEngine.publish({ kind: 'block.remove', noteId: activeNoteId, blockId }));
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
    const copies = blockClipboard.map((block) => ({ ...structuredClone(block), id: crypto.randomUUID(), x: block.x + 32, y: block.y + 32 }));
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
  addExercise(exercise) { set((state) => ({ exercises: [...state.exercises, exercise] })); persist(get()); syncEngine.publish({ kind: 'exercise.upsert', exercise }); },
  appendChatMessage(threadId, message) { set((state) => ({ chatThreads: { ...state.chatThreads, [threadId]: [...(state.chatThreads[threadId] ?? []), message] } })); persist(get()); syncEngine.publish({ kind: 'chat.message', threadId, message }); },
  enqueueProposals(proposals) { set((state) => ({ pendingProposals: [...state.pendingProposals, ...proposals] })); persist(get()); proposals.forEach((proposal) => syncEngine.publish({ kind: 'proposal.upsert', proposal })); },
  updateProposal(id, changes) { set((state) => ({ pendingProposals: state.pendingProposals.map((item) => item.id === id ? { ...item, ...changes } : item) })); persist(get()); const proposal = get().pendingProposals.find((item) => item.id === id); if (proposal) syncEngine.publish({ kind: 'proposal.upsert', proposal }); },
  resolveProposal(id, resolution) {
    const proposal = get().pendingProposals.find((item) => item.id === id);
    if (!proposal) return;
    if (resolution === 'approved') {
      if (proposal.kind === 'context.update') {
        const { projectId, fieldId, label, value } = proposal.payload;
        if (typeof projectId === 'string' && typeof label === 'string' && typeof value === 'string') get().setContextItem(projectId, { id: typeof fieldId === 'string' ? fieldId : crypto.randomUUID(), label, value });
      }
      if (proposal.kind === 'calendar.create') {
        const { title, start, end, projectId } = proposal.payload;
        if (typeof title === 'string' && typeof start === 'string' && typeof end === 'string') get().addEvent({ id: crypto.randomUUID(), title, start, end, projectId: typeof projectId === 'string' ? projectId : undefined, color: 'green' });
      }
      if (proposal.kind === 'task.create') {
        const { title, due, projectId } = proposal.payload;
        if (typeof title === 'string') get().addTask({ id: crypto.randomUUID(), title, done: false, due: typeof due === 'string' ? due : undefined, projectId: typeof projectId === 'string' ? projectId : undefined, checklist: [] });
      }
      if (proposal.kind === 'file.update') {
        const { noteId, blockId, content } = proposal.payload;
        if (typeof noteId === 'string' && typeof blockId === 'string' && typeof content === 'string') {
          const block = get().notes[noteId]?.blocks.find((item) => item.id === blockId);
          if (block) get().upsertBlock(noteId, { ...block, content });
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
      const remote = await cloudSync.loadSnapshot();
      const data = stored ? migrate(stored) : remote ? migrate(remote) : seedWorkspace;
      set({ ...data, hydrated: true });
      if (!remote) persist(get());
    } catch { set({ hydrated: true }); }
  },
  applyRemote(operation) {
    if (operation.kind === 'project.upsert') set((state) => ({ projects: state.projects.some((item) => item.id === operation.project.id) ? state.projects.map((item) => item.id === operation.project.id ? operation.project : item) : [...state.projects, operation.project] }));
    if (operation.kind === 'note.upsert') set((state) => ({ notes: { ...state.notes, [operation.note.id]: operation.note } }));
    if (operation.kind === 'block.upsert') get().upsertBlock(operation.noteId, operation.block, false, false);
    if (operation.kind === 'stroke.add') get().addStroke(operation.noteId, operation.stroke, false, false);
    if (operation.kind === 'stroke.clear') set((state) => ({ notes: { ...state.notes, [operation.noteId]: { ...state.notes[operation.noteId], strokes: [] } } }));
    if (operation.kind === 'stroke.remove') set((state) => ({ notes: { ...state.notes, [operation.noteId]: { ...state.notes[operation.noteId], strokes: state.notes[operation.noteId].strokes.filter((stroke) => stroke.id !== operation.strokeId) } } }));
    if (operation.kind === 'block.remove') set((state) => ({ notes: { ...state.notes, [operation.noteId]: { ...state.notes[operation.noteId], blocks: state.notes[operation.noteId].blocks.filter((block) => block.id !== operation.blockId) } } }));
    if (operation.kind === 'context.upsert') set((state) => ({ projects: state.projects.map((project) => project.id === operation.projectId ? { ...project, context: project.context.some((item) => item.id === operation.item.id) ? project.context.map((item) => item.id === operation.item.id ? operation.item : item) : [...project.context, operation.item] } : project) }));
    if (operation.kind === 'context.remove') set((state) => ({ projects: state.projects.map((project) => project.id === operation.projectId ? { ...project, context: project.context.filter((item) => item.id !== operation.itemId) } : project) }));
    if (operation.kind === 'folder-context.upsert') set((state) => ({ folders: state.folders.map((folder) => folder.id === operation.folderId ? { ...folder, context: folder.context.some((item) => item.id === operation.item.id) ? folder.context.map((item) => item.id === operation.item.id ? operation.item : item) : [...folder.context, operation.item] } : folder) }));
    if (operation.kind === 'folder-context.remove') set((state) => ({ folders: state.folders.map((folder) => folder.id === operation.folderId ? { ...folder, context: folder.context.filter((item) => item.id !== operation.itemId) } : folder) }));
    if (operation.kind === 'event.upsert') set((state) => ({ calendarEvents: state.calendarEvents.some((item) => item.id === operation.event.id) ? state.calendarEvents.map((item) => item.id === operation.event.id ? operation.event : item) : [...state.calendarEvents, operation.event] }));
    if (operation.kind === 'event.remove') set((state) => ({ calendarEvents: state.calendarEvents.filter((event) => event.id !== operation.eventId) }));
    if (operation.kind === 'task.upsert') set((state) => ({ tasks: state.tasks.some((item) => item.id === operation.task.id) ? state.tasks.map((item) => item.id === operation.task.id ? operation.task : item) : [...state.tasks, operation.task] }));
    if (operation.kind === 'task.remove') set((state) => ({ tasks: state.tasks.filter((item) => item.id !== operation.taskId) }));
    if (operation.kind === 'workout.upsert') set((state) => ({ workouts: state.workouts.some((item) => item.id === operation.workout.id) ? state.workouts.map((item) => item.id === operation.workout.id ? operation.workout : item) : [...state.workouts, operation.workout] }));
    if (operation.kind === 'exercise.upsert') set((state) => ({ exercises: state.exercises.some((item) => item.id === operation.exercise.id) ? state.exercises.map((item) => item.id === operation.exercise.id ? operation.exercise : item) : [...state.exercises, operation.exercise] }));
    if (operation.kind === 'chat.message') set((state) => ({ chatThreads: { ...state.chatThreads, [operation.threadId]: (state.chatThreads[operation.threadId] ?? []).some((message) => message.id === operation.message.id) ? state.chatThreads[operation.threadId] : [...(state.chatThreads[operation.threadId] ?? []), operation.message] } }));
    if (operation.kind === 'proposal.upsert') set((state) => ({ pendingProposals: state.pendingProposals.some((item) => item.id === operation.proposal.id) ? state.pendingProposals.map((item) => item.id === operation.proposal.id ? operation.proposal : item) : [...state.pendingProposals, operation.proposal] }));
    persist(get());
  },
}));
