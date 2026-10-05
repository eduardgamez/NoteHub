import { Files } from 'lucide-react';
import { useWorkspace } from '../store/useWorkspace';

export function Topbar() {
  const sidebarOpen = useWorkspace((state) => state.sidebarOpen);
  const setSidebarOpen = useWorkspace((state) => state.setSidebarOpen);

  if (sidebarOpen) return null;
  return <button type="button" className="project-sidebar-toggle" onClick={() => setSidebarOpen(true)} aria-label="Open project explorer" title="Open project explorer"><Files size={20} /></button>;
}
