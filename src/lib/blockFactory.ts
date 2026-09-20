import type { BlockType, CanvasBlock } from '../types';

export function makeBlock(type: BlockType, x: number, y: number): CanvasBlock {
  const base = { id: crypto.randomUUID(), type, x, y, width: 380, height: 220, content: '' } as CanvasBlock;
  if (type === 'text') return { ...base, content: '<h2>Untitled idea</h2><p>Start writing…</p>' };
  if (type === 'code') return { ...base, width: 500, height: 280, language: 'python', content: '# Explore an idea\nprint("Hello, NoteHub")' };
  if (type === 'checklist') return { ...base, width: 330, content: JSON.stringify([{ id: crypto.randomUUID(), text: 'First step', done: false }]) };
  return base;
}
