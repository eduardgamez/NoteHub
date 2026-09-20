import type { BlockType, CanvasBlock } from '../types';

export function makeBlock(type: BlockType, x: number, y: number): CanvasBlock {
  const base = { id: crypto.randomUUID(), type, x, y, width: 380, height: 220, content: '' } as CanvasBlock;
  if (type === 'text') return { ...base, content: '<h2>Untitled idea</h2><p>Start writing…</p>' };
  if (type === 'code') return { ...base, width: 500, height: 280, language: 'python', content: '# Explore an idea\nprint("Hello, NoteHub")' };
  if (type === 'checklist') return { ...base, width: 330, content: JSON.stringify([{ id: crypto.randomUUID(), text: 'First step', done: false }]) };
  if (type === 'table') return { ...base, width: 480, height: 250, content: JSON.stringify([['Topic', 'Status', 'Notes'], ['Sensitivity', 'In progress', ''], ['Duality', 'Not started', '']]) };
  if (type === 'list') return { ...base, width: 340, content: '<h3>Key points</h3><ul><li>First idea</li><li>Second idea</li></ul>' };
  if (type === 'drawing') return { ...base, width: 520, height: 330, content: '' };
  return base;
}
