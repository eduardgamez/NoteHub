import { useEffect } from 'react';
import { Sparkles, X } from 'lucide-react';
import { AIPanel } from './components/AIPanel';
import { AppHeader } from './components/AppHeader';
import { CanvasWorkspace } from './components/CanvasWorkspace';
import { HomeView } from './components/HomeView';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { GymView } from './components/modules/GymView';
import { ContextView } from './components/modules/ContextView';
import { SettingsView } from './components/modules/SettingsView';
import { PWAStatus } from './components/PWAStatus';
import { useWorkspace, workspaceDataFrom } from './store/useWorkspace';
import { syncEngine } from './sync/syncEngine';

export function App() {
  const hydrate = useWorkspace((state) => state.hydrate);
  const hydrated = useWorkspace((state) => state.hydrated);
  const applyRemote = useWorkspace((state) => state.applyRemote);
  const aiOpen = useWorkspace((state) => state.aiOpen);
  const setAiOpen = useWorkspace((state) => state.setAiOpen);
  const sidebarOpen = useWorkspace((state) => state.sidebarOpen);
  const activeView = useWorkspace((state) => state.activeView);
  const activeProjectId = useWorkspace((state) => state.activeProjectId);
  const notes = useWorkspace((state) => state.notes);
  const activeNoteId = useWorkspace((state) => state.activeNoteId);
  const addNote = useWorkspace((state) => state.addNote);

  useEffect(() => { void hydrate(); }, [hydrate]);
  useEffect(() => hydrated ? syncEngine.subscribe(applyRemote, () => workspaceDataFrom(useWorkspace.getState())) : undefined, [applyRemote, hydrated]);

  if (!hydrated) return <div className="loading-screen"><div className="brand-mark">N</div><span>Opening your workspace…</span></div>;

  const projectView = activeView === 'note' || activeView === 'project' || activeView === 'context';
  const hasActiveDocument = notes[activeNoteId]?.projectId === activeProjectId;
  return <div className={`app-frame ${projectView ? 'in-project' : ''}`}>
    <AppHeader />
    {activeView === 'calendar' ? <HomeView /> : projectView ? <div className={`project-layout ${sidebarOpen ? '' : 'sidebar-collapsed'} ${aiOpen ? '' : 'ai-collapsed'}`}>
      {sidebarOpen && <Sidebar />}
      <section className="project-workspace"><Topbar />{activeView === 'context' ? <ContextView /> : hasActiveDocument ? <CanvasWorkspace /> : <div className="project-empty"><h1>Your project is ready</h1><p>Add your first document to start writing.</p><button className="primary-button" onClick={() => { const title = window.prompt('Document name'); if (title?.trim()) addNote({ id: crypto.randomUUID(), title: title.trim(), emoji: '◇', projectId: activeProjectId, updatedAt: Date.now(), blocks: [], strokes: [] }); }}>Create document</button></div>}</section>
      {aiOpen && <AIPanel />}
      <button className={`ai-panel-toggle ${aiOpen ? 'open' : ''}`} onClick={() => setAiOpen(!aiOpen)} aria-label={aiOpen ? 'Close AI panel' : 'Open AI panel'}>{aiOpen ? <X size={17} /> : <Sparkles size={17} />}</button>
    </div> : <div className="standalone-view">{activeView === 'gym' ? <GymView /> : <SettingsView />}</div>}
    <PWAStatus />
  </div>;
}
