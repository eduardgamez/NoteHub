import type { CanvasBlock, InkStroke, Point } from '../types';

export interface DocumentRect { x: number; y: number; width: number; height: number }
export type DocumentLayout = Record<string, DocumentRect>;

export function readDocumentLayout(page: HTMLElement): DocumentLayout {
  const pageRect = page.getBoundingClientRect();
  const layout: DocumentLayout = {};
  page.querySelectorAll<HTMLElement>('[data-block-id]').forEach((element) => {
    const rect = element.getBoundingClientRect();
    layout[element.dataset.blockId!] = { x: rect.left - pageRect.left, y: rect.top - pageRect.top, width: rect.width, height: rect.height };
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
