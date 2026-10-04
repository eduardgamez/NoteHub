import { describe, expect, it } from 'vitest';
import { applyLayout, blockRows, findBlockDrop, insertInLayout, layoutOf, moveInLayout, type DropBlock } from './blockLayout';
import { makeBlock } from './blockFactory';
import type { CanvasBlock } from '../types';

const block = (id: string, group?: string, column?: string): CanvasBlock => ({ ...makeBlock(id === 'drawing' ? 'drawing' : 'text', 0, 0), id, layoutGroupId: group, layoutColumnId: column });
const layout = (blocks: CanvasBlock[]) => blockRows(blocks).map((row) => row.columns.map((column) => column.blocks.map((item) => item.id)));

describe('document block placement', () => {
  it('keeps a legacy row in place when its first column moves beside a drawing below it', () => {
    const blocks = [block('first'), block('neighbour', 'first'), block('drawing'), block('last')];
    expect(layout(moveInLayout(blocks, 'first', 'drawing', false, true))).toEqual([[['neighbour']], [['drawing'], ['first']], [['last']]]);
  });

  it('preserves visual order in old arrays with interleaved row members', () => {
    const blocks = [block('first'), block('drawing'), block('neighbour', 'first'), block('last')];
    expect(layout(moveInLayout(blocks, 'last', 'drawing', true, true))).toEqual([[['first'], ['neighbour']], [['last'], ['drawing']]]);
  });

  it('creates separate side columns even when a previous column ID survives on another block', () => {
    const blocks = [block('drawing'), block('other', 'drawing', 'source:drawing:right'), block('source')];
    expect(layout(moveInLayout(blocks, 'source', 'drawing', false, true))).toEqual([[['drawing'], ['source'], ['other']]]);
  });

  it('stacks above and below within the target column and preserves other columns', () => {
    const blocks = [block('drawing'), block('a', 'drawing', 'right'), block('b', 'drawing', 'right'), block('source')];
    expect(layout(moveInLayout(blocks, 'source', 'b', true, false))).toEqual([[['drawing'], ['a', 'source', 'b']]]);
    expect(layout(moveInLayout(blocks, 'source', 'a', false, false))).toEqual([[['drawing'], ['a', 'source', 'b']]]);
  });

  it('inserts new rows after all columns and duplicates inside their existing column', () => {
    const blocks = [block('drawing'), block('a', 'drawing', 'right')];
    expect(layout(insertInLayout(blocks, block('new'), 'drawing'))).toEqual([[['drawing'], ['a']], [['new']]]);
    expect(layout(insertInLayout(blocks, block('copy', 'drawing', 'right'), 'a'))).toEqual([[['drawing'], ['a', 'copy']]]);
  });

  it('moves a column out into a row of its own before or after its row', () => {
    const blocks = [block('a'), block('b', 'a', 'b'), block('c', 'a', 'c'), block('next')];
    expect(layout(moveInLayout(blocks, 'c', 'a', false, false, true))).toEqual([[['a'], ['b']], [['c']], [['next']]]);
    expect(layout(moveInLayout(blocks, 'c', 'b', true, false, true))).toEqual([[['c']], [['a'], ['b']], [['next']]]);
    const twice = moveInLayout(moveInLayout(blocks, 'c', 'a', false, false, true), 'b', 'next', false, false, true);
    expect(layout(twice)).toEqual([[['a']], [['c']], [['next']], [['b']]]);
  });

  it('copies another device\'s rows and columns exactly, keeping blocks it did not know', () => {
    const remote = moveInLayout([block('a'), block('b'), block('c')], 'c', 'a', false, true);
    const local = [block('a'), block('b', 'a', 'stale'), block('local'), block('c', 'x', 'y')];
    expect(layout(applyLayout(local, layoutOf(remote)))).toEqual([[['a'], ['c']], [['b']], [['local']]]);
    expect(layout(applyLayout([block('a'), block('c')], layoutOf(remote)))).toEqual([[['a'], ['c']]]);
  });

  it('protects the title and safely ignores missing or identical targets', () => {
    const blocks = [{ ...block('title'), isTitle: true }, block('drawing')];
    expect(moveInLayout(blocks, 'title', 'drawing', false, true)).toBe(blocks);
    expect(moveInLayout(blocks, 'drawing', 'title', false, true)).toBe(blocks);
    expect(moveInLayout(blocks, 'drawing', 'missing', false, false)).toBe(blocks);
    expect(moveInLayout(blocks, 'drawing', 'drawing', false, true)).toBe(blocks);
    expect(layout(moveInLayout(blocks, 'drawing', 'title', true, false))).toEqual([[['title', 'drawing']]]);
  });
});

const rect = (id: string, rowId: string, left: number, top: number, right: number, bottom: number, drawing = false): DropBlock => ({ id, rowId, left, top, right, bottom, drawing, title: false });

describe('drop target geometry', () => {
  it('selects the drawing row beside a tall drawing with a short neighbouring column', () => {
    const candidates = [rect('above', 'above', 0, 0, 700, 60), rect('drawing', 'row', 0, 74, 350, 450, true), rect('short', 'row', 364, 74, 700, 120)];
    expect(findBlockDrop(candidates, 340, 250)).toEqual({ targetId: 'drawing', side: true, before: false, row: false });
    expect(findBlockDrop(candidates, 360, 80)).toEqual({ targetId: 'short', side: true, before: true, row: false });
  });

  it('uses vertical insertion in row gaps, without drawing side zones extending into other rows', () => {
    const candidates = [rect('above', 'above', 0, 0, 700, 60), rect('drawing', 'row', 0, 74, 700, 450, true)];
    expect(findBlockDrop(candidates, 690, 72)).toEqual({ targetId: 'drawing', side: false, before: true, row: false });
    expect(findBlockDrop(candidates, 690, 50)?.targetId).toBe('above');
  });

  it('handles wrapped columns, titles, empty candidates and invalid coordinates', () => {
    const candidates = [rect('drawing', 'row', 0, 0, 300, 200, true), rect('wrapped', 'row', 0, 214, 300, 280)];
    expect(findBlockDrop(candidates, 290, 240)?.targetId).toBe('wrapped');
    expect(findBlockDrop([{ ...candidates[0], title: true }], 290, 80)).toEqual({ targetId: 'drawing', side: false, before: false, row: false });
    expect(findBlockDrop([], 0, 0)).toBeNull();
    const columns = [rect('left', 'row', 0, 0, 300, 200), rect('right', 'row', 314, 0, 600, 120), rect('below', 'below', 0, 300, 600, 400)];
    expect(findBlockDrop(columns, 400, 206)).toEqual({ targetId: 'right', side: false, before: false, row: true });
    expect(findBlockDrop(columns, 400, 150)).toEqual({ targetId: 'right', side: false, before: false, row: false });
    expect(findBlockDrop(candidates, NaN, 0)).toBeNull();
  });
});
