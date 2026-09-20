import { useMemo, useState } from 'react';
import { CalendarDays, CheckSquare2, ChevronDown, ChevronRight, CircleHelp, Dumbbell, FileText, Folder, Plus, Search, Settings, Sparkles } from 'lucide-react';
import { useWorkspace } from '../store/useWorkspace';

export function Sidebar() {
  const projects = useWorkspace((state) => state.projects);
  const notes = useWorkspace((state) => state.notes);
  const folders = useWorkspace((state) => state.folders);
  const activeNoteId = useWorkspace((state) => state.activeNoteId);
  const setActiveNote = useWorkspace((state) => state.setActiveNote);
  const activeView = useWorkspace((state) => state.activeView);
  const setActiveView = useWorkspace((state) => state.setActiveView);
  const setAiOpen = useWorkspace((state) => state.setAiOpen);
  const addProject = useWorkspace((state) => state.addProject);
  const addNote = useWorkspace((state) => state.addNote);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [searching, setSearching] = useState(false);

  const [query, setQuery] = useState('');
  const grouped = useMemo(() => projects.map((project) => ({
    project,
    notes: Object.values(notes).filter((note) => note.projectId === project.id && note.title.toLowerCase().includes(query.toLowerCase())),
    folders: folders.filter((folder) => folder.projectId === project.id && (folder.title.toLowerCase().includes(query.toLowerCase()) || Object.values(notes).some((note) => note.folderId === folder.id && note.title.toLowerCase().includes(query.toLowerCase())))),
  })), [projects, notes, folders, query]);

  return (
    <aside className="sidebar">
      <div className="workspace-switcher">
        <div className="brand-mark">N</div>
        <div className="workspace-name"><strong>Eduard’s space</strong><span>Personal workspace</span></div>
        <ChevronDown size={15} />
      </div>

      <nav className="sidebar-nav" aria-label="Workspace">
        <button onClick={() => setSearching(!searching)}><Search size={16} /><span>Search</span><kbd>⌘K</kbd></button>
        {searching && <input autoFocus className="sidebar-search" placeholder="Search notes…" value={query} onChange={(event) => setQuery(event.target.value)} />}
        <button className={activeView === 'inbox' ? 'active' : ''} onClick={() => { setActiveView('inbox'); setAiOpen(false); }}><Sparkles size={16} /><span>AI inbox</span><span className="nav-badge">3</span></button>
        <button className={activeView === 'calendar' ? 'active' : ''} onClick={() => setActiveView('calendar')}><CalendarDays size={16} /><span>Calendar</span></button>
        <button className={activeView === 'tasks' ? 'active' : ''} onClick={() => setActiveView('tasks')}><CheckSquare2 size={16} /><span>Tasks & reminders</span></button>
        <button className={activeView === 'gym' ? 'active' : ''} onClick={() => setActiveView('gym')}><Dumbbell size={16} /><span>Gym</span></button>
      </nav>

      <div className="sidebar-section-heading"><span>Projects</span><button aria-label="Add project" onClick={() => { const title = window.prompt('Project name'); if (title?.trim()) addProject({ id: crypto.randomUUID(), title: title.trim(), emoji: '◆', context: [] }); }}><Plus size={15} /></button></div>
      <div className="project-list">
        {grouped.map(({ project, notes: projectNotes, folders: projectFolders }) => {
          const isCollapsed = collapsed.includes(project.id);
          return <div key={project.id} className="project-group">
            <button className="project-row" onDoubleClick={() => { const first = projectNotes[0]; if (first) setActiveNote(first.id); setActiveView('context'); }} onClick={() => setCollapsed(isCollapsed ? collapsed.filter((id) => id !== project.id) : [...collapsed, project.id])} title="Double-click to edit project memory">
              {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
              <span className="project-emoji">{project.emoji}</span><span>{project.title}</span>
              <Plus className="row-action" size={14} onClick={(event) => { event.stopPropagation(); const title = window.prompt(`New note in ${project.title}`); if (title?.trim()) addNote({ id: crypto.randomUUID(), title: title.trim(), emoji: '◇', projectId: project.id, updatedAt: Date.now(), blocks: [], strokes: [] }); }} />
            </button>
            {!isCollapsed && <div className="project-notes">
              {projectNotes.filter((note) => !note.folderId).map((note) => <button key={note.id} className={`note-row ${note.id === activeNoteId && activeView === 'note' ? 'active' : ''}`} onClick={() => setActiveNote(note.id)}>
                <FileText size={14} /><span>{note.title}</span>
              </button>)}
              {projectFolders.map((folder) => <div className="folder-group" key={folder.id}><button className="note-row folder-row" onDoubleClick={() => { const first = projectNotes.find((note) => note.folderId === folder.id); if (first) setActiveNote(first.id); setActiveView('context'); }}><Folder size={14} /><span>{folder.title}</span></button><div className="folder-notes">{projectNotes.filter((note) => note.folderId === folder.id).map((note) => <button key={note.id} className={`note-row ${note.id === activeNoteId && activeView === 'note' ? 'active' : ''}`} onClick={() => setActiveNote(note.id)}><FileText size={13} /><span>{note.title}</span></button>)}</div></div>)}
            </div>}
          </div>;
        })}
      </div>

      <div className="sidebar-bottom">
        <button className={activeView === 'settings' ? 'active' : ''} onClick={() => setActiveView('settings')}><Settings size={16} /><span>Settings</span></button>
        <button><CircleHelp size={16} /><span>Help & shortcuts</span></button>
        <div className="storage-meter"><div><span>Local workspace</span><span>12 MB</span></div><div className="meter"><span /></div></div>
      </div>
    </aside>
  );
}
