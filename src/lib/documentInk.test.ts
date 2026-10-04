import { describe, expect, it } from 'vitest';
import { documentPageWidth, documentPoint, documentRowWidth, fitDocumentScale, readDocumentLayout } from './documentInk';

describe('uniform document scaling', () => {
  it('fits the same canonical page for every column layout', () => {
    expect(fitDocumentScale(340)).toBe(.4);
    expect(fitDocumentScale(1200)).toBe(1);
    expect(fitDocumentScale(0)).toBe(1);
  });

  it('widens rows with three or more columns instead of zooming text', () => {
    expect(documentRowWidth(1)).toBe(734);
    expect(documentRowWidth(2)).toBe(734);
    expect(documentRowWidth(3)).toBe(3 * 360 + 28);
    expect(documentPageWidth([734, 734])).toBe(850);
    expect(documentPageWidth([734, documentRowWidth(4)])).toBe(4 * 360 + 42 + 116);
  });

  it('widens a row for wide tables instead of wrapping its columns', () => {
    expect(documentRowWidth(2, [600, 160])).toBe(774);
    expect(documentRowWidth(2, [300, 160])).toBe(734);
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
