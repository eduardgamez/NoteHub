import type { PersonalProfile, ProfileField, ProfileUpdate } from '../types';

export const profileQuestions: Array<{ field: ProfileField; label: string }> = [
  { field: 'background', label: 'Estudios y/o trabajo' },
  { field: 'classes', label: 'Horario y rutina' },
  { field: 'routines', label: 'Hobbies y pasatiempos' },
  { field: 'events', label: 'Planes y eventos' },
  { field: 'style', label: 'Estilo de respuesta' },
  { field: 'topics', label: 'Gimnasio y objetivos' },
];

export function profileSummary(profile: PersonalProfile): string {
  const priority = ['style', 'topics', 'classes', 'routines', 'events', 'background'];
  const lines = [...profileQuestions].sort((a, b) => priority.indexOf(a.field) - priority.indexOf(b.field))
    .map(({ field, label }) => profile.answers[field]?.trim() ? `${label}: ${profile.answers[field]!.trim().slice(0, 260)}` : '').filter(Boolean);
  if (profile.notes.trim()) lines.push(`Otros datos: ${profile.notes.trim().slice(0, 220)}`);
  return lines.join('\n').slice(0, 1800);
}

export function profileDetails(profile: PersonalProfile): string {
  const lines = profileQuestions.map(({ field, label }) => `${label}\n${profile.answers[field]?.trim() || '(sin responder)'}`);
  lines.push(`Otros datos\n${profile.notes.trim() || '(vacío)'}`);
  return lines.join('\n\n');
}

export function appendAIProfileText(existing: string, addition: string): string {
  const unmark = (line: string) => line.trim().replace(/^#\s+/, '').replace(/^\/(.*)\/$/, '$1');
  const known = new Set(existing.split('\n').map((line) => unmark(line).toLocaleLowerCase()).filter(Boolean));
  const added = addition.split('\n').map(unmark).filter((line) => {
    const normalized = line.toLocaleLowerCase();
    if (!normalized || known.has(normalized)) return false;
    known.add(normalized);
    return true;
  }).map((line) => `/${line}/`);
  return [existing.trimEnd(), ...added].filter(Boolean).join('\n');
}

export function migrateAIProfileText(value: string): string {
  return value.replace(/^# (.+)$/gm, '/$1/');
}

export function validProfileUpdates(value: unknown): ProfileUpdate[] {
  if (!Array.isArray(value)) return [];
  const fields = new Set<string>([...profileQuestions.map((item) => item.field), 'notes']);
  return value.filter((item): item is ProfileUpdate =>
    typeof item === 'object' && item !== null && fields.has(item.field) && typeof item.value === 'string' && item.value.trim().length > 0 && item.value.length <= 800,
  ).slice(0, 6).map((item) => ({ field: item.field, value: item.value.trim() }));
}
