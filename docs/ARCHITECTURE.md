# NoteHub architecture

## Stack

The MVP uses React, TypeScript, Vite, Zustand, and IndexedDB (`idb-keyval`). This is a small client stack with a fast feedback loop and no required backend. Lucide supplies a consistent icon system. The canvas uses DOM blocks and an SVG ink overlay, which preserves native rich text and accessibility while allowing spatial composition.

## Boundaries

- `store/useWorkspace.ts` is the single mutation boundary for workspace data. UI components do not write persistence or synchronization state directly.
- `sync/syncEngine.ts` defines granular operations (`block.upsert`, `block.remove`, `stroke.add`, `stroke.clear`). The current adapter synchronizes browser tabs with `BroadcastChannel`; a WebSocket/CRDT adapter can implement the same operation boundary.
- `ai/provider.ts` isolates provider-specific completion logic. The UI only consumes `AIProvider`, structured context items, responses, and change proposals.
- `lib/storage.ts` owns durable local storage. Notes that are not active are represented in state today; the interface can move to per-note lazy loading without component changes.

## Canvas and performance

World-space coordinates are independent of camera translation and zoom. Pointer coordinates are converted back to world space before blocks or strokes are updated. Only blocks and ink bounds intersecting the viewport plus a 400-world-unit preload margin are rendered.

Ink is stored as independent strokes with pressure values and precalculated bounds. That supports spatial culling now and future chunked storage, simplification, and tile indexing. For very large workspaces, the next step is an R-tree index plus per-note IndexedDB records rather than a single snapshot.

## Persistence and synchronization

Local mutations are optimistically applied, debounced into IndexedDB, and published as small sync operations. Cross-tab synchronization is functional. Multi-device sync should add:

1. authentication and encrypted workspace keys;
2. an operation log over WebSockets;
3. CRDT ordering/conflict resolution (Yjs is a good candidate for text; block geometry can use last-write-wins timestamps);
4. offline operation replay and server acknowledgements;
5. blob storage for images, separate from document operations.

## AI safety and providers

AI is optional. `AIProvider` adapters can support OpenAI, Anthropic, Gemini, or local inference. Production API keys should be stored by a server-side credential broker or in a platform-backed encrypted vault. They must not be bundled as `VITE_*` variables.

Workspace writes should be modeled as typed proposals. The demo already queues proposals and presents one approval at a time. A production executor should validate permissions, show a diff, apply an atomic command after approval, and retain an audit trail.

## Python execution

The code block UI is ready for an execution adapter. Recommended implementations:

- Pyodide in a Web Worker for private, offline-friendly scientific Python;
- a sandboxed remote kernel for packages, networking, or longer jobs.

Both should implement the same future `PythonRuntime` interface and return structured text, table, image, or error outputs.

## Near-term roadmap

1. Split persistence into note manifests, block records, stroke chunks, and blob records.
2. Add undo/redo command history and multi-block selection marquee.
3. Add Yjs-backed collaboration and authenticated relay service.
4. Connect one production AI provider through a secure server route.
5. Add folder-context editing, global search, calendar/tasks, and the structured gym domain.
6. Add Pyodide worker execution and rich output blocks.
7. Add accessibility passes, export/import, and end-to-end browser tests.
