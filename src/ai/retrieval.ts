import type { AIContextItem } from './provider';
import type { CanvasBlock, Note, WorkspaceStateData } from '../types';
import type { AIPermissions } from './permissions';
import { projectStroke, type DocumentLayout } from '../lib/documentInk';
import { getInkTranscript } from './inkTranscript';

const clean = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const terms = (query: string) => query.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((term) => term.length > 2);
const score = (text: string, queryTerms: string[]) => queryTerms.reduce((total, term) => total + (text.toLowerCase().includes(term) ? 1 : 0), 0);

export function retrieveWorkspaceContext(query: string, data: WorkspaceStateData, options: { projectId?: string; currentNoteId?: string; selectedBlockIds?: string[]; permissions?: AIPermissions } = {}): AIContextItem[] {
  const queryTerms = terms(query);
  const permissions = options.permissions;
  const context: Array<AIContextItem & { _score?: number }> = [];
  const selected = new Set(options.selectedBlockIds ?? []);

  Object.values(data.notes).forEach((note) => {
    if (options.projectId && note.projectId !== options.projectId) return;
    note.blocks.forEach((block) => {
      const content = block.type === 'image' ? block.content : clean(block.content);
      const allowed = selected.has(block.id) || (!permissions || permissions.searchFiles || (permissions.readCurrentFile && note.id === options.currentNoteId));
      const relevance = !allowed ? 0 : selected.has(block.id) ? 100 : score(`${note.title} ${content}`, queryTerms);
      if (relevance > 0) context.push({ id: `${note.id}:${block.id}`, type: block.type === 'image' ? 'image' : `note-${block.type}`, content, _score: relevance });
    });
  });

  if (!permissions || permissions.readProjectContext) data.projects.filter((project) => !options.projectId || project.id === options.projectId).forEach((project) => project.context.forEach((item) => {
    context.push({ id: `project:${project.id}:${item.id}`, type: 'project-context', content: `${project.title} · ${item.label}: ${item.value}` });
  }));
  if (!permissions || permissions.readProjectContext) data.folders.filter((folder) => !options.projectId || folder.projectId === options.projectId).forEach((folder) => folder.context.forEach((item) => {
    context.push({ id: `folder:${folder.id}:${item.id}`, type: 'folder-context', content: `${folder.title} · ${item.label}: ${item.value}` });
  }));

  if (!options.projectId) {
    if (!permissions || permissions.inspectCalendar) data.calendarEvents.filter((event) => score(event.title, queryTerms) > 0 || /calendar|free|available|when|study|exam/i.test(query)).slice(0, 12).forEach((event) => context.push({ id: event.id, type: 'calendar-event', content: `${event.title}: ${event.start}–${event.end}` }));
    data.tasks.filter((task) => score(task.title, queryTerms) > 0 || /task|remind|checklist|todo/i.test(query)).slice(0, 12).forEach((task) => context.push({ id: task.id, type: 'task', content: `${task.reminder ? 'Reminder' : 'Task'} · ${task.done ? 'Done' : 'Open'}: ${task.title}${task.due ? ` · due ${task.due}` : ''}` }));
    if ((!permissions || permissions.inspectGym) && /gym|workout|train|press|row|calf|weight|exercise|progress/i.test(query)) data.workouts.slice(-12).forEach((workout) => context.push({ id: workout.id, type: 'workout', content: `${workout.title} ${workout.startedAt}: ${workout.exercises.map((entry) => `${data.exercises.find((exercise) => exercise.id === entry.exerciseId)?.name}: ${entry.sets.map((set) => `${set.weight}kg×${set.reps} RIR${set.rir ?? '?'}`).join(', ')}`).join('; ')}` }));
  }

  return context.sort((a, b) => (b._score ?? 1) - (a._score ?? 1)).slice(0, 20).map(({ id, type, content }) => ({ id, type, content }));
}

export function workspaceFileMap(data: WorkspaceStateData, options: { projectId?: string; currentNoteId?: string; permissions?: AIPermissions } = {}): AIContextItem {
  const canSearch = !options.permissions || options.permissions.searchFiles;
  const visibleNotes = Object.values(data.notes).filter((note) =>
    (!options.projectId || note.projectId === options.projectId) && (canSearch || (options.permissions?.readCurrentFile && note.id === options.currentNoteId)),
  );
  const projectIds = new Set(visibleNotes.map((note) => note.projectId));
  const folderIds = new Set(visibleNotes.map((note) => note.folderId).filter((id): id is string => Boolean(id)));
  if (canSearch) data.projects.filter((project) => !options.projectId || project.id === options.projectId).forEach((project) => projectIds.add(project.id));
  const folders = data.folders.filter((folder) => canSearch && (!options.projectId || folder.projectId === options.projectId));
  folders.forEach((folder) => folderIds.add(folder.id));
  const lines = [
    ...data.projects.filter((project) => projectIds.has(project.id)).map((project) => `project ${project.id} ${JSON.stringify(project.title)}`),
    ...data.folders.filter((folder) => folderIds.has(folder.id)).map((folder) => `folder ${folder.id} project=${folder.projectId} parent=${folder.parentId ?? '-'} ${JSON.stringify(folder.title)}`),
    ...visibleNotes.map((note) => `file ${note.id} project=${note.projectId} folder=${note.folderId ?? '-'} blocks=${note.blocks.length} ink=${note.strokes.length} ${JSON.stringify(note.title)}`),
  ];
  return { id: 'workspace-file-map', type: 'workspace-file-map', content: lines.join('\n') || '(no accessible files)' };
}

export type WorkspaceSection = 'calendar' | 'tasks' | 'gym' | 'context';

export function readWorkspaceSection(data: WorkspaceStateData, section: WorkspaceSection, query: string, options: { projectId?: string; permissions?: AIPermissions } = {}): AIContextItem[] {
  const relevant = (value: string) => score(value, terms(query)) > 0;
  const inProject = (projectId?: string) => !options.projectId || projectId === options.projectId;
  const result: AIContextItem[] = [];
  if (section === 'calendar' && options.permissions?.inspectCalendar !== false) {
    const events = data.calendarEvents.filter((event) => inProject(event.projectId));
    const matches = events.filter((event) => relevant(`${event.title} ${event.notes ?? ''}`));
    (matches.length ? matches : events).slice(0, 40).forEach((event) => result.push({ id: event.id, type: 'calendar-event', content: `${event.title}: ${event.start}–${event.end}${event.notes ? ` · ${event.notes}` : ''}` }));
  }
  if (section === 'tasks') {
    const tasks = data.tasks.filter((task) => inProject(task.projectId));
    const matches = tasks.filter((task) => relevant(task.title));
    (matches.length ? matches : tasks).slice(0, 40).forEach((task) => result.push({ id: task.id, type: 'task', content: `${task.reminder ? 'Reminder' : 'Task'} · ${task.done ? 'Done' : 'Open'}: ${task.title}${task.due ? ` · due ${task.due}` : ''}${task.checklist.length ? ` · checklist: ${task.checklist.map((item) => `${item.done ? '✓' : '○'} ${item.text}`).join('; ')}` : ''}` }));
  }
  if (section === 'gym' && options.permissions?.inspectGym !== false) {
    data.workouts.slice(-20).forEach((workout) => result.push({ id: workout.id, type: 'workout', content: `${workout.title} ${workout.startedAt}: ${workout.exercises.map((entry) => `${data.exercises.find((exercise) => exercise.id === entry.exerciseId)?.name ?? entry.exerciseId}: ${entry.sets.map((set) => `${set.weight}kg×${set.reps} RIR${set.rir ?? '?'}`).join(', ')}`).join('; ')}` }));
  }
  if (section === 'context' && options.permissions?.readProjectContext !== false) {
    data.projects.filter((project) => inProject(project.id)).forEach((project) => project.context.forEach((item) => result.push({ id: `project:${project.id}:${item.id}`, type: 'project-context', content: `${project.title} · ${item.label}: ${item.value}` })));
    data.folders.filter((folder) => inProject(folder.projectId)).forEach((folder) => folder.context.forEach((item) => result.push({ id: `folder:${folder.id}:${item.id}`, type: 'folder-context', content: `${folder.title} · ${item.label}: ${item.value}` })));
  }
  return result.length ? result.slice(0, 40) : [{ id: section, type: 'workspace-section', content: `No accessible ${section} entries.` }];
}

export function readWorkspaceFiles(data: WorkspaceStateData, noteIds: string[], options: { projectId?: string; currentNoteId?: string; permissions?: AIPermissions } = {}): AIContextItem[] {
  const canSearch = !options.permissions || options.permissions.searchFiles;
  return noteIds.flatMap((id) => {
    const note = data.notes[id];
    if (!note || (options.projectId && note.projectId !== options.projectId) || (!canSearch && !(options.permissions?.readCurrentFile && note.id === options.currentNoteId))) return [];
    const blocks = note.blocks.map((block) => {
      const preview = block.type === 'image' ? `[Image] ${block.caption ?? ''}` : clean(block.content);
      return `${note.id}:${block.id} type=${block.type} preview=${JSON.stringify(preview.slice(0, 120))}`;
    });
    const ink = note.blocks.flatMap((block) => {
      const count = note.strokes.filter((stroke) => stroke.anchorBlockId === block.id).length;
      const regionId = `${note.id}:${block.id}:ink`;
      const transcript = getInkTranscript(note, regionId);
      return count ? [`${regionId} type=drawing strokes=${count} (visual content not included in preview)${transcript ? ` handwriting=${JSON.stringify(transcript.slice(0, 120))}` : ''}`] : [];
    });
    const unanchoredInk = note.strokes.filter((stroke) => !stroke.anchorBlockId || !note.blocks.some((block) => block.id === stroke.anchorBlockId));
    if (unanchoredInk.length) {
      const transcript = getInkTranscript(note, `${note.id}:ink`);
      ink.push(`${note.id}:ink type=drawing strokes=${unanchoredInk.length} (visual content not included in preview)${transcript ? ` handwriting=${JSON.stringify(transcript.slice(0, 120))}` : ''}`);
    }
    return [{ id: note.id, type: 'file-outline', content: `Title: ${note.title}; project: ${note.projectId}; folder: ${note.folderId ?? 'none'}\n${[...blocks, ...ink].join('\n') || '(empty file)'}` }];
  });
}

export function readWorkspaceBlocks(data: WorkspaceStateData, blockIds: string[], options: { projectId?: string; currentNoteId?: string; permissions?: AIPermissions } = {}): AIContextItem[] {
  const canSearch = !options.permissions || options.permissions.searchFiles;
  return blockIds.flatMap((id) => {
    const note = Object.values(data.notes).find((item) => item.blocks.some((block) => `${item.id}:${block.id}` === id));
    if (!note || (options.projectId && note.projectId !== options.projectId) || (!canSearch && !(options.permissions?.readCurrentFile && note.id === options.currentNoteId))) return [];
    const block = note.blocks.find((item) => `${note.id}:${item.id}` === id);
    if (!block) return [];
    return [{
      id,
      type: block.type === 'image' && block.content.startsWith('data:image/') ? 'image' : `note-${block.type}`,
      content: block.type === 'image' && !block.content.startsWith('data:image/') ? `[Image] ${block.caption ?? ''} ${block.content}`.trim() : block.content,
    }];
  });
}

export function renderWorkspaceInk(data: WorkspaceStateData, regionId: string, options: { projectId?: string; currentNoteId?: string; permissions?: AIPermissions } = {}, layout?: DocumentLayout): AIContextItem | null {
  const note = Object.values(data.notes).find((item) => regionId === `${item.id}:ink` || item.blocks.some((block) => regionId === `${item.id}:${block.id}:ink`));
  const canSearch = !options.permissions || options.permissions.searchFiles;
  if (!note || !note.strokes.length || (options.projectId && note.projectId !== options.projectId) || (!canSearch && !(options.permissions?.readCurrentFile && note.id === options.currentNoteId))) return null;
  const block = note.blocks.find((item) => regionId === `${note.id}:${item.id}:ink`);
  const fallbackLayout: DocumentLayout = Object.fromEntries(note.blocks.map((item) => [item.id, item]));
  const strokes = note.strokes.filter((stroke) => block ? stroke.anchorBlockId === block.id : !stroke.anchorBlockId || !note.blocks.some((item) => item.id === stroke.anchorBlockId))
    .map((stroke) => projectStroke(stroke, note.blocks, layout ?? fallbackLayout)).filter((stroke): stroke is NonNullable<typeof stroke> => stroke !== null);
  if (!strokes.length) return null;
  const left = Math.min(...strokes.map((stroke) => stroke.bounds.x)) - 12;
  const top = Math.min(...strokes.map((stroke) => stroke.bounds.y)) - 12;
  const right = Math.max(...strokes.map((stroke) => stroke.bounds.x + stroke.bounds.width)) + 12;
  const bottom = Math.max(...strokes.map((stroke) => stroke.bounds.y + stroke.bounds.height)) + 12;
  const scale = Math.min(1, 1024 / Math.max(right - left, bottom - top));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil((right - left) * scale));
  canvas.height = Math.max(1, Math.ceil((bottom - top) * scale));
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
  context.lineCap = 'round'; context.lineJoin = 'round';
  strokes.forEach((stroke) => {
    context.beginPath(); context.strokeStyle = stroke.color; context.lineWidth = Math.max(1, stroke.width * scale);
    stroke.points.forEach((point, index) => { const x = (point.x - left) * scale, y = (point.y - top) * scale; if (index === 0) context.moveTo(x, y); else context.lineTo(x, y); });
    context.stroke();
  });
  return { id: regionId, type: 'image', content: canvas.toDataURL('image/png') };
}

function readonlyBlockElement(block: CanvasBlock): HTMLElement {
  const element = document.createElement('article');
  element.className = `canvas-block type-${block.type}`;
  element.dataset.blockId = block.id;
  if (block.type === 'text' || block.type === 'list') {
    const content = document.createElement('div'); content.className = `rich-block ${block.type === 'list' ? 'list-rich-block' : ''}`;
    content.innerHTML = block.content;
    content.querySelectorAll('script,iframe,object,embed,link,style,img').forEach((node) => node.remove());
    content.querySelectorAll('*').forEach((node) => [...node.attributes].forEach((attribute) => { if (/^on/i.test(attribute.name)) node.removeAttribute(attribute.name); }));
    element.append(content);
  } else if (block.type === 'code') {
    const content = document.createElement('div'); content.className = 'code-block';
    const header = document.createElement('div'); header.className = 'code-header'; header.textContent = block.language ?? 'python'; content.append(header);
    const pre = document.createElement('pre'); pre.textContent = block.content; content.append(pre); element.append(content);
  } else if (block.type === 'image') {
    const figure = document.createElement('figure'); figure.className = 'image-block';
    if (block.content.startsWith('data:image/')) { const image = document.createElement('img'); image.src = block.content; image.alt = block.captionRichText ? clean(block.caption ?? '') : block.caption ?? ''; figure.append(image); }
    const caption = document.createElement('figcaption'); caption.textContent = block.captionRichText ? clean(block.caption ?? '') : block.caption ?? ''; figure.append(caption); element.append(figure);
  } else if (block.type === 'drawing') {
    const content = document.createElement('div'); content.className = 'drawing-space'; element.append(content);
  } else {
    const content = document.createElement('div'); content.className = block.type === 'table' ? 'table-block' : 'checklist-block';
    try {
      const rows = JSON.parse(block.content) as unknown;
      if (Array.isArray(rows) && block.type === 'table') {
        const table = document.createElement('table'); const body = document.createElement('tbody');
        rows.forEach((row) => { if (!Array.isArray(row)) return; const line = document.createElement('tr'); row.forEach((cell) => { const value = document.createElement('td'); const input = document.createElement('input'); input.value = block.tableRichText ? clean(String(cell)) : String(cell); value.append(input); line.append(value); }); body.append(line); });
        table.append(body); content.append(table);
      } else if (Array.isArray(rows)) {
        const heading = document.createElement('h3'); heading.textContent = 'Checklist'; content.append(heading);
        const items = document.createElement('div'); items.className = 'checklist-items';
        rows.forEach((row) => { if (typeof row !== 'object' || row === null || !('text' in row)) return; const line = document.createElement('label'); if ('done' in row && row.done) line.className = 'done'; const mark = document.createElement('span'); mark.textContent = 'done' in row && row.done ? '☑' : '☐'; const text = document.createElement('span'); text.textContent = block.checklistRichText ? clean(String(row.text)) : String(row.text); line.append(mark, text); items.append(line); });
        content.append(items);
      }
    } catch { content.textContent = block.content; }
    element.append(content);
  }
  return element;
}

function serializeStyledElement(element: HTMLElement): string {
  const clone = element.cloneNode(true) as HTMLElement;
  const originals = [element, ...element.querySelectorAll<HTMLElement>('*')];
  const copies = [clone, ...clone.querySelectorAll<HTMLElement>('*')];
  originals.forEach((original, index) => {
    const copy = copies[index];
    const computed = getComputedStyle(original);
    for (const property of computed) copy.style.setProperty(property, computed.getPropertyValue(property));
  });
  return new XMLSerializer().serializeToString(clone);
}

export async function renderWorkspaceBlockVisual(data: WorkspaceStateData, blockId: string, options: { projectId?: string; currentNoteId?: string; permissions?: AIPermissions } = {}, layout?: DocumentLayout): Promise<AIContextItem | null> {
  const note = Object.values(data.notes).find((item) => item.blocks.some((block) => `${item.id}:${block.id}` === blockId));
  const canSearch = !options.permissions || options.permissions.searchFiles;
  if (!note || (options.projectId && note.projectId !== options.projectId) || (!canSearch && !(options.permissions?.readCurrentFile && note.id === options.currentNoteId))) return null;
  const block = note.blocks.find((item) => `${note.id}:${item.id}` === blockId);
  if (!block) return null;
  const fallbackLayout: DocumentLayout = Object.fromEntries(note.blocks.map((item) => [item.id, item]));
  const livePage = layout ? document.querySelector<HTMLElement>('.document-page') : null;
  const liveElement = [...(livePage?.querySelectorAll<HTMLElement>('[data-block-id]') ?? [])].find((item) => item.dataset.blockId === block.id);
  let preview = liveElement;
  let previewHost: HTMLElement | null = null;
  if (!preview) {
    previewHost = document.createElement('div'); previewHost.className = 'document-mode';
    previewHost.style.cssText = `position:fixed;left:-20000px;top:0;width:${Math.max(400, Math.min(734, block.width))}px;pointer-events:none;`;
    preview = readonlyBlockElement(block); previewHost.append(preview); document.body.append(previewHost);
  }
  const box = preview.getBoundingClientRect();
  const rect = liveElement && layout?.[block.id] ? layout[block.id] : { x: block.x, y: block.y, width: box.width, height: box.height };
  const effectiveLayout = liveElement && layout ? layout : { ...fallbackLayout, [block.id]: rect };
  const html = serializeStyledElement(preview);
  const previewText = preview.textContent ?? '';
  previewHost?.remove();
  const strokes = note.strokes.map((stroke) => projectStroke(stroke, note.blocks, effectiveLayout))
    .filter((stroke): stroke is NonNullable<typeof stroke> => stroke !== null)
    .filter((stroke) => stroke.anchorBlockId === block.id || (stroke.bounds.x < rect.x + rect.width && stroke.bounds.x + stroke.bounds.width > rect.x && stroke.bounds.y < rect.y + rect.height && stroke.bounds.y + stroke.bounds.height > rect.y));
  if (!strokes.length) return null;

  const left = Math.min(rect.x, ...strokes.map((stroke) => stroke.bounds.x)) - 12;
  const top = Math.min(rect.y, ...strokes.map((stroke) => stroke.bounds.y)) - 12;
  const right = Math.max(rect.x + rect.width, ...strokes.map((stroke) => stroke.bounds.x + stroke.bounds.width)) + 12;
  const bottom = Math.max(rect.y + rect.height, ...strokes.map((stroke) => stroke.bounds.y + stroke.bounds.height)) + 12;
  const width = right - left, height = bottom - top;
  const scale = Math.min(1, 1400 / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(width * scale)); canvas.height = Math.max(1, Math.ceil(height * scale));
  const context = canvas.getContext('2d'); if (!context) return null;

  const paths = strokes.map((stroke) => {
    const d = stroke.points.map((point, index) => `${index ? 'L' : 'M'}${point.x} ${point.y}`).join(' ');
    return `<path d="${d}" fill="none" stroke="${stroke.color}" stroke-width="${stroke.width}" stroke-linecap="round" stroke-linejoin="round"/>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}" viewBox="${left} ${top} ${width} ${height}"><rect x="${left}" y="${top}" width="${width}" height="${height}" fill="#fff"/><foreignObject x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}">${html}</foreignObject>${paths}</svg>`;
  try {
    const image = new Image(); image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    await image.decode(); context.drawImage(image, 0, 0);
    return { id: `${blockId}:visual`, type: 'image', content: canvas.toDataURL('image/png') };
  } catch {
    context.setTransform(scale, 0, 0, scale, -left * scale, -top * scale);
    context.fillStyle = '#fff'; context.fillRect(left, top, width, height);
    context.fillStyle = '#343431'; context.font = '14px Arial';
    const words = previewText.replace(/\s+/g, ' ').split(' ');
    let line = '', y = rect.y + 30;
    words.forEach((word) => {
      const candidate = `${line} ${word}`.trim();
      if (line && context.measureText(candidate).width > rect.width - 24) { context.fillText(line, rect.x + 12, y); y += 22; line = word; }
      else line = candidate;
    });
    if (line) context.fillText(line, rect.x + 12, y);
    strokes.forEach((stroke) => { context.beginPath(); context.strokeStyle = stroke.color; context.lineWidth = stroke.width; stroke.points.forEach((point, index) => { if (index === 0) context.moveTo(point.x, point.y); else context.lineTo(point.x, point.y); }); context.stroke(); });
    return { id: `${blockId}:visual`, type: 'image', content: canvas.toDataURL('image/png') };
  }
}

export function renderSelectedInk(note: Note, selectedBlockIds: string[], layout?: DocumentLayout): AIContextItem | null {
  if (!note.strokes.length || !selectedBlockIds.length) return null;
  const blocks = note.blocks.filter((block) => selectedBlockIds.includes(block.id));
  if (!blocks.length) return null;
  const bounds = blocks.reduce((box, block) => {
    const rect = layout?.[block.id] ?? block;
    return { x: Math.min(box.x, rect.x), y: Math.min(box.y, rect.y), right: Math.max(box.right, rect.x + rect.width), bottom: Math.max(box.bottom, rect.y + rect.height) };
  }, { x: Infinity, y: Infinity, right: -Infinity, bottom: -Infinity });
  const strokes = note.strokes.map((stroke) => layout ? projectStroke(stroke, note.blocks, layout) : stroke).filter((stroke) => {
    if (!stroke) return false;
    return stroke.bounds.x < bounds.right && stroke.bounds.x + stroke.bounds.width > bounds.x && stroke.bounds.y < bounds.bottom && stroke.bounds.y + stroke.bounds.height > bounds.y;
  }).filter((stroke): stroke is NonNullable<typeof stroke> => stroke !== null);
  if (!strokes.length) return null;
  const width = Math.min(1024, Math.max(1, bounds.right - bounds.x));
  const height = Math.min(1024, Math.max(1, bounds.bottom - bounds.y));
  const scale = Math.min(width / (bounds.right - bounds.x), height / (bounds.bottom - bounds.y));
  const canvas = document.createElement('canvas'); canvas.width = Math.ceil(width); canvas.height = Math.ceil(height);
  const context = canvas.getContext('2d'); if (!context) return null;
  context.lineCap = 'round'; context.lineJoin = 'round';
  strokes.forEach((stroke) => { context.beginPath(); context.strokeStyle = stroke.color; context.lineWidth = Math.max(1, stroke.width * scale); stroke.points.forEach((point, index) => { const x = (point.x - bounds.x) * scale, y = (point.y - bounds.y) * scale; if (index === 0) context.moveTo(x, y); else context.lineTo(x, y); }); context.stroke(); });
  return { id: `${note.id}:selected-ink`, type: 'image', content: canvas.toDataURL('image/png') };
}
