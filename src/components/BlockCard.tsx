import { memo, useRef } from 'react';
import { AlignLeft, Bold, Check, Code2, Copy, GripVertical, Highlighter, Italic, Link, List, LoaderCircle, MoreHorizontal, Play, Sparkles, Trash2, Underline } from 'lucide-react';
import { useWorkspace } from '../store/useWorkspace';
import type { CanvasBlock } from '../types';
import { pythonRuntime } from '../python/runtime';

interface BlockCardProps {
  block: CanvasBlock;
  zoom: number;
  selected: boolean;
  onAskAI: () => void;
}

function highlightCode(code: string, language = 'python') {
  const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const keywordSets: Record<string, string> = {
    python: 'from|import|as|print|for|in|if|else|elif|def|return|class|True|False|None|async|await|with|try|except',
    c: 'auto|break|case|char|const|continue|default|do|double|else|enum|extern|float|for|goto|if|int|long|register|return|short|signed|sizeof|static|struct|switch|typedef|union|unsigned|void|volatile|while|_Bool|_Complex|_Imaginary',
    javascript: 'const|let|var|function|return|class|new|if|else|for|while|true|false|null|undefined|async|await|import|export|from',
    typescript: 'const|let|var|function|return|class|new|if|else|for|while|true|false|null|undefined|async|await|import|export|from|interface|type|extends|implements',
    sql: 'SELECT|FROM|WHERE|JOIN|ON|INSERT|UPDATE|DELETE|CREATE|TABLE|AS|AND|OR|GROUP|ORDER|BY|LIMIT|NULL',
  };
  const comment = language === 'python' ? '#[^\\n]*' : language === 'sql' ? '--[^\\n]*' : language === 'c' ? '//[^\\n]*|/\\*.*?\\*/' : '//[^\\n]*';
  const directive = language === 'c' ? '#[^\\n]*|' : '';
  const tokens = new RegExp(`${comment}|${directive}'[^'\\n]*'|"[^"\\n]*"|\\b(?:${keywordSets[language] ?? keywordSets.python})\\b|\\b\\d+(?:\\.\\d+)?\\b`, language === 'sql' ? 'gi' : 'g');
  return code.replace(tokens, (token) => {
    const className = (language === 'python' && token.startsWith('#')) || /^(\/\/|\/\*|--)/.test(token) ? 'syn-comment' : /^['"]/.test(token) ? 'syn-string' : /^\d/.test(token) ? 'syn-number' : 'syn-keyword';
    return `<span class="${className}">${escape(token)}</span>`;
  }).split('\n').map(escapeMarkupOutsideTokens).join('\n');
}

function escapeMarkupOutsideTokens(line: string) {
  return line.split(/(<span class="syn-(?:comment|string|number|keyword)">.*?<\/span>)/g)
    .map((part) => part.startsWith('<span class="syn-') ? part : part.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'))
    .join('');
}

export const BlockCard = memo(function BlockCard({ block, zoom, selected, onAskAI }: BlockCardProps) {
  const activeNoteId = useWorkspace((state) => state.activeNoteId);
  const upsertBlock = useWorkspace((state) => state.upsertBlock);
  const selectBlock = useWorkspace((state) => state.selectBlock);
  const removeSelectedBlocks = useWorkspace((state) => state.removeSelectedBlocks);
  const checkpoint = useWorkspace((state) => state.checkpoint);
  const editorRef = useRef<HTMLDivElement>(null);
  const actionRef = useRef<{ mode: 'drag' | 'resize'; x: number; y: number; block: CanvasBlock } | null>(null);

  function startAction(event: React.PointerEvent, mode: 'drag' | 'resize') {
    event.preventDefault();
    event.stopPropagation();
    selectBlock(block.id, event.shiftKey);
    checkpoint(activeNoteId);
    actionRef.current = { mode, x: event.clientX, y: event.clientY, block };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveAction(event: React.PointerEvent) {
    const action = actionRef.current;
    if (!action) return;
    const dx = (event.clientX - action.x) / zoom;
    const dy = (event.clientY - action.y) / zoom;
    if (action.mode === 'drag') upsertBlock(activeNoteId, { ...action.block, x: Math.round(action.block.x + dx), y: Math.round(action.block.y + dy) }, false, false);
    else upsertBlock(activeNoteId, { ...action.block, width: Math.max(220, Math.round(action.block.width + dx)), height: Math.max(130, Math.round(action.block.height + dy)) }, false, false);
  }

  function endAction(event: React.PointerEvent) {
    if (!actionRef.current) return;
    const current = useWorkspace.getState().notes[activeNoteId].blocks.find((item) => item.id === block.id);
    if (current) upsertBlock(activeNoteId, current, true, false);
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

  function updateCurrent(changes: Partial<CanvasBlock>, recordHistory = false) {
    const current = useWorkspace.getState().notes[activeNoteId].blocks.find((item) => item.id === block.id) ?? block;
    upsertBlock(activeNoteId, { ...current, ...changes }, true, recordHistory);
  }

  async function runPython() {
    if (block.language !== 'python' && block.language) return;
    updateCurrent({ execution: { status: 'loading' } }, true);
    const result = await pythonRuntime.run(activeNoteId, block.content, (status) => updateCurrent({ execution: { status } }));
    updateCurrent({ execution: result });
  }

  return <article
    className={`canvas-block type-${block.type} ${selected ? 'selected' : ''}`}
    style={{ transform: `translate(${block.x}px, ${block.y}px)`, width: block.width, height: block.height }}
    onPointerDown={(event) => { event.stopPropagation(); selectBlock(block.id, event.shiftKey); }}
    data-block-id={block.id}
  >
    <div className="block-chrome">
      <button className="drag-handle" title="Drag block" onPointerDown={(event) => startAction(event, 'drag')} onPointerMove={moveAction} onPointerUp={endAction}><GripVertical size={16} /></button>
      <span className="block-kind">{{ text: 'Text', code: block.language === 'c' ? 'C' : block.language ?? 'Python', checklist: 'Checklist', image: 'Image', table: 'Table', list: 'List', drawing: 'Drawing space' }[block.type]}</span>
      <div className="block-actions">
        <button title="Ask AI" onClick={onAskAI}><Sparkles size={14} /></button>
        <button title="Duplicate" onClick={duplicate}><Copy size={14} /></button>
        <button title="Delete" onClick={removeSelectedBlocks}><Trash2 size={14} /></button>
        <button aria-label="More"><MoreHorizontal size={15} /></button>
      </div>
    </div>

    {(block.type === 'text' || block.type === 'list') && <>
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
      <div ref={editorRef} className={`rich-block ${block.type === 'list' ? 'list-rich-block' : ''} ${selected ? 'with-formatbar' : ''}`} contentEditable suppressContentEditableWarning onBlur={(event) => updateContent(event.currentTarget.innerHTML)} dangerouslySetInnerHTML={{ __html: block.content }} />
    </>}

    {block.type === 'code' && <div className="code-block">
      <div className="code-header"><span><i className="python-dot" /><select value={block.language ?? 'python'} onChange={(event) => updateCurrent({ language: event.target.value, execution: undefined }, true)}><option value="python">Python</option><option value="c">C</option><option value="javascript">JavaScript</option><option value="typescript">TypeScript</option><option value="sql">SQL</option></select></span>{(block.language ?? 'python') === 'python' && <button onClick={() => void runPython()} disabled={block.execution?.status === 'loading' || block.execution?.status === 'running'}>{block.execution?.status === 'loading' || block.execution?.status === 'running' ? <LoaderCircle className="spin" size={13} /> : <Play size={13} fill="currentColor" />} {block.execution?.status === 'loading' ? 'Loading Python' : block.execution?.status === 'running' ? 'Running' : 'Run'}</button>}</div>
      <pre contentEditable suppressContentEditableWarning spellCheck={false} onBlur={(event) => updateContent(event.currentTarget.textContent ?? '')} dangerouslySetInnerHTML={{ __html: highlightCode(block.content, block.language) }} />
      {(block.language ?? 'python') === 'python' && <CodeOutput block={block} />}
    </div>}

    {block.type === 'image' && <figure className="image-block"><img src={block.content} alt={block.caption || 'Workspace upload'} /><figcaption contentEditable suppressContentEditableWarning onBlur={(event) => upsertBlock(activeNoteId, { ...block, caption: event.currentTarget.textContent ?? '' })}>{block.caption || 'Add a caption…'}</figcaption></figure>}

    {block.type === 'checklist' && <Checklist block={block} onChange={updateContent} />}
    {block.type === 'table' && <TableBlock block={block} onChange={updateContent} />}
    {block.type === 'drawing' && <div className="drawing-space"><span>Draw anywhere in this space with the ink tool</span></div>}

    <button className="resize-handle" aria-label="Resize block" onPointerDown={(event) => startAction(event, 'resize')} onPointerMove={moveAction} onPointerUp={endAction} />
  </article>;
});

interface ChecklistItem { id: string; text: string; done: boolean }

function Checklist({ block, onChange }: { block: CanvasBlock; onChange: (value: string) => void }) {
  const items: ChecklistItem[] = (() => { try { return JSON.parse(block.content); } catch { return []; } })();
  const toggle = (id: string) => onChange(JSON.stringify(items.map((item) => item.id === id ? { ...item, done: !item.done } : item)));
  const addItem = () => { const text = window.prompt('Checklist item'); if (text?.trim()) onChange(JSON.stringify([...items, { id: crypto.randomUUID(), text: text.trim(), done: false }])); };
  return <div className="checklist-block">
    <p className="eyebrow">STUDY PLAN</p><h3>Before Thursday</h3>
    <div className="checklist-items">{items.map((item) => <label key={item.id} className={item.done ? 'done' : ''}>
      <button onClick={() => toggle(item.id)} className="check-button">{item.done && <Check size={12} />}</button><span>{item.text}</span>
    </label>)}</div>
    <button className="add-item" onClick={addItem}>+ Add item</button>
  </div>;
}

function TableBlock({ block, onChange }: { block: CanvasBlock; onChange: (value: string) => void }) {
  const rows: string[][] = (() => { try { return JSON.parse(block.content); } catch { return [['Column A', 'Column B'], ['', '']]; } })();
  const update = (row: number, column: number, value: string) => onChange(JSON.stringify(rows.map((cells, rowIndex) => rowIndex === row ? cells.map((cell, columnIndex) => columnIndex === column ? value : cell) : cells)));
  return <div className="table-block"><table><tbody>{rows.map((cells, rowIndex) => <tr key={rowIndex}>{cells.map((cell, columnIndex) => <td key={columnIndex}><input value={cell} onChange={(event) => update(rowIndex, columnIndex, event.target.value)} /></td>)}</tr>)}</tbody></table><button onClick={() => onChange(JSON.stringify([...rows, rows[0].map(() => '')]))}>+ Row</button></div>;
}

function CodeOutput({ block }: { block: CanvasBlock }) {
  const output = block.execution;
  if (!output || output.status === 'idle') return <div className="code-output"><span>›</span><span>Run to see output</span></div>;
  if (output.status === 'loading' || output.status === 'running') return <div className="code-output running"><LoaderCircle className="spin" size={12} /><span>{output.status === 'loading' ? 'Loading Python runtime and packages…' : 'Executing in a worker…'}</span></div>;
  return <div className={`code-result ${output.status}`}>
    {output.stdout && <pre>{output.stdout}</pre>}{output.result && <pre>{output.result}</pre>}{output.html && <div className="python-html" dangerouslySetInnerHTML={{ __html: output.html }} />}{output.image && <img src={output.image} alt="Python plot output" />}{output.error && <pre className="traceback">{output.error}</pre>}
    <small>{output.durationMs ? `${(output.durationMs / 1000).toFixed(2)}s` : ''}</small>
  </div>;
}
