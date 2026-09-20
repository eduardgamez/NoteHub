import { useRef } from 'react';
import { AlignLeft, Bold, Check, Code2, Copy, GripVertical, Highlighter, Italic, Link, List, MoreHorizontal, Play, Sparkles, Trash2, Underline } from 'lucide-react';
import { useWorkspace } from '../store/useWorkspace';
import type { CanvasBlock } from '../types';

interface BlockCardProps {
  block: CanvasBlock;
  zoom: number;
  selected: boolean;
  onAskAI: () => void;
}

function highlightPython(code: string) {
  const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const tokens = /#[^\n]*|'[^'\n]*'|"[^"\n]*"|\b(?:from|import|as|print|for|in|if|else|def|return|class|True|False|None)\b|\b\d+(?:\.\d+)?\b/g;
  return code.replace(tokens, (token) => {
    const className = token.startsWith('#') ? 'syn-comment' : /^['"]/.test(token) ? 'syn-string' : /^\d/.test(token) ? 'syn-number' : 'syn-keyword';
    return `<span class="${className}">${escape(token)}</span>`;
  }).split('\n').map(escapeMarkupOutsideTokens).join('\n');
}

function escapeMarkupOutsideTokens(line: string) {
  return line.split(/(<span class="syn-(?:comment|string|number|keyword)">.*?<\/span>)/g)
    .map((part) => part.startsWith('<span class="syn-') ? part : part.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'))
    .join('');
}

export function BlockCard({ block, zoom, selected, onAskAI }: BlockCardProps) {
  const activeNoteId = useWorkspace((state) => state.activeNoteId);
  const upsertBlock = useWorkspace((state) => state.upsertBlock);
  const selectBlock = useWorkspace((state) => state.selectBlock);
  const removeSelectedBlocks = useWorkspace((state) => state.removeSelectedBlocks);
  const editorRef = useRef<HTMLDivElement>(null);
  const actionRef = useRef<{ mode: 'drag' | 'resize'; x: number; y: number; block: CanvasBlock } | null>(null);

  function startAction(event: React.PointerEvent, mode: 'drag' | 'resize') {
    event.preventDefault();
    event.stopPropagation();
    selectBlock(block.id, event.shiftKey);
    actionRef.current = { mode, x: event.clientX, y: event.clientY, block };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveAction(event: React.PointerEvent) {
    const action = actionRef.current;
    if (!action) return;
    const dx = (event.clientX - action.x) / zoom;
    const dy = (event.clientY - action.y) / zoom;
    if (action.mode === 'drag') upsertBlock(activeNoteId, { ...action.block, x: Math.round(action.block.x + dx), y: Math.round(action.block.y + dy) });
    else upsertBlock(activeNoteId, { ...action.block, width: Math.max(220, Math.round(action.block.width + dx)), height: Math.max(130, Math.round(action.block.height + dy)) });
  }

  function endAction(event: React.PointerEvent) {
    if (!actionRef.current) return;
    actionRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function updateContent(content: string) { upsertBlock(activeNoteId, { ...block, content }); }

  function format(command: string, value?: string) {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
  }

  function duplicate() {
    const copy = { ...block, id: crypto.randomUUID(), x: block.x + 28, y: block.y + 28 };
    upsertBlock(activeNoteId, copy);
    selectBlock(copy.id);
  }

  return <article
    className={`canvas-block type-${block.type} ${selected ? 'selected' : ''}`}
    style={{ transform: `translate(${block.x}px, ${block.y}px)`, width: block.width, height: block.height }}
    onPointerDown={(event) => { event.stopPropagation(); selectBlock(block.id, event.shiftKey); }}
    data-block-id={block.id}
  >
    <div className="block-chrome">
      <button className="drag-handle" title="Drag block" onPointerDown={(event) => startAction(event, 'drag')} onPointerMove={moveAction} onPointerUp={endAction}><GripVertical size={16} /></button>
      <span className="block-kind">{block.type === 'text' ? 'Text' : block.type === 'code' ? 'Python' : block.type === 'checklist' ? 'Checklist' : 'Image'}</span>
      <div className="block-actions">
        <button title="Ask AI" onClick={onAskAI}><Sparkles size={14} /></button>
        <button title="Duplicate" onClick={duplicate}><Copy size={14} /></button>
        <button title="Delete" onClick={removeSelectedBlocks}><Trash2 size={14} /></button>
        <button aria-label="More"><MoreHorizontal size={15} /></button>
      </div>
    </div>

    {block.type === 'text' && <>
      {selected && <div className="rich-formatbar" onPointerDown={(event) => event.stopPropagation()}>
        <select title="Font size" defaultValue="3" onChange={(event) => format('fontSize', event.target.value)}>
          <option value="2">S</option><option value="3">M</option><option value="4">L</option><option value="5">XL</option>
        </select>
        <button title="Bold" onMouseDown={(event) => { event.preventDefault(); format('bold'); }}><Bold size={13} /></button>
        <button title="Italic" onMouseDown={(event) => { event.preventDefault(); format('italic'); }}><Italic size={13} /></button>
        <button title="Underline" onMouseDown={(event) => { event.preventDefault(); format('underline'); }}><Underline size={13} /></button>
        <span />
        <button title="Text color" className="color-tool" onMouseDown={(event) => { event.preventDefault(); format('foreColor', '#315c54'); }}><i /></button>
        <button title="Highlight" onMouseDown={(event) => { event.preventDefault(); format('hiliteColor', '#f2e9b9'); }}><Highlighter size={13} /></button>
        <button title="Align left" onMouseDown={(event) => { event.preventDefault(); format('justifyLeft'); }}><AlignLeft size={13} /></button>
        <button title="Bulleted list" onMouseDown={(event) => { event.preventDefault(); format('insertUnorderedList'); }}><List size={13} /></button>
        <button title="Link" onMouseDown={(event) => { event.preventDefault(); const url = window.prompt('Link URL'); if (url) format('createLink', url); }}><Link size={13} /></button>
        <button title="Inline code" onMouseDown={(event) => { event.preventDefault(); format('formatBlock', 'pre'); }}><Code2 size={13} /></button>
      </div>}
      <div ref={editorRef} className={`rich-block ${selected ? 'with-formatbar' : ''}`} contentEditable suppressContentEditableWarning onBlur={(event) => updateContent(event.currentTarget.innerHTML)} dangerouslySetInnerHTML={{ __html: block.content }} />
    </>}

    {block.type === 'code' && <div className="code-block">
      <div className="code-header"><span><i className="python-dot" /> {block.language ?? 'code'}</span><button title="Python execution adapter is ready to connect"><Play size={13} fill="currentColor" /> Run</button></div>
      <pre contentEditable suppressContentEditableWarning spellCheck={false} onBlur={(event) => updateContent(event.currentTarget.textContent ?? '')} dangerouslySetInnerHTML={{ __html: highlightPython(block.content) }} />
      <div className="code-output"><span>›</span><span>Run to see output</span></div>
    </div>}

    {block.type === 'image' && <figure className="image-block"><img src={block.content} alt={block.caption || 'Workspace upload'} /><figcaption contentEditable suppressContentEditableWarning onBlur={(event) => upsertBlock(activeNoteId, { ...block, caption: event.currentTarget.textContent ?? '' })}>{block.caption || 'Add a caption…'}</figcaption></figure>}

    {block.type === 'checklist' && <Checklist block={block} onChange={updateContent} />}

    <button className="resize-handle" aria-label="Resize block" onPointerDown={(event) => startAction(event, 'resize')} onPointerMove={moveAction} onPointerUp={endAction} />
  </article>;
}

interface ChecklistItem { id: string; text: string; done: boolean }

function Checklist({ block, onChange }: { block: CanvasBlock; onChange: (value: string) => void }) {
  const items: ChecklistItem[] = (() => { try { return JSON.parse(block.content); } catch { return []; } })();
  const toggle = (id: string) => onChange(JSON.stringify(items.map((item) => item.id === id ? { ...item, done: !item.done } : item)));
  return <div className="checklist-block">
    <p className="eyebrow">STUDY PLAN</p><h3>Before Thursday</h3>
    <div className="checklist-items">{items.map((item) => <label key={item.id} className={item.done ? 'done' : ''}>
      <button onClick={() => toggle(item.id)} className="check-button">{item.done && <Check size={12} />}</button><span>{item.text}</span>
    </label>)}</div>
    <button className="add-item">+ Add item</button>
  </div>;
}
