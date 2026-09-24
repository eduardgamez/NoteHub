import { useMemo, useRef, useState } from 'react';
import { useWorkspace } from '../store/useWorkspace';
import type { Point, ToolMode } from '../types';
import { nearestBlock, projectStroke, type DocumentLayout } from '../lib/documentInk';

interface InkLayerProps {
  noteId: string;
  mode: ToolMode;
  toWorld: (clientX: number, clientY: number) => Point;
  layout: DocumentLayout;
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

export function InkLayer({ noteId, mode, toWorld, layout }: InkLayerProps) {
  const strokes = useWorkspace((state) => state.notes[noteId].strokes);
  const blocks = useWorkspace((state) => state.notes[noteId].blocks);
  const addStroke = useWorkspace((state) => state.addStroke);
  const removeStroke = useWorkspace((state) => state.removeStroke);
  const inkWidth = useWorkspace((state) => state.inkWidth);
  const [current, setCurrent] = useState<Point[]>([]);
  const drawing = useRef(false);

  const visible = useMemo(() => strokes.map((stroke) => projectStroke(stroke, blocks, layout)).filter((stroke) => stroke !== null), [strokes, blocks, layout]);

  function pointerDown(event: React.PointerEvent<SVGSVGElement>) {
    if (mode !== 'ink' && mode !== 'eraser') return;
    event.preventDefault();
    if (mode === 'eraser') { eraseAt(toWorld(event.clientX, event.clientY)); return; }
    drawing.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    setCurrent([toWorld(event.clientX, event.clientY)]);
  }

  function pointerMove(event: React.PointerEvent<SVGSVGElement>) {
    if (mode === 'eraser') { if (event.buttons) eraseAt(toWorld(event.clientX, event.clientY)); return; }
    if (!drawing.current) return;
    const events = event.nativeEvent.getCoalescedEvents?.() ?? [event.nativeEvent];
    setCurrent((points) => [...points, ...events.map((item) => ({ ...toWorld(item.clientX, item.clientY), pressure: item.pressure }))]);
  }

  function pointerUp(event: React.PointerEvent<SVGSVGElement>) {
    if (!drawing.current || !current.length) return;
    drawing.current = false;
    event.currentTarget.releasePointerCapture(event.pointerId);
    const xs = current.map((point) => point.x), ys = current.map((point) => point.y);
    const anchor = nearestBlock(current[0], blocks, layout);
    if (anchor) {
      const origin = layout[anchor.id];
      addStroke(noteId, {
        id: crypto.randomUUID(), color: '#4d8f80', width: inkWidth, anchorBlockId: anchor.id, anchorOrigin: { x: origin.x, y: origin.y }, space: 'block',
        points: current.map((point) => ({ ...point, x: point.x - origin.x, y: point.y - origin.y })),
        bounds: { x: Math.min(...xs) - 8 - origin.x, y: Math.min(...ys) - 8 - origin.y, width: Math.max(16, Math.max(...xs) - Math.min(...xs) + 16), height: Math.max(16, Math.max(...ys) - Math.min(...ys) + 16) },
      });
    } else addStroke(noteId, {
      id: crypto.randomUUID(), color: '#4d8f80', width: inkWidth, space: 'document', points: current,
      bounds: { x: Math.min(...xs) - 8, y: Math.min(...ys) - 8, width: Math.max(16, Math.max(...xs) - Math.min(...xs) + 16), height: Math.max(16, Math.max(...ys) - Math.min(...ys) + 16) },
    });
    setCurrent([]);
  }

  function eraseAt(point: Point) {
    const hit = visible.find((stroke) => point.x >= stroke.bounds.x - 10 && point.x <= stroke.bounds.x + stroke.bounds.width + 10 && point.y >= stroke.bounds.y - 10 && point.y <= stroke.bounds.y + stroke.bounds.height + 10 && stroke.points.some((sample) => Math.hypot(sample.x - point.x, sample.y - point.y) < 14));
    if (hit) removeStroke(noteId, hit.id);
  }

  const active = mode === 'ink' || mode === 'eraser';
  return <svg className={`ink-layer ${active ? 'active' : ''} ${mode === 'eraser' ? 'eraser' : ''}`} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp}>
    {visible.map((stroke) => <path key={stroke.id} d={pathFrom(stroke.points)} stroke={stroke.color} strokeWidth={stroke.width} fill="none" strokeLinecap="round" strokeLinejoin="round" />)}
    {current.length > 0 && <path d={pathFrom(current)} stroke="#4d8f80" strokeWidth={inkWidth} fill="none" strokeLinecap="round" strokeLinejoin="round" />}
  </svg>;
}
