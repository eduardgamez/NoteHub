import type { Routine, Workout } from '../types';
// The original Upper A routine was explicitly removed, including edited copies of that ID.
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
export const isDemoRoutine = (routine: Routine) => routine.id === 'upper-a';
export const isDemoWorkout = (workout: Workout) => workout.startedAt === workout.endedAt && demoWorkouts.some((demo) => withoutDates(workout) === withoutDates(demo));
