import type { CanvasBlock, InkStroke } from '../types';

export type SyncOperation =
  | { kind: 'block.upsert'; noteId: string; block: CanvasBlock; source: string }
  | { kind: 'block.remove'; noteId: string; blockId: string; source: string }
  | { kind: 'stroke.add'; noteId: string; stroke: InkStroke; source: string }
  | { kind: 'stroke.clear'; noteId: string; source: string };

type OutgoingOperation = SyncOperation extends infer Operation
  ? Operation extends { source: string }
    ? Omit<Operation, 'source'>
    : never
  : never;

const source = crypto.randomUUID();
const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('notehub-sync-v1');

export const syncEngine = {
  source,
  publish(operation: OutgoingOperation) {
    channel?.postMessage({ ...operation, source });
  },
  subscribe(listener: (operation: SyncOperation) => void) {
    if (!channel) return () => undefined;
    const handler = (event: MessageEvent<SyncOperation>) => {
      if (event.data.source !== source) listener(event.data);
    };
    channel.addEventListener('message', handler);
    return () => channel.removeEventListener('message', handler);
  },
};
