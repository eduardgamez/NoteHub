import { useMemo, useState } from 'react';
import { CalendarDays, ChevronDown, ChevronRight, CircleHelp, FileText, Folder, Plus, Search, Settings, Sparkles } from 'lucide-react';
import { useWorkspace } from '../store/useWorkspace';

export function Sidebar() {
  const projects = useWorkspace((state) => state.projects);
  const notes = useWorkspace((state) => state.notes);
  const activeNoteId = useWorkspace((state) => state.activeNoteId);
  const setActiveNote = useWorkspace((state) => state.setActiveNote);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [searching, setSearching] = useState(false);

  const grouped = useMemo(() => projects.map((project) => ({ project, notes: Object.values(notes).filter((note) => note.projectId === project.id) })), [projects, notes]);

  return (
    <aside className="sidebar">
      <div className="workspace-switcher">
        <div className="brand-mark">N</div>
        <div className="workspace-name"><strong>Eduard’s space</strong><span>Personal workspace</span></div>
        <ChevronDown size={15} />
      </div>

      <nav className="sidebar-nav" aria-label="Workspace">
        <button onClick={() => setSearching(!searching)}><Search size={16} /><span>Search</span><kbd>⌘K</kbd></button>
        {searching && <input autoFocus className="sidebar-search" placeholder="Search notes…" />}
        <button><Sparkles size={16} /><span>AI inbox</span><span className="nav-badge">3</span></button>
        <button><CalendarDays size={16} /><span>Calendar</span><span className="muted-label">Soon</span></button>
      </nav>

      <div className="sidebar-section-heading"><span>Projects</span><button aria-label="Add project"><Plus size={15} /></button></div>
      <div className="project-list">
        {grouped.map(({ project, notes: projectNotes }) => {
          const isCollapsed = collapsed.includes(project.id);
          return <div key={project.id} className="project-group">
            <button className="project-row" onClick={() => setCollapsed(isCollapsed ? collapsed.filter((id) => id !== project.id) : [...collapsed, project.id])}>
              {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
              <span className="project-emoji">{project.emoji}</span><span>{project.title}</span>
              <Plus className="row-action" size={14} />
            </button>
            {!isCollapsed && <div className="project-notes">
              {projectNotes.map((note) => <button key={note.id} className={`note-row ${note.id === activeNoteId ? 'active' : ''}`} onClick={() => setActiveNote(note.id)}>
                <FileText size={14} /><span>{note.title}</span>
              </button>)}
              {project.id === 'university' && <button className="note-row folder-row"><Folder size={14} /><span>Course files</span></button>}
            </div>}
          </div>;
        })}
      </div>

      <div className="sidebar-bottom">
        <button><Settings size={16} /><span>Settings</span></button>
        <button><CircleHelp size={16} /><span>Help & shortcuts</span></button>
        <div className="storage-meter"><div><span>Local workspace</span><span>12 MB</span></div><div className="meter"><span /></div></div>
      </div>
    </aside>
  );
}
