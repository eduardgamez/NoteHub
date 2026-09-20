import { Sparkles, X } from 'lucide-react';
import { useWorkspace } from '../store/useWorkspace';
import { AIChat } from './AIChat';

export function AIPanel() {
  const setAiOpen = useWorkspace((state) => state.setAiOpen);
  const activeView = useWorkspace((state) => state.activeView);
  const globalScope = !['note', 'context'].includes(activeView);
  const label = globalScope ? `Workspace · ${activeView}` : 'Current project';
  return <aside className="ai-panel"><div className="ai-header"><div><div className="ai-title"><Sparkles size={17} /> NoteHub AI <span>Beta</span></div><span className="context-picker">{label}</span></div><button onClick={() => setAiOpen(false)} aria-label="Close AI panel"><X size={18} /></button></div><AIChat global={globalScope} compact /></aside>;
}
