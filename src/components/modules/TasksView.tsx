import { useMemo, useState } from 'react';
import { Bell, Check, CheckCircle2, Circle, ListChecks, Plus } from 'lucide-react';
import { useWorkspace } from '../../store/useWorkspace';

export function TasksView() {
  const tasks = useWorkspace((state) => state.tasks);
  const templates = useWorkspace((state) => state.reminderTemplates);
  const addTask = useWorkspace((state) => state.addTask);
  const toggleTask = useWorkspace((state) => state.toggleTask);
  const toggleTaskItem = useWorkspace((state) => state.toggleTaskItem);
  const [filter, setFilter] = useState<'open' | 'all' | 'done'>('open');
  const [title, setTitle] = useState('');
  const visible = useMemo(() => tasks.filter((task) => filter === 'all' || (filter === 'done' ? task.done : !task.done)), [tasks, filter]);

  function createTask(event: React.FormEvent) {
    event.preventDefault(); if (!title.trim()) return;
    addTask({ id: crypto.randomUUID(), title: title.trim(), done: false, checklist: [] }); setTitle('');
  }

  function applyTemplate(templateId: string) {
    const template = templates.find((item) => item.id === templateId); if (!template) return;
    addTask({ id: crypto.randomUUID(), title: template.title, done: false, reminder: true, checklist: template.items.map((text) => ({ id: crypto.randomUUID(), text, done: false })) });
  }

  return <div className="module-view tasks-view">
    <div className="module-header"><div><p className="eyebrow">FOCUS</p><h1>Tasks & reminders</h1><p>{tasks.filter((task) => !task.done).length} things still need your attention.</p></div>
      <div className="segmented">{(['open', 'all', 'done'] as const).map((item) => <button className={filter === item ? 'active' : ''} onClick={() => setFilter(item)} key={item}>{item}</button>)}</div>
    </div>
    <div className="tasks-layout">
      <section className="task-list-panel">
        <form className="quick-add" onSubmit={createTask}><Plus size={17} /><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Add a task and press Enter…" /></form>
        <div className="task-list">{visible.map((task) => <article className={`task-card ${task.done ? 'completed' : ''}`} key={task.id}>
          <button className="task-toggle" onClick={() => toggleTask(task.id)}>{task.done ? <CheckCircle2 size={20} /> : <Circle size={20} />}</button>
          <div className="task-body"><div className="task-title"><strong>{task.title}</strong>{task.reminder && <span><Bell size={11} /> Reminder</span>}</div>
            {task.due && <small>{new Date(task.due).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</small>}
            {task.checklist.length > 0 && <div className="interactive-checklist">{task.checklist.map((item) => <label className={item.done ? 'done' : ''} key={item.id}><button onClick={() => toggleTaskItem(task.id, item.id)}>{item.done && <Check size={12} />}</button><span>{item.text}</span></label>)}</div>}
          </div>
        </article>)}</div>
      </section>
      <aside className="template-panel"><div className="panel-heading"><ListChecks size={17} /><div><strong>Reusable checklists</strong><small>Start recurring routines in one click.</small></div></div>
        {templates.map((template) => <button className="template-card" onClick={() => applyTemplate(template.id)} key={template.id}><span><strong>{template.title}</strong><small>{template.items.length} items</small></span><Plus size={16} /></button>)}
      </aside>
    </div>
  </div>;
}
