import type { CalendarEvent, Task } from '../types';

const canonical = (value: unknown) => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
export function deletionSnapshot(expected: unknown): unknown {
  if (typeof expected !== 'string') return undefined;
  try { return JSON.parse(expected); } catch { return undefined; }
}
export function deletionSnapshotMatches(expected: string, current: CalendarEvent | Task): boolean {
  const snapshot = deletionSnapshot(expected);
  return Boolean(snapshot) && canonical(snapshot) === canonical(current);
}
export function deletionSnapshotHasId(expected: unknown, id: string): boolean {
  const snapshot = deletionSnapshot(expected);
  return typeof snapshot === 'object' && snapshot !== null && 'id' in snapshot && snapshot.id === id;
}
export function deletionPreview(target: CalendarEvent | Task): string {
  const date = (value: string) => new Date(value).toLocaleString();
  const when = 'start' in target ? `${date(target.start)} – ${date(target.end)}` : target.due ? date(target.due) : 'Sin fecha';
  return [target.title, when, 'done' in target ? target.done ? 'Completado' : 'Pendiente' : '', 'notes' in target ? target.notes : '', target.checklist?.map((item) => `${item.done ? '✓' : '○'} ${item.text}`).join('; ')].filter(Boolean).join(' · ');
}
