import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useWorkspace } from '../store/useWorkspace';
import type { BlockType, Point } from '../types';
import { makeBlock } from '../lib/blockFactory';
import { BlockCard } from './BlockCard';
import { CanvasToolbar } from './CanvasToolbar';
import { InkLayer } from './InkLayer';
import { readDocumentLayout, type DocumentLayout } from '../lib/documentInk';

export function CanvasWorkspace() {
  const pageRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const [layout, setLayout] = useState<DocumentLayout>({});
  const note = useWorkspace((state) => state.notes[state.activeNoteId]);
  const selectedIds = useWorkspace((state) => state.selectedIds);
  const selectBlock = useWorkspace((state) => state.selectBlock);
  const clearSelection = useWorkspace((state) => state.clearSelection);
  const upsertBlock = useWorkspace((state) => state.upsertBlock);
  const tool = useWorkspace((state) => state.tool);
  const setTool = useWorkspace((state) => state.setTool);
  const setAiOpen = useWorkspace((state) => state.setAiOpen);
  const removeSelectedBlocks = useWorkspace((state) => state.removeSelectedBlocks);
  const copySelectedBlocks = useWorkspace((state) => state.copySelectedBlocks);
  const pasteBlocks = useWorkspace((state) => state.pasteBlocks);
  const undo = useWorkspace((state) => state.undo);
  const redo = useWorkspace((state) => state.redo);

  useLayoutEffect(() => {
    const page = pageRef.current;
    if (!page) return;
    const measure = () => setLayout(readDocumentLayout(page));
    const observer = new ResizeObserver(measure);
    observer.observe(page);
    page.querySelectorAll<HTMLElement>('[data-block-id]').forEach((element) => observer.observe(element));
    measure();
    return () => observer.disconnect();
  }, [note.id, note.blocks]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
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
  }, [copySelectedBlocks, note.id, pasteBlocks, redo, removeSelectedBlocks, selectedIds.length, setTool, undo]);

  function addBlock(type: BlockType) {
    const block = makeBlock(type, 0, 0);
    upsertBlock(note.id, block);
    selectBlock(block.id);
  }

  function addImage(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const block = { ...makeBlock('image', 0, 0), width: 640, height: 320, content: String(reader.result), caption: file.name };
      upsertBlock(note.id, block);
      selectBlock(block.id);
    };
    reader.readAsDataURL(file);
  }

  const toPage = useCallback((clientX: number, clientY: number): Point => {
    const rect = pageRef.current?.getBoundingClientRect();
    return { x: clientX - (rect?.left ?? 0), y: clientY - (rect?.top ?? 0) };
  }, []);
  const askAI = useCallback(() => setAiOpen(true), [setAiOpen]);

  return <main className={`canvas-shell document-mode tool-${tool}`}>
    <CanvasToolbar addBlock={addBlock} onImage={() => imageRef.current?.click()} />
    <input ref={imageRef} hidden type="file" accept="image/*" capture="environment" onChange={(event) => addImage(event.target.files?.[0])} />
    <div className="document-viewport" onPointerDown={(event) => { if (event.target === event.currentTarget) clearSelection(); }}>
      <article ref={pageRef} className="document-page">
        <header className="document-title"><h1>{note.title}</h1></header>
        <div className="document-blocks">
          {note.blocks.map((block) => <BlockCard key={block.id} block={block} zoom={1} selected={selectedIds.includes(block.id)} onAskAI={askAI} />)}
        </div>
        <InkLayer noteId={note.id} mode={tool} toWorld={toPage} layout={layout} />
      </article>
    </div>
  </main>;
}
