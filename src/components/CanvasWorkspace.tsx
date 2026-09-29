import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { GripVertical, Sparkles } from 'lucide-react';
import { useWorkspace } from '../store/useWorkspace';
import { captureTextSelection } from '../ai/textSelection';
import type { AITextSelection, BlockType, CanvasBlock, Point } from '../types';
import { makeBlock } from '../lib/blockFactory';
import { BlockCard } from './BlockCard';
import { CanvasToolbar } from './CanvasToolbar';
import { InkLayer } from './InkLayer';
import { projectStroke, readDocumentLayout, strokeIntersectsRect, type DocumentLayout, type DocumentRect } from '../lib/documentInk';

function selectionRect(start: Point, end: Point): DocumentRect {
  return { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) };
}

export function CanvasWorkspace() {
  const pageRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<{ blockId: string; startX: number; startY: number; clientX: number; clientY: number; targetId?: string; before?: boolean; side?: boolean } | null>(null);
  const marqueeRef = useRef<{ pointerId: number; start: Point; dragging: boolean } | null>(null);
  const inkMoveRef = useRef<{ pointerId: number; startX: number; startY: number; ids: string[] } | null>(null);
  const crossTextRangeRef = useRef<Range | null>(null);
  const crossTextToolsRef = useRef<HTMLDivElement>(null);
  const [dropTarget, setDropTarget] = useState<{ blockId: string; targetId: string; before: boolean; side: boolean } | null>(null);
  const [marquee, setMarquee] = useState<DocumentRect | null>(null);
  const [selectedStrokeIds, setSelectedStrokeIds] = useState<string[]>([]);
  const [inkMove, setInkMove] = useState<{ ids: string[]; dx: number; dy: number } | null>(null);
  const [layout, setLayout] = useState<DocumentLayout>({});
  const [contentWidth, setContentWidth] = useState(0);
  const [crossTextPosition, setCrossTextPosition] = useState<{ left: number; top: number } | null>(null);
  const note = useWorkspace((state) => state.notes[state.activeNoteId]);
  const selectedIds = useWorkspace((state) => state.selectedIds);
  const activeBlockId = useWorkspace((state) => state.activeBlockId);
  const setActiveBlockId = useWorkspace((state) => state.setActiveBlockId);
  const clearSelection = useWorkspace((state) => state.clearSelection);
  const insertBlockAfter = useWorkspace((state) => state.insertBlockAfter);
  const reorderBlock = useWorkspace((state) => state.reorderBlock);
  const tool = useWorkspace((state) => state.tool);
  const setTool = useWorkspace((state) => state.setTool);
  const setAiOpen = useWorkspace((state) => state.setAiOpen);
  const setAiTextSelection = useWorkspace((state) => state.setAiTextSelection);
  const removeSelectedBlocks = useWorkspace((state) => state.removeSelectedBlocks);
  const copySelectedBlocks = useWorkspace((state) => state.copySelectedBlocks);
  const pasteBlocks = useWorkspace((state) => state.pasteBlocks);
  const undo = useWorkspace((state) => state.undo);
  const redo = useWorkspace((state) => state.redo);
  const moveStrokes = useWorkspace((state) => state.moveStrokes);

  useEffect(() => { setSelectedStrokeIds([]); setMarquee(null); setInkMove(null); marqueeRef.current = null; inkMoveRef.current = null; }, [note.id]);

  useEffect(() => {
    if (tool !== 'ink') return;
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && pageRef.current?.contains(focused)) focused.blur();
    window.getSelection()?.removeAllRanges();
  }, [tool, note.id]);

  useEffect(() => {
    const update = () => {
      if (crossTextToolsRef.current?.contains(document.activeElement)) return;
      const selection = window.getSelection();
      const range = selection && !selection.isCollapsed && selection.rangeCount ? selection.getRangeAt(0) : null;
      const captured = captureTextSelection(range, note.id, pageRef.current);
      if (!range || !captured || captured.blockIds.length < 2) { crossTextRangeRef.current = null; setCrossTextPosition(null); return; }
      const rect = range.getBoundingClientRect();
      if (!rect.width && !rect.height) return;
      crossTextRangeRef.current = range.cloneRange();
      setCrossTextPosition({ left: Math.max(8, Math.min(rect.right + 8, window.innerWidth - 45)), top: Math.max(8, Math.min(rect.top - 35, window.innerHeight - 45)) });
    };
    const close = () => { crossTextRangeRef.current = null; setCrossTextPosition(null); };
    document.addEventListener('selectionchange', update);
    document.addEventListener('pointerup', update);
    document.addEventListener('keyup', update);
    document.addEventListener('scroll', close, true);
    return () => { document.removeEventListener('selectionchange', update); document.removeEventListener('pointerup', update); document.removeEventListener('keyup', update); document.removeEventListener('scroll', close, true); };
  }, [note.id]);

  useLayoutEffect(() => {
    const page = pageRef.current;
    if (!page) return;
    const measure = () => {
      setLayout(readDocumentLayout(page));
      const width = page.querySelector<HTMLElement>('.document-blocks')?.clientWidth ?? 0;
      setContentWidth((previous) => previous === width ? previous : width);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(page);
    page.querySelectorAll<HTMLElement>('[data-block-id]').forEach((element) => observer.observe(element));
    measure();
    return () => observer.disconnect();
  }, [note.id, note.blocks]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && (selectedIds.length || activeBlockId || selectedStrokeIds.length)) { clearSelection(); setSelectedStrokeIds([]); setMarquee(null); return; }
      const target = event.target as HTMLElement;
      if (target.isContentEditable || target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') return;
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedIds.length) removeSelectedBlocks();
      if (event.key.toLowerCase() === 'v') setTool('select');
      if (event.key.toLowerCase() === 'd') setTool('ink');
      if (event.key.toLowerCase() === 'e') setTool('eraser');
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c') copySelectedBlocks();
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'v') pasteBlocks();
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) redo(note.id); else undo(note.id); }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [activeBlockId, clearSelection, copySelectedBlocks, note.id, pasteBlocks, redo, removeSelectedBlocks, selectedIds.length, selectedStrokeIds.length, setTool, undo]);

  function addBlock(type: BlockType) {
    const block = makeBlock(type, 0, 0);
    insertBlockAfter(note.id, block, activeBlockId);
    setActiveBlockId(block.id);
  }

  function addImage(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const block = { ...makeBlock('image', 0, 0), width: 640, height: 320, content: String(reader.result), caption: file.name };
      insertBlockAfter(note.id, block, activeBlockId);
      setActiveBlockId(block.id);
    };
    reader.readAsDataURL(file);
  }

  const toPage = useCallback((clientX: number, clientY: number): Point => {
    const rect = pageRef.current?.getBoundingClientRect();
    return { x: clientX - (rect?.left ?? 0), y: clientY - (rect?.top ?? 0) };
  }, []);
  const askAI = useCallback((selection?: AITextSelection) => {
    setAiTextSelection(selection ?? null);
    setAiOpen(true);
    window.getSelection()?.removeAllRanges();
    requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>('.ai-panel .ai-composer textarea')?.focus());
  }, [setAiOpen, setAiTextSelection]);
  const startReorder = useCallback((blockId: string, clientX: number, clientY: number) => {
    dragRef.current = { blockId, startX: clientX, startY: clientY, clientX, clientY };
  }, []);
  const moveReorder = useCallback((blockId: string, clientX: number, clientY: number) => {
    const drag = dragRef.current;
    if (!drag || drag.blockId !== blockId) return;
    drag.clientX = clientX;
    drag.clientY = clientY;
    if (Math.hypot(clientX - drag.startX, clientY - drag.startY) < 5) return;
    const page = pageRef.current;
    if (!page) return;
    const viewport = page.closest<HTMLElement>('.document-viewport');
    const horizontalBounds = (viewport ?? page).getBoundingClientRect();
    if (clientX < horizontalBounds.left || clientX > horizontalBounds.right) { setDropTarget(null); drag.targetId = undefined; return; }
    const candidates = [...page.querySelectorAll<HTMLElement>('.document-block-column > [data-block-id]')].filter((element) => element.dataset.blockId !== blockId);
    if (!candidates.length) return;
    const distance = (element: HTMLElement) => {
      const rect = element.getBoundingClientRect();
      const horizontalGap = Math.max(rect.left - clientX, 0, clientX - rect.right);
      const verticalGap = Math.max(rect.top - clientY, 0, clientY - rect.bottom);
      return verticalGap * 4 + horizontalGap * .1;
    };
    const target = candidates.reduce((closest, element) => distance(element) < distance(closest) ? element : closest);
    const bounds = target.getBoundingClientRect();
    const sideMargin = 34;
    const side = !target.classList.contains('title-block') && clientY >= bounds.top - sideMargin && clientY <= bounds.bottom + sideMargin && (clientX < bounds.left + bounds.width * .24 || clientX > bounds.right - bounds.width * .24);
    const before = side ? clientX < bounds.left + bounds.width / 2 : clientY < bounds.top + bounds.height / 2;
    drag.targetId = target.dataset.blockId;
    drag.before = before;
    drag.side = side;
    setDropTarget((previous) => previous?.blockId === blockId && previous.targetId === drag.targetId && previous.before === before && previous.side === side ? previous : { blockId, targetId: drag.targetId!, before, side });
    if (viewport) {
      const edge = viewport.getBoundingClientRect();
      if (clientY < edge.top + 55) viewport.scrollBy(0, -18);
      else if (clientY > edge.bottom - 55) viewport.scrollBy(0, 18);
    }
  }, []);
  useEffect(() => {
    if (!dropTarget) return;
    const timer = window.setInterval(() => {
      const drag = dragRef.current;
      if (drag) moveReorder(drag.blockId, drag.clientX, drag.clientY);
    }, 40);
    return () => window.clearInterval(timer);
  }, [dropTarget, moveReorder]);
  const endReorder = useCallback((blockId: string, cancel = false) => {
    const drag = dragRef.current;
    dragRef.current = null;
    setDropTarget(null);
    if (!cancel && drag?.blockId === blockId && drag.targetId) reorderBlock(note.id, blockId, drag.targetId, Boolean(drag.before), Boolean(drag.side));
  }, [note.id, reorderBlock]);

  const rows: { id: string; columns: { id: string; blocks: CanvasBlock[] }[] }[] = [];
  for (const block of note.blocks) {
    const groupId = block.layoutGroupId ?? block.id;
    const columnId = block.layoutColumnId ?? block.id;
    let row = rows.find((item) => item.id === groupId);
    if (!row) { row = { id: groupId, columns: [] }; rows.push(row); }
    let column = row.columns.find((item) => item.id === columnId);
    if (!column) { column = { id: columnId, blocks: [] }; row.columns.push(column); }
    column.blocks.push(block);
  }
  const columnMinWidth = (blocks: CanvasBlock[]) => Math.min(contentWidth || 734, Math.max(160, ...blocks.filter((block) => block.type === 'table').map((block) => (block.tableColumnWidths?.reduce((sum, width) => sum + width, 4) ?? (block.tableColumnCount ?? (() => { try { return JSON.parse(block.content)[0]?.length ?? 0; } catch { return 0; } })()) * 90 + 4) + 25)));
  const selectedStrokes = note.strokes.filter((stroke) => selectedStrokeIds.includes(stroke.id)).map((stroke) => projectStroke(stroke, note.blocks, layout)).filter((stroke) => stroke !== null);
  const strokeBox = selectedStrokes.length ? selectedStrokes.reduce<DocumentRect>((box, stroke) => {
    const right = Math.max(box.x + box.width, stroke.bounds.x + stroke.bounds.width);
    const bottom = Math.max(box.y + box.height, stroke.bounds.y + stroke.bounds.height);
    const x = Math.min(box.x, stroke.bounds.x);
    const y = Math.min(box.y, stroke.bounds.y);
    return { x, y, width: right - x, height: bottom - y };
  }, { ...selectedStrokes[0].bounds }) : null;

  return <main className={`canvas-shell document-mode tool-${tool}`}>
    <CanvasToolbar addBlock={addBlock} onImage={() => imageRef.current?.click()} />
    <input ref={imageRef} hidden type="file" accept="image/*" capture="environment" onChange={(event) => addImage(event.target.files?.[0])} />
    <div className="document-viewport" onPointerDownCapture={(event) => {
      if (!(event.target instanceof Element) || event.target.closest('.ink-selection-box')) return;
      if (event.shiftKey && event.button === 0 && event.target.closest('.document-page') && !event.target.closest('button, input, textarea, select, .resize-handle')) {
        marqueeRef.current = { pointerId: event.pointerId, start: toPage(event.clientX, event.clientY), dragging: false };
        event.currentTarget.setPointerCapture(event.pointerId);
        event.preventDefault();
        return;
      }
      setSelectedStrokeIds([]);
      if (event.target.closest('.canvas-block')) return;
      clearSelection();
      if (event.target.closest('.ink-layer')) {
        const point = toPage(event.clientX, event.clientY);
        const block = note.blocks.find((item) => {
          const rect = layout[item.id];
          return rect && point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
        });
        if (block) setActiveBlockId(block.id);
      }
    }} onPointerMoveCapture={(event) => {
      const gesture = marqueeRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      const end = toPage(event.clientX, event.clientY);
      if (!gesture.dragging && Math.hypot(end.x - gesture.start.x, end.y - gesture.start.y) >= 5) {
        gesture.dragging = true;
        clearSelection();
        window.getSelection()?.removeAllRanges();
      }
      if (gesture.dragging) setMarquee(selectionRect(gesture.start, end));
    }} onPointerUpCapture={(event) => {
      const gesture = marqueeRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      if (gesture.dragging) {
        const rect = selectionRect(gesture.start, toPage(event.clientX, event.clientY));
        setSelectedStrokeIds(note.strokes.filter((stroke) => {
          const projected = projectStroke(stroke, note.blocks, layout);
          return projected && strokeIntersectsRect(projected, rect);
        }).map((stroke) => stroke.id));
      }
      marqueeRef.current = null;
      setMarquee(null);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    }} onPointerCancelCapture={(event) => {
      if (marqueeRef.current?.pointerId !== event.pointerId) return;
      marqueeRef.current = null;
      setMarquee(null);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    }}>
      <article ref={pageRef} className="document-page">
        <div className="document-blocks">
          {rows.map((row) => {
            const shouldWrap = contentWidth > 0 && row.columns.reduce((width, column) => width + columnMinWidth(column.blocks), 14 * (row.columns.length - 1)) > contentWidth;
            const wideTable = row.columns.some((column) => column.blocks.some((block) => block.type === 'table') && columnMinWidth(column.blocks) > contentWidth / 2);
            const columns = shouldWrap && wideTable ? [...row.columns].sort((a, b) => Number(b.blocks.some((block) => block.type === 'table')) - Number(a.blocks.some((block) => block.type === 'table'))) : row.columns;
            return <div className="document-block-row" key={row.id}>
            {columns.map((column) => <div className={`document-block-column ${column.blocks.some((block) => block.type === 'table') ? 'has-table' : ''}`} key={column.id} style={{ minWidth: columnMinWidth(column.blocks) }}>
              {column.blocks.map((block) => <BlockCard key={block.id} block={block} zoom={1} selected={selectedIds.includes(block.id)} active={activeBlockId === block.id} onAskAI={askAI} onReorderStart={startReorder} onReorderMove={moveReorder} onReorderEnd={endReorder} reorderClass={`${dropTarget?.blockId === block.id ? 'is-reordering' : ''} ${dropTarget?.targetId === block.id ? dropTarget.side ? dropTarget.before ? 'drop-left' : 'drop-right' : dropTarget.before ? 'drop-before' : 'drop-after' : ''}`} />)}
            </div>)}
          </div>; })}
        </div>
        <InkLayer noteId={note.id} mode={tool} toWorld={toPage} layout={layout} moving={inkMove} />
        {marquee && <div className="ink-selection-marquee" style={{ left: marquee.x, top: marquee.y, width: marquee.width, height: marquee.height }} />}
        {strokeBox && <div className={`ink-selection-box ${strokeBox.x + strokeBox.width + 34 > (pageRef.current?.clientWidth ?? 850) ? 'handle-left' : ''}`} role="group" aria-label="Selected drawing" style={{ left: strokeBox.x + (inkMove?.dx ?? 0), top: strokeBox.y + (inkMove?.dy ?? 0), width: strokeBox.width, height: strokeBox.height }}>
          <button type="button" className="ink-move-handle" aria-label="Move selected drawing" title="Move drawing" onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            inkMoveRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, ids: selectedStrokeIds };
            event.currentTarget.setPointerCapture(event.pointerId);
          }} onPointerMove={(event) => {
            const move = inkMoveRef.current;
            if (move?.pointerId === event.pointerId) setInkMove({ ids: move.ids, dx: Math.round(event.clientX - move.startX), dy: Math.round(event.clientY - move.startY) });
          }} onPointerUp={(event) => {
            const move = inkMoveRef.current;
            if (move?.pointerId !== event.pointerId) return;
            moveStrokes(note.id, move.ids, Math.round(event.clientX - move.startX), Math.round(event.clientY - move.startY));
            inkMoveRef.current = null;
            setInkMove(null);
            if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
          }} onPointerCancel={(event) => {
            inkMoveRef.current = null;
            setInkMove(null);
            if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
          }}><GripVertical size={15} /></button>
        </div>}
      </article>
    </div>
    {crossTextPosition && createPortal(<div className="text-selection-tools" ref={crossTextToolsRef} style={crossTextPosition}><button type="button" className="format-bubble selection-ai-bubble" title="Enviar selección a la IA" aria-label="Enviar selección a la IA" onPointerDown={(event) => event.preventDefault()} onClick={() => { const selection = captureTextSelection(crossTextRangeRef.current, note.id, pageRef.current); if (selection) askAI(selection); setCrossTextPosition(null); }}><Sparkles size={15} /></button></div>, document.body)}
  </main>;
}
