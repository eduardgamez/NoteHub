import { Braces, CheckSquare, Eraser, Image, ListTree, MousePointer2, Pencil, Redo2, Sparkles, SquareDashed, Table2, Trash2, Type, Undo2 } from 'lucide-react';
import { useWorkspace } from '../store/useWorkspace';
import type { BlockType } from '../types';

interface CanvasToolbarProps {
  addBlock: (type: BlockType) => void;
  onImage: () => void;
  onAskAI: () => void;
}

export function CanvasToolbar({ addBlock, onImage, onAskAI }: CanvasToolbarProps) {
  const tool = useWorkspace((state) => state.tool);
  const setTool = useWorkspace((state) => state.setTool);
  const selected = useWorkspace((state) => state.selectedIds);
  const activeNoteId = useWorkspace((state) => state.activeNoteId);
  const clearStrokes = useWorkspace((state) => state.clearStrokes);
  const inkWidth = useWorkspace((state) => state.inkWidth);
  const setInkWidth = useWorkspace((state) => state.setInkWidth);
  const undo = useWorkspace((state) => state.undo);
  const redo = useWorkspace((state) => state.redo);
  const canUndo = useWorkspace((state) => (state.history[state.activeNoteId]?.length ?? 0) > 0);
  const canRedo = useWorkspace((state) => (state.future[state.activeNoteId]?.length ?? 0) > 0);

  return <div className="canvas-toolbar" role="toolbar" aria-label="Canvas tools">
    <div className="tool-group">
      <button className={tool === 'select' ? 'active' : ''} onClick={() => setTool('select')} title="Select (V)"><MousePointer2 size={17} /></button>
      <button className={tool === 'ink' ? 'active' : ''} onClick={() => setTool('ink')} title="Draw (D)"><Pencil size={17} /></button>
      <button className={tool === 'eraser' ? 'active' : ''} onClick={() => setTool('eraser')} title="Eraser (E)"><Eraser size={17} /></button>
    </div>
    <span className="tool-divider" />
    <div className="tool-group add-tools">
      <button onClick={() => addBlock('text')} title="Text block"><Type size={17} /><span>Text</span></button>
      <button onClick={() => addBlock('code')} title="Code block"><Braces size={17} /><span>Code</span></button>
      <button onClick={() => addBlock('checklist')} title="Checklist"><CheckSquare size={17} /><span>List</span></button>
      <button onClick={() => addBlock('list')} title="Bulleted list block"><ListTree size={17} /><span>Bullets</span></button>
      <button onClick={() => addBlock('table')} title="Table block"><Table2 size={17} /><span>Table</span></button>
      <button onClick={() => addBlock('drawing')} title="Drawing space"><SquareDashed size={17} /><span>Space</span></button>
      <button onClick={onImage} title="Upload image"><Image size={17} /><span>Image</span></button>
    </div>
    <span className="tool-divider" />
    <div className="tool-group">
      <button disabled={!canUndo} onClick={() => undo(activeNoteId)} title="Undo (⌘Z)"><Undo2 size={16} /></button><button disabled={!canRedo} onClick={() => redo(activeNoteId)} title="Redo (⇧⌘Z)"><Redo2 size={16} /></button>
    </div>
    {(tool === 'ink' || tool === 'eraser') && <><span className="tool-divider" /><div className="ink-options">{tool === 'ink' && <><i /><select aria-label="Stroke width" value={inkWidth} onChange={(event) => setInkWidth(Number(event.target.value))}><option value="1.5">Fine</option><option value="2.5">Medium</option><option value="5">Broad</option></select></>}<button onClick={() => clearStrokes(activeNoteId)} title="Clear all ink"><Trash2 size={15} /></button></div></>}
    {selected.length > 0 && <button className="ask-ai-selection" onClick={onAskAI}><Sparkles size={15} /> Ask AI <span>{selected.length}</span></button>}
  </div>;
}
