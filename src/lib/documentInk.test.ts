import { describe, expect, it } from 'vitest';
import { documentPoint, fitDocumentScale, readDocumentLayout } from './documentInk';

describe('uniform document scaling', () => {
  it('fits up to two columns and scrolls for three or more', () => {
    expect(fitDocumentScale(340, 1)).toBe(.4);
    expect(fitDocumentScale(340, 2)).toBe(.4);
    expect(fitDocumentScale(340, 3)).toBe(1);
    expect(fitDocumentScale(1200, 2)).toBe(1);
    expect(fitDocumentScale(0, 1)).toBe(1);
  });

  it('measures blocks and maps pointer input in canonical coordinates', () => {
    const page = document.createElement('article');
    const block = document.createElement('div'); block.dataset.blockId = 'drawing'; page.append(block);
    Object.defineProperty(page, 'offsetWidth', { value: 850 });
    page.getBoundingClientRect = () => ({ left: 10, top: 100, width: 425 } as DOMRect);
    block.getBoundingClientRect = () => ({ left: 39, top: 150, width: 200, height: 150 } as DOMRect);
    expect(readDocumentLayout(page)).toEqual({ drawing: { x: 58, y: 100, width: 400, height: 300 } });
    expect(documentPoint(page, 39, 150)).toEqual({ x: 58, y: 100 });
  });
});
