import type { CanvasBlock, InkStroke, Point } from '../types';

export interface DocumentRect { x: number; y: number; width: number; height: number }
export type DocumentLayout = Record<string, DocumentRect>;

export function strokeIntersectsRect(stroke: InkStroke, rect: DocumentRect): boolean {
  const left = rect.x - stroke.width / 2;
  const top = rect.y - stroke.width / 2;
  const right = rect.x + rect.width + stroke.width / 2;
  const bottom = rect.y + rect.height + stroke.width / 2;
  const inside = (point: Point) => point.x >= left && point.x <= right && point.y >= top && point.y <= bottom;
  if (stroke.points.some(inside)) return true;
  for (let index = 1; index < stroke.points.length; index++) {
    const first = stroke.points[index - 1];
    const second = stroke.points[index];
    let start = 0;
    let end = 1;
    const dx = second.x - first.x;
    const dy = second.y - first.y;
    for (const [p, q] of [[-dx, first.x - left], [dx, right - first.x], [-dy, first.y - top], [dy, bottom - first.y]]) {
      if (p === 0) { if (q < 0) { start = 1; end = 0; break; } }
      else if (p < 0) start = Math.max(start, q / p);
      else end = Math.min(end, q / p);
    }
    if (start <= end) return true;
  }
  return false;
}

export const DOCUMENT_WIDTH = 850;

const DOCUMENT_PADDING = 58;
const COLUMN_GAP = 14;
const MIN_VISIBLE_COLUMN = 160;

// The page is always laid out at DOCUMENT_WIDTH so text, blocks and ink keep
// the same geometry everywhere. When a row has 3+ columns and fitting the whole
// page would make them too narrow, zoom so two columns fill the screen and the
// rest is reached by scrolling sideways.
export function fitDocumentScale(availableWidth: number, maxColumns = 1): number {
  if (availableWidth <= 0) return 1;
  const fit = Math.min(1, availableWidth / DOCUMENT_WIDTH);
  if (maxColumns < 3) return fit;
  const column = (DOCUMENT_WIDTH - 2 * DOCUMENT_PADDING - COLUMN_GAP * (maxColumns - 1)) / maxColumns;
  if (column * fit >= MIN_VISIBLE_COLUMN) return fit;
  return Math.max(fit, Math.min(1, availableWidth / (DOCUMENT_PADDING + 2 * column + COLUMN_GAP)));
}

export function readDocumentScale(page: HTMLElement): number {
  return page.offsetWidth > 0 ? page.getBoundingClientRect().width / page.offsetWidth || 1 : 1;
}

export function documentPoint(page: HTMLElement, clientX: number, clientY: number): Point {
  const rect = page.getBoundingClientRect();
  const scale = readDocumentScale(page);
  return { x: (clientX - rect.left) / scale, y: (clientY - rect.top) / scale };
}

export function readDocumentLayout(page: HTMLElement): DocumentLayout {
  const pageRect = page.getBoundingClientRect();
  const scale = readDocumentScale(page);
  const layout: DocumentLayout = {};
  page.querySelectorAll<HTMLElement>('[data-block-id]').forEach((element) => {
    const rect = element.getBoundingClientRect();
    layout[element.dataset.blockId!] = { x: (rect.left - pageRect.left) / scale, y: (rect.top - pageRect.top) / scale, width: rect.width / scale, height: rect.height / scale };
  });
  return layout;
}

export function nearestBlock(point: Point, blocks: CanvasBlock[], layout: DocumentLayout): CanvasBlock | undefined {
  return blocks.filter((block) => layout[block.id]).reduce<CanvasBlock | undefined>((nearest, block) => {
    const distance = (candidate: CanvasBlock) => {
      const rect = layout[candidate.id];
      const dx = Math.max(rect.x - point.x, 0, point.x - rect.x - rect.width);
      const dy = Math.max(rect.y - point.y, 0, point.y - rect.y - rect.height);
      return dx * dx + dy * dy;
    };
    return !nearest || distance(block) < distance(nearest) ? block : nearest;
  }, undefined);
}

export function projectStroke(stroke: InkStroke, blocks: CanvasBlock[], layout: DocumentLayout): InkStroke | null {
  if (stroke.space === 'document') return stroke;
  const anchor = stroke.space === 'block'
    ? blocks.find((block) => block.id === stroke.anchorBlockId)
    : blocks.reduce<CanvasBlock | undefined>((nearest, block) => {
        const distance = (candidate: CanvasBlock) => {
          const x = Math.max(candidate.x - stroke.bounds.x, 0, stroke.bounds.x - candidate.x - candidate.width);
          const y = Math.max(candidate.y - stroke.bounds.y, 0, stroke.bounds.y - candidate.y - candidate.height);
          return x * x + y * y;
        };
        return !nearest || distance(block) < distance(nearest) ? block : nearest;
      }, undefined);
  if ((!anchor || !layout[anchor.id]) && stroke.space === 'block' && stroke.anchorOrigin) {
    return { ...stroke, points: stroke.points.map((point) => ({ ...point, x: point.x + stroke.anchorOrigin!.x, y: point.y + stroke.anchorOrigin!.y })), bounds: { ...stroke.bounds, x: stroke.bounds.x + stroke.anchorOrigin.x, y: stroke.bounds.y + stroke.anchorOrigin.y } };
  }
  if (!anchor || !layout[anchor.id]) return stroke.space === 'block' ? null : stroke;
  const rect = layout[anchor.id];
  const dx = stroke.space === 'block' ? rect.x : rect.x - anchor.x;
  const dy = stroke.space === 'block' ? rect.y : rect.y - anchor.y;
  return {
    ...stroke,
    anchorBlockId: anchor.id,
    points: stroke.points.map((point) => ({ ...point, x: point.x + dx, y: point.y + dy })),
    bounds: { ...stroke.bounds, x: stroke.bounds.x + dx, y: stroke.bounds.y + dy },
  };
}
