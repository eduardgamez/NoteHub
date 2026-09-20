import type { CalendarEvent, CanvasBlock, ChatMessageRecord, Exercise, FolderContext, InkStroke, Note, PendingProposal, Project, Task, Workout, WorkspaceStateData } from '../types';
import { cloudSync } from './cloudSync';

export type SyncPayload =
  | { kind: 'project.upsert'; project: Project }
  | { kind: 'note.upsert'; note: Note }
  | { kind: 'block.upsert'; noteId: string; block: CanvasBlock }
  | { kind: 'block.remove'; noteId: string; blockId: string }
  | { kind: 'stroke.add'; noteId: string; stroke: InkStroke }
  | { kind: 'stroke.remove'; noteId: string; strokeId: string }
  | { kind: 'stroke.clear'; noteId: string }
  | { kind: 'context.upsert'; projectId: string; item: FolderContext }
  | { kind: 'context.remove'; projectId: string; itemId: string }
  | { kind: 'folder-context.upsert'; folderId: string; item: FolderContext }
  | { kind: 'folder-context.remove'; folderId: string; itemId: string }
  | { kind: 'event.upsert'; event: CalendarEvent }
  | { kind: 'event.remove'; eventId: string }
  | { kind: 'task.upsert'; task: Task }
  | { kind: 'workout.upsert'; workout: Workout }
  | { kind: 'exercise.upsert'; exercise: Exercise }
  | { kind: 'chat.message'; threadId: string; message: ChatMessageRecord }
  | { kind: 'proposal.upsert'; proposal: PendingProposal };

export type SyncOperation = SyncPayload & { source: string; timestamp: number; opId: string };
const source = crypto.randomUUID();
const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('notehub-sync-v2');
const seen = new Set<string>();
const listeners = new Set<(operation: SyncOperation) => void>();
let remoteStarted = false;

function deliver(operation: SyncOperation) {
  if (operation.source === source || seen.has(operation.opId)) return;
  seen.add(operation.opId);
  if (seen.size > 4000) seen.delete(seen.values().next().value!);
  listeners.forEach((listener) => listener(operation));
}

channel?.addEventListener('message', (event: MessageEvent<SyncOperation>) => deliver(event.data));

export const syncEngine = {
  source,
  publish(payload: SyncPayload) {
    const operation = { ...payload, source, timestamp: Date.now(), opId: crypto.randomUUID() } as SyncOperation;
    seen.add(operation.opId);
    channel?.postMessage(operation);
    void cloudSync.publish(operation);
  },
  subscribe(listener: (operation: SyncOperation) => void, getSnapshot?: () => WorkspaceStateData) {
    listeners.add(listener);
    if (!remoteStarted) { remoteStarted = true; void cloudSync.start(deliver, getSnapshot); }
    return () => { listeners.delete(listener); };
  },
};
