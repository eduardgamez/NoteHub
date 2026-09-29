import type { AITextSelection } from '../types';

export function captureTextSelection(range: Range | null, noteId: string, page: HTMLElement | null): AITextSelection | null {
  if (!range || !page || !page.contains(range.commonAncestorContainer)) return null;
  const text = range.toString().trim();
  if (!text) return null;
  const blockIds = [...page.querySelectorAll<HTMLElement>('.canvas-block[data-block-id]')]
    .filter((element) => range.intersectsNode(element))
    .map((element) => element.dataset.blockId!)
    .filter((id, index, ids) => ids.indexOf(id) === index);
  return blockIds.length ? { noteId, text, blockIds } : null;
}
