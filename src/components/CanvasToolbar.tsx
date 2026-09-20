import { Braces, CheckSquare, Image, MousePointer2, Pencil, Redo2, Sparkles, Trash2, Type, Undo2 } from 'lucide-react';
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

  return <div className="canvas-toolbar" role="toolbar" aria-label="Canvas tools">
    <div className="tool-group">
      <button className={tool === 'select' ? 'active' : ''} onClick={() => setTool('select')} title="Select (V)"><MousePointer2 size={17} /></button>
      <button className={tool === 'ink' ? 'active' : ''} onClick={() => setTool('ink')} title="Draw (D)"><Pencil size={17} /></button>
    </div>
    <span className="tool-divider" />
    <div className="tool-group add-tools">
      <button onClick={() => addBlock('text')} title="Text block"><Type size={17} /><span>Text</span></button>
      <button onClick={() => addBlock('code')} title="Code block"><Braces size={17} /><span>Code</span></button>
      <button onClick={() => addBlock('checklist')} title="Checklist"><CheckSquare size={17} /><span>List</span></button>
      <button onClick={onImage} title="Upload image"><Image size={17} /><span>Image</span></button>
    </div>
    <span className="tool-divider" />
    <div className="tool-group">
      <button disabled><Undo2 size={16} /></button><button disabled><Redo2 size={16} /></button>
    </div>
    {tool === 'ink' && <><span className="tool-divider" /><div className="ink-options"><i /><span>2.5</span><button onClick={() => clearStrokes(activeNoteId)} title="Clear ink"><Trash2 size={15} /></button></div></>}
    {selected.length > 0 && <button className="ask-ai-selection" onClick={onAskAI}><Sparkles size={15} /> Ask AI <span>{selected.length}</span></button>}
  </div>;
}
