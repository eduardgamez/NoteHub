import type { AIContextItem } from './provider';
import type { Note, WorkspaceStateData } from '../types';
import type { AIPermissions } from './permissions';

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
    data.tasks.filter((task) => score(task.title, queryTerms) > 0 || /task|remind|checklist|todo/i.test(query)).slice(0, 12).forEach((task) => context.push({ id: task.id, type: 'task', content: `${task.done ? 'Done' : 'Open'}: ${task.title}${task.due ? ` · due ${task.due}` : ''}` }));
    if ((!permissions || permissions.inspectGym) && /gym|workout|train|press|row|calf|weight|exercise|progress/i.test(query)) data.workouts.slice(-12).forEach((workout) => context.push({ id: workout.id, type: 'workout', content: `${workout.title} ${workout.startedAt}: ${workout.exercises.map((entry) => `${data.exercises.find((exercise) => exercise.id === entry.exerciseId)?.name}: ${entry.sets.map((set) => `${set.weight}kg×${set.reps} RIR${set.rir ?? '?'}`).join(', ')}`).join('; ')}` }));
  }

  return context.sort((a, b) => (b._score ?? 1) - (a._score ?? 1)).slice(0, 20).map(({ id, type, content }) => ({ id, type, content }));
}

export function renderSelectedInk(note: Note, selectedBlockIds: string[]): AIContextItem | null {
  if (!note.strokes.length || !selectedBlockIds.length) return null;
  const blocks = note.blocks.filter((block) => selectedBlockIds.includes(block.id));
  if (!blocks.length) return null;
  const bounds = blocks.reduce((box, block) => ({ x: Math.min(box.x, block.x), y: Math.min(box.y, block.y), right: Math.max(box.right, block.x + block.width), bottom: Math.max(box.bottom, block.y + block.height) }), { x: Infinity, y: Infinity, right: -Infinity, bottom: -Infinity });
  const strokes = note.strokes.filter((stroke) => stroke.bounds.x < bounds.right && stroke.bounds.x + stroke.bounds.width > bounds.x && stroke.bounds.y < bounds.bottom && stroke.bounds.y + stroke.bounds.height > bounds.y);
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
