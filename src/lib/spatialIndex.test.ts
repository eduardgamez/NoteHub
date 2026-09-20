import { describe, expect, it } from 'vitest';
import { buildSpatialIndex, querySpatialIndex } from './spatialIndex';

describe('spatial index', () => {
  it('limits a large canvas query to nearby cells', () => {
    const items = Array.from({ length: 10000 }, (_, index) => ({ id: String(index), x: (index % 100) * 300, y: Math.floor(index / 100) * 300, width: 120, height: 120 }));
    const index = buildSpatialIndex(items);
    const visible = querySpatialIndex(index, { x: 0, y: 0, width: 800, height: 800 });
    expect(visible.size).toBeLessThan(100);
    expect(visible.has('0')).toBe(true);
    expect(visible.has('9999')).toBe(false);
  });
});
