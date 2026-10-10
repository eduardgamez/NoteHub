import { type CSSProperties, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { GripVertical, Sparkles } from 'lucide-react';
import { useWorkspace } from '../store/useWorkspace';
import { captureTextSelection } from '../ai/textSelection';
import type { AITextSelection, BlockType, CanvasBlock, Point } from '../types';
import { makeBlock } from '../lib/blockFactory';
import { blockRows, findBlockDrop } from '../lib/blockLayout';
import { BlockCard } from './BlockCard';
import { CanvasToolbar } from './CanvasToolbar';
import { InkLayer } from './InkLayer';
import { isNativeIOS, nativeBridge } from '../native/bridge';
import { documentPageWidth, documentPoint, documentRowWidth, documentSideCrop, fitDocumentScale, projectStroke, readDocumentLayout, strokeIntersectsRect, type DocumentLayout, type DocumentRect } from '../lib/documentInk';

const isTextField = (element: Element | null): element is HTMLElement => element instanceof HTMLElement && (element.isContentEditable || element.tagName === 'TEXTAREA' || element.tagName === 'INPUT');

function caretRect(): DOMRect | null {
  const selection = window.getSelection();
  if (selection?.rangeCount) {
    const range = selection.getRangeAt(0);
    const rects = range.getClientRects();
    const rect = rects[rects.length - 1] ?? range.getBoundingClientRect();
    if (rect.width || rect.height) return rect;
  }
  return isTextField(document.activeElement) ? document.activeElement.getBoundingClientRect() : null;
}

function selectionRect(start: Point, end: Point): DocumentRect {
  return { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) };
}

// A table needs its full width; other columns can shrink to 160px.
const columnMinWidth = (blocks: CanvasBlock[], rowWidth: number) => Math.min(rowWidth, Math.max(160, ...blocks.filter((block) => block.type === 'table').map((block) => (block.tableColumnWidths?.reduce((sum, width) => sum + width, 4) ?? (block.tableColumnCount ?? (() => { try { return JSON.parse(block.content)[0]?.length ?? 0; } catch { return 0; } })()) * 90 + 4) + 25)));

export function CanvasWorkspace() {
  const pageRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<{ blockId: string; startX: number; startY: number; clientX: number; clientY: number; grabOffset: number; targetId?: string; before?: boolean; side?: boolean; row?: boolean } | null>(null);
  const marqueeRef = useRef<{ pointerId: number; start: Point; dragging: boolean } | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const inkMoveRef = useRef<{ pointerId: number; startX: number; startY: number; ids: string[] } | null>(null);
  const crossTextRangeRef = useRef<Range | null>(null);
  const crossTextToolsRef = useRef<HTMLDivElement>(null);
  const [dropTarget, setDropTarget] = useState<{ blockId: string; targetId: string; before: boolean; side: boolean; row: boolean } | null>(null);
  const [marquee, setMarquee] = useState<DocumentRect | null>(null);
  const [selectedStrokeIds, setSelectedStrokeIds] = useState<string[]>([]);
  const [inkMove, setInkMove] = useState<{ ids: string[]; dx: number; dy: number } | null>(null);
  const [layout, setLayout] = useState<DocumentLayout>({});
  const [availableWidth, setAvailableWidth] = useState(0);
  const [pageHeight, setPageHeight] = useState(0);
  const [crossTextPosition, setCrossTextPosition] = useState<{ left: number; top: number } | null>(null);
  const note = useWorkspace((state) => state.notes[state.activeNoteId]);
  const rows = blockRows(note.blocks).map((row) => {
    const minimums = row.columns.map((column) => columnMinWidth(column.blocks, documentRowWidth(row.columns.length)));
    return { ...row, minimums, width: documentRowWidth(row.columns.length, minimums) };
  });
  const pageWidth = documentPageWidth(rows.map((row) => row.width));
  const documentZoom = fitDocumentScale(availableWidth);
  const sideCrop = documentSideCrop(availableWidth, documentZoom);
  const frameWidth = pageWidth * documentZoom - 2 * sideCrop;
  const documentFitted = frameWidth <= availableWidth + 1;
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

  useEffect(() => { setSelectedStrokeIds([]); setMarquee(null); setInkMove(null); marqueeRef.current = null; inkMoveRef.current = null; dragRef.current = null; setDropTarget(null); }, [note.id]);

  useEffect(() => {
    if (tool !== 'ink') return;
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && pageRef.current?.contains(focused)) focused.blur();
    window.getSelection()?.removeAllRanges();
  }, [tool, note.id]);

  useEffect(() => {
    if (tool !== 'ink' && tool !== 'eraser') return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    // While the pen is on the page nothing scrolls, so a resting palm cannot
    // drag the page under the stroke.
    const stopStylusScroll = (event: TouchEvent) => {
      if ([...Array.from(event.touches), ...Array.from(event.changedTouches)].some((touch) => (touch as Touch & { touchType?: string }).touchType === 'stylus')) event.preventDefault();
    };
    viewport.addEventListener('touchstart', stopStylusScroll, { passive: false });
    viewport.addEventListener('touchmove', stopStylusScroll, { passive: false });
    return () => {
      viewport.removeEventListener('touchstart', stopStylusScroll);
      viewport.removeEventListener('touchmove', stopStylusScroll);
    };
  }, [tool]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !isNativeIOS()) return;
    // Opening or closing the keyboard must not move the document at all: the
    // app keeps the page pinned, the area under the keyboard only gains room to
    // scroll into, and the caret is brought above the keyboard only once the
    // user types.
    let keyboard = 0, room = 0, frame = 0, holdUntil = 0, anchor = viewport.scrollTop, touching = false, locked = false;
    const editing = () => isTextField(document.activeElement) && viewport.contains(document.activeElement);
    // Pinning is requested as the finger lands, well before iOS focuses the field and starts its own scroll.
    const lock = (next: boolean) => { if (locked !== next) { locked = next; void nativeBridge.keyboardLock({ locked: next }).catch(() => {}); } };
    const setRoom = (next: number) => { room = next; viewport.style.setProperty('--keyboard-room', `${next}px`); };
    // Extra room is removed only once it is out of sight, so the scroll position never has to jump.
    const dropRoom = () => { if (room && !keyboard && viewport.scrollTop + viewport.clientHeight <= viewport.scrollHeight - room) setRoom(0); };
    const hold = () => { holdUntil = performance.now() + 700; };
    const reveal = () => {
      holdUntil = 0;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const caret = keyboard && editing() ? caretRect() : null;
        if (!caret) return;
        const bounds = viewport.getBoundingClientRect();
        const top = bounds.top + 70, bottom = Math.min(bounds.bottom, document.documentElement.clientHeight - keyboard) - 24;
        if (caret.bottom > bottom) viewport.scrollBy({ top: Math.min(caret.bottom - bottom, caret.top - top), behavior: 'smooth' });
        else if (caret.top < top) viewport.scrollBy({ top: caret.top - top, behavior: 'smooth' });
      });
    };
    const keyboardChanged = (event: Event) => {
      keyboard = (event as CustomEvent<{ height: number }>).detail.height;
      hold();
      const shell = viewport.parentElement?.getBoundingClientRect();
      const covered = keyboard && editing() && shell ? Math.max(0, keyboard - (document.documentElement.clientHeight - shell.bottom)) : 0;
      if (covered > room) setRoom(covered);
      dropRoom();
    };
    const pointerDown = (event: PointerEvent) => {
      holdUntil = 0;
      anchor = viewport.scrollTop;
      const target = event.target instanceof Element ? event.target : null;
      if (target && viewport.contains(target)) lock(true);
      else if (isTextField(target?.closest('input, textarea, [contenteditable="true"]') ?? null)) lock(false);
    };
    // Touch events keep firing while the finger scrolls, unlike pointer events, so they tell a real drag apart.
    const touchStart = () => { touching = true; holdUntil = 0; };
    const touchEnd = (event: TouchEvent) => { touching = event.touches.length > 0; };
    const wheel = () => { holdUntil = 0; };
    const focusChanged = (event: FocusEvent) => {
      hold();
      if (event.type === 'focusin' && isTextField(document.activeElement)) lock(viewport.contains(document.activeElement));
    };
    // iOS may still try to scroll the document to the field while the keyboard
    // slides in or out; put it back unless the finger is the one scrolling.
    const scrolled = () => {
      if (!touching && performance.now() < holdUntil && viewport.scrollTop !== anchor) viewport.scrollTop = anchor;
      else anchor = viewport.scrollTop;
      dropRoom();
    };
    window.addEventListener('notehub-keyboard', keyboardChanged);
    document.addEventListener('pointerdown', pointerDown, true);
    document.addEventListener('touchstart', touchStart, { capture: true, passive: true });
    document.addEventListener('touchend', touchEnd, true);
    document.addEventListener('touchcancel', touchEnd, true);
    document.addEventListener('focusin', focusChanged);
    document.addEventListener('focusout', focusChanged);
    viewport.addEventListener('scroll', scrolled, { passive: true });
    viewport.addEventListener('wheel', wheel, { passive: true });
    viewport.addEventListener('input', reveal);
    lock(true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('notehub-keyboard', keyboardChanged);
      document.removeEventListener('pointerdown', pointerDown, true);
      document.removeEventListener('touchstart', touchStart, true);
      document.removeEventListener('touchend', touchEnd, true);
      document.removeEventListener('touchcancel', touchEnd, true);
      document.removeEventListener('focusin', focusChanged);
      document.removeEventListener('focusout', focusChanged);
      viewport.removeEventListener('scroll', scrolled);
      viewport.removeEventListener('wheel', wheel);
      viewport.removeEventListener('input', reveal);
      viewport.style.removeProperty('--keyboard-room');
      void nativeBridge.keyboardLock({ locked: false }).catch(() => {});
    };
  }, []);

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
      setPageHeight((previous) => previous === page.offsetHeight ? previous : page.offsetHeight);
      const viewport = viewportRef.current;
      if (viewport) {
        const style = getComputedStyle(viewport);
        const available = viewport.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        setAvailableWidth((previous) => previous === available ? previous : available);
      }
    };
    const observer = new ResizeObserver(measure);
    observer.observe(page);
    if (viewportRef.current) observer.observe(viewportRef.current);
    page.querySelectorAll<HTMLElement>('[data-block-id]').forEach((element) => observer.observe(element));
    measure();
    return () => observer.disconnect();
  }, [note.id, note.blocks, documentZoom]);

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
    const page = pageRef.current;
    return page ? documentPoint(page, clientX, clientY) : { x: 0, y: 0 };
  }, []);
  const askAI = useCallback((selection?: AITextSelection) => {
    setAiTextSelection(selection ?? null);
    setAiOpen(true);
    window.getSelection()?.removeAllRanges();
    requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>('.ai-panel .ai-composer textarea')?.focus());
  }, [setAiOpen, setAiTextSelection]);
  const startReorder = useCallback((blockId: string, clientX: number, clientY: number) => {
    // The move handle floats above the block, so the pointer sits over the gap
    // or the row above. Aim with the block's top edge instead of the handle.
    const top = pageRef.current?.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(blockId)}"]`)?.getBoundingClientRect().top;
    dragRef.current = { blockId, startX: clientX, startY: clientY, clientX, clientY, grabOffset: top === undefined ? 0 : Math.max(0, top - clientY) };
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
    const candidates = [...page.querySelectorAll<HTMLElement>('.document-block-column > [data-block-id]')].map((element) => {
      const rect = element.getBoundingClientRect();
      return { id: element.dataset.blockId!, rowId: element.closest<HTMLElement>('.document-block-row')!.dataset.rowId!, title: element.classList.contains('title-block'), drawing: element.classList.contains('type-drawing'), left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
    });
    const drop = findBlockDrop(candidates.filter((item) => item.id !== blockId), clientX, clientY + drag.grabOffset);
    if (!drop) { setDropTarget(null); drag.targetId = undefined; return; }
    drag.targetId = drop.targetId;
    drag.before = drop.before;
    drag.side = drop.side;
    drag.row = drop.row;
    setDropTarget((previous) => previous?.blockId === blockId && previous.targetId === drop.targetId && previous.before === drop.before && previous.side === drop.side && previous.row === drop.row ? previous : { blockId, ...drop });
    if (viewport) {
      const edge = viewport.getBoundingClientRect();
      if (clientX < edge.left + 40) viewport.scrollBy(-18, 0);
      else if (clientX > edge.right - 40) viewport.scrollBy(18, 0);
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
    if (!cancel && drag?.blockId === blockId) moveReorder(blockId, drag.clientX, drag.clientY);
    dragRef.current = null;
    setDropTarget(null);
    if (!cancel && drag?.blockId === blockId && drag.targetId) reorderBlock(note.id, blockId, drag.targetId, Boolean(drag.before), Boolean(drag.side), true, true, Boolean(drag.row));
  }, [note.id, reorderBlock, moveReorder]);

  const selectedStrokes = note.strokes.filter((stroke) => selectedStrokeIds.includes(stroke.id)).map((stroke) => projectStroke(stroke, note.blocks, layout)).filter((stroke) => stroke !== null);
  const strokeBox = selectedStrokes.length ? selectedStrokes.reduce<DocumentRect>((box, stroke) => {
    const right = Math.max(box.x + box.width, stroke.bounds.x + stroke.bounds.width);
    const bottom = Math.max(box.y + box.height, stroke.bounds.y + stroke.bounds.height);
    const x = Math.min(box.x, stroke.bounds.x);
    const y = Math.min(box.y, stroke.bounds.y);
    return { x, y, width: right - x, height: bottom - y };
  }, { ...selectedStrokes[0].bounds }) : null;

  return <main className={`canvas-shell document-mode tool-${tool} ${documentFitted ? 'document-fitted' : 'document-zoomed'}`} data-document-scale={documentZoom}>
    <CanvasToolbar addBlock={addBlock} onImage={() => imageRef.current?.click()} />
    <input ref={imageRef} hidden type="file" accept="image/*" capture="environment" onChange={(event) => addImage(event.target.files?.[0])} />
    <div ref={viewportRef} className="document-viewport" onPointerDownCapture={(event) => {
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
      <div className="document-page-frame" style={{ width: frameWidth, height: pageHeight ? pageHeight * documentZoom : undefined }}>
      <article ref={pageRef} className="document-page" style={{ width: pageWidth, minWidth: pageWidth, maxWidth: pageWidth, marginLeft: -sideCrop, transform: `scale(${documentZoom})`, '--doc-zoom': documentZoom } as CSSProperties}>
        <div className="document-blocks">
          {rows.map((row) => {
            const rowDrop = dropTarget?.row && row.columns.some((column) => column.blocks.some((block) => block.id === dropTarget.targetId)) ? dropTarget.before ? 'drop-row-before' : 'drop-row-after' : '';
            return <div className={`document-block-row ${rowDrop}`} data-row-id={row.id} key={row.id} style={{ width: row.width }}>
            {row.columns.map((column, index) => <div className={`document-block-column ${column.blocks.some((block) => block.type === 'table') ? 'has-table' : ''}`} key={column.id} style={{ minWidth: row.minimums[index] }}>
              {column.blocks.map((block) => <BlockCard key={block.id} block={block} zoom={documentZoom} selected={selectedIds.includes(block.id)} active={activeBlockId === block.id} onAskAI={askAI} onReorderStart={startReorder} onReorderMove={moveReorder} onReorderEnd={endReorder} reorderClass={`${dropTarget?.blockId === block.id ? 'is-reordering' : ''} ${dropTarget?.targetId === block.id && !dropTarget.row ? dropTarget.side ? dropTarget.before ? 'drop-left' : 'drop-right' : dropTarget.before ? 'drop-before' : 'drop-after' : ''}`} />)}
            </div>)}
          </div>; })}
        </div>
        <InkLayer noteId={note.id} mode={tool} toWorld={toPage} layout={layout} moving={inkMove} />
        {marquee && <div className="ink-selection-marquee" style={{ left: marquee.x, top: marquee.y, width: marquee.width, height: marquee.height }} />}
        {strokeBox && <div className={`ink-selection-box ${strokeBox.x + strokeBox.width + 34 > pageWidth ? 'handle-left' : ''}`} role="group" aria-label="Selected drawing" style={{ left: strokeBox.x + (inkMove?.dx ?? 0), top: strokeBox.y + (inkMove?.dy ?? 0), width: strokeBox.width, height: strokeBox.height }}>
          <button type="button" className="ink-move-handle" aria-label="Move selected drawing" title="Move drawing" onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            inkMoveRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, ids: selectedStrokeIds };
            event.currentTarget.setPointerCapture(event.pointerId);
          }} onPointerMove={(event) => {
            const move = inkMoveRef.current;
            if (move?.pointerId === event.pointerId) setInkMove({ ids: move.ids, dx: Math.round((event.clientX - move.startX) / documentZoom), dy: Math.round((event.clientY - move.startY) / documentZoom) });
          }} onPointerUp={(event) => {
            const move = inkMoveRef.current;
            if (move?.pointerId !== event.pointerId) return;
            moveStrokes(note.id, move.ids, Math.round((event.clientX - move.startX) / documentZoom), Math.round((event.clientY - move.startY) / documentZoom));
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
    </div>
    {crossTextPosition && createPortal(<div className="text-selection-tools" ref={crossTextToolsRef} style={crossTextPosition}><button type="button" className="format-bubble selection-ai-bubble" title="Enviar selección a la IA" aria-label="Enviar selección a la IA" onPointerDown={(event) => event.preventDefault()} onClick={() => { const selection = captureTextSelection(crossTextRangeRef.current, note.id, pageRef.current); if (selection) askAI(selection); setCrossTextPosition(null); }}><Sparkles size={15} /></button></div>, document.body)}
  </main>;
}
