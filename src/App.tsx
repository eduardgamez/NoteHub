import { useEffect } from 'react';
import { AIPanel } from './components/AIPanel';
import { CanvasWorkspace } from './components/CanvasWorkspace';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { useWorkspace } from './store/useWorkspace';
import { syncEngine } from './sync/syncEngine';

export function App() {
  const hydrate = useWorkspace((state) => state.hydrate);
  const hydrated = useWorkspace((state) => state.hydrated);
  const applyRemote = useWorkspace((state) => state.applyRemote);
  const aiOpen = useWorkspace((state) => state.aiOpen);
  const sidebarOpen = useWorkspace((state) => state.sidebarOpen);

  useEffect(() => { void hydrate(); }, [hydrate]);
  useEffect(() => syncEngine.subscribe(applyRemote), [applyRemote]);

  if (!hydrated) return <div className="loading-screen"><div className="brand-mark">N</div><span>Opening your workspace…</span></div>;

  return <div className={`app-shell ${sidebarOpen ? '' : 'sidebar-collapsed'} ${aiOpen ? '' : 'ai-collapsed'}`}>
    {sidebarOpen && <Sidebar />}
    <section className="workspace-area"><Topbar /><CanvasWorkspace /></section>
    {aiOpen && <AIPanel />}
  </div>;
}
