import { describe, expect, it } from 'vitest';
import { completedSets, exerciseLog, newWorkout, personalRecords, workoutVolume } from './workout';
import type { Workout } from '../types';
const past: Workout = { id: 'past', title: 'Sesión', startedAt: '2026-09-01T10:00:00Z', exercises: [{ exerciseId: 'press', sets: [{ id: 'valid', reps: 8, weight: 20, rir: 2, completed: true }, { id: 'draft', reps: 10, weight: 100, completed: false }] }] };
describe('workout summaries and session creation', () => {
  it('counts only completed sets for volume and records', () => {
    expect(completedSets(past)).toHaveLength(1);
    expect(workoutVolume(past)).toBe(160);
    expect(personalRecords([{ id: 'press', name: 'Press', category: 'Pecho', equipment: 'Mancuernas' }], [past])[0].weight).toBe(20);
  });
  it('prefills a new routine from completed historical sets without marking them complete', () => {
    const log = exerciseLog('press', 3, '8-12', [past]);
    expect(log.sets.map((set) => [set.weight, set.reps, set.completed])).toEqual([[20, 8, false], [20, 8, false], [20, 8, false]]);
    expect(new Set(log.sets.map((set) => set.id)).size).toBe(3);
  });
  it('starts a free workout without any routines', () => {
    expect(newWorkout(undefined, []).exercises).toEqual([]);
    expect(newWorkout(undefined, []).title).toBe('Entrenamiento libre');
  });
});
