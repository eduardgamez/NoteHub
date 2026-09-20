export interface SpatialBounds { id: string; x: number; y: number; width: number; height: number }
export interface SpatialRect { x: number; y: number; width: number; height: number }
export interface SpatialIndex { cellSize: number; cells: Map<string, Set<string>> }

const key = (x: number, y: number) => `${x}:${y}`;

export function buildSpatialIndex(items: SpatialBounds[], cellSize = 600): SpatialIndex {
  const cells = new Map<string, Set<string>>();
  items.forEach((item) => {
    const minX = Math.floor(item.x / cellSize), maxX = Math.floor((item.x + item.width) / cellSize);
    const minY = Math.floor(item.y / cellSize), maxY = Math.floor((item.y + item.height) / cellSize);
    for (let x = minX; x <= maxX; x += 1) for (let y = minY; y <= maxY; y += 1) {
      const cellKey = key(x, y); const cell = cells.get(cellKey) ?? new Set<string>(); cell.add(item.id); cells.set(cellKey, cell);
    }
  });
  return { cellSize, cells };
}

export function querySpatialIndex(index: SpatialIndex, rect: SpatialRect): Set<string> {
  const found = new Set<string>();
  const minX = Math.floor(rect.x / index.cellSize), maxX = Math.floor((rect.x + rect.width) / index.cellSize);
  const minY = Math.floor(rect.y / index.cellSize), maxY = Math.floor((rect.y + rect.height) / index.cellSize);
  for (let x = minX; x <= maxX; x += 1) for (let y = minY; y <= maxY; y += 1) index.cells.get(key(x, y))?.forEach((id) => found.add(id));
  return found;
}

export function intersects(item: SpatialBounds, rect: SpatialRect) {
  return item.x < rect.x + rect.width && item.x + item.width > rect.x && item.y < rect.y + rect.height && item.y + item.height > rect.y;
}
