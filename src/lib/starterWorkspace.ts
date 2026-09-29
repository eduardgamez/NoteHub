import { seedWorkspace } from '../data/seed';
import { ensureTitleBlock } from './noteTitle';
import type { WorkspaceStateData } from '../types';

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Starter content is local demo data, not a user's cloud workspace. */
export function isStarterWorkspace(data: WorkspaceStateData): boolean {
  const initial = seedWorkspace;
  if (!same(data.projects, initial.projects) || !same(data.folders, initial.folders)) return false;
  if (!same(Object.keys(data.notes).sort(), Object.keys(initial.notes).sort())) return false;
  for (const [id, note] of Object.entries(initial.notes)) {
    const actual = data.notes[id];
    if (!actual) return false;
    const withoutTimestamp = ({ updatedAt: _updatedAt, ...rest }: typeof actual) => rest;
    if (!same(withoutTimestamp(actual), withoutTimestamp(ensureTitleBlock(note)))) return false;
  }
  return !data.calendarEvents.length && !data.tasks.length && !data.reminderTemplates.length
    && !Object.keys(data.chatSessions).length && !Object.keys(data.chatThreads).length
    && !data.pendingProposals.length && !Object.keys(data.personalProfile.answers).length && !data.personalProfile.notes
    && same(data.exercises, initial.exercises) && same(data.routines, initial.routines)
    && same(data.workouts.map(({ startedAt: _startedAt, endedAt: _endedAt, ...workout }) => workout), initial.workouts.map(({ startedAt: _startedAt, endedAt: _endedAt, ...workout }) => workout));
}
