import { ChevronRight, Cloud, Menu, MoreHorizontal, PanelRight, Share2, Users } from 'lucide-react';
import { useWorkspace } from '../store/useWorkspace';

export function Topbar() {
  const note = useWorkspace((state) => state.notes[state.activeNoteId]);
  const project = useWorkspace((state) => state.projects.find((item) => item.id === note.projectId));
  const aiOpen = useWorkspace((state) => state.aiOpen);
  const setAiOpen = useWorkspace((state) => state.setAiOpen);
  const sidebarOpen = useWorkspace((state) => state.sidebarOpen);
  const setSidebarOpen = useWorkspace((state) => state.setSidebarOpen);

  return <header className="topbar">
    <div className="breadcrumbs">
      <button className="mobile-menu" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Toggle sidebar"><Menu size={18} /></button>
      <span>{project?.emoji}</span><span>{project?.title}</span><ChevronRight size={14} /><strong>{note.title}</strong>
    </div>
    <div className="topbar-actions">
      <span className="save-status"><Cloud size={14} /> Saved locally</span>
      <button className="avatar-stack" title="Collaborators"><span>EG</span><span><Users size={12} /></span></button>
      <button><Share2 size={16} /><span className="button-label">Share</span></button>
      <button className={aiOpen ? 'active' : ''} onClick={() => setAiOpen(!aiOpen)}><PanelRight size={17} /><span className="button-label">AI</span></button>
      <button aria-label="More"><MoreHorizontal size={18} /></button>
    </div>
  </header>;
}
