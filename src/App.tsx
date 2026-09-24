import { useEffect } from 'react';
import { Sparkles, X } from 'lucide-react';
import { AIPanel } from './components/AIPanel';
import { CanvasWorkspace } from './components/CanvasWorkspace';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { CalendarView } from './components/modules/CalendarView';
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

  useEffect(() => { void hydrate(); }, [hydrate]);
  useEffect(() => hydrated ? syncEngine.subscribe(applyRemote, () => workspaceDataFrom(useWorkspace.getState())) : undefined, [applyRemote, hydrated]);

  if (!hydrated) return <div className="loading-screen"><div className="brand-mark">N</div><span>Opening your workspace…</span></div>;

  return <div className={`app-shell ${sidebarOpen ? '' : 'sidebar-collapsed'} ${aiOpen ? '' : 'ai-collapsed'}`}>
    {sidebarOpen && <Sidebar />}
    <section className="workspace-area"><Topbar />{
      activeView === 'note' ? <CanvasWorkspace />
        : activeView === 'calendar' ? <CalendarView />
            : activeView === 'gym' ? <GymView />
              : activeView === 'context' ? <ContextView />
                : <SettingsView />
    }</section>
    {aiOpen && <AIPanel />}
    <button className={`ai-panel-toggle ${aiOpen ? 'open' : ''}`} onClick={() => setAiOpen(!aiOpen)} aria-label={aiOpen ? 'Close AI panel' : 'Open AI panel'}>{aiOpen ? <X size={17} /> : <Sparkles size={17} />}</button>
    <PWAStatus />
  </div>;
}
