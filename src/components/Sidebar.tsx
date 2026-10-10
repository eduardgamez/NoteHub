import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ChevronDown, ChevronRight, Copy, FilePlus2, FileText, Folder, FolderPlus, MoreHorizontal, Pencil, Trash2, X } from 'lucide-react';
import { useWorkspace } from '../store/useWorkspace';
import type { Folder as FolderRecord, Note } from '../types';

type MenuState = { kind: 'blank' | 'folder' | 'note'; id?: string; x: number; y: number };
type EditState = { kind: 'folder' | 'note'; id?: string; parentId?: string; value: string };

export function Sidebar() {
  const projectId = useWorkspace((state) => state.activeProjectId);
  const project = useWorkspace((state) => state.projects.find((item) => item.id === state.activeProjectId));
  const allFolders = useWorkspace((state) => state.folders);
  const allNotes = useWorkspace((state) => state.notes);
  const folders = allFolders.filter((item) => item.projectId === projectId);
  const notes = Object.values(allNotes).filter((item) => item.projectId === projectId);
  const activeNoteId = useWorkspace((state) => state.activeNoteId);
  const activeView = useWorkspace((state) => state.activeView);
  const setActiveNote = useWorkspace((state) => state.setActiveNote);
  const setActiveView = useWorkspace((state) => state.setActiveView);
  const setAiOpen = useWorkspace((state) => state.setAiOpen);
  const setSidebarOpen = useWorkspace((state) => state.setSidebarOpen);
  const addFolder = useWorkspace((state) => state.addFolder);
  const updateFolder = useWorkspace((state) => state.updateFolder);
  const duplicateFolder = useWorkspace((state) => state.duplicateFolder);
  const removeFolder = useWorkspace((state) => state.removeFolder);
  const addNote = useWorkspace((state) => state.addNote);
  const renameNote = useWorkspace((state) => state.renameNote);
  const duplicateNote = useWorkspace((state) => state.duplicateNote);
  const removeNote = useWorkspace((state) => state.removeNote);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [editing, setEditing] = useState<EditState | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!menu) return;
    const closeOutside = (event: PointerEvent) => { if (event.target instanceof Node && !menuRef.current?.contains(event.target)) setMenu(null); };
    const closeEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenu(null); };
    document.addEventListener('pointerdown', closeOutside, true);
    document.addEventListener('keydown', closeEscape);
    return () => { document.removeEventListener('pointerdown', closeOutside, true); document.removeEventListener('keydown', closeEscape); };
  }, [menu]);

  useEffect(() => {
    if (!editing) return;
    const frame = requestAnimationFrame(() => { inputRef.current?.focus(); if (editing.id) inputRef.current?.select(); });
    return () => cancelAnimationFrame(frame);
  }, [editing?.kind, editing?.id, editing?.parentId]);

  function showMenu(kind: MenuState['kind'], id: string | undefined, x: number, y: number) {
    setMenu({ kind, id, x: Math.max(8, Math.min(x, window.innerWidth - 198)), y: Math.max(8, Math.min(y, window.innerHeight - (kind === 'folder' ? 194 : 128))) });
  }

  function startCreate(kind: EditState['kind'], parentId?: string) {
    setMenu(null);
    if (parentId) setCollapsed((current) => current.filter((id) => id !== parentId));
    setEditing({ kind, parentId, value: '' });
  }

  function finishEditing(save: boolean) {
    if (!editing) return;
    const draft = editing;
    setEditing(null);
    const title = draft.value.trim();
    if (!save || !title) return;
    if (draft.kind === 'folder') {
      if (draft.id) {
        const folder = folders.find((item) => item.id === draft.id);
        if (folder && folder.title !== title) updateFolder({ ...folder, title });
      } else addFolder({ id: crypto.randomUUID(), projectId, parentId: draft.parentId, title, emoji: '▧', context: [] });
    } else if (draft.id) renameNote(draft.id, title);
    else addNote({ id: crypto.randomUUID(), title, emoji: '◇', projectId, folderId: draft.parentId, updatedAt: Date.now(), blocks: [], strokes: [] });
  }

  function draftInput() {
    return <input ref={inputRef} aria-label={editing?.id ? `Rename ${editing.kind}` : `New ${editing?.kind} name`} placeholder={editing?.kind === 'folder' ? 'Folder name' : 'Document name'} value={editing?.value ?? ''} onChange={(event) => setEditing((current) => current ? { ...current, value: event.target.value } : null)} onBlur={() => finishEditing(true)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); finishEditing(true); } if (event.key === 'Escape') { event.preventDefault(); finishEditing(false); } }} />;
  }

  function newItem(parentId?: string) {
    if (!editing || editing.id || editing.parentId !== parentId) return null;
    return <div className="tree-draft-row" key="new-item">{editing.kind === 'folder' ? <Folder size={15} /> : <FileText size={14} />}{draftInput()}</div>;
  }

  function noteRow(note: Note) {
    const renaming = editing?.kind === 'note' && editing.id === note.id;
    return <div className="tree-item-entry" key={note.id}>
      {renaming ? <div className="tree-draft-row"><FileText size={14} />{draftInput()}</div> : <><button className={`tree-document ${!note.folderId ? 'root-document' : ''} ${activeNoteId === note.id && activeView === 'note' ? 'active' : ''}`} onClick={() => setActiveNote(note.id)}><FileText size={14} /><span>{note.title}</span></button><button className={`tree-item-more ${menu?.kind === 'note' && menu.id === note.id ? 'open' : ''}`} type="button" aria-label={`Options for document ${note.title}`} aria-expanded={menu?.kind === 'note' && menu.id === note.id} onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); showMenu('note', note.id, rect.right + 5, rect.top); }}><MoreHorizontal size={16} /></button></>}
    </div>;
  }

  function folderRow(folder: FolderRecord) {
    const isOpen = !collapsed.includes(folder.id);
    const renaming = editing?.kind === 'folder' && editing.id === folder.id;
    return <div className="tree-folder" key={folder.id}>
      <div className="tree-item-entry">{renaming ? <div className="tree-draft-row"><Folder size={15} />{draftInput()}</div> : <><button className={`tree-folder-row ${selectedFolderId === folder.id ? 'selected' : ''}`} onClick={() => { setSelectedFolderId(folder.id); setCollapsed((current) => isOpen ? [...current, folder.id] : current.filter((id) => id !== folder.id)); }}><span>{isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</span><Folder size={15} /><strong>{folder.title}</strong></button><button className={`tree-item-more ${menu?.kind === 'folder' && menu.id === folder.id ? 'open' : ''}`} type="button" aria-label={`Options for folder ${folder.title}`} aria-expanded={menu?.kind === 'folder' && menu.id === folder.id} onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); showMenu('folder', folder.id, rect.right + 5, rect.top); }}><MoreHorizontal size={16} /></button></>}</div>
      {isOpen && <div className="tree-documents">{folders.filter((child) => child.parentId === folder.id).map(folderRow)}{notes.filter((note) => note.folderId === folder.id).map(noteRow)}{newItem(folder.id)}</div>}
    </div>;
  }

  const targetFolder = menu?.kind === 'folder' ? folders.find((folder) => folder.id === menu.id) : undefined;
  const targetNote = menu?.kind === 'note' ? notes.find((note) => note.id === menu.id) : undefined;

  return <aside className="project-sidebar" onContextMenu={(event) => {
    if (event.target instanceof Element && event.target.closest('.project-sidebar-heading, .tree-item-entry, .tree-draft-row')) { event.preventDefault(); return; }
    event.preventDefault();
    showMenu('blank', undefined, event.clientX + 6, event.clientY);
  }}>
    <div className="project-sidebar-heading"><button aria-label="Back to home" onClick={() => { setActiveView('calendar'); setAiOpen(false); }}><ArrowLeft size={19} /></button><strong>PROJECTS</strong><button type="button" className="project-sidebar-close" aria-label="Close project explorer" title="Close project explorer" onClick={() => setSidebarOpen(false)}><X size={20} /></button></div>
    {project ? <div className="project-tree"><div className="project-tree-root"><span>{project.emoji}</span><strong>{project.title}</strong><button type="button" aria-label="New folder" title="New folder" onClick={() => startCreate('folder')}><FolderPlus size={16} /></button><button type="button" aria-label="New document" title="New document" onClick={() => startCreate('note')}><FilePlus2 size={16} /></button></div>
      <div className="project-tree-children">{folders.filter((folder) => !folder.parentId || !folders.some((parent) => parent.id === folder.parentId)).map(folderRow)}{notes.filter((note) => !note.folderId || !folders.some((folder) => folder.id === note.folderId)).map(noteRow)}{newItem()}</div>
    </div> : <p className="project-tree-empty">Project not found.</p>}
    {menu && createPortal(<div ref={menuRef} className="project-context-menu" role="menu" aria-label="Project item options" style={{ left: menu.x, top: menu.y }}>
      {(menu.kind === 'blank' || targetFolder) && <><button role="menuitem" onClick={() => startCreate('folder', targetFolder?.id)}><FolderPlus size={15} />New folder</button><button role="menuitem" onClick={() => startCreate('note', targetFolder?.id)}><FilePlus2 size={15} />New document</button></>}
      {(targetFolder || targetNote) && <div className="project-context-divider" />}
      {targetFolder && <><button role="menuitem" onClick={() => { setEditing({ kind: 'folder', id: targetFolder.id, parentId: targetFolder.parentId, value: targetFolder.title }); setMenu(null); }}><Pencil size={15} />Rename</button><button role="menuitem" onClick={() => { duplicateFolder(targetFolder.id); setMenu(null); }}><Copy size={15} />Duplicate</button><button role="menuitem" className="danger" onClick={() => { setMenu(null); if (window.confirm(`Delete “${targetFolder.title}” and everything inside it?`)) removeFolder(targetFolder.id); }}><Trash2 size={15} />Delete</button></>}
      {targetNote && <><button role="menuitem" onClick={() => { setEditing({ kind: 'note', id: targetNote.id, parentId: targetNote.folderId, value: targetNote.title }); setMenu(null); }}><Pencil size={15} />Rename</button><button role="menuitem" onClick={() => { duplicateNote(targetNote.id); setMenu(null); }}><Copy size={15} />Duplicate</button><button role="menuitem" className="danger" onClick={() => { setMenu(null); if (window.confirm(`Delete “${targetNote.title}”?`)) removeNote(targetNote.id); }}><Trash2 size={15} />Delete</button></>}
    </div>, document.body)}
  </aside>;
}
