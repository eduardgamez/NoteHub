import { describe, expect, it } from 'vitest';
import { makeBlock } from './blockFactory';

describe('makeBlock', () => {
  it('creates useful defaults at the requested canvas position', () => {
    const block = makeBlock('text', 120, 240);
    expect(block).toMatchObject({ type: 'text', x: 120, y: 240, width: 380, height: 220 });
    expect(block.content).toContain('Untitled idea');
    expect(block.id).toBeTruthy();
  });

  it('creates a Python-ready code block', () => {
    const block = makeBlock('code', 0, 0);
    expect(block.language).toBe('python');
    expect(block.content).toContain('print');
  });
});
