import type { Exercise, Routine, Workout, WorkoutExerciseLog } from '../types';
export function completedSets(workout: Workout) { return workout.exercises.flatMap((log) => log.sets).filter((set) => set.completed); }
export function workoutVolume(workout: Workout) { return completedSets(workout).reduce((sum, set) => sum + set.weight * set.reps, 0); }
export function exerciseLog(exerciseId: string, sets: number, repRange: string, workouts: Workout[]): WorkoutExerciseLog {
  const previous = [...workouts].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).flatMap((workout) => workout.exercises).find((log) => log.exerciseId === exerciseId && log.sets.some((set) => set.completed));
  const last = previous?.sets.filter((set) => set.completed) ?? [];
  return { exerciseId, sets: Array.from({ length: Math.min(20, Math.max(1, sets)) }, (_, index) => ({ id: crypto.randomUUID(), weight: last[index]?.weight ?? last.at(-1)?.weight ?? 0, reps: last[index]?.reps ?? (Number.parseInt(repRange) || 8), rir: last[index]?.rir ?? 2, completed: false })) };
}
export function newWorkout(routine: Routine | undefined, workouts: Workout[]): Workout {
  return { id: crypto.randomUUID(), title: routine?.name ?? 'Entrenamiento libre', routineId: routine?.id, startedAt: new Date().toISOString(), exercises: routine?.exercises.map((item) => exerciseLog(item.exerciseId, item.targetSets, item.repRange, workouts)) ?? [] };
}
export function personalRecords(exercises: Exercise[], workouts: Workout[]) {
  return exercises.map((exercise) => ({ exercise, weight: Math.max(0, ...workouts.flatMap((workout) => workout.exercises.filter((log) => log.exerciseId === exercise.id).flatMap((log) => log.sets.filter((set) => set.completed).map((set) => set.weight)))) })).filter((record) => record.weight > 0).sort((a, b) => b.weight - a.weight);
}
