import { describe, expect, it } from 'vitest';
import { documentPoint, fitDocumentScale, readDocumentLayout } from './documentInk';

describe('uniform document scaling', () => {
  it('fits the same canonical page for every column layout', () => {
    expect(fitDocumentScale(340)).toBe(.4);
    expect(fitDocumentScale(1200)).toBe(1);
    expect(fitDocumentScale(0)).toBe(1);
  });

  it('zooms narrow screens so two of three or more columns fit across', () => {
    expect(fitDocumentScale(340, 2)).toBe(.4);
    const three = fitDocumentScale(380, 3);
    const column = (850 - 116 - 28) / 3;
    expect(three).toBeCloseTo(380 / (58 + 2 * column + 14));
    expect(fitDocumentScale(380, 4)).toBeGreaterThan(three);
    expect(fitDocumentScale(800, 3)).toBe(800 / 850);
    expect(fitDocumentScale(560, 4)).toBe(1);
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
