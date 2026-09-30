import { describe, expect, it } from 'vitest';
import { parseModelResponse } from './parseModelResponse';

describe('AI response parsing', () => {
  it('recovers the answer when LaTeX backslashes make the JSON invalid', () => {
    const raw = String.raw`{"text":"La entropía es\n\n[\nH(X)=-\sum\_{x\in\mathcal{X}}p(x)\log\_2 p(x),\n]\n\nSe mide en **bits**.","proposals":[],"readFiles":[]}`;
    const parsed = parseModelResponse(raw);
    expect(parsed.text).toContain('H(X)=-\\sum\\_{x\\in\\mathcal{X}}');
    expect(parsed.text).not.toContain('"proposals"');
    expect(parsed.proposals).toEqual([]);
  });

  it('preserves progress written by the model for the next read', () => {
    expect(parseModelResponse(JSON.stringify({ text: '', progress: 'Comparo los eventos con tus horarios.', readWorkspace: ['calendar'] }))).toMatchObject({ progress: 'Comparo los eventos con tus horarios.', readWorkspace: ['calendar'] });
  });

  it('preserves exact memory replacements through the API', () => {
    const update = { field: 'classes', value: 'Universidad a las 9, excepto lunes.', replace: [{ field: 'routines', value: 'Universidad a las 9.' }] };
    expect(parseModelResponse(JSON.stringify({ text: 'Vale', profileUpdates: [update] })).profileUpdates).toEqual([update]);
  });

  it('preserves structured actions from valid JSON', () => {
    const parsed = parseModelResponse(JSON.stringify({ text: 'Listo', proposals: [{ kind: 'task.create', payload: { title: 'Revisar' } }], readWorkspace: ['profile'] }));
    expect(parsed.text).toBe('Listo');
    expect(parsed.proposals).toHaveLength(1);
    expect(parsed.readWorkspace).toEqual(['profile']);
  });
});
