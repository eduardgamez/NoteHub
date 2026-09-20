# NoteHub architecture

## Runtime topology

NoteHub has three independently useful layers:

1. The React/Vite PWA owns interaction, optimistic state, IndexedDB storage, canvas rendering, and browser Python execution.
2. The small Express broker owns AI credentials and translates one provider-neutral request into OpenAI Responses, Anthropic Messages, or Gemini `generateContent` calls.
3. Optional Supabase Auth/Postgres/Realtime supplies identity, cloud snapshots, an append-only operation log, and multi-device delivery.

The PWA does not require either remote layer for normal local note, calendar, task, or workout use.

## Client boundaries

- `store/useWorkspace.ts` is the mutation boundary. It owns persistent domain state, note history, selection, view state, and application of remote operations.
- `lib/storage.ts` owns the debounced local snapshot. The persisted schema is versioned and older local data is migrated during hydration.
- `sync/syncEngine.ts` creates UUID-addressed operations, deduplicates delivery, and fans operations out to `BroadcastChannel` and the cloud adapter.
- `sync/cloudSync.ts` owns Supabase auth, historical replay, Realtime subscription, offline queueing, and snapshot bootstrapping.
- `ai/provider.ts` is the provider-neutral browser contract. Provider SDKs and secrets exist only in `server/index.ts`.
- `ai/retrieval.ts` ranks local notes and structured records, prioritizes current/selected material, and rasterizes selected ink when applicable. It sends a bounded context set rather than the workspace snapshot.
- `python/runtime.ts` communicates with `public/pyodide-worker.mjs`; this boundary can later be replaced by a sandboxed remote kernel.

Transient UI state (active view, canvas tool, selection, undo stacks) is not persisted. Product data, chats, pending proposals, and preferences are persistent; theme, provider choice, and AI permissions use localStorage while workspace data uses IndexedDB/Supabase.

## Canvas and ink

Blocks and strokes use world-space coordinates independent from the camera transform. Pointer coordinates are converted to world space before mutations. A tile-based spatial index queries the viewport plus a 400-world-unit preload margin, so off-screen DOM blocks and SVG paths are not mounted. Block components are memoized and drag/resize only publishes the final operation.

Ink is a separate SVG layer over all blocks. Strokes retain pressure and precalculated bounds, enabling hit-tested erasure and the same spatial culling as blocks. Undo snapshots the current note before a logical action; drag and resize create one history item instead of one per pointer move.

## Persistence and synchronization

Every local mutation is immediately reflected in Zustand, then debounced to IndexedDB. Sync messages carry one entity-level operation, an operation UUID, source UUID, and timestamp. The same messages drive tabs and Supabase Realtime. Duplicate operation IDs are ignored.

When signed in, the client:

- loads a cloud snapshot only if the browser has no local workspace;
- replays historical operations and then subscribes to new inserts;
- stores offline operations in IndexedDB and flushes them when a session reconnects;
- periodically upserts a complete bootstrap snapshot after local state changes.

Postgres row-level-security policies scope both tables to `auth.uid()`. Image blocks currently travel as data URLs inside persisted JSON; a production deployment with many large images should move blobs to Supabase Storage and retain references in operations.

Conflict behavior is operation deduplication plus arrival-order replacement at entity level. Independent entities and strokes merge without loss. Simultaneous edits to the same rich-text block are not a character-level CRDT and the later delivered block wins; Yjs/Automerge or revision preconditions are the appropriate next step for true concurrent text editing.

## AI retrieval and write safety

The app separates read access from writes:

- User-controlled permissions gate current file, file search, project context, calendar, gym history, and internet access.
- Retrieval scores terms over only allowed local records, attaches the current note and selected blocks first, and includes actual image data where available.
- OpenAI can receive its native web-search tool when internet permission is enabled. Anthropic and Gemini currently receive NoteHub context and images but no provider-native web-search tool.
- The model can return only a small typed proposal vocabulary. Proposals are persisted and shown one at a time with before/after information. The store validates essential payload types again before applying an approved mutation.

User-supplied provider secrets are encrypted with AES-GCM using a non-exportable, device-local Web Crypto key and stored in a separate IndexedDB vault. They are never included in Zustand, workspace snapshots, sync operations, localStorage, or the Vite bundle. The selected secret is decrypted only for an AI request and sent to the same-origin broker over HTTPS; the broker does not persist it. Server environment variables remain available as a managed fallback and are never returned by the status endpoint. Public deployments can require a valid Supabase JWT with `NOTEHUB_REQUIRE_AUTH=true`; deployment-level rate limiting is still recommended.

## Python execution

Each note maps to a long-lived Pyodide globals dictionary inside a Web Worker, which gives notebook-like shared state without blocking React. Package imports are loaded before execution. The worker captures stdout, evaluates the final expression when possible, formats pandas DataFrames as HTML, converts matplotlib figures to PNG data URLs, and serializes tracebacks. The UI stores the latest structured result on the code block.

## Service worker

The worker precaches the application shell, uses cache-first behavior for same-origin static assets, and falls back to the cached shell for offline navigation. A waiting worker does not take over silently: `PWAStatus` presents an update action that sends `SKIP_WAITING` and reloads after activation.

## Known limits

- The spatial index virtualizes rendering, but each note is still loaded as one IndexedDB record and all note records are hydrated into memory. Per-note manifests, stroke chunks, and lazy loading are still needed for extremely large workspaces.
- Concurrent changes to the exact same block use arrival-order replacement rather than character-level CRDT merging.
- Cloud image/blob storage, operation-log compaction, server acknowledgements, and encryption beyond the platform transport/storage controls are not implemented.
- Pyodide and newly imported Python packages require network on first load; the runtime is not bundled into the offline shell.
- Native web search is currently wired only for OpenAI. Provider-specific tool calling beyond the common proposal JSON contract is not implemented.
- Calendar recurrence/time-zone tooling, full routine editing, and arbitrary custom metric/chart builders are intentionally smaller than dedicated specialist apps.
- AI and Supabase behavior require the user-supplied credentials described in the README; automated tests cover the contracts and unconfigured states, not live paid-provider calls.
