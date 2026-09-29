import { describe, expect, it } from 'vitest';
import { selectGeminiModels } from './geminiModels';

describe('Gemini model discovery', () => {
  it('selects current text models by version and excludes specialized endpoints', () => {
    const models = ['gemini-3.1-pro-preview', 'gemini-3.7-flash', 'gemini-3.8-flash', 'gemini-3.8-flash-tts', 'gemini-3.1-flash-image', 'gemini-2.5-pro']
      .map((id) => ({ name: `models/${id}`, displayName: id, supportedActions: ['generateContent'], thinking: true }));
    expect(selectGeminiModels(models)).toEqual([
      { id: 'gemini-3.8-flash', label: 'gemini-3.8-flash', profile: 'fast' },
      { id: 'gemini-3.7-flash', label: 'gemini-3.7-flash', profile: 'fast' },
      { id: 'gemini-3.1-pro-preview', label: 'gemini-3.1-pro-preview', profile: 'reasoning' },
      { id: 'gemini-3.8-flash', label: 'gemini-3.8-flash', profile: 'reasoning' },
    ]);
  });
});
