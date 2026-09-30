import { isAllDayReminder, reminderDate, reminderDone } from '../../lib/reminderTime';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, Check, ChevronLeft, ChevronRight, Clock3, Plus, Trash2, X } from 'lucide-react';
import { useWorkspace } from '../../store/useWorkspace';
import type { CalendarEvent, ChecklistEntry, Task } from '../../types';

type PopoverPosition = { id: string; x: number; y: number; above: boolean; maxHeight: number };

function popoverPosition(id: string, element: HTMLElement, width = 300): PopoverPosition {
  const rect = element.getBoundingClientRect();
  const spaceAbove = Math.max(0, rect.top - 20);
  const spaceBelow = Math.max(0, window.innerHeight - rect.bottom - 20);
  const above = spaceBelow < 420 && spaceAbove > spaceBelow;
  return { id, x: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)), y: above ? rect.top - 8 : rect.bottom + 8, above, maxHeight: Math.min(420, above ? spaceAbove : spaceBelow) };
}

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
  const updateEvent = useWorkspace((state) => state.updateEvent);
  const addEvent = useWorkspace((state) => state.addEvent);
  const addTask = useWorkspace((state) => state.addTask);
  const removeEvent = useWorkspace((state) => state.removeEvent);
  const removeTask = useWorkspace((state) => state.removeTask);
  const updateTask = useWorkspace((state) => state.updateTask);
  const [mode, setMode] = useState<CalendarMode>('week');
  const [cursor, setCursor] = useState(new Date());
  const [creating, setCreating] = useState(false);
  const [creationKind, setCreationKind] = useState<'event' | 'reminder'>('event');
  const [templateId, setTemplateId] = useState('');
  const [selectedTask, setSelectedTask] = useState<PopoverPosition | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<PopoverPosition | null>(null);
  const [eventDraft, setEventDraft] = useState({ title: '', start: '', end: '' });
  const [eventChecklistItem, setEventChecklistItem] = useState('');
  const [creationTasks, setCreationTasks] = useState('');
  const [hoveredReminder, setHoveredReminder] = useState<{ title: string; x: number; y: number; side: 'left' | 'right' } | null>(null);
  const taskPopoverRef = useRef<HTMLFormElement>(null);
  const [reminderDraft, setReminderDraft] = useState({ title: '', date: '', time: '09:00', allDay: false, checklist: [] as ChecklistEntry[] });
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const refresh = () => setNow(new Date());
    const timer = window.setInterval(refresh, 1000);
    window.addEventListener('focus', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, []);
  const [draft, setDraft] = useState(() => { const initialStart = new Date(); const initialEnd = new Date(initialStart.getTime() + 3600000); return { title: '', start: localInputValue(initialStart), end: localInputValue(initialEnd) }; });
  const start = monday(cursor);
  const days = useMemo(() => Array.from({ length: mode === 'day' ? 1 : 7 }, (_, index) => { const day = new Date(mode === 'day' ? cursor : start); day.setDate(day.getDate() + index); return day; }), [cursor, mode, start]);
  const datedTasks = tasks.filter((task) => task.due && !Number.isNaN(reminderDate(task.due).getTime()));
  const activeEvent = events.find((event) => event.id === selectedEvent?.id);
  const activeTask = tasks.find((task) => task.id === selectedTask?.id);

  useEffect(() => {
    if (!selectedTask && !selectedEvent) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') { setSelectedTask(null); setSelectedEvent(null); } };
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !taskPopoverRef.current?.contains(event.target)) { setSelectedTask(null); setSelectedEvent(null); }
    };
    window.addEventListener('keydown', close);
    document.addEventListener('pointerdown', closeOutside, true);
    return () => { window.removeEventListener('keydown', close); document.removeEventListener('pointerdown', closeOutside, true); };
  }, [selectedTask, selectedEvent]);

  function openTask(task: Task, element: HTMLElement) {
    setSelectedEvent(null);
    const due = task.due && !Number.isNaN(reminderDate(task.due).getTime()) ? localInputValue(reminderDate(task.due)) : '';
    setReminderDraft({ title: task.title, date: due.slice(0, 10), time: isAllDayReminder(task) ? '09:00' : due.slice(11, 16) || '09:00', allDay: isAllDayReminder(task), checklist: structuredClone(task.checklist) });
    setSelectedTask(popoverPosition(task.id, element, Math.min(360, window.innerWidth - 24)));
  }

  function openEvent(event: CalendarEvent, element: HTMLElement) {
    setSelectedTask(null); setHoveredReminder(null); setEventChecklistItem('');
    setEventDraft({ title: event.title, start: localInputValue(new Date(event.start)), end: localInputValue(new Date(event.end)) });
    setSelectedEvent(popoverPosition(event.id, element));
  }

  function saveEvent(event: React.FormEvent) {
    event.preventDefault();
    if (!activeEvent || !eventDraft.title.trim() || !eventDraft.start || !eventDraft.end || new Date(eventDraft.end) <= new Date(eventDraft.start)) return;
    updateEvent({ ...activeEvent, title: eventDraft.title.trim(), start: new Date(eventDraft.start).toISOString(), end: new Date(eventDraft.end).toISOString() });
    setSelectedEvent(null);
  }

  function addEventTask() {
    if (!activeEvent || !eventChecklistItem.trim()) return;
    updateEvent({ ...activeEvent, checklist: [...(activeEvent.checklist ?? []), { id: crypto.randomUUID(), text: eventChecklistItem.trim(), done: false }] });
    setEventChecklistItem('');
  }

  function showReminderTooltip(task: Task, element: HTMLElement) {
    const rect = element.getBoundingClientRect();
    const side = rect.right + 228 < window.innerWidth ? 'right' : 'left';
    setHoveredReminder({ title: task.title, x: side === 'right' ? rect.right + 8 : rect.left - 8, y: Math.max(20, Math.min(rect.top + rect.height / 2, window.innerHeight - 20)), side });
  }

  function saveReminder(event: React.FormEvent) {
    event.preventDefault();
    if (!activeTask || !reminderDraft.title.trim()) return;
    const due = reminderDraft.date ? reminderDraft.allDay ? reminderDraft.date : new Date(`${reminderDraft.date}T${reminderDraft.time || '09:00'}`).toISOString() : undefined;
    const updated = { ...activeTask, title: reminderDraft.title.trim(), due, checklist: reminderDraft.checklist.map((item) => ({ ...item, text: item.text.trim() })).filter((item) => item.text) };
    updateTask({ ...updated, done: reminderDone(updated) });
    setSelectedTask(null);
  }

  function addChecklistItem() {
    setReminderDraft((current) => ({ ...current, checklist: [...current.checklist, { id: crypto.randomUUID(), text: '', done: false }] }));
  }

  function editChecklistItem(id: string, changes: Partial<ChecklistEntry>) {
    setReminderDraft((current) => ({ ...current, checklist: current.checklist.map((item) => item.id === id ? { ...item, ...changes } : item) }));
  }

  function move(direction: number) {
    setCursor((current) => { const next = new Date(current); next.setDate(next.getDate() + direction * (mode === 'day' ? 1 : mode === 'week' ? 7 : 30)); return next; });
  }

  function createItem(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.title.trim() || !draft.start) return;
    if (creationKind === 'event') {
      if (!draft.end || new Date(draft.end) <= new Date(draft.start)) return;
      addEvent({ id: crypto.randomUUID(), title: draft.title.trim(), start: new Date(draft.start).toISOString(), end: new Date(draft.end).toISOString(), color: 'green', checklist: creationTasks.split('\n').map((text) => text.trim()).filter(Boolean).map((text) => ({ id: crypto.randomUUID(), text, done: false })) });
    } else {
      const template = templates.find((item) => item.id === templateId);
      addTask({ id: crypto.randomUUID(), title: draft.title.trim(), done: false, reminder: true, due: new Date(draft.start).toISOString(), checklist: template?.items.map((text) => ({ id: crypto.randomUUID(), text, done: false })) ?? [] });
    }
    setCreating(false); setCreationTasks(''); setTemplateId(''); setDraft({ ...draft, title: '' });
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

    {mode === 'month' ? <MonthGrid cursor={cursor} events={events} reminders={datedTasks} onOpenEvent={openEvent} onRemoveEvent={removeEvent} onOpenReminder={openTask} onHoverReminder={showReminderTooltip} onLeaveReminder={() => setHoveredReminder(null)} now={now} /> : <div className={`week-calendar ${mode}`}>
      <div className="calendar-corner" />
      {days.map((day) => <div key={day.toISOString()} className={`day-heading ${sameDay(day, new Date()) ? 'today' : ''}`}><span>{dayName.format(day)}</span><strong>{day.getDate()}</strong></div>)}
      <div className="calendar-prehour" aria-hidden="true" />
      {days.map((day) => <div className="calendar-prehour calendar-prehour-day" key={`pre-${day.toISOString()}`}>
        {datedTasks.filter((task) => isAllDayReminder(task) && sameDay(reminderDate(task.due!), day)).map((task) => <button key={task.id} type="button" className={`calendar-reminder calendar-all-day ${reminderDone(task, now) ? 'done' : ''}`} title={`${task.title} · Todo el día`} aria-label={`Reminder: ${task.title}`} onMouseEnter={(event) => showReminderTooltip(task, event.currentTarget)} onMouseLeave={() => setHoveredReminder(null)} onClick={(event) => openTask(task, event.currentTarget)}><Bell size={13} fill="currentColor" /></button>)}
      </div>)}
      <div className="time-column">{hours.map((hour) => <span key={hour}>{String(hour).padStart(2, '0')}:00</span>)}</div>
      {days.map((day) => <div className="day-column" key={day.toISOString()}>{hours.map((hour) => <div className="hour-line" key={hour} />)}
        {events.filter((event) => sameDay(new Date(event.start), day)).map((event) => {
          const eventStart = new Date(event.start), eventEnd = new Date(event.end);
          const top = `clamp(2px, ${((eventStart.getHours() + eventStart.getMinutes() / 60) - 8) / hours.length * 100}%, calc(100% - 22px))`;
          const height = `max(22px, ${(eventEnd.getTime() - eventStart.getTime()) / 3600000 / hours.length * 100}%)`;
          return <button key={event.id} className={`calendar-event ${event.color}`} style={{ top, height }} onClick={(click) => openEvent(event, click.currentTarget)} onDoubleClick={() => { removeEvent(event.id); setSelectedEvent(null); }} aria-label={`Event: ${event.title}`} title="Click to manage; double-click to delete"><strong>{event.title}</strong><EventProgress event={event} /><span><Clock3 size={10} /> {eventStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></button>;
        })}
        {datedTasks.filter((task) => !isAllDayReminder(task) && sameDay(reminderDate(task.due!), day)).map((task, index, dayTasks) => {
          const date = reminderDate(task.due!);
          const minute = date.getHours() * 60 + date.getMinutes();
          const lane = dayTasks.slice(0, index).filter((item) => { const due = new Date(item.due!); return due.getHours() * 60 + due.getMinutes() === minute; }).length;
          const top = `clamp(2px, calc(${((minute / 60 - 8) / hours.length) * 100}% - 9.5px), calc(100% - 20px))`;
          const left = `min(${5 + lane * 21}px, calc(100% - 20px))`;
          return <button key={task.id} className={`calendar-reminder ${reminderDone(task, now) ? 'done' : ''}`} style={{ top, left }} onMouseEnter={(event) => showReminderTooltip(task, event.currentTarget)} onMouseLeave={() => setHoveredReminder(null)} onFocus={(event) => showReminderTooltip(task, event.currentTarget)} onBlur={() => setHoveredReminder(null)} onClick={(event) => { setHoveredReminder(null); openTask(task, event.currentTarget); }} aria-label={`Reminder: ${task.title}`}><Bell size={13} fill="currentColor" /></button>;
        })}
      </div>)}
    </div>}

    {hoveredReminder && <div className="reminder-tooltip" role="tooltip" style={{ left: hoveredReminder.x, top: hoveredReminder.y, transform: `translate(${hoveredReminder.side === 'right' ? '0' : '-100%'}, -50%)` }}>{hoveredReminder.title}</div>}

    {selectedEvent && activeEvent && <form ref={taskPopoverRef} className="reminder-popover" role="dialog" aria-label="Manage event" style={{ left: selectedEvent.x, top: selectedEvent.y, maxHeight: selectedEvent.maxHeight, transform: selectedEvent.above ? 'translateY(-100%)' : undefined }} onSubmit={saveEvent}>
      <div className="reminder-popover-heading"><span><Clock3 size={14} /> Event</span><button type="button" aria-label="Close event" onClick={() => setSelectedEvent(null)}><X size={15} /></button></div>
      <label>Title<input value={eventDraft.title} onChange={(event) => setEventDraft({ ...eventDraft, title: event.target.value })} required /></label>
      <label>Starts<input type="datetime-local" value={eventDraft.start} onChange={(event) => setEventDraft({ ...eventDraft, start: event.target.value })} required /></label>
      <label>Ends<input type="datetime-local" min={eventDraft.start} value={eventDraft.end} onChange={(event) => setEventDraft({ ...eventDraft, end: event.target.value })} required /></label>
      <div className="reminder-checklist">{(activeEvent.checklist ?? []).map((item) => <div className="reminder-checklist-row" key={item.id}><button type="button" className={`reminder-check-button ${item.done ? 'done' : ''}`} role="checkbox" aria-checked={item.done} aria-label={item.text} onClick={() => updateEvent({ ...activeEvent, checklist: activeEvent.checklist!.map((entry) => entry.id === item.id ? { ...entry, done: !entry.done } : entry) })}>{item.done && <Check size={11} />}</button><span className={`reminder-check-text ${item.done ? 'done' : ''}`}>{item.text}</span><button type="button" className="checklist-remove" aria-label={`Remove ${item.text}`} onClick={() => updateEvent({ ...activeEvent, checklist: activeEvent.checklist!.filter((entry) => entry.id !== item.id) })}><X size={12} /></button></div>)}<div className="reminder-checklist-add"><input aria-label="New event task" value={eventChecklistItem} onChange={(event) => setEventChecklistItem(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addEventTask(); } }} placeholder="Add task" /><button type="button" onClick={addEventTask} aria-label="Add event task"><Plus size={14} /></button></div></div>
      <div className="reminder-popover-actions"><button type="button" className="reminder-delete" aria-label="Delete event" onClick={() => { removeEvent(activeEvent.id); setSelectedEvent(null); }}><Trash2 size={13} /></button><button type="submit">Save</button></div>
    </form>}

    {selectedTask && activeTask && <form ref={taskPopoverRef} className="reminder-popover reminder-editor" role="dialog" aria-label="Manage reminder" style={{ left: selectedTask.x, top: selectedTask.y, maxHeight: selectedTask.maxHeight, transform: selectedTask.above ? 'translateY(-100%)' : undefined }} onSubmit={saveReminder}>
      <div className="reminder-title-line"><strong>{activeTask.reminder ? 'Recordatorio' : 'Tarea'} ·</strong><textarea aria-label="Título del recordatorio" value={reminderDraft.title} onChange={(event) => setReminderDraft({ ...reminderDraft, title: event.target.value })} rows={1} ref={(element) => { if (element) { element.style.height = 'auto'; element.style.height = `${element.scrollHeight}px`; } }} required /><button type="button" className="reminder-close" aria-label="Close reminder" onClick={() => setSelectedTask(null)}><X size={14} /></button></div>
      <div className="reminder-moment"><span>Momento</span><input aria-label="Día del recordatorio" type="date" value={reminderDraft.date} onChange={(event) => setReminderDraft({ ...reminderDraft, date: event.target.value })} /><div className={`reminder-time-field ${reminderDraft.allDay ? 'without-time' : ''}`}><input aria-label="Hora del recordatorio" className={reminderDraft.allDay ? 'without-time' : ''} type={reminderDraft.allDay ? 'text' : 'time'} value={reminderDraft.time} disabled={reminderDraft.allDay} onChange={(event) => setReminderDraft({ ...reminderDraft, time: event.target.value })} /></div><button type="button" className={`reminder-time-toggle ${reminderDraft.allDay ? 'off' : ''}`} aria-label={reminderDraft.allDay ? 'Activar hora' : 'Quitar hora'} aria-pressed={reminderDraft.allDay} title={reminderDraft.allDay ? 'Recordatorio de todo el día. Activar hora' : 'Convertir en recordatorio de todo el día'} onClick={() => setReminderDraft({ ...reminderDraft, allDay: !reminderDraft.allDay })}><X size={15} /></button></div>
      <div className="reminder-editor-list">{reminderDraft.checklist.map((item) => <div className="reminder-editor-task" key={item.id}><button type="button" className={`reminder-task-check ${item.done ? 'done' : ''}`} role="checkbox" aria-checked={item.done} aria-label={item.text || 'Tarea sin título'} onClick={() => editChecklistItem(item.id, { done: !item.done })}>{item.done && <Check size={13} />}</button><input aria-label={`Título de tarea ${item.id}`} value={item.text} placeholder="Tarea" className={item.done ? 'done' : ''} autoFocus={!item.text} onChange={(event) => editChecklistItem(item.id, { text: event.target.value })} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addChecklistItem(); } }} /><button type="button" className="reminder-task-remove" aria-label={`Eliminar tarea ${item.text || 'sin título'}`} onClick={() => setReminderDraft({ ...reminderDraft, checklist: reminderDraft.checklist.filter((entry) => entry.id !== item.id) })}><X size={14} /></button></div>)}<button type="button" className="reminder-add-task" onClick={addChecklistItem}><Plus size={14} />Añadir tarea</button></div>
      <div className="reminder-editor-footer"><span className="reminder-auto-status">{reminderDone(activeTask, now) ? 'Done' : ''}</span><button type="button" className="reminder-delete" aria-label="Delete reminder" onClick={() => { removeTask(activeTask.id); setSelectedTask(null); }}><Trash2 size={16} /></button><button type="submit" className="reminder-save">Save</button></div>
    </form>}

    {creating && <div className="modal-backdrop" onMouseDown={() => setCreating(false)}><form className="editor-modal" role="dialog" aria-label="Create calendar item" onSubmit={createItem} onMouseDown={(event) => event.stopPropagation()}>
      <div className="modal-header"><div><p className="eyebrow">CALENDAR</p><h2>Create</h2></div><button type="button" className="icon-button" onClick={() => setCreating(false)}><X size={17} /></button></div>
      <div className="segmented create-kind"><button type="button" className={creationKind === 'event' ? 'active' : ''} onClick={() => setCreationKind('event')}>Event</button><button type="button" className={creationKind === 'reminder' ? 'active' : ''} onClick={() => setCreationKind('reminder')}>Reminder</button></div>
      <label>Title<input autoFocus value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="What are you planning?" /></label>
      <label>{creationKind === 'event' ? 'Starts' : 'When'}<input type="datetime-local" value={draft.start} onChange={(event) => setDraft({ ...draft, start: event.target.value })} required /></label>
      {creationKind === 'event' ? <label>Ends<input type="datetime-local" value={draft.end} min={draft.start} onChange={(event) => setDraft({ ...draft, end: event.target.value })} required /></label> : <label>Checklist template<select value={templateId} onChange={(event) => { const next = event.target.value; setTemplateId(next); const template = templates.find((item) => item.id === next); if (template) setDraft({ ...draft, title: template.title }); }}><option value="">None</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.title}</option>)}</select></label>}
      {creationKind === 'event' && <label>Tasks (one per line)<textarea value={creationTasks} onChange={(event) => setCreationTasks(event.target.value)} placeholder="Optional tasks" rows={3} /></label>}
      <button className="primary-button" type="submit">Create {creationKind}</button>
    </form></div>}
  </div>;
}

function MonthGrid({ cursor, events, reminders, onOpenEvent, onRemoveEvent, onOpenReminder, onHoverReminder, onLeaveReminder, now }: { now: Date; cursor: Date; events: CalendarEvent[]; reminders: Task[]; onOpenEvent: (event: CalendarEvent, element: HTMLElement) => void; onRemoveEvent: (id: string) => void; onOpenReminder: (task: Task, element: HTMLElement) => void; onHoverReminder: (task: Task, element: HTMLElement) => void; onLeaveReminder: () => void }) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const gridStart = monday(first);
  const days = Array.from({ length: 42 }, (_, index) => { const day = new Date(gridStart); day.setDate(day.getDate() + index); return day; });
  return <div className="month-calendar">
    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => <div className="month-weekday" key={day}>{day}</div>)}
    {days.map((day) => <div className={`month-day ${day.getMonth() !== cursor.getMonth() ? 'outside' : ''} ${sameDay(day, new Date()) ? 'today' : ''}`} key={day.toISOString()}><strong>{day.getDate()}</strong>
      {events.filter((event) => sameDay(new Date(event.start), day)).slice(0, 3).map((event) => <button type="button" className={`month-event ${event.color}`} key={event.id} aria-label={`Event: ${event.title}`} onClick={(click) => onOpenEvent(event, click.currentTarget)} onDoubleClick={() => onRemoveEvent(event.id)}>{event.title}<EventProgress event={event} /></button>)}
      {reminders.filter((task) => sameDay(reminderDate(task.due!), day)).map((task) => <button className={`month-reminder ${reminderDone(task, now) ? 'done' : ''}`} key={task.id} onMouseEnter={(event) => onHoverReminder(task, event.currentTarget)} onMouseLeave={onLeaveReminder} onFocus={(event) => onHoverReminder(task, event.currentTarget)} onBlur={onLeaveReminder} onClick={(event) => { onLeaveReminder(); onOpenReminder(task, event.currentTarget); }} aria-label={`Reminder: ${task.title}`}><Bell size={12} fill="currentColor" /></button>)}
    </div>)}
  </div>;
}

function EventProgress({ event }: { event: CalendarEvent }) {
  const checklist: ChecklistEntry[] = event.checklist ?? [];
  return checklist.length ? <span className="event-checklist-progress"><Check size={10} /> {checklist.filter((item) => item.done).length}/{checklist.length}</span> : null;
}
