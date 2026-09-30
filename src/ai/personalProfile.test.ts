import { describe, expect, it } from 'vitest';
import { appendAIProfileText, migrateAIProfileText, profileDetails, profileSummary, validProfileUpdates, updateAIProfile } from './personalProfile';

describe('personal profile context', () => {
  const profile = { answers: { style: 'Respuestas breves en español', topics: 'Arquitectura de computadores', classes: 'Lunes de 9 a 12' }, notes: 'Evitar eventos muy temprano', updatedAt: 1 };

  it('includes key preferences in the chat summary and all sections in the detailed read', () => {
    expect(profileSummary(profile)).toContain('Respuestas breves en español');
    expect(profileSummary(profile)).toContain('Arquitectura de computadores');
    expect(profileDetails(profile)).toContain('(sin responder)');
    expect(profileDetails(profile)).toContain('Evitar eventos muy temprano');
  });

  it('rejects unknown and empty AI updates', () => {
    expect(validProfileUpdates([{ field: 'style', value: 'Breve' }, { field: 'password', value: 'secret' }, { field: 'topics', value: '  ' }]))
      .toEqual([{ field: 'style', value: 'Breve' }]);
  });

  it('marks only new AI lines and keeps user text unchanged', () => {
    const initial = 'Prefiero respuestas breves';
    const result = appendAIProfileText(initial, 'Prefiero respuestas breves\nTutea al usuario\nEvita tablas');
    expect(result).toBe('Prefiero respuestas breves\n/Tutea al usuario/\n/Evita tablas/');
    expect(appendAIProfileText(result, 'Tutea al usuario')).toBe(result);
  });

  it('converts old AI markers without changing their text', () => {
    expect(migrateAIProfileText('Texto del usuario\n# Dato de la IA\nOtro texto'))
      .toBe('Texto del usuario\n/Dato de la IA/\nOtro texto');
  });
});


describe('consolidated AI memory', () => {
  it('moves and consolidates university schedules out of hobbies', () => {
    const profile = { answers: { routines: 'Le gusta pintar\n/Todos los días que tiene universidad debe estar allí a las 9:00./\n/Los lunes nunca tiene clases./', classes: 'Horario escrito por el usuario' }, notes: '', updatedAt: 1 };
    const next = updateAIProfile(profile, [{ field: 'classes', value: 'Los días de universidad llega a las 9:00; los lunes no tiene clases.', replace: [{ field: 'routines', value: 'Todos los días que tiene universidad debe estar allí a las 9:00.' }, { field: 'routines', value: 'Los lunes nunca tiene clases.' }] }]);
    expect(next.answers.routines).toBe('Le gusta pintar');
    expect(next.answers.classes).toBe('Horario escrito por el usuario\n/Los días de universidad llega a las 9:00; los lunes no tiene clases./');
    expect(profile.answers.routines).toContain('/Los lunes');
  });

  it('rewrites the same topic without accumulating old statements', () => {
    const profile = { answers: { classes: '/Universidad a las 9./' }, notes: '', updatedAt: 1 };
    const update = { field: 'classes' as const, value: 'Universidad a las 9, excepto los lunes.', replace: [{ field: 'classes' as const, value: 'Universidad a las 9.' }] };
    const next = updateAIProfile(profile, [update]);
    expect(next.answers.classes).toBe('/Universidad a las 9, excepto los lunes./');
    expect(updateAIProfile(next, [update])).toEqual(next);
  });

  it('rejects edits to user text and stale or partly missing replacements atomically', () => {
    const profile = { answers: { classes: 'Universidad a las 9.\n/Lunes libres./' }, notes: '', updatedAt: 1 };
    for (const value of ['Universidad a las 9.', 'Dato ya borrado']) {
      expect(updateAIProfile(profile, [{ field: 'notes', value: 'Nuevo texto', replace: [{ field: 'classes', value: 'Lunes libres.' }, { field: 'classes', value }] }])).toEqual(profile);
    }
  });

  it('avoids duplicate facts across sections and rejects malformed replacements', () => {
    const profile = { answers: { classes: '/Universidad a las 9./' }, notes: '', updatedAt: 1 };
    expect(updateAIProfile(profile, [{ field: 'notes', value: 'universidad a las 9' }])).toEqual(profile);
    expect(validProfileUpdates([{ field: 'notes', value: 'Nuevo', replace: [{ field: 'unknown', value: 'Viejo' }] }])).toEqual([]);
  });
});
