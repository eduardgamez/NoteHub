# NoteHub

NoteHub is a web-first personal workspace for spatial notes, code, handwriting, projects, tasks, fitness data, and AI-assisted knowledge management.

This repository contains the initial local-first MVP. It is intentionally useful before any account, backend, or AI key is configured.

## What works

- Project and note navigation with realistic seeded content
- Large free canvas with trackpad pan, cursor-centered zoom, touch input, and viewport culling
- Movable, resizable rich-text, Python, image, and checklist blocks
- Rich-text formatting for size, bold, italic, underline, color, highlight, alignment, lists, links, and inline code
- Local image/file upload and supported-device camera capture
- Pressure-aware ink drawing over every block using Pointer Events
- IndexedDB persistence and granular cross-tab synchronization through `BroadcastChannel`
- Collapsible responsive sidebar and AI panel
- Provider-neutral AI interface plus a local demo flow with one-at-a-time change proposals
- Installable PWA manifest and production service worker

## Run locally

```bash
npm install
npm run dev
```

Open the URL printed by Vite. Use the top canvas toolbar to add blocks or draw. Drag a block from its handle; resize it from the lower-right dot. Pinch/`Ctrl` + scroll to zoom and use a trackpad or drag the background to pan.

## Quality checks

```bash
npm run lint
npm test
npm run build
```

The production output is written to `dist/`.

## Project layout

```text
src/
  ai/           provider contract and adapters
  components/   application shell, canvas, blocks, ink, AI panel
  data/         starter workspace
  lib/          persistence and domain factories
  store/        workspace state and mutation boundary
  sync/         granular synchronization operations
docs/           architecture notes and growth path
public/         PWA manifest, icon, service worker
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the data model, key decisions, and next implementation milestones.
