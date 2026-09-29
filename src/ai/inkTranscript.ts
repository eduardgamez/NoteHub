import type { Note } from '../types';

function cacheKey(note: Note, regionId: string) {
  const source = JSON.stringify(note.strokes);
  let hash = 2166136261;
  for (let index = 0; index < source.length; index++) hash = Math.imul(hash ^ source.charCodeAt(index), 16777619);
  return `notehub-ai-ink-text-v1:${regionId}:${(hash >>> 0).toString(16)}`;
}

export function getInkTranscript(note: Note, regionId: string): string | null {
  try { return localStorage.getItem(cacheKey(note, regionId)); } catch { return null; }
}

export function saveInkTranscript(note: Note, regionId: string, text: string) {
  try { localStorage.setItem(cacheKey(note, regionId), text); } catch { /* The visual remains available without a cached transcript. */ }
}
