import { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, Check, ChevronLeft, ChevronRight, Clock3, Plus, Trash2, X } from 'lucide-react';
import { useWorkspace } from '../../store/useWorkspace';
import type { CalendarEvent, Task } from '../../types';

type CalendarMode = 'day' | 'week' | 'month';
const hours = Array.from({ length: 14 }, (_, index) => index + 8);
const dayName = new Intl.DateTimeFormat('en', { weekday: 'short' });

function monday(date: Date) {
  const result = new Date(date); result.setHours(0, 0, 0, 0);
  result.setDate(result.getDate() - ((result.getDay() + 6) % 7));
  return result;
}

function sameDay(a: Date, b: Date) { return a.toDateString() === b.toDateString(); }
function localInputValue(date: Date) { return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }

export function CalendarView() {
  const events = useWorkspace((state) => state.calendarEvents);
  const tasks = useWorkspace((state) => state.tasks);
  const templates = useWorkspace((state) => state.reminderTemplates);
  const addEvent = useWorkspace((state) => state.addEvent);
  const addTask = useWorkspace((state) => state.addTask);
  const removeEvent = useWorkspace((state) => state.removeEvent);
  const removeTask = useWorkspace((state) => state.removeTask);
  const updateTask = useWorkspace((state) => state.updateTask);
  const toggleTask = useWorkspace((state) => state.toggleTask);
  const toggleTaskItem = useWorkspace((state) => state.toggleTaskItem);
  const [mode, setMode] = useState<CalendarMode>('week');
  const [cursor, setCursor] = useState(new Date());
  const [creating, setCreating] = useState(false);
  const [creationKind, setCreationKind] = useState<'event' | 'reminder'>('event');
  const [templateId, setTemplateId] = useState('');
  const [selectedTask, setSelectedTask] = useState<{ id: string; x: number; y: number; above: boolean; maxHeight: number } | null>(null);
  const [hoveredReminder, setHoveredReminder] = useState<{ title: string; x: number; y: number; side: 'left' | 'right' } | null>(null);
  const taskPopoverRef = useRef<HTMLFormElement>(null);
  const [reminderDraft, setReminderDraft] = useState({ title: '', due: '' });
  const [newChecklistItem, setNewChecklistItem] = useState('');
  const [draft, setDraft] = useState(() => { const initialStart = new Date(); const initialEnd = new Date(initialStart.getTime() + 3600000); return { title: '', start: localInputValue(initialStart), end: localInputValue(initialEnd) }; });
  const start = monday(cursor);
  const days = useMemo(() => Array.from({ length: mode === 'day' ? 1 : 7 }, (_, index) => { const day = new Date(mode === 'day' ? cursor : start); day.setDate(day.getDate() + index); return day; }), [cursor, mode, start]);
  const datedTasks = tasks.filter((task) => task.due && !Number.isNaN(new Date(task.due).getTime()));
  const activeTask = tasks.find((task) => task.id === selectedTask?.id);

  useEffect(() => {
    if (!selectedTask) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setSelectedTask(null); };
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !taskPopoverRef.current?.contains(event.target)) setSelectedTask(null);
    };
    window.addEventListener('keydown', close);
    document.addEventListener('pointerdown', closeOutside, true);
    return () => { window.removeEventListener('keydown', close); document.removeEventListener('pointerdown', closeOutside, true); };
  }, [selectedTask]);

  function openTask(task: Task, element: HTMLElement) {
    const rect = element.getBoundingClientRect();
    const spaceAbove = Math.max(0, rect.top - 20);
    const spaceBelow = Math.max(0, window.innerHeight - rect.bottom - 20);
    const above = spaceBelow < 420 && spaceAbove > spaceBelow;
    setReminderDraft({ title: task.title, due: task.due && !Number.isNaN(new Date(task.due).getTime()) ? localInputValue(new Date(task.due)) : '' });
    setNewChecklistItem('');
    setSelectedTask({ id: task.id, x: Math.max(12, Math.min(rect.left, window.innerWidth - 312)), y: above ? rect.top - 8 : rect.bottom + 8, above, maxHeight: Math.min(420, above ? spaceAbove : spaceBelow) });
  }

  function showReminderTooltip(task: Task, element: HTMLElement) {
    const rect = element.getBoundingClientRect();
    const side = rect.right + 228 < window.innerWidth ? 'right' : 'left';
    setHoveredReminder({ title: task.title, x: side === 'right' ? rect.right + 8 : rect.left - 8, y: Math.max(20, Math.min(rect.top + rect.height / 2, window.innerHeight - 20)), side });
  }

  function saveReminder(event: React.FormEvent) {
    event.preventDefault();
    if (!activeTask || !reminderDraft.title.trim()) return;
    updateTask({ ...activeTask, title: reminderDraft.title.trim(), due: reminderDraft.due ? new Date(reminderDraft.due).toISOString() : undefined });
    setSelectedTask(null);
  }

  function addChecklistItem() {
    if (!activeTask || !newChecklistItem.trim()) return;
    updateTask({ ...activeTask, checklist: [...activeTask.checklist, { id: crypto.randomUUID(), text: newChecklistItem.trim(), done: false }] });
    setNewChecklistItem('');
  }

  function move(direction: number) {
    setCursor((current) => { const next = new Date(current); next.setDate(next.getDate() + direction * (mode === 'day' ? 1 : mode === 'week' ? 7 : 30)); return next; });
  }

  function createItem(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.title.trim() || !draft.start) return;
    if (creationKind === 'event') {
      if (!draft.end || new Date(draft.end) <= new Date(draft.start)) return;
      addEvent({ id: crypto.randomUUID(), title: draft.title.trim(), start: new Date(draft.start).toISOString(), end: new Date(draft.end).toISOString(), color: 'green' });
    } else {
      const template = templates.find((item) => item.id === templateId);
      addTask({ id: crypto.randomUUID(), title: draft.title.trim(), done: false, reminder: true, due: new Date(draft.start).toISOString(), checklist: template?.items.map((text) => ({ id: crypto.randomUUID(), text, done: false })) ?? [] });
    }
    setCreating(false); setTemplateId(''); setDraft({ ...draft, title: '' });
  }

  return <div className="module-view calendar-view">
    <div className="module-header">
      <div><h1>Calendar</h1></div>
      <div className="module-actions">
        <div className="segmented">{(['day', 'week', 'month'] as CalendarMode[]).map((item) => <button key={item} className={mode === item ? 'active' : ''} onClick={() => setMode(item)}>{item}</button>)}</div>
        <button className="icon-button" onClick={() => move(-1)}><ChevronLeft size={16} /></button><button className="icon-button" onClick={() => move(1)}><ChevronRight size={16} /></button>
        <button className="icon-button calendar-create" aria-label="Create" title="Create event or reminder" onClick={() => setCreating(true)}><Plus size={17} /></button>
      </div>
    </div>

    {mode === 'month' ? <MonthGrid cursor={cursor} events={events} reminders={datedTasks} onOpenReminder={openTask} onHoverReminder={showReminderTooltip} onLeaveReminder={() => setHoveredReminder(null)} /> : <div className={`week-calendar ${mode}`}>
      <div className="calendar-corner" />
      {days.map((day) => <div key={day.toISOString()} className={`day-heading ${sameDay(day, new Date()) ? 'today' : ''}`}><span>{dayName.format(day)}</span><strong>{day.getDate()}</strong></div>)}
      <div className="calendar-prehour" aria-hidden="true" />
      {days.map((day) => <div className="calendar-prehour calendar-prehour-day" aria-hidden="true" key={`pre-${day.toISOString()}`} />)}
      <div className="time-column">{hours.map((hour) => <span key={hour}>{String(hour).padStart(2, '0')}:00</span>)}</div>
      {days.map((day) => <div className="day-column" key={day.toISOString()}>{hours.map((hour) => <div className="hour-line" key={hour} />)}
        {events.filter((event) => sameDay(new Date(event.start), day)).map((event) => {
          const eventStart = new Date(event.start), eventEnd = new Date(event.end);
          const top = `clamp(2px, ${((eventStart.getHours() + eventStart.getMinutes() / 60) - 8) / hours.length * 100}%, calc(100% - 22px))`;
          const height = `max(22px, ${(eventEnd.getTime() - eventStart.getTime()) / 3600000 / hours.length * 100}%)`;
          return <button key={event.id} className={`calendar-event ${event.color}`} style={{ top, height }} onDoubleClick={() => removeEvent(event.id)} title="Double-click to delete"><strong>{event.title}</strong><span><Clock3 size={10} /> {eventStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></button>;
        })}
        {datedTasks.filter((task) => sameDay(new Date(task.due!), day)).map((task, index) => {
          const date = new Date(task.due!);
          const top = `clamp(2px, calc(${((date.getHours() - 8 + 0.5) / hours.length) * 100}% - 9.5px + ${index * 22}px), calc(100% - 20px))`;
          return <button key={task.id} className={`calendar-reminder ${task.done ? 'done' : ''}`} style={{ top }} onMouseEnter={(event) => showReminderTooltip(task, event.currentTarget)} onMouseLeave={() => setHoveredReminder(null)} onFocus={(event) => showReminderTooltip(task, event.currentTarget)} onBlur={() => setHoveredReminder(null)} onClick={(event) => { setHoveredReminder(null); openTask(task, event.currentTarget); }} aria-label={`Reminder: ${task.title}`}><Bell size={13} fill="currentColor" /></button>;
        })}
      </div>)}
    </div>}

    {hoveredReminder && <div className="reminder-tooltip" role="tooltip" style={{ left: hoveredReminder.x, top: hoveredReminder.y, transform: `translate(${hoveredReminder.side === 'right' ? '0' : '-100%'}, -50%)` }}>{hoveredReminder.title}</div>}

    {selectedTask && activeTask && <form ref={taskPopoverRef} className="reminder-popover" role="dialog" aria-label="Manage reminder" style={{ left: selectedTask.x, top: selectedTask.y, maxHeight: selectedTask.maxHeight, transform: selectedTask.above ? 'translateY(-100%)' : undefined }} onSubmit={saveReminder}>
      <div className="reminder-popover-heading"><span><Bell size={14} /> {activeTask.reminder ? 'Reminder' : 'Task'}</span><button type="button" aria-label="Close reminder" onClick={() => setSelectedTask(null)}><X size={15} /></button></div>
      <label>Title<input value={reminderDraft.title} onChange={(event) => setReminderDraft({ ...reminderDraft, title: event.target.value })} required /></label>
      <label>When<input type="datetime-local" value={reminderDraft.due} onChange={(event) => setReminderDraft({ ...reminderDraft, due: event.target.value })} /></label>
      <div className="reminder-checklist">{activeTask.checklist.map((item) => <div className="reminder-checklist-row" key={item.id}><button type="button" className={item.done ? 'done' : ''} onClick={() => toggleTaskItem(activeTask.id, item.id)}><span>{item.done && <Check size={11} />}</span>{item.text}</button><button type="button" className="checklist-remove" aria-label={`Remove ${item.text}`} onClick={() => updateTask({ ...activeTask, checklist: activeTask.checklist.filter((entry) => entry.id !== item.id) })}><X size={12} /></button></div>)}<div className="reminder-checklist-add"><input aria-label="New checklist item" value={newChecklistItem} onChange={(event) => setNewChecklistItem(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addChecklistItem(); } }} placeholder="Add checklist item" /><button type="button" onClick={addChecklistItem} aria-label="Add checklist item"><Plus size={14} /></button></div></div>
      <div className="reminder-popover-actions"><button type="button" onClick={() => toggleTask(activeTask.id)}>{activeTask.done ? 'Mark as open' : 'Mark done'}</button><button type="button" className="reminder-delete" aria-label="Delete reminder" onClick={() => { removeTask(activeTask.id); setSelectedTask(null); }}><Trash2 size={13} /></button><button type="submit">Save</button></div>
    </form>}

    {creating && <div className="modal-backdrop" onMouseDown={() => setCreating(false)}><form className="editor-modal" role="dialog" aria-label="Create calendar item" onSubmit={createItem} onMouseDown={(event) => event.stopPropagation()}>
      <div className="modal-header"><div><p className="eyebrow">CALENDAR</p><h2>Create</h2></div><button type="button" className="icon-button" onClick={() => setCreating(false)}><X size={17} /></button></div>
      <div className="segmented create-kind"><button type="button" className={creationKind === 'event' ? 'active' : ''} onClick={() => setCreationKind('event')}>Event</button><button type="button" className={creationKind === 'reminder' ? 'active' : ''} onClick={() => setCreationKind('reminder')}>Reminder</button></div>
      <label>Title<input autoFocus value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="What are you planning?" /></label>
      <label>{creationKind === 'event' ? 'Starts' : 'When'}<input type="datetime-local" value={draft.start} onChange={(event) => setDraft({ ...draft, start: event.target.value })} required /></label>
      {creationKind === 'event' ? <label>Ends<input type="datetime-local" value={draft.end} min={draft.start} onChange={(event) => setDraft({ ...draft, end: event.target.value })} required /></label> : <label>Checklist template<select value={templateId} onChange={(event) => { const next = event.target.value; setTemplateId(next); const template = templates.find((item) => item.id === next); if (template) setDraft({ ...draft, title: template.title }); }}><option value="">None</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.title}</option>)}</select></label>}
      <button className="primary-button" type="submit">Create {creationKind}</button>
    </form></div>}
  </div>;
}

function MonthGrid({ cursor, events, reminders, onOpenReminder, onHoverReminder, onLeaveReminder }: { cursor: Date; events: CalendarEvent[]; reminders: Task[]; onOpenReminder: (task: Task, element: HTMLElement) => void; onHoverReminder: (task: Task, element: HTMLElement) => void; onLeaveReminder: () => void }) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const gridStart = monday(first);
  const days = Array.from({ length: 42 }, (_, index) => { const day = new Date(gridStart); day.setDate(day.getDate() + index); return day; });
  return <div className="month-calendar">
    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => <div className="month-weekday" key={day}>{day}</div>)}
    {days.map((day) => <div className={`month-day ${day.getMonth() !== cursor.getMonth() ? 'outside' : ''} ${sameDay(day, new Date()) ? 'today' : ''}`} key={day.toISOString()}><strong>{day.getDate()}</strong>
      {events.filter((event) => sameDay(new Date(event.start), day)).slice(0, 3).map((event) => <span className={`month-event ${event.color}`} key={event.id}>{event.title}</span>)}
      {reminders.filter((task) => sameDay(new Date(task.due!), day)).map((task) => <button className={`month-reminder ${task.done ? 'done' : ''}`} key={task.id} onMouseEnter={(event) => onHoverReminder(task, event.currentTarget)} onMouseLeave={onLeaveReminder} onFocus={(event) => onHoverReminder(task, event.currentTarget)} onBlur={onLeaveReminder} onClick={(event) => { onLeaveReminder(); onOpenReminder(task, event.currentTarget); }} aria-label={`Reminder: ${task.title}`}><Bell size={12} fill="currentColor" /></button>)}
    </div>)}
  </div>;
}
