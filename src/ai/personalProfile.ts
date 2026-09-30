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
    typeof item === 'object' && item !== null && fields.has(item.field) && typeof item.value === 'string' && item.value.trim().length > 0 && item.value.length <= 2400 &&
    (item.replace === undefined || (Array.isArray(item.replace) && item.replace.length <= 12 && item.replace.every((target: { field?: unknown; value?: unknown }) => target && fields.has(String(target.field)) && typeof target.value === 'string' && target.value.trim().length > 0 && target.value.length <= 2400))),
  ).slice(0, 3).map((item) => ({ field: item.field, value: item.value.trim(), ...(item.replace ? { replace: item.replace.map((target) => ({ field: target.field, value: target.value.trim() })) } : {}) }));
}

/** Exact replacements can touch AI-marked lines only, including moves between sections. */
export function updateAIProfile(profile: PersonalProfile, updates: ProfileUpdate[]): PersonalProfile {
  const next = structuredClone(profile);
  const read = (field: ProfileUpdate['field']) => field === 'notes' ? next.notes : next.answers[field] ?? '';
  const write = (field: ProfileUpdate['field'], value: string) => { if (field === 'notes') next.notes = value; else next.answers[field] = value; };
  const normalize = (value: string) => value.trim().replace(/^\/(.*)\/$/, '$1').toLocaleLowerCase().replace(/[.!?]+$/, '');
  for (const update of validProfileUpdates(updates)) {
    const targets = update.replace ?? [];
    // Reject the whole edit if a source was edited/deleted, or was written by the user.
    if (targets.some((target) => !read(target.field).split('\n').some((line) => line.trim() === `/${target.value}/`))) continue;
    for (const target of targets) write(target.field, read(target.field).split('\n').filter((line) => line.trim() !== `/${target.value}/`).join('\n'));
    const known = [...profileQuestions.map(({ field }) => read(field)), read('notes')].flatMap((text) => text.split('\n')).map(normalize);
    const additions = update.value.split('\n').filter((line) => !known.includes(normalize(line))).join('\n');
    if (additions) write(update.field, appendAIProfileText(read(update.field), additions));
  }
  return next;
}
