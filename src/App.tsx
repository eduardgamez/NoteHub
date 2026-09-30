import { NativeRuntime } from './native/NativeRuntime';
import { useEffect } from 'react';
import { Sparkles } from 'lucide-react';
import { AIPanel } from './components/AIPanel';
import { AppHeader } from './components/AppHeader';
import { CanvasWorkspace } from './components/CanvasWorkspace';
import { HomeView } from './components/HomeView';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { GymView } from './components/modules/GymView';
import { ContextView } from './components/modules/ContextView';
import { SettingsView } from './components/modules/SettingsView';
import { ProfileView } from './components/modules/ProfileView';
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

  useEffect(() => { void hydrate(); }, [hydrate]);
  useEffect(() => hydrated ? syncEngine.subscribe(applyRemote, () => workspaceDataFrom(useWorkspace.getState()), () => useWorkspace.getState().finishSyncRecovery()) : undefined, [applyRemote, hydrated]);

  useEffect(() => {
    const fitPanels = () => {
      const state = useWorkspace.getState();
      if (window.innerWidth <= 820 && state.aiOpen && state.sidebarOpen) state.setSidebarOpen(false);
    };
    fitPanels();
    window.addEventListener('resize', fitPanels);
    return () => window.removeEventListener('resize', fitPanels);
  }, [aiOpen, sidebarOpen]);

  if (!hydrated) return <div className="loading-screen"><div className="brand-mark">N</div><span>Opening your workspace…</span></div>;

  const projectView = activeView === 'note' || activeView === 'project' || activeView === 'context';
  const hasActiveDocument = notes[activeNoteId]?.projectId === activeProjectId;
  return <div className={`app-frame ${projectView ? 'in-project' : ''}`}>
    <AppHeader />
    {activeView === 'calendar' ? <HomeView /> : projectView ? <div className={`project-layout ${sidebarOpen ? '' : 'sidebar-collapsed'} ${aiOpen ? '' : 'ai-collapsed'}`}>
      {sidebarOpen && <Sidebar />}
      <section className="project-workspace"><Topbar />{activeView === 'context' ? <ContextView /> : hasActiveDocument ? <CanvasWorkspace /> : <div className="project-empty"><h1>Your project is ready</h1><p>Right-click empty space in Projects to create a folder or document.</p></div>}</section>
      {aiOpen && <AIPanel />}
      {!aiOpen && <button className="ai-panel-toggle" onClick={() => setAiOpen(true)} aria-label="Open AI panel"><Sparkles size={17} /></button>}
    </div> : <div className="standalone-view">{activeView === 'gym' ? <GymView /> : activeView === 'profile' ? <ProfileView /> : <SettingsView />}</div>}
    <NativeRuntime /><PWAStatus />
  </div>;
}
