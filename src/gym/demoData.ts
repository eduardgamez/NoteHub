import type { Routine, Workout } from '../types';
// Recognize the exact old fixtures only; edited or genuinely created sessions are preserved.
const demoRoutine: Routine = { id: 'upper-a', name: 'Upper A', exercises: [
    { exerciseId: 'incline-db', targetSets: 3, repRange: '6–10' },
    { exerciseId: 'chest-row', targetSets: 3, repRange: '8–12' },
    { exerciseId: 'lateral-raise', targetSets: 4, repRange: '10–15' },
  ] };
const demoWorkouts: Workout[] = Array.from({ length: 8 }, (_, index) => ({
    id: `workout-${index}`, routineId: 'upper-a', title: 'Upper A', startedAt: '', endedAt: '',
    exercises: [
      { exerciseId: 'incline-db', sets: [
        { id: `incline-${index}-1`, reps: 8, weight: 24 + index, rir: 2, completed: true },
        { id: `incline-${index}-2`, reps: 9, weight: 22 + index, rir: 1, completed: true },
      ] },
      { exerciseId: 'chest-row', sets: [{ id: `row-${index}`, reps: 10, weight: 45 + index * 2, rir: 2, completed: true }] },
      { exerciseId: 'calf-raise', sets: [{ id: `calf-${index}`, reps: 12, weight: 50 + index * 2, rir: 2, completed: true }] },
    ],
  }));
const withoutDates = (workout: Workout) => JSON.stringify(workout, (key, value) => key === 'startedAt' || key === 'endedAt' ? undefined : value);
export const isDemoRoutine = (routine: Routine) => JSON.stringify(routine) === JSON.stringify(demoRoutine);
export const isDemoWorkout = (workout: Workout) => workout.startedAt === workout.endedAt && demoWorkouts.some((demo) => withoutDates(workout) === withoutDates(demo));
