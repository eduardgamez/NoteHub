import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Clock3, Plus, X } from 'lucide-react';
import { useWorkspace } from '../../store/useWorkspace';
import type { CalendarEvent } from '../../types';

type CalendarMode = 'day' | 'week' | 'month';
const hours = Array.from({ length: 14 }, (_, index) => index + 8);
const dayName = new Intl.DateTimeFormat('en', { weekday: 'short' });
const monthName = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' });

function monday(date: Date) {
  const result = new Date(date); result.setHours(0, 0, 0, 0);
  result.setDate(result.getDate() - ((result.getDay() + 6) % 7));
  return result;
}

function sameDay(a: Date, b: Date) { return a.toDateString() === b.toDateString(); }
function localInputValue(date: Date) { return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }

export function CalendarView() {
  const events = useWorkspace((state) => state.calendarEvents);
  const addEvent = useWorkspace((state) => state.addEvent);
  const removeEvent = useWorkspace((state) => state.removeEvent);
  const [mode, setMode] = useState<CalendarMode>('week');
  const [cursor, setCursor] = useState(new Date());
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => { const initialStart = new Date(); const initialEnd = new Date(initialStart.getTime() + 3600000); return { title: '', start: localInputValue(initialStart), end: localInputValue(initialEnd) }; });
  const start = monday(cursor);
  const days = useMemo(() => Array.from({ length: mode === 'day' ? 1 : 7 }, (_, index) => { const day = new Date(mode === 'day' ? cursor : start); day.setDate(day.getDate() + index); return day; }), [cursor, mode, start]);

  function move(direction: number) {
    setCursor((current) => { const next = new Date(current); next.setDate(next.getDate() + direction * (mode === 'day' ? 1 : mode === 'week' ? 7 : 30)); return next; });
  }

  function createEvent(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.title || !draft.start || !draft.end) return;
    addEvent({ id: crypto.randomUUID(), title: draft.title, start: new Date(draft.start).toISOString(), end: new Date(draft.end).toISOString(), color: 'green' });
    setEditing(false); setDraft({ ...draft, title: '' });
  }

  return <div className="module-view calendar-view">
    <div className="module-header">
      <div><p className="eyebrow">YOUR TIME</p><h1>{mode === 'month' ? monthName.format(cursor) : `Week of ${start.toLocaleDateString('en', { month: 'long', day: 'numeric' })}`}</h1></div>
      <div className="module-actions">
        <div className="segmented">{(['day', 'week', 'month'] as CalendarMode[]).map((item) => <button key={item} className={mode === item ? 'active' : ''} onClick={() => setMode(item)}>{item}</button>)}</div>
        <button className="secondary-button" onClick={() => setCursor(new Date())}>Today</button>
        <button className="icon-button" onClick={() => move(-1)}><ChevronLeft size={16} /></button><button className="icon-button" onClick={() => move(1)}><ChevronRight size={16} /></button>
        <button className="primary-button" onClick={() => setEditing(true)}><Plus size={15} /> Event</button>
      </div>
    </div>

    {mode === 'month' ? <MonthGrid cursor={cursor} events={events} /> : <div className={`week-calendar ${mode}`}>
      <div className="calendar-corner" />
      {days.map((day) => <div key={day.toISOString()} className={`day-heading ${sameDay(day, new Date()) ? 'today' : ''}`}><span>{dayName.format(day)}</span><strong>{day.getDate()}</strong></div>)}
      <div className="time-column">{hours.map((hour) => <span key={hour}>{String(hour).padStart(2, '0')}:00</span>)}</div>
      {days.map((day) => <div className="day-column" key={day.toISOString()}>{hours.map((hour) => <div className="hour-line" key={hour} />)}
        {events.filter((event) => sameDay(new Date(event.start), day)).map((event) => {
          const eventStart = new Date(event.start), eventEnd = new Date(event.end);
          const top = ((eventStart.getHours() + eventStart.getMinutes() / 60) - 8) * 58;
          const height = Math.max(30, ((eventEnd.getTime() - eventStart.getTime()) / 3600000) * 58);
          return <button key={event.id} className={`calendar-event ${event.color}`} style={{ top, height }} onDoubleClick={() => removeEvent(event.id)} title="Double-click to delete"><strong>{event.title}</strong><span><Clock3 size={10} /> {eventStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></button>;
        })}
      </div>)}
    </div>}

    {editing && <div className="modal-backdrop" onMouseDown={() => setEditing(false)}><form className="editor-modal" onSubmit={createEvent} onMouseDown={(event) => event.stopPropagation()}>
      <div className="modal-header"><div><p className="eyebrow">CALENDAR</p><h2>New event</h2></div><button type="button" className="icon-button" onClick={() => setEditing(false)}><X size={17} /></button></div>
      <label>Title<input autoFocus value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="What are you planning?" /></label>
      <label>Starts<input type="datetime-local" value={draft.start} onChange={(event) => setDraft({ ...draft, start: event.target.value })} /></label>
      <label>Ends<input type="datetime-local" value={draft.end} onChange={(event) => setDraft({ ...draft, end: event.target.value })} /></label>
      <button className="primary-button" type="submit">Create event</button>
    </form></div>}
  </div>;
}

function MonthGrid({ cursor, events }: { cursor: Date; events: CalendarEvent[] }) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const gridStart = monday(first);
  const days = Array.from({ length: 42 }, (_, index) => { const day = new Date(gridStart); day.setDate(day.getDate() + index); return day; });
  return <div className="month-calendar">
    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => <div className="month-weekday" key={day}>{day}</div>)}
    {days.map((day) => <div className={`month-day ${day.getMonth() !== cursor.getMonth() ? 'outside' : ''} ${sameDay(day, new Date()) ? 'today' : ''}`} key={day.toISOString()}><strong>{day.getDate()}</strong>
      {events.filter((event) => sameDay(new Date(event.start), day)).slice(0, 3).map((event) => <span className={`month-event ${event.color}`} key={event.id}>{event.title}</span>)}
    </div>)}
  </div>;
}
