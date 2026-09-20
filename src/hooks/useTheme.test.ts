import { describe, expect, it } from 'vitest';
import { resolveTheme } from './useTheme';

describe('resolveTheme', () => {
  it('uses the system preference when there is no manual choice', () => {
    expect(resolveTheme(null, true)).toBe('dark');
    expect(resolveTheme(null, false)).toBe('light');
  });

  it('gives a saved manual choice priority over the system', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});
