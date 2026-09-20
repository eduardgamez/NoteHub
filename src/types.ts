export type BlockType = 'text' | 'code' | 'image' | 'checklist' | 'table' | 'list' | 'drawing';

export interface Point { x: number; y: number; pressure?: number }

export interface InkStroke {
  id: string;
  color: string;
  width: number;
  points: Point[];
  bounds: { x: number; y: number; width: number; height: number };
}

export interface CanvasBlock {
  id: string;
  type: BlockType;
  x: number;
  y: number;
  width: number;
  height: number;
  content: string;
  language?: string;
  caption?: string;
  execution?: CodeExecution;
}

export interface CodeExecution {
  status: 'idle' | 'loading' | 'running' | 'success' | 'error';
  stdout?: string;
  result?: string;
  html?: string;
  image?: string;
  error?: string;
  durationMs?: number;
}

export interface Note {
  id: string;
  title: string;
  emoji: string;
  projectId: string;
  folderId?: string;
  updatedAt: number;
  blocks: CanvasBlock[];
  strokes: InkStroke[];
}

export interface Folder {
  id: string;
  projectId: string;
  parentId?: string;
  title: string;
  emoji?: string;
  context: FolderContext[];
}

export interface FolderContext {
  id: string;
  label: string;
  value: string;
}

export interface Project {
  id: string;
  title: string;
  emoji: string;
  context: FolderContext[];
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  color: 'green' | 'purple' | 'amber' | 'blue';
  projectId?: string;
  notes?: string;
}

export interface ChecklistEntry { id: string; text: string; done: boolean }

export interface Task {
  id: string;
  title: string;
  done: boolean;
  due?: string;
  projectId?: string;
  reminder?: boolean;
  checklist: ChecklistEntry[];
}

export interface ReminderTemplate {
  id: string;
  title: string;
  items: string[];
}

export interface Exercise {
  id: string;
  name: string;
  category: string;
  equipment: string;
  notes?: string;
}

export interface RoutineExercise { exerciseId: string; targetSets: number; repRange: string }
export interface Routine { id: string; name: string; exercises: RoutineExercise[] }
export interface WorkoutSet { id: string; reps: number; weight: number; rir?: number; completed: boolean; metrics?: Record<string, number> }
export interface WorkoutExerciseLog { exerciseId: string; sets: WorkoutSet[]; notes?: string }
export interface Workout {
  id: string;
  routineId?: string;
  title: string;
  startedAt: string;
  endedAt?: string;
  notes?: string;
  exercises: WorkoutExerciseLog[];
}

export interface ChatMessageRecord { id: string; role: 'user' | 'assistant'; content: string; createdAt: number }
export type ProposalKind = 'context.update' | 'calendar.create' | 'task.create' | 'file.update';
export interface PendingProposal {
  id: string;
  threadId: string;
  kind: ProposalKind;
  title: string;
  description: string;
  before?: string;
  after: string;
  payload: Record<string, unknown>;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: number;
}

export type AppView = 'note' | 'calendar' | 'tasks' | 'gym' | 'inbox' | 'settings' | 'context';

export interface WorkspaceStateData {
  version: number;
  projects: Project[];
  folders: Folder[];
  notes: Record<string, Note>;
  activeNoteId: string;
  calendarEvents: CalendarEvent[];
  tasks: Task[];
  reminderTemplates: ReminderTemplate[];
  exercises: Exercise[];
  routines: Routine[];
  workouts: Workout[];
  chatThreads: Record<string, ChatMessageRecord[]>;
  pendingProposals: PendingProposal[];
}

export type ToolMode = 'select' | 'pan' | 'ink' | 'eraser';
