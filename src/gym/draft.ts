import { create } from 'zustand';
import type { Workout } from '../types';
const KEY = 'notehub-gym-draft-v1';
function initial(): Workout | null {
  try { const value = JSON.parse(localStorage.getItem(KEY) ?? 'null'); return value && typeof value.id === 'string' && typeof value.startedAt === 'string' && Array.isArray(value.exercises) ? value : null; } catch { return null; }
}
export const useGymDraft = create<{ workout: Workout | null; restUntil: number; setWorkout: (workout: Workout | null) => void; rest: (seconds: number) => void }>((set) => ({
  workout: initial(), restUntil: Number(localStorage.getItem(`${KEY}-rest`)) || 0,
  setWorkout(workout) { if (workout) localStorage.setItem(KEY, JSON.stringify(workout)); else localStorage.removeItem(KEY); set({ workout }); },
  rest(seconds) { const restUntil = seconds ? Date.now() + seconds * 1000 : 0; localStorage.setItem(`${KEY}-rest`, String(restUntil)); set({ restUntil }); },
}));
