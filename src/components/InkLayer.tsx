import { useMemo, useRef, useState } from 'react';
import { useWorkspace } from '../store/useWorkspace';
import type { Point } from '../types';

interface InkLayerProps {
  noteId: string;
  active: boolean;
  toWorld: (clientX: number, clientY: number) => Point;
  visibleRect: { x: number; y: number; width: number; height: number };
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

export function InkLayer({ noteId, active, toWorld, visibleRect }: InkLayerProps) {
  const strokes = useWorkspace((state) => state.notes[noteId].strokes);
  const addStroke = useWorkspace((state) => state.addStroke);
  const [current, setCurrent] = useState<Point[]>([]);
  const drawing = useRef(false);

  const visible = useMemo(() => strokes.filter((stroke) => {
    const b = stroke.bounds;
    return b.x < visibleRect.x + visibleRect.width && b.x + b.width > visibleRect.x && b.y < visibleRect.y + visibleRect.height && b.y + b.height > visibleRect.y;
  }), [strokes, visibleRect]);

  function pointerDown(event: React.PointerEvent<SVGSVGElement>) {
    if (!active) return;
    event.preventDefault();
    drawing.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    setCurrent([toWorld(event.clientX, event.clientY)]);
  }

  function pointerMove(event: React.PointerEvent<SVGSVGElement>) {
    if (!drawing.current) return;
    const events = event.nativeEvent.getCoalescedEvents?.() ?? [event.nativeEvent];
    setCurrent((points) => [...points, ...events.map((item) => ({ ...toWorld(item.clientX, item.clientY), pressure: item.pressure }))]);
  }

  function pointerUp(event: React.PointerEvent<SVGSVGElement>) {
    if (!drawing.current || !current.length) return;
    drawing.current = false;
    event.currentTarget.releasePointerCapture(event.pointerId);
    const xs = current.map((point) => point.x), ys = current.map((point) => point.y);
    addStroke(noteId, {
      id: crypto.randomUUID(), color: '#315c54', width: 2.5, points: current,
      bounds: { x: Math.min(...xs) - 8, y: Math.min(...ys) - 8, width: Math.max(16, Math.max(...xs) - Math.min(...xs) + 16), height: Math.max(16, Math.max(...ys) - Math.min(...ys) + 16) },
    });
    setCurrent([]);
  }

  return <svg className={`ink-layer ${active ? 'active' : ''}`} width="5000" height="3500" viewBox="0 0 5000 3500" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp}>
    {visible.map((stroke) => <path key={stroke.id} d={pathFrom(stroke.points)} stroke={stroke.color} strokeWidth={stroke.width} fill="none" strokeLinecap="round" strokeLinejoin="round" />)}
    {current.length > 0 && <path d={pathFrom(current)} stroke="#315c54" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />}
  </svg>;
}
