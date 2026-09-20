import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LocateFixed, Minus, Plus } from 'lucide-react';
import { useWorkspace } from '../store/useWorkspace';
import type { BlockType, Point } from '../types';
import { makeBlock } from '../lib/blockFactory';
import { BlockCard } from './BlockCard';
import { CanvasToolbar } from './CanvasToolbar';
import { InkLayer } from './InkLayer';

interface Camera { x: number; y: number; zoom: number }

export function CanvasWorkspace() {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const note = useWorkspace((state) => state.notes[state.activeNoteId]);
  const selectedIds = useWorkspace((state) => state.selectedIds);
  const selectBlock = useWorkspace((state) => state.selectBlock);
  const clearSelection = useWorkspace((state) => state.clearSelection);
  const upsertBlock = useWorkspace((state) => state.upsertBlock);
  const tool = useWorkspace((state) => state.tool);
  const setTool = useWorkspace((state) => state.setTool);
  const setAiOpen = useWorkspace((state) => state.setAiOpen);
  const removeSelectedBlocks = useWorkspace((state) => state.removeSelectedBlocks);
  const [camera, setCamera] = useState<Camera>({ x: 10, y: 8, zoom: 0.8 });
  const [viewport, setViewport] = useState({ width: 1200, height: 800 });
  const panRef = useRef<{ x: number; y: number; camera: Camera } | null>(null);

  useEffect(() => {
    const element = surfaceRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setViewport({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.isContentEditable || target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') return;
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedIds.length) removeSelectedBlocks();
      if (event.key.toLowerCase() === 'v') setTool('select');
      if (event.key.toLowerCase() === 'd') setTool('ink');
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [removeSelectedBlocks, selectedIds.length, setTool]);

  const visibleRect = useMemo(() => ({ x: (-camera.x / camera.zoom) - 400, y: (-camera.y / camera.zoom) - 400, width: viewport.width / camera.zoom + 800, height: viewport.height / camera.zoom + 800 }), [camera, viewport]);
  const visibleBlocks = useMemo(() => note.blocks.filter((block) => block.x < visibleRect.x + visibleRect.width && block.x + block.width > visibleRect.x && block.y < visibleRect.y + visibleRect.height && block.y + block.height > visibleRect.y), [note.blocks, visibleRect]);

  const toWorld = useCallback((clientX: number, clientY: number): Point => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    return { x: (clientX - (rect?.left ?? 0) - camera.x) / camera.zoom, y: (clientY - (rect?.top ?? 0) - camera.y) / camera.zoom };
  }, [camera]);

  function zoomAt(nextZoom: number, clientX = viewport.width / 2, clientY = viewport.height / 2) {
    const zoom = Math.min(2, Math.max(0.3, nextZoom));
    setCamera((current) => {
      const worldX = (clientX - current.x) / current.zoom;
      const worldY = (clientY - current.y) / current.zoom;
      return { zoom, x: clientX - worldX * zoom, y: clientY - worldY * zoom };
    });
  }

  function onWheel(event: React.WheelEvent) {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    if (event.ctrlKey || event.metaKey) zoomAt(camera.zoom * Math.exp(-event.deltaY * 0.006), event.clientX - rect.left, event.clientY - rect.top);
    else setCamera((current) => ({ ...current, x: current.x - event.deltaX, y: current.y - event.deltaY }));
  }

  function onPointerDown(event: React.PointerEvent) {
    if (tool === 'ink') return;
    if (event.button !== 0 && event.button !== 1) return;
    if (event.target === event.currentTarget || (event.target as Element).classList.contains('canvas-grid')) clearSelection();
    panRef.current = { x: event.clientX, y: event.clientY, camera };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: React.PointerEvent) {
    if (!panRef.current) return;
    setCamera({ ...panRef.current.camera, x: panRef.current.camera.x + event.clientX - panRef.current.x, y: panRef.current.camera.y + event.clientY - panRef.current.y });
  }

  function onPointerUp(event: React.PointerEvent) {
    if (!panRef.current) return;
    panRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function addBlock(type: BlockType) {
    const center = toWorld((surfaceRef.current?.getBoundingClientRect().left ?? 0) + viewport.width / 2, (surfaceRef.current?.getBoundingClientRect().top ?? 0) + viewport.height / 2);
    const block = makeBlock(type, Math.round(center.x - 180), Math.round(center.y - 100));
    upsertBlock(note.id, block);
    selectBlock(block.id);
  }

  function addImage(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const center = toWorld((surfaceRef.current?.getBoundingClientRect().left ?? 0) + viewport.width / 2, (surfaceRef.current?.getBoundingClientRect().top ?? 0) + viewport.height / 2);
      const block = { ...makeBlock('image', center.x - 190, center.y - 130), width: 420, height: 320, content: String(reader.result), caption: file.name };
      upsertBlock(note.id, block); selectBlock(block.id);
    };
    reader.readAsDataURL(file);
  }

  function askAI() { setAiOpen(true); }

  return <main className={`canvas-shell tool-${tool}`}>
    <CanvasToolbar addBlock={addBlock} onImage={() => imageRef.current?.click()} onAskAI={askAI} />
    <input ref={imageRef} hidden type="file" accept="image/*" capture="environment" onChange={(event) => addImage(event.target.files?.[0])} />
    <div ref={surfaceRef} className="canvas-viewport" onWheel={onWheel} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
      <div className="canvas-grid" style={{ backgroundPosition: `${camera.x}px ${camera.y}px`, backgroundSize: `${24 * camera.zoom}px ${24 * camera.zoom}px` }} />
      <div className="canvas-world" style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})` }}>
        {visibleBlocks.map((block) => <BlockCard key={block.id} block={block} zoom={camera.zoom} selected={selectedIds.includes(block.id)} onAskAI={askAI} />)}
        <InkLayer noteId={note.id} active={tool === 'ink'} toWorld={toWorld} visibleRect={visibleRect} />
      </div>
      <div className="canvas-meta"><span>{note.emoji}</span><div><strong>{note.title}</strong><small>{visibleBlocks.length} of {note.blocks.length} blocks rendered</small></div></div>
      <div className="zoom-controls"><button onClick={() => zoomAt(camera.zoom - 0.1)}><Minus size={15} /></button><button className="zoom-value" onClick={() => zoomAt(1)}>{Math.round(camera.zoom * 100)}%</button><button onClick={() => zoomAt(camera.zoom + 0.1)}><Plus size={15} /></button><button onClick={() => setCamera({ x: 10, y: 8, zoom: 0.8 })}><LocateFixed size={15} /></button></div>
    </div>
  </main>;
}
