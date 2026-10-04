import type { CanvasBlock } from '../types';

export interface BlockRow { id: string; columns: { id: string; blocks: CanvasBlock[] }[] }

// Resolve legacy implicit IDs before changing membership or array order.
export function blockRows(blocks: CanvasBlock[]): BlockRow[] {
  const rows: BlockRow[] = [];
  for (const block of blocks) {
    const groupId = block.layoutGroupId ?? block.id;
    const columnId = block.layoutColumnId ?? block.id;
    let row = rows.find((item) => item.id === groupId);
    if (!row) { row = { id: groupId, columns: [] }; rows.push(row); }
    let column = row.columns.find((item) => item.id === columnId);
    if (!column) { column = { id: columnId, blocks: [] }; row.columns.push(column); }
    column.blocks.push(block);
  }
  return rows;
}

function flatten(rows: BlockRow[]): CanvasBlock[] {
  return rows.flatMap((row) => row.columns.flatMap((column) => column.blocks.map((block) => ({ ...block, layoutGroupId: row.id, layoutColumnId: column.id }))));
}

export function insertInLayout(blocks: CanvasBlock[], block: CanvasBlock, afterBlockId?: string | null): CanvasBlock[] {
  const rows = blockRows(blocks);
  const rowIndex = rows.findIndex((row) => row.columns.some((column) => column.blocks.some((item) => item.id === afterBlockId)));
  if (rowIndex >= 0 && block.layoutGroupId === rows[rowIndex].id) {
    const column = rows[rowIndex].columns.find((item) => item.id === (block.layoutColumnId ?? block.id));
    if (column) {
      const index = column.blocks.findIndex((item) => item.id === afterBlockId);
      column.blocks.splice(index < 0 ? column.blocks.length : index + 1, 0, block);
      return flatten(rows);
    }
  }
  // A new standalone block follows the entire row, never splits its columns.
  const groupId = block.layoutGroupId ?? block.id;
  const columnId = block.layoutColumnId ?? block.id;
  const existing = rows.find((row) => row.id === groupId);
  if (existing) {
    const column = existing.columns.find((item) => item.id === columnId);
    if (column) column.blocks.push(block);
    else existing.columns.push({ id: columnId, blocks: [block] });
  } else rows.splice(rowIndex < 0 ? rows.length : rowIndex + 1, 0, { id: groupId, columns: [{ id: columnId, blocks: [block] }] });
  return flatten(rows);
}

// side: a new column beside the target. row: a new row of its own before or
// after the target's whole row. Otherwise the block stacks in the target's column.
export function moveInLayout(blocks: CanvasBlock[], blockId: string, targetId: string, before: boolean, side: boolean, row = false): CanvasBlock[] {
  const source = blocks.find((block) => block.id === blockId);
  const target = blocks.find((block) => block.id === targetId);
  if (!source || !target || blockId === targetId || source.isTitle || ((side || row) && target.isTitle)) return blocks;
  const rows = blockRows(blocks);
  for (const item of rows) for (const column of item.columns) column.blocks = column.blocks.filter((block) => block.id !== blockId);
  const rowIndex = rows.findIndex((item) => item.columns.some((column) => column.blocks.some((block) => block.id === targetId)));
  const targetRow = rows[rowIndex];
  const columnIndex = targetRow.columns.findIndex((column) => column.blocks.some((block) => block.id === targetId));
  if (row) {
    const occupied = (id: string) => rows.some((item) => item.id === id && item.columns.some((column) => column.blocks.length));
    let id = `${source.id}:row`;
    for (let suffix = 1; occupied(id); suffix++) id = `${source.id}:row:${suffix}`;
    rows.splice(rowIndex + (before ? 0 : 1), 0, { id, columns: [{ id, blocks: [source] }] });
  } else if (side) {
    const base = `${source.id}:${target.id}:${before ? 'left' : 'right'}`;
    let id = base;
    for (let suffix = 1; targetRow.columns.some((column) => column.id === id && column.blocks.length); suffix++) id = `${base}:${suffix}`;
    targetRow.columns.splice(columnIndex + (before ? 0 : 1), 0, { id, blocks: [source] });
  } else {
    const column = targetRow.columns[columnIndex];
    const index = column.blocks.findIndex((block) => block.id === targetId);
    column.blocks.splice(index + (before && !target.isTitle ? 0 : 1), 0, source);
  }
  return flatten(rows);
}

export interface BlockPlacement { id: string; row: string; column: string }

export function layoutOf(blocks: CanvasBlock[]): BlockPlacement[] {
  return blocks.map((block) => ({ id: block.id, row: block.layoutGroupId ?? block.id, column: block.layoutColumnId ?? block.id }));
}

// Puts the blocks exactly where another device has them. Blocks this device
// has but the other did not know about keep their place after the block that
// precedes them here; placements for blocks deleted here are ignored.
export function applyLayout(blocks: CanvasBlock[], placements: BlockPlacement[]): CanvasBlock[] {
  const byId = new Map(blocks.map((block) => [block.id, block]));
  const placed = new Set<string>();
  const result: CanvasBlock[] = [];
  for (const placement of placements) {
    const block = byId.get(placement.id);
    if (!block || placed.has(block.id)) continue;
    placed.add(block.id);
    result.push({ ...block, layoutGroupId: placement.row, layoutColumnId: placement.column });
  }
  blocks.forEach((block, index) => {
    if (placed.has(block.id)) return;
    const previous = blocks.slice(0, index).reverse().find((item) => result.some((placedBlock) => placedBlock.id === item.id));
    result.splice(previous ? result.findIndex((item) => item.id === previous.id) + 1 : 0, 0, block);
    placed.add(block.id);
  });
  const title = result.findIndex((block) => block.isTitle);
  if (title > 0) result.unshift(...result.splice(title, 1));
  return result;
}

export interface DropBlock {
  id: string; rowId: string; title: boolean; drawing: boolean;
  left: number; right: number; top: number; bottom: number;
}

export function findBlockDrop(candidates: DropBlock[], x: number, y: number) {
  if (!candidates.length || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  const gap = (point: number, min: number, max: number) => Math.max(min - point, 0, point - max);
  // Select a visual row first. A short neighbouring column must not send a
  // pointer beside a tall drawing to a different row.
  const rows = new Map<string, { top: number; bottom: number; blocks: DropBlock[] }>();
  for (const block of candidates) {
    const row = rows.get(block.rowId);
    if (row) { row.top = Math.min(row.top, block.top); row.bottom = Math.max(row.bottom, block.bottom); row.blocks.push(block); }
    else rows.set(block.rowId, { top: block.top, bottom: block.bottom, blocks: [block] });
  }
  const row = [...rows.values()].reduce((best, next) => gap(y, next.top, next.bottom) < gap(y, best.top, best.bottom) ? next : best);
  // Above or below a row with several columns, the block gets a row of its own.
  if (new Set(row.blocks.map((block) => block.left)).size > 1 && (y < row.top || y > row.bottom)) {
    const edge = row.blocks.reduce((best, next) => gap(x, next.left, next.right) < gap(x, best.left, best.right) ? next : best);
    return { targetId: edge.id, side: false, before: y < row.top, row: true };
  }
  const target = row.blocks.reduce((best, next) => {
    const nextX = gap(x, next.left, next.right), bestX = gap(x, best.left, best.right);
    return nextX < bestX || (nextX === bestX && gap(y, next.top, next.bottom) < gap(y, best.top, best.bottom)) ? next : best;
  });
  const zone = target.drawing ? .38 : .24;
  const side = !target.title && y >= target.top && y <= target.bottom && (x < target.left + (target.right - target.left) * zone || x > target.right - (target.right - target.left) * zone);
  return { targetId: target.id, side, before: target.title ? false : side ? x < (target.left + target.right) / 2 : y < (target.top + target.bottom) / 2, row: false };
}
