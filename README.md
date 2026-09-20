# NoteHub

NoteHub is a web-first, local-first personal workspace for spatial notes, code, handwriting, planning, workout tracking, and AI-assisted knowledge management. It runs without an account for local use and can add secure AI providers and Supabase-based device sync when configured.

## Product surface

- Infinite spatial canvas with smooth pan/zoom, viewport culling, multi-selection, move/resize, duplicate, copy/paste, delete, undo/redo, and desktop/tablet pointer input.
- Rich text, lists, tables, checklists, images/camera capture, drawing spaces, and highlighted code blocks.
- Global pressure-aware ink over every block, with pen widths, eraser, and undo/redo.
- Python in a dedicated Pyodide Web Worker with document-scoped shared state, stdout, return values, tracebacks, DataFrame HTML, and matplotlib images.
- Projects, folders, notes, search, and editable contextual memory kept separate from note content.
- Day/week/month calendar, tasks, reusable interactive reminder checklists, and project-linked records.
- Exercise library, routines, fast workout logging, set/reps/weight/RIR, history, personal records, and progress charts.
- Project chat and global AI inbox with local retrieval, image/selected-ink context, explicit read permissions, and a persistent sequential proposal queue for writes.
- OpenAI, Anthropic, and Gemini behind one server-side provider boundary; user keys are entered in Settings and encrypted in a device-local vault rather than entering the Vite bundle.
- IndexedDB persistence, cross-tab operations, optional authenticated Supabase snapshots/realtime operations, and an offline retry queue.
- System/light/dark themes, responsive shell, install prompt, update prompt, manifest, and offline application shell.

## Run locally

Requirements: Node.js 20 or newer and npm.

```bash
npm install
cp .env.example .env
npm run dev
```

Open `http://localhost:5173`. `npm run dev` starts both Vite and the API broker. NoteHub remains usable locally when `.env` contains no credentials; Settings clearly shows AI and cloud sync as unconfigured.

Useful commands:

```bash
npm run dev:web       # browser app only
npm run dev:api       # watched AI broker only
npm run start:api     # AI broker without watch mode
npm run build         # strict TypeScript plus production bundle
npm run preview       # serve the latest production bundle
npm run lint
npm test
npm run test:e2e      # Playwright browser smoke test (build first)
```

## AI configuration

Open **Settings → AI provider**, choose OpenAI, Anthropic, or Gemini, paste the API key, and select **Save key**. The key is encrypted with a non-exportable Web Crypto key and kept in a separate IndexedDB database on that browser. It persists across sessions but is not included in workspace sync. Removing the site's browser data also removes the key.

When AI is used, the selected key is sent over the same-origin `/api/ai/complete` HTTPS request and is held only for that provider call. The broker does not persist it. A managed deployment can alternatively provide server-side keys:

```dotenv
OPENAI_API_KEY=...
ANTHROPIC_API_KEY=...
GEMINI_API_KEY=...
```

Optional model overrides are documented in `.env.example`. During development Vite proxies `/api` to port `8787`. For production, deploy `server/index.ts` (or an equivalent protected server function), route `/api` to it, set `NOTEHUB_WEB_ORIGIN`, use HTTPS, and set `NOTEHUB_REQUIRE_AUTH=true`. The broker then validates the caller's Supabase access token before accepting either a browser-supplied or server-managed provider key.

AI permissions are opt-in switches in Settings. Read-only answers run immediately. Workspace writes are restricted to typed proposals (`context.update`, `calendar.create`, `task.create`, and `file.update`) and are only applied after approval. Proposal state is persisted, so normal questions do not interrupt the review queue.

## Multi-device sync with Supabase

1. Create a Supabase project.
2. Run `supabase/migrations/001_workspace_operations.sql` in its SQL editor or through the Supabase CLI.
3. Put the project URL and anon key in `.env`:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=...
```

4. Restart the app, open **Settings → Cloud sync**, and request a magic link.

The migration enables row-level security, so each authenticated user can read and write only their own operation log and snapshot. Local edits remain optimistic; offline operations are queued in IndexedDB and replayed after authentication/reconnection. Realtime changes are granular (block, stroke, context, event, task, workout, exercise, chat, or proposal), while a debounced snapshot bootstraps a new device.

## PWA and Python notes

The production service worker is registered by the app, caches the shell and visited same-origin assets, and exposes an update action when a new worker is ready. Test installation and offline behavior from a production build over HTTPS (localhost is also accepted by browsers).

Pyodide executes away from the UI thread and shares one Python namespace per note. Its runtime and imported packages are fetched from the official Pyodide CDN on first use, so the first Python execution requires a network connection; subsequent availability depends on the browser HTTP cache.

## Project layout

```text
server/             secure provider broker
src/ai/             permissions, retrieval, provider-neutral client
src/components/     shell, canvas, blocks, AI, and product modules
src/data/           coherent starter workspace
src/hooks/          theme and browser hooks
src/lib/            persistence, factories, spatial index
src/python/         replaceable worker runtime adapter
src/store/          state and mutation boundary
src/sync/           local and Supabase operation transports
supabase/            database migration and RLS policies
public/             PWA assets, service worker, Pyodide worker
tests/              Playwright product smoke test
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for boundaries, data flow, conflict behavior, security, and known limitations.
