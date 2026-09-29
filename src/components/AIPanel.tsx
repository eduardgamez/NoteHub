import { useWorkspace } from '../store/useWorkspace';
import { AIChat } from './AIChat';

export function AIPanel() {
  const activeView = useWorkspace((state) => state.activeView);
  const globalScope = !['note', 'project', 'context'].includes(activeView);
  return <aside className="ai-panel"><AIChat global={globalScope} compact /></aside>;
}
