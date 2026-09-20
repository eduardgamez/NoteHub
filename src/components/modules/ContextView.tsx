import { useState } from 'react';
import { Brain, Folder, Plus, Trash2 } from 'lucide-react';
import { useWorkspace } from '../../store/useWorkspace';

export function ContextView() {
  const activeNote = useWorkspace((state) => state.notes[state.activeNoteId]);
  const project = useWorkspace((state) => state.projects.find((item) => item.id === activeNote.projectId)!);
  const folders = useWorkspace((state) => state.folders.filter((item) => item.projectId === project.id));
  const setContextItem = useWorkspace((state) => state.setContextItem);
  const removeContextItem = useWorkspace((state) => state.removeContextItem);
  const setFolderContextItem = useWorkspace((state) => state.setFolderContextItem);
  const removeFolderContextItem = useWorkspace((state) => state.removeFolderContextItem);
  const [scope, setScope] = useState(project.id);
  const [draft, setDraft] = useState({ label: '', value: '' });
  const folder = folders.find((item) => item.id === scope);
  const items = folder?.context ?? project.context;

  function add(event: React.FormEvent) {
    event.preventDefault(); if (!draft.label.trim() || !draft.value.trim()) return;
    const item = { id: crypto.randomUUID(), label: draft.label.trim(), value: draft.value.trim() };
    if (folder) setFolderContextItem(folder.id, item); else setContextItem(project.id, item);
    setDraft({ label: '', value: '' });
  }

  return <div className="module-view context-view">
    <div className="module-header"><div><p className="eyebrow">CONTEXTUAL MEMORY</p><h1>{project.emoji} {project.title}</h1><p>Structured facts live outside your notes and are available to AI when relevant.</p></div></div>
    <div className="context-layout">
      <aside className="context-scopes"><button className={scope === project.id ? 'active' : ''} onClick={() => setScope(project.id)}><Brain size={16} /><span><strong>Project memory</strong><small>{project.context.length} facts</small></span></button>
        {folders.map((item) => <button className={scope === item.id ? 'active' : ''} onClick={() => setScope(item.id)} key={item.id}><Folder size={16} /><span><strong>{item.title}</strong><small>{item.context.length} facts</small></span></button>)}
      </aside>
      <section className="context-editor"><div className="panel-heading"><Brain size={18} /><div><strong>{folder?.title ?? project.title} memory</strong><small>Keep facts short and specific so search and AI retrieval stay precise.</small></div></div>
        <div className="context-fields">{items.map((item) => <div className="context-field" key={item.id}><input value={item.label} aria-label="Context label" onChange={(event) => folder ? setFolderContextItem(folder.id, { ...item, label: event.target.value }) : setContextItem(project.id, { ...item, label: event.target.value })} /><input value={item.value} aria-label="Context value" onChange={(event) => folder ? setFolderContextItem(folder.id, { ...item, value: event.target.value }) : setContextItem(project.id, { ...item, value: event.target.value })} /><button onClick={() => folder ? removeFolderContextItem(folder.id, item.id) : removeContextItem(project.id, item.id)}><Trash2 size={15} /></button></div>)}</div>
        <form className="context-add" onSubmit={add}><input placeholder="Field, e.g. Next exam" value={draft.label} onChange={(event) => setDraft({ ...draft, label: event.target.value })} /><input placeholder="Value" value={draft.value} onChange={(event) => setDraft({ ...draft, value: event.target.value })} /><button className="primary-button"><Plus size={15} /> Add fact</button></form>
        <div className="permission-note"><Brain size={16} /><div><strong>AI write protection</strong><p>Assistants can read these facts. Any edit proposed by AI appears as a diff and requires your approval.</p></div></div>
      </section>
    </div>
  </div>;
}
