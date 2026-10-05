import { memo, useMemo, useRef } from 'react';
import { useWorkspace } from '../store/useWorkspace';
import type { Point, ToolMode } from '../types';
import { nearestBlock, projectStroke, type DocumentLayout } from '../lib/documentInk';

interface InkLayerProps {
  noteId: string;
  mode: ToolMode;
  toWorld: (clientX: number, clientY: number) => Point;
  layout: DocumentLayout;
  moving?: { ids: string[]; dx: number; dy: number } | null;
}

function pathFrom(points: Point[]) {
  if (!points.length) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y} l 0.1 0`;
  return points.reduce((path, point, index) => {
    if (index === 0) return `M ${point.x} ${point.y}`;
    const previous = points[index - 1];
    const midX = (previous.x + point.x) / 2;
    const midY = (previous.y + point.y) / 2;
    return `${path} Q ${previous.x} ${previous.y} ${midX} ${midY}`;
  }, '');
}

export function InkLayer({ noteId, mode, toWorld, layout, moving }: InkLayerProps) {
  const strokes = useWorkspace((state) => state.notes[noteId].strokes);
  const blocks = useWorkspace((state) => state.notes[noteId].blocks);
  const addStroke = useWorkspace((state) => state.addStroke);
  const removeStroke = useWorkspace((state) => state.removeStroke);
  const inkWidth = useWorkspace((state) => state.inkWidth);
  const inkColor = useWorkspace((state) => state.inkColor);
  const currentRef = useRef<Point[]>([]);
  const currentPath = useRef<SVGPathElement>(null);
  const frame = useRef<number | null>(null);
  const activePointer = useRef<number | null>(null);
  // Mapping from screen to page coordinates, measured once per stroke so the
  // pen never forces a layout read on every sample.
  const mapping = useRef({ x: 0, y: 0, scale: 1 });

  const visible = useMemo(() => strokes.map((stroke) => projectStroke(stroke, blocks, layout)).filter((stroke) => stroke !== null), [strokes, blocks, layout]);

  function pagePoint(clientX: number, clientY: number, pressure: number): Point {
    const { x, y, scale } = mapping.current;
    return { x: x + clientX / scale, y: y + clientY / scale, pressure };
  }

  function drawCurrent() {
    frame.current = null;
    currentPath.current?.setAttribute('d', pathFrom(currentRef.current));
  }

  function scheduleDraw() {
    if (frame.current === null) frame.current = requestAnimationFrame(drawCurrent);
  }

  function addPoint(point: Point) {
    const points = currentRef.current;
    const last = points[points.length - 1];
    // Drop samples closer than half a page pixel: they add no detail and make
    // the curve jittery.
    if (last && Math.hypot(point.x - last.x, point.y - last.y) < 0.5) return;
    points.push(point);
  }

  function pointerDown(event: React.PointerEvent<SVGSVGElement>) {
    if (event.shiftKey) return;
    if (mode !== 'ink' && mode !== 'eraser') return;
    // Fingers and the palm scroll the page; only the pen or a mouse draws.
    if (event.pointerType === 'touch') return;
    if (activePointer.current !== null) return;
    event.preventDefault();
    activePointer.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    const origin = toWorld(0, 0), unit = toWorld(1, 1);
    mapping.current = { x: origin.x, y: origin.y, scale: 1 / ((unit.x - origin.x) || 1) };
    if (mode === 'eraser') { eraseAt(toWorld(event.clientX, event.clientY)); return; }
    currentRef.current = [];
    currentPath.current?.setAttribute('stroke', inkColor);
    currentPath.current?.setAttribute('stroke-width', String(inkWidth));
    addPoint(pagePoint(event.clientX, event.clientY, event.pressure));
    drawCurrent();
  }

  function pointerMove(event: React.PointerEvent<SVGSVGElement>) {
    if (activePointer.current !== event.pointerId) return;
    if (mode === 'eraser') { eraseAt(toWorld(event.clientX, event.clientY)); return; }
    const coalesced = event.nativeEvent.getCoalescedEvents?.();
    const events = coalesced?.length ? coalesced : [event.nativeEvent];
    for (const item of events) addPoint(pagePoint(item.clientX, item.clientY, item.pressure));
    scheduleDraw();
  }

  function pointerUp(event: React.PointerEvent<SVGSVGElement>) {
    if (activePointer.current !== event.pointerId) return;
    activePointer.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (mode === 'eraser') return;
    if (event.type === 'pointerup') addPoint(pagePoint(event.clientX, event.clientY, event.pressure));
    const current = currentRef.current;
    currentRef.current = [];
    if (frame.current !== null) { cancelAnimationFrame(frame.current); frame.current = null; }
    currentPath.current?.setAttribute('d', '');
    if (!current.length) return;
    const xs = current.map((point) => point.x), ys = current.map((point) => point.y);
    const anchor = nearestBlock(current[0], blocks, layout);
    if (anchor) {
      const origin = layout[anchor.id];
      addStroke(noteId, {
        id: crypto.randomUUID(), color: inkColor, width: inkWidth, anchorBlockId: anchor.id, anchorOrigin: { x: origin.x, y: origin.y }, space: 'block',
        points: current.map((point) => ({ ...point, x: point.x - origin.x, y: point.y - origin.y })),
        bounds: { x: Math.min(...xs) - 8 - origin.x, y: Math.min(...ys) - 8 - origin.y, width: Math.max(16, Math.max(...xs) - Math.min(...xs) + 16), height: Math.max(16, Math.max(...ys) - Math.min(...ys) + 16) },
      });
    } else addStroke(noteId, {
      id: crypto.randomUUID(), color: inkColor, width: inkWidth, space: 'document', points: current,
      bounds: { x: Math.min(...xs) - 8, y: Math.min(...ys) - 8, width: Math.max(16, Math.max(...xs) - Math.min(...xs) + 16), height: Math.max(16, Math.max(...ys) - Math.min(...ys) + 16) },
    });
  }

  function eraseAt(point: Point) {
    const hit = visible.find((stroke) => point.x >= stroke.bounds.x - 10 && point.x <= stroke.bounds.x + stroke.bounds.width + 10 && point.y >= stroke.bounds.y - 10 && point.y <= stroke.bounds.y + stroke.bounds.height + 10 && stroke.points.some((sample) => Math.hypot(sample.x - point.x, sample.y - point.y) < 14));
    if (hit) removeStroke(noteId, hit.id);
  }

  const active = mode === 'ink' || mode === 'eraser';
  return <svg className={`ink-layer ${active ? 'active' : ''} ${mode === 'eraser' ? 'eraser' : ''}`} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp}>
    {visible.map((stroke) => <StrokePath key={stroke.id} points={stroke.points} color={stroke.color} width={stroke.width} transform={moving?.ids.includes(stroke.id) ? `translate(${moving.dx} ${moving.dy})` : undefined} />)}
    <path ref={currentPath} stroke={inkColor} strokeWidth={inkWidth} fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}

// Saved strokes only rebuild their path when their own points change, not on
// every render of the layer.
const StrokePath = memo(function StrokePath({ points, color, width, transform }: { points: Point[]; color: string; width: number; transform?: string }) {
  const d = useMemo(() => pathFrom(points), [points]);
  return <path d={d} transform={transform} stroke={color} strokeWidth={width} fill="none" strokeLinecap="round" strokeLinejoin="round" />;
});
