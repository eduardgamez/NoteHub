import { Menu } from 'lucide-react';
import { useWorkspace } from '../store/useWorkspace';

export function Topbar() {
  const sidebarOpen = useWorkspace((state) => state.sidebarOpen);
  const setSidebarOpen = useWorkspace((state) => state.setSidebarOpen);

  return <button className="mobile-menu" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Toggle sidebar"><Menu size={18} /></button>;
}
