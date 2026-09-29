import { describe, expect, it } from 'vitest';
import { appendAIProfileText, migrateAIProfileText, profileDetails, profileSummary, validProfileUpdates } from './personalProfile';

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
