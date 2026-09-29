import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Braces, CheckSquare, Eraser, Image, MousePointer2, Pencil, Redo2, SquareDashed, Table2, Trash2, Type, Undo2 } from 'lucide-react';
import { useWorkspace } from '../store/useWorkspace';
import type { BlockType } from '../types';

interface CanvasToolbarProps {
  addBlock: (type: BlockType) => void;
  onImage: () => void;
}

const strokeColors = [
  { name: 'Black', value: '#252523' }, { name: 'Gray', value: '#747474' },
  { name: 'Red', value: '#b64a48' }, { name: 'Orange', value: '#ca7834' },
  { name: 'Yellow', value: '#a47b22' }, { name: 'Green', value: '#477c63' },
  { name: 'Blue', value: '#315c8f' }, { name: 'Purple', value: '#7855a1' },
];

export function CanvasToolbar({ addBlock, onImage }: CanvasToolbarProps) {
  const pencilRef = useRef<HTMLButtonElement>(null);
  const eraserRef = useRef<HTMLButtonElement>(null);
  const optionsRef = useRef<HTMLDivElement>(null);
  const [optionsOpen, setOptionsOpen] = useState<'ink' | 'eraser' | null>(null);
  const [colorsOpen, setColorsOpen] = useState(false);
  const [optionsPosition, setOptionsPosition] = useState({ left: 0, top: 0 });
  const tool = useWorkspace((state) => state.tool);
  const setTool = useWorkspace((state) => state.setTool);
  const activeNoteId = useWorkspace((state) => state.activeNoteId);
  const clearStrokes = useWorkspace((state) => state.clearStrokes);
  const inkWidth = useWorkspace((state) => state.inkWidth);
  const setInkWidth = useWorkspace((state) => state.setInkWidth);
  const inkColor = useWorkspace((state) => state.inkColor);
  const setInkColor = useWorkspace((state) => state.setInkColor);
  const undo = useWorkspace((state) => state.undo);
  const redo = useWorkspace((state) => state.redo);
  const canUndo = useWorkspace((state) => (state.history[state.activeNoteId]?.length ?? 0) > 0);
  const canRedo = useWorkspace((state) => (state.future[state.activeNoteId]?.length ?? 0) > 0);

  useEffect(() => {
    if (optionsOpen && tool !== optionsOpen) { setOptionsOpen(null); setColorsOpen(false); }
  }, [tool, optionsOpen]);

  useEffect(() => {
    if (!optionsOpen) return;
    const closeOutside = (event: PointerEvent) => {
      const trigger = optionsOpen === 'ink' ? pencilRef.current : eraserRef.current;
      if (event.target instanceof Node && (trigger?.contains(event.target) || optionsRef.current?.contains(event.target))) return;
      setOptionsOpen(null);
      setColorsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOptionsOpen(null); setColorsOpen(false); }
    };
    document.addEventListener('pointerdown', closeOutside, true);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside, true);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [optionsOpen]);

  function chooseDrawingTool(nextTool: 'ink' | 'eraser') {
    if (tool !== nextTool) {
      setTool(nextTool);
      setOptionsOpen(null);
      setColorsOpen(false);
      return;
    }
    const rect = (nextTool === 'ink' ? pencilRef : eraserRef).current?.getBoundingClientRect();
    if (rect) setOptionsPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - (nextTool === 'ink' ? 204 : 57))), top: rect.bottom + 8 });
    setOptionsOpen(optionsOpen === nextTool ? null : nextTool);
    setColorsOpen(false);
  }

  return <><div className="canvas-toolbar" role="toolbar" aria-label="Canvas tools">
    <div className="tool-group">
      <button className={tool === 'select' ? 'active' : ''} onClick={() => setTool('select')} title="Select (V)"><MousePointer2 size={17} /></button>
      <button ref={pencilRef} className={tool === 'ink' ? 'active' : ''} onClick={() => chooseDrawingTool('ink')} title="Draw (D)" aria-expanded={optionsOpen === 'ink'}><Pencil size={17} /></button>
      <button ref={eraserRef} className={tool === 'eraser' ? 'active' : ''} onClick={() => chooseDrawingTool('eraser')} title="Eraser (E)" aria-expanded={optionsOpen === 'eraser'}><Eraser size={17} /></button>
      <button disabled={!canUndo} onClick={() => undo(activeNoteId)} title="Undo (⌘Z)"><Undo2 size={16} /></button>
      <button disabled={!canRedo} onClick={() => redo(activeNoteId)} title="Redo (⇧⌘Z)"><Redo2 size={16} /></button>
    </div>
    <span className="tool-divider" />
    <div className="tool-group add-tools">
      <button onClick={() => addBlock('text')} title="Text block"><Type size={17} /><span>Text</span></button>
      <button onClick={() => addBlock('code')} title="Code block"><Braces size={17} /><span>Code</span></button>
      <button onClick={() => addBlock('checklist')} title="Checklist"><CheckSquare size={17} /><span>List</span></button>
      <button onClick={() => addBlock('list')} title="Bulleted list block"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 5h16M9 11h11M9 17h11" /><circle cx="5" cy="11" r="1.3" fill="currentColor" stroke="none" /><circle cx="5" cy="17" r="1.3" fill="currentColor" stroke="none" /></svg><span>Bullets</span></button>
      <button onClick={() => addBlock('table')} title="Table block"><Table2 size={17} /><span>Table</span></button>
      <button onClick={() => addBlock('drawing')} title="Drawing space"><SquareDashed size={17} /><span>Space</span></button>
      <button onClick={onImage} title="Upload image"><Image size={17} /><span>Image</span></button>
    </div>
  </div>
  {optionsOpen && createPortal(<div ref={optionsRef} className={`ink-options-popover ${optionsOpen === 'eraser' ? 'eraser-options' : ''}`} role="dialog" aria-label={optionsOpen === 'ink' ? 'Drawing options' : 'Eraser options'} style={optionsPosition}>
    {optionsOpen === 'ink' ? <><div className="ink-options-row"><button type="button" className="ink-color-button" aria-label="Drawing color" aria-expanded={colorsOpen} title="Drawing color" onClick={() => setColorsOpen(!colorsOpen)}><i style={{ background: inkColor }} /></button><select aria-label="Stroke width" value={inkWidth} onChange={(event) => setInkWidth(Number(event.target.value))}><option value="1.5">Fine</option><option value="2.5">Medium</option><option value="5">Broad</option></select></div>
    {colorsOpen && <div className="ink-color-palette" role="group" aria-label="Drawing colors"><div className="text-color-swatches">{strokeColors.map(({ name, value }) => <button key={value} type="button" className={inkColor === value ? 'selected' : ''} style={{ background: value }} aria-label={name} title={name} onClick={() => setInkColor(value)} />)}</div><label className="text-color-custom">Custom color <input type="color" aria-label="Custom drawing color" value={inkColor} onChange={(event) => setInkColor(event.target.value)} /></label></div>}</> : <div className="ink-options-row"><button type="button" onClick={() => { clearStrokes(activeNoteId); setOptionsOpen(null); }} title="Clear all ink" aria-label="Clear all ink"><Trash2 size={15} /></button></div>}
  </div>, document.body)}
  </>;
}
