import { memo, useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { AlignLeft, Bold, Check, ChevronDown, Code2, Copy, GripVertical, Highlighter, Italic, Link, List, LoaderCircle, Pencil, Play, Scissors, Sparkles, Trash2, Underline } from 'lucide-react';
import { useWorkspace } from '../store/useWorkspace';
import { captureTextSelection } from '../ai/textSelection';
import type { AITextSelection, CanvasBlock } from '../types';
import { pythonRuntime } from '../python/runtime';

interface BlockCardProps {
  block: CanvasBlock;
  zoom: number;
  selected: boolean;
  active: boolean;
  onAskAI: (selection?: AITextSelection) => void;
  onReorderStart: (blockId: string, clientX: number, clientY: number) => void;
  onReorderMove: (blockId: string, clientX: number, clientY: number) => void;
  onReorderEnd: (blockId: string, cancel?: boolean) => void;
  reorderClass?: string;
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

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const textColors = [
  { name: 'Black', value: '#252523' },
  { name: 'Gray', value: '#747474' },
  { name: 'Red', value: '#b64a48' },
  { name: 'Orange', value: '#ca7834' },
  { name: 'Yellow', value: '#a47b22' },
  { name: 'Green', value: '#477c63' },
  { name: 'Blue', value: '#315c8f' },
  { name: 'Purple', value: '#7855a1' },
];

export const BlockCard = memo(function BlockCard({ block, zoom, selected, active, onAskAI, onReorderStart, onReorderMove, onReorderEnd, reorderClass = '' }: BlockCardProps) {
  const activeNoteId = useWorkspace((state) => state.activeNoteId);
  const upsertBlock = useWorkspace((state) => state.upsertBlock);
  const insertBlockAfter = useWorkspace((state) => state.insertBlockAfter);
  const selectBlock = useWorkspace((state) => state.selectBlock);
  const setActiveBlockId = useWorkspace((state) => state.setActiveBlockId);
  const clearSelection = useWorkspace((state) => state.clearSelection);
  const removeSelectedBlocks = useWorkspace((state) => state.removeSelectedBlocks);
  const checkpoint = useWorkspace((state) => state.checkpoint);
  const blockRef = useRef<HTMLElement>(null);
  const selectedEditableRef = useRef<HTMLElement | null>(null);
  const formatToolsRef = useRef<HTMLDivElement>(null);
  const selectedRangeRef = useRef<Range | null>(null);
  const linkPromptOpenRef = useRef(false);
  const colorDialogRef = useRef(false);
  const formattingRef = useRef(false);
  const [formatPosition, setFormatPosition] = useState<{ left: number; top: number } | null>(null);
  const [formatOpen, setFormatOpen] = useState(false);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [selectedColor, setSelectedColor] = useState('#315c54');
  const [underlineActive, setUnderlineActive] = useState(false);
  const [selectionMode, setSelectionMode] = useState<'rich' | 'code' | 'readonly'>('rich');
  const actionRef = useRef<{ mode: 'drag' | 'resize'; x: number; y: number; block: CanvasBlock } | null>(null);

  useEffect(() => {
    if (block.type === 'drawing') return;
    const close = () => { selectedRangeRef.current = null; selectedEditableRef.current = null; colorDialogRef.current = false; setFormatPosition(null); setFormatOpen(false); setColorPickerOpen(false); setUnderlineActive(false); };
    const updateSelection = (reposition = false) => {
      if (linkPromptOpenRef.current || colorDialogRef.current || formattingRef.current) return;
      if (formatToolsRef.current?.contains(document.activeElement)) return;
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !selection.rangeCount) { close(); return; }
      const range = selection.getRangeAt(0);
      const node = range.commonAncestorContainer;
      if (!blockRef.current?.contains(node)) { close(); return; }
      const element = node instanceof Element ? node : node.parentElement;
      const editable = element?.closest<HTMLElement>('[contenteditable="true"]');
      const rect = range.getBoundingClientRect();
      if (!rect.width && !rect.height) { close(); return; }
      selectedEditableRef.current = editable && blockRef.current.contains(editable) ? editable : null;
      setSelectionMode(selectedEditableRef.current ? block.type === 'code' ? 'code' : 'rich' : 'readonly');
      selectedRangeRef.current = range.cloneRange();
      setUnderlineActive(document.queryCommandState('underline'));
      if (formatOpen && !reposition) return;
      const panelWidth = Math.min(272, window.innerWidth - 60);
      setFormatPosition({
        left: Math.max(8, Math.min(rect.right + 8, window.innerWidth - panelWidth - 42)),
        top: Math.max(8, Math.min(rect.top - 35, window.innerHeight - 72)),
      });
    };
    const onPointerDown = (event: PointerEvent) => {
      if (linkPromptOpenRef.current) return;
      if (event.target instanceof Node && (blockRef.current?.contains(event.target) || formatToolsRef.current?.contains(event.target))) return;
      close();
    };
    const onSelectionChange = () => updateSelection();
    const onPointerUp = (event: PointerEvent) => updateSelection(event.target instanceof Node && Boolean(blockRef.current?.contains(event.target)));
    const onKeyUp = (event: KeyboardEvent) => { if (event.target instanceof Node && blockRef.current?.contains(event.target)) updateSelection(true); };
    document.addEventListener('selectionchange', onSelectionChange);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('pointerdown', onPointerDown, true);
    const onScroll = () => { if (!linkPromptOpenRef.current) close(); };
    document.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('selectionchange', onSelectionChange);
      document.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, [selected, block.type, formatOpen]);

  function startAction(event: React.PointerEvent, mode: 'drag' | 'resize') {
    event.preventDefault();
    event.stopPropagation();
    clearSelection();
    setActiveBlockId(block.id);
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
    else upsertBlock(activeNoteId, action.block.type === 'drawing'
      ? { ...action.block, height: Math.max(120, Math.round(action.block.height + dy)) }
      : { ...action.block, width: Math.max(220, Math.round(action.block.width + dx)), height: Math.max(130, Math.round(action.block.height + dy)) }, false, false);
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
    const editor = selectedEditableRef.current;
    formattingRef.current = true;
    setColorPickerOpen(false);
    editor?.focus();
    const selection = window.getSelection();
    if (selection && selectedRangeRef.current) {
      selection.removeAllRanges();
      selection.addRange(selectedRangeRef.current);
    }
    document.execCommand(command, false, value);
    if (command === 'underline') setUnderlineActive(document.queryCommandState('underline'));
    if (selection?.rangeCount) selectedRangeRef.current = selection.getRangeAt(0).cloneRange();
    requestAnimationFrame(() => { formattingRef.current = false; });
  }

  function toggleCodeFormatting() {
    const editor = selectedEditableRef.current;
    const range = selectedRangeRef.current;
    const start = range?.startContainer;
    const element = start instanceof Element ? start : start?.parentElement;
    const codeBlock = element?.closest('pre');
    format('formatBlock', codeBlock && editor?.contains(codeBlock) ? 'p' : 'pre');
  }

  function askAIAboutSelection() {
    const selection = captureTextSelection(selectedRangeRef.current, activeNoteId, blockRef.current?.closest<HTMLElement>('.document-page') ?? null);
    if (selection) onAskAI(selection);
    setFormatPosition(null);
    setFormatOpen(false);
  }

  function applyTextColor(color: string) {
    setSelectedColor(color);
    format('foreColor', color);
  }

  function editLink() {
    const savedRange = selectedRangeRef.current?.cloneRange();
    if (!savedRange) return;
    const selectedText = savedRange.toString();
    linkPromptOpenRef.current = true;
    const url = window.prompt('Link URL')?.trim();
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(savedRange);
    selectedRangeRef.current = savedRange;
    if (url) format('createLink', url);
    requestAnimationFrame(() => {
      const editor = selectedEditableRef.current;
      const current = window.getSelection();
      if (editor && current && (current.isCollapsed || current.toString() !== selectedText)) {
        const link = url ? [...editor.querySelectorAll('a[href]')].find((item) => item.getAttribute('href') === url && item.textContent === selectedText) : null;
        const range = link ? document.createRange() : savedRange;
        if (link) range.selectNodeContents(link);
        if (editor.contains(range.commonAncestorContainer)) {
          current.removeAllRanges();
          current.addRange(range);
          selectedRangeRef.current = range.cloneRange();
        }
      }
      linkPromptOpenRef.current = false;
    });
  }

  function duplicate() {
    const copy = { ...block, id: crypto.randomUUID(), isTitle: false, x: block.x + 28, y: block.y + 28 };
    insertBlockAfter(activeNoteId, copy, block.id);
    setActiveBlockId(copy.id);
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
    ref={blockRef}
    className={`canvas-block type-${block.type} ${block.isTitle ? 'title-block' : ''} ${selected ? 'selected' : ''} ${active ? 'active-block' : ''} ${reorderClass}`}
    style={{ transform: `translate(${block.x}px, ${block.y}px)`, width: block.width, height: block.height, '--table-width': block.type === 'table' && block.tableColumnWidths?.length ? `${block.tableColumnWidths.reduce((sum, width) => sum + width, 4)}px` : '100%' } as CSSProperties}
    onPointerDown={(event) => {
      event.stopPropagation();
      if (event.target instanceof Element && event.target.closest('.block-actions, .drag-handle, .resize-handle')) return;
      if (event.shiftKey) { event.preventDefault(); selectBlock(block.id, true); }
      else { clearSelection(); setActiveBlockId(block.id); }
    }}
    data-block-id={block.id}
  >
    <div className="block-chrome">
      <button className="drag-handle" title="Drag block" onPointerDown={(event) => startAction(event, 'drag')} onPointerMove={moveAction} onPointerUp={endAction}><GripVertical size={16} /></button>
      <span className="block-kind">{{ text: 'Text', code: block.language === 'c' ? 'C' : block.language ?? 'Python', checklist: 'Checklist', image: 'Image', table: 'Table', list: 'List', drawing: 'Drawing space' }[block.type]}</span>
      <div className="block-actions">
        <button title="Ask AI" onClick={() => onAskAI()}><Sparkles size={14} /></button>
        <button title="Duplicate" onClick={duplicate}><Copy size={14} /></button>
        {!block.isTitle && <button title="Delete" onClick={() => { if (!selected) selectBlock(block.id); removeSelectedBlocks(); }}><Trash2 size={14} /></button>}
        <button type="button" className="reorder-handle" title="Move block" aria-label="Move block" onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); onReorderStart(block.id, event.clientX, event.clientY); }} onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) onReorderMove(block.id, event.clientX, event.clientY); }} onPointerUp={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) { onReorderEnd(block.id); event.currentTarget.releasePointerCapture(event.pointerId); } }} onPointerCancel={() => onReorderEnd(block.id, true)}><GripVertical size={15} /></button>
      </div>
    </div>

    {formatPosition && createPortal(<div className="text-selection-tools" ref={formatToolsRef} style={formatPosition} onPointerDown={(event) => { event.stopPropagation(); if (event.target === event.currentTarget || event.target instanceof Element && event.target.classList.contains('rich-formatbar')) event.preventDefault(); }}>
        <button type="button" className="format-bubble" title="Editar texto seleccionado" aria-label="Editar texto seleccionado" aria-expanded={formatOpen} onPointerDown={(event) => event.preventDefault()} onClick={() => { setFormatOpen(!formatOpen); setColorPickerOpen(false); }}><Pencil size={15} /></button>
        <button type="button" className="format-bubble selection-ai-bubble" title="Enviar selección a la IA" aria-label="Enviar selección a la IA" onPointerDown={(event) => event.preventDefault()} onClick={askAIAboutSelection}><Sparkles size={15} /></button>
        {formatOpen && (selectionMode !== 'rich' ? <div className={`rich-formatbar code-selection-formatbar ${selectionMode === 'readonly' ? 'readonly-selection-formatbar' : ''}`}>
          <button title="Copy selected text" onMouseDown={(event) => { event.preventDefault(); format('copy'); }}><Copy size={13} /></button>
          {selectionMode === 'code' && <button title="Cut selected code" onMouseDown={(event) => { event.preventDefault(); format('cut'); }}><Scissors size={13} /></button>}
        </div> : <div className="rich-formatbar">
        <label className="font-size-control"><select title="Font size" defaultValue="3" onChange={(event) => format('fontSize', event.target.value)}>
          <option value="2">S</option><option value="3">M</option><option value="4">L</option><option value="5">XL</option>
        </select><span aria-hidden="true">T</span><ChevronDown size={12} aria-hidden="true" /></label>
        <button title="Bold" onMouseDown={(event) => { event.preventDefault(); format('bold'); }}><Bold size={13} /></button>
        <button title="Italic" onMouseDown={(event) => { event.preventDefault(); format('italic'); }}><Italic size={13} /></button>
        <button title="Underline" aria-pressed={underlineActive} onMouseDown={(event) => { event.preventDefault(); format('underline'); }}><Underline size={13} /></button>
        <button type="button" title="Text color" className="color-tool" aria-expanded={colorPickerOpen} onPointerDown={(event) => event.preventDefault()} onClick={() => setColorPickerOpen(!colorPickerOpen)}><i style={{ background: selectedColor }} /></button>
        <button title="Highlight" onMouseDown={(event) => { event.preventDefault(); format('hiliteColor', '#f2e9b9'); }}><Highlighter size={13} /></button>
        <button title="Align left" onMouseDown={(event) => { event.preventDefault(); format('justifyLeft'); }}><AlignLeft size={13} /></button>
        <button title="Bulleted list" onMouseDown={(event) => { event.preventDefault(); format('insertUnorderedList'); }}><List size={13} /></button>
        <button title="Link" onMouseDown={(event) => { event.preventDefault(); editLink(); }}><Link size={13} /></button>
        <button title="Code formatting" onMouseDown={(event) => { event.preventDefault(); toggleCodeFormatting(); }}><Code2 size={13} /></button>
        {colorPickerOpen && <div className="text-color-palette" role="group" aria-label="Text colors">
          <div className="text-color-swatches">{textColors.map(({ name, value }) => <button key={value} type="button" className={selectedColor === value ? 'selected' : ''} style={{ background: value }} aria-label={name} title={name} onPointerDown={(event) => event.preventDefault()} onClick={() => applyTextColor(value)} />)}</div>
          <label className="text-color-custom">Custom color <input type="color" aria-label="Custom text color" value={selectedColor} onPointerDown={() => { colorDialogRef.current = true; }} onFocus={() => { colorDialogRef.current = true; }} onBlur={() => { requestAnimationFrame(() => { colorDialogRef.current = false; }); }} onChange={(event) => { applyTextColor(event.target.value); requestAnimationFrame(() => { colorDialogRef.current = false; }); }} /></label>
        </div>}
        </div>)}
      </div>, document.body)}
    {(block.type === 'text' || block.type === 'list') && <div className={`rich-block ${block.type === 'list' ? 'list-rich-block' : ''}`} contentEditable suppressContentEditableWarning onBlur={(event) => updateContent(event.currentTarget.innerHTML)} dangerouslySetInnerHTML={{ __html: block.content }} />}

    {block.type === 'code' && <div className="code-block">
      <div className="code-header"><span><i className="python-dot" /><select value={block.language ?? 'python'} onChange={(event) => updateCurrent({ language: event.target.value, execution: undefined }, true)}><option value="python">Python</option><option value="c">C</option><option value="javascript">JavaScript</option><option value="typescript">TypeScript</option><option value="sql">SQL</option></select></span>{(block.language ?? 'python') === 'python' && <button onClick={() => void runPython()} disabled={block.execution?.status === 'loading' || block.execution?.status === 'running'}>{block.execution?.status === 'loading' || block.execution?.status === 'running' ? <LoaderCircle className="spin" size={13} /> : <Play size={13} fill="currentColor" />} {block.execution?.status === 'loading' ? 'Loading Python' : block.execution?.status === 'running' ? 'Running' : 'Run'}</button>}</div>
      <pre contentEditable suppressContentEditableWarning spellCheck={false} onBlur={(event) => updateContent(event.currentTarget.textContent ?? '')} dangerouslySetInnerHTML={{ __html: highlightCode(block.content, block.language) }} />
      {(block.language ?? 'python') === 'python' && <CodeOutput block={block} />}
    </div>}

    {block.type === 'image' && <figure className="image-block"><img src={block.content} alt={(block.captionRichText ? block.caption?.replace(/<[^>]+>/g, ' ') : block.caption) || 'Workspace upload'} /><figcaption contentEditable suppressContentEditableWarning onBlur={(event) => updateCurrent({ caption: event.currentTarget.innerHTML, captionRichText: true }, true)} dangerouslySetInnerHTML={{ __html: block.caption ? block.captionRichText ? block.caption : escapeHtml(block.caption) : 'Add a caption…' }} /></figure>}

    {block.type === 'checklist' && <Checklist block={block} onChange={updateContent} />}
    {block.type === 'table' && <TableBlock block={block} />}
    {block.type === 'drawing' && <div className="drawing-space" />}

    <button className="resize-handle" aria-label={block.type === 'drawing' ? 'Resize drawing height' : 'Resize block'} title={block.type === 'drawing' ? 'Drag to change drawing height' : 'Resize block'} onPointerDown={(event) => startAction(event, 'resize')} onPointerMove={moveAction} onPointerUp={endAction} />
  </article>;
});

interface ChecklistItem { id: string; text: string; done: boolean }

function Checklist({ block, onChange }: { block: CanvasBlock; onChange: (value: string) => void }) {
  const activeNoteId = useWorkspace((state) => state.activeNoteId);
  const upsertBlock = useWorkspace((state) => state.upsertBlock);
  const items: ChecklistItem[] = (() => { try { return JSON.parse(block.content); } catch { return []; } })();
  const toggle = (id: string) => onChange(JSON.stringify(items.map((item) => item.id === id ? { ...item, done: !item.done } : item)));
  const addItem = () => { const text = window.prompt('Checklist item'); if (text?.trim()) onChange(JSON.stringify([...items, { id: crypto.randomUUID(), text: block.checklistRichText ? escapeHtml(text.trim()) : text.trim(), done: false }])); };
  const updateItem = (id: string, text: string) => {
    const next = items.map((item) => ({ ...item, text: item.id === id ? text : block.checklistRichText ? item.text : escapeHtml(item.text) }));
    const current = useWorkspace.getState().notes[activeNoteId]?.blocks.find((item) => item.id === block.id) ?? block;
    upsertBlock(activeNoteId, { ...current, content: JSON.stringify(next), checklistRichText: true });
  };
  return <div className="checklist-block">
    <p className="eyebrow">STUDY PLAN</p><h3>Before Thursday</h3>
    <div className="checklist-items">{items.map((item) => <div key={item.id} className={`checklist-item ${item.done ? 'done' : ''}`}>
      <button type="button" role="checkbox" aria-checked={item.done} aria-label={item.text.replace(/<[^>]*>/g, '')} onClick={() => toggle(item.id)} className="check-button">{item.done && <Check size={12} />}</button><span contentEditable suppressContentEditableWarning onBlur={(event) => updateItem(item.id, event.currentTarget.innerHTML)} dangerouslySetInnerHTML={{ __html: block.checklistRichText ? item.text : escapeHtml(item.text) }} />
    </div>)}</div>
    <button className="add-item" onClick={addItem}>+ Add item</button>
  </div>;
}

function TableBlock({ block }: { block: CanvasBlock }) {
  const activeNoteId = useWorkspace((state) => state.activeNoteId);
  const upsertBlock = useWorkspace((state) => state.upsertBlock);
  const checkpoint = useWorkspace((state) => state.checkpoint);
  const rootRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const [activeCell, setActiveCell] = useState<{ row: number; column: number } | null>(null);
  const resizeRef = useRef<{ axis: 'column' | 'row'; index: number; pointerId: number; start: number; sizes: number[]; changed: boolean } | null>(null);
  useEffect(() => {
    const clearCell = (event: PointerEvent | FocusEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setActiveCell(null);
    };
    document.addEventListener('pointerdown', clearCell, true);
    document.addEventListener('focusin', clearCell, true);
    return () => { document.removeEventListener('pointerdown', clearCell, true); document.removeEventListener('focusin', clearCell, true); };
  }, []);
  const rows: string[][] = (() => { try { return JSON.parse(block.content); } catch { return [['Column A', 'Column B'], ['', '']]; } })();
  const columnCount = rows[0]?.length ?? block.tableColumnCount ?? block.tableColumnWidths?.length ?? 0;
  const update = (row: number, column: number, value: string) => {
    const next = rows.map((cells, rowIndex) => cells.map((cell, columnIndex) => rowIndex === row && columnIndex === column ? value : block.tableRichText ? cell : escapeHtml(cell)));
    upsertBlock(activeNoteId, { ...currentBlock(), content: JSON.stringify(next), tableRichText: true });
  };
  const currentBlock = () => useWorkspace.getState().notes[activeNoteId]?.blocks.find((item) => item.id === block.id) ?? block;
  const updateStructure = (nextRows: string[][], columnWidths = block.tableColumnWidths, rowHeights = block.tableRowHeights, nextColumnCount = columnCount) => {
    upsertBlock(activeNoteId, { ...currentBlock(), content: JSON.stringify(nextRows), tableColumnWidths: columnWidths, tableColumnCount: nextRows[0]?.length ?? nextColumnCount, tableRowHeights: rowHeights });
  };
  const startResize = (event: React.PointerEvent<HTMLSpanElement>, axis: 'column' | 'row', index: number) => {
    event.preventDefault();
    event.stopPropagation();
    const table = tableRef.current;
    if (!table) return;
    const sizes = axis === 'column'
      ? [...table.rows[0].cells].map((cell) => Math.round(cell.getBoundingClientRect().width))
      : [...table.rows].map((row) => Math.round(row.getBoundingClientRect().height));
    resizeRef.current = { axis, index, pointerId: event.pointerId, start: axis === 'column' ? event.clientX : event.clientY, sizes, changed: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveResize = (event: React.PointerEvent<HTMLSpanElement>) => {
    const resize = resizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    const delta = (resize.axis === 'column' ? event.clientX : event.clientY) - resize.start;
    if (Math.abs(delta) < 2 && !resize.changed) return;
    const size = Math.max(resize.axis === 'column' ? 60 : 28, Math.round(resize.sizes[resize.index] + delta));
    const sizes = event.shiftKey ? resize.sizes.map(() => size) : [...resize.sizes];
    sizes[resize.index] = size;
    if (!resize.changed) { checkpoint(activeNoteId); resize.changed = true; }
    const current = currentBlock();
    upsertBlock(activeNoteId, { ...current, [resize.axis === 'column' ? 'tableColumnWidths' : 'tableRowHeights']: sizes }, false, false);
  };
  const endResize = (event: React.PointerEvent<HTMLSpanElement>) => {
    const resize = resizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    resizeRef.current = null;
    if (resize.changed) upsertBlock(activeNoteId, currentBlock(), true, false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const resizeWithKeyboard = (event: React.KeyboardEvent<HTMLSpanElement>, axis: 'column' | 'row', index: number) => {
    const direction = axis === 'column' ? event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0 : event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
    if (!direction || !tableRef.current) return;
    event.preventDefault();
    const current = currentBlock();
    const sizes = axis === 'column'
      ? current.tableColumnWidths ?? [...tableRef.current.rows[0].cells].map((cell) => Math.round(cell.getBoundingClientRect().width))
      : current.tableRowHeights ?? [...tableRef.current.rows].map((row) => Math.round(row.getBoundingClientRect().height));
    const size = Math.max(axis === 'column' ? 60 : 28, sizes[index] + direction * (event.shiftKey ? 10 : 5));
    const next = event.shiftKey ? sizes.map(() => size) : [...sizes];
    next[index] = size;
    upsertBlock(activeNoteId, { ...current, [axis === 'column' ? 'tableColumnWidths' : 'tableRowHeights']: next });
  };
  const columnWidths = block.tableColumnWidths;
  const rowHeights = block.tableRowHeights;
  const focusCell = (row: number, column: number) => requestAnimationFrame(() => tableRef.current?.querySelector<HTMLElement>(`.table-cell-editor[data-row="${row}"][data-column="${column}"]`)?.focus());
  const addRow = () => {
    const index = activeCell ? Math.min(activeCell.row + 1, rows.length) : rows.length;
    const nextRows = columnCount ? [...rows] : rows.map(() => ['']);
    nextRows.splice(index, 0, Array(Math.max(columnCount, 1)).fill(''));
    const nextHeights = rowHeights ? [...rowHeights] : undefined;
    nextHeights?.splice(index, 0, 34);
    updateStructure(nextRows, !columnCount && columnWidths ? [100] : columnWidths, nextHeights);
    focusCell(index, activeCell?.column ?? 0);
  };
  const addColumn = () => {
    const index = activeCell ? Math.min(activeCell.column + 1, columnCount) : columnCount;
    const nextRows = (rows.length ? rows : [Array(columnCount).fill('')]).map((cells) => { const next = [...cells]; next.splice(index, 0, ''); return next; });
    const nextWidths = columnWidths ? [...columnWidths] : undefined;
    nextWidths?.splice(index, 0, 100);
    updateStructure(nextRows, nextWidths, !rows.length && rowHeights ? [34] : rowHeights);
    focusCell(activeCell?.row ?? 0, index);
  };
  return <div className="table-block" ref={rootRef}>
    <div className="table-main">
      <div className="table-scroll"><table ref={tableRef} style={{ width: columnWidths?.length ? `${columnWidths.reduce((sum, width) => sum + width, 0)}px` : columnCount ? '100%' : '0px', minWidth: columnWidths?.length ? undefined : `${columnCount * 90}px` }}>
        {columnWidths?.length && <colgroup>{columnWidths.map((width, index) => <col key={index} style={{ width: `${width}px` }} />)}</colgroup>}
        <tbody>{rows.map((cells, rowIndex) => <tr key={rowIndex} style={{ height: rowHeights?.[rowIndex] }}>{cells.map((cell, columnIndex) => <td key={columnIndex}>
          <div className="table-cell-editor" data-row={rowIndex} data-column={columnIndex} contentEditable suppressContentEditableWarning onFocus={() => setActiveCell({ row: rowIndex, column: columnIndex })} onBlur={(event) => update(rowIndex, columnIndex, event.currentTarget.innerHTML)} dangerouslySetInnerHTML={{ __html: block.tableRichText ? cell : escapeHtml(cell) }} />
          <span className="table-column-resizer" role="separator" tabIndex={0} aria-label={`Resize column ${columnIndex + 1}`} title="Drag to resize · Shift: all columns" aria-orientation="vertical" aria-valuenow={columnWidths?.[columnIndex]} onPointerDown={(event) => startResize(event, 'column', columnIndex)} onPointerMove={moveResize} onPointerUp={endResize} onPointerCancel={endResize} onKeyDown={(event) => resizeWithKeyboard(event, 'column', columnIndex)} />
          <span className="table-row-resizer" role="separator" tabIndex={0} aria-label={`Resize row ${rowIndex + 1}`} title="Drag to resize · Shift: all rows" aria-orientation="horizontal" aria-valuenow={rowHeights?.[rowIndex]} onPointerDown={(event) => startResize(event, 'row', rowIndex)} onPointerMove={moveResize} onPointerUp={endResize} onPointerCancel={endResize} onKeyDown={(event) => resizeWithKeyboard(event, 'row', rowIndex)} />
        </td>)}</tr>)}</tbody>
      </table></div>
      <div className="table-control table-column-control">
        <button type="button" aria-label="Add column" title="Add column" onClick={addColumn}>+</button>
        <span>Col</span>
        <button type="button" aria-label="Remove last column" title="Remove last column" disabled={columnCount === 0} onClick={() => updateStructure(rows.map((cells) => cells.slice(0, -1)), columnWidths?.slice(0, -1), rowHeights, columnCount - 1)}>−</button>
      </div>
    </div>
    <div className="table-control table-row-control"><button type="button" onClick={addRow}>+ Row</button><button type="button" aria-label="Remove last row" title="Remove last row" disabled={rows.length === 0} onClick={() => updateStructure(rows.slice(0, -1), columnWidths, rowHeights?.slice(0, -1))}>−</button></div>
  </div>;
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
