import { useState } from 'react';
import { ArrowLeft, Brain, ChevronDown, ChevronRight, FileText, Folder, Plus, X } from 'lucide-react';
import { useWorkspace } from '../store/useWorkspace';

export function Sidebar() {
  const projectId = useWorkspace((state) => state.activeProjectId);
  const projects = useWorkspace((state) => state.projects);
  const allFolders = useWorkspace((state) => state.folders);
  const allNotes = useWorkspace((state) => state.notes);
  const project = projects.find((item) => item.id === projectId);
  const folders = allFolders.filter((item) => item.projectId === projectId);
  const notes = Object.values(allNotes).filter((item) => item.projectId === projectId);
  const activeNoteId = useWorkspace((state) => state.activeNoteId);
  const activeView = useWorkspace((state) => state.activeView);
  const setActiveNote = useWorkspace((state) => state.setActiveNote);
  const setActiveView = useWorkspace((state) => state.setActiveView);
  const setAiOpen = useWorkspace((state) => state.setAiOpen);
  const addFolder = useWorkspace((state) => state.addFolder);
  const addNote = useWorkspace((state) => state.addNote);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | undefined>();
  const [addOpen, setAddOpen] = useState(false);

  function createNote() {
    const title = window.prompt('Document name');
    if (title?.trim()) {
      if (selectedFolderId) setExpanded((current) => current.filter((id) => id !== selectedFolderId));
      addNote({ id: crypto.randomUUID(), title: title.trim(), emoji: '◇', projectId, folderId: selectedFolderId, updatedAt: Date.now(), blocks: [], strokes: [] });
    }
    setAddOpen(false);
  }

  function createFolder() {
    const title = window.prompt('Folder name');
    if (title?.trim()) addFolder({ id: crypto.randomUUID(), projectId, title: title.trim(), emoji: '▧', context: [] });
    setAddOpen(false);
  }

  return <aside className="project-sidebar">
    <div className="project-sidebar-heading"><button aria-label="Back to home" onClick={() => { setActiveView('calendar'); setAiOpen(false); }}><ArrowLeft size={19} /></button><strong>PROJECTS</strong><button aria-label="Add folder or document" onClick={() => setAddOpen(!addOpen)}><Plus size={20} /></button></div>
    {addOpen && <div className="project-add-menu"><div><span>Add to {selectedFolderId ? folders.find((folder) => folder.id === selectedFolderId)?.title : project?.title}</span><button aria-label="Close add menu" onClick={() => setAddOpen(false)}><X size={13} /></button></div><button onClick={createFolder}><Folder size={15} /> New folder</button><button onClick={createNote}><FileText size={15} /> New document</button></div>}
    {project ? <div className="project-tree"><div className="project-tree-root"><span>{project.emoji}</span><strong>{project.title}</strong><button title="Project memory" aria-label="Project memory" onClick={() => setActiveView('context')}><Brain size={15} /></button></div>
      <div className="project-tree-children">
        {folders.map((folder) => { const isOpen = !expanded.includes(folder.id); return <div className="tree-folder" key={folder.id}><button className={`tree-folder-row ${selectedFolderId === folder.id ? 'selected' : ''}`} onClick={() => { setSelectedFolderId(folder.id); setExpanded(isOpen ? [...expanded, folder.id] : expanded.filter((id) => id !== folder.id)); }}><span>{isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</span><Folder size={15} /><strong>{folder.title}</strong></button>{isOpen && <div className="tree-documents">{notes.filter((note) => note.folderId === folder.id).map((note) => <button className={`tree-document ${activeNoteId === note.id && activeView === 'note' ? 'active' : ''}`} key={note.id} onClick={() => setActiveNote(note.id)}><FileText size={14} /><span>{note.title}</span></button>)}</div>}</div>; })}
        {notes.filter((note) => !note.folderId).map((note) => <button className={`tree-document root-document ${activeNoteId === note.id && activeView === 'note' ? 'active' : ''}`} key={note.id} onClick={() => setActiveNote(note.id)}><FileText size={14} /><span>{note.title}</span></button>)}
      </div>
    </div> : <p className="project-tree-empty">Project not found.</p>}
  </aside>;
}
