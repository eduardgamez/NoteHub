import type { Routine, Workout } from '../types';

// These IDs belong to the original examples, including any edited versions.
const demoWorkoutIds = new Set(Array.from({ length: 8 }, (_, index) => `workout-${index}`));
export const isDemoRoutine = (routine: Routine) => routine.id === 'upper-a';
export const isDemoWorkout = (workout: Workout) => demoWorkoutIds.has(workout.id);
