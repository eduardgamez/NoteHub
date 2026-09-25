import { Sparkles } from 'lucide-react';
import { useWorkspace } from '../store/useWorkspace';
import { AIChat } from './AIChat';

export function AIPanel() {
  const activeView = useWorkspace((state) => state.activeView);
  const selectedCount = useWorkspace((state) => state.selectedIds.length);
  const globalScope = !['note', 'project', 'context'].includes(activeView);
  return <aside className="ai-panel"><div className="ai-context-header"><Sparkles size={14} /><span>Context: {globalScope ? 'workspace' : selectedCount > 0 ? `${selectedCount} selected block${selectedCount === 1 ? '' : 's'}` : 'current note'}</span></div><AIChat global={globalScope} compact /></aside>;
}
