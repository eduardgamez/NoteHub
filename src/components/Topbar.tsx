import { ChevronRight, Cloud, Menu, Moon, MoreHorizontal, PanelRight, Share2, Sun, Users } from 'lucide-react';
import { useWorkspace } from '../store/useWorkspace';
import { useTheme } from '../hooks/useTheme';

export function Topbar() {
  const note = useWorkspace((state) => state.notes[state.activeNoteId]);
  const activeView = useWorkspace((state) => state.activeView);
  const project = useWorkspace((state) => state.projects.find((item) => item.id === note.projectId));
  const aiOpen = useWorkspace((state) => state.aiOpen);
  const setAiOpen = useWorkspace((state) => state.setAiOpen);
  const sidebarOpen = useWorkspace((state) => state.sidebarOpen);
  const setSidebarOpen = useWorkspace((state) => state.setSidebarOpen);
  const { theme, followsSystem, toggleTheme, useSystemTheme } = useTheme();
  const viewLabel = { calendar: 'Calendar', tasks: 'Tasks & reminders', gym: 'Gym', inbox: 'AI inbox', settings: 'Settings', context: 'Project memory', note: note.title }[activeView];

  return <header className="topbar">
    <div className="breadcrumbs">
      <button className="mobile-menu" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Toggle sidebar"><Menu size={18} /></button>
      <span>{activeView === 'note' || activeView === 'context' ? project?.emoji : 'N'}</span>
      <span>{activeView === 'note' || activeView === 'context' ? project?.title : 'Workspace'}</span><ChevronRight size={14} /><strong>{viewLabel}</strong>
    </div>
    <div className="topbar-actions">
      <span className="save-status"><Cloud size={14} /> Saved locally</span>
      <button className="avatar-stack" title="Collaborators"><span>EG</span><span><Users size={12} /></span></button>
      <button><Share2 size={16} /><span className="button-label">Share</span></button>
      <button
        className="theme-toggle"
        onClick={toggleTheme}
        onDoubleClick={useSystemTheme}
        aria-label={theme === 'dark' ? 'Use light theme' : 'Use dark theme'}
        title={`${theme === 'dark' ? 'Use light theme' : 'Use dark theme'}${followsSystem ? ' · Following system' : ' · Double-click to follow system'}`}
      >{theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}</button>
      <button className={aiOpen ? 'active' : ''} onClick={() => setAiOpen(!aiOpen)}><PanelRight size={17} /><span className="button-label">AI</span></button>
      <button aria-label="More"><MoreHorizontal size={18} /></button>
    </div>
  </header>;
}
