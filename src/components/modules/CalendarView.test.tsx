import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { seedWorkspace } from '../../data/seed';
import { useWorkspace } from '../../store/useWorkspace';
import { syncEngine } from '../../sync/syncEngine';
import { CalendarView } from './CalendarView';

vi.mock('../../lib/storage', () => ({ loadWorkspace: vi.fn(), scheduleSave: vi.fn() }));
vi.mock('../../sync/syncEngine', () => ({ syncEngine: { publish: vi.fn(), subscribe: vi.fn() } }));

beforeEach(() => {
  cleanup(); vi.clearAllMocks();
  const start = new Date(); start.setHours(10, 0, 0, 0);
  useWorkspace.setState({ ...structuredClone(seedWorkspace), calendarEvents: [{ id: 'event-test', title: 'Study session', start: start.toISOString(), end: new Date(start.getTime() + 3600000).toISOString(), color: 'green' }] });
});

describe('event task lists', () => {
  it('adds, completes and removes tasks from an existing event and synchronizes updates', () => {
    render(<CalendarView />);
    fireEvent.click(screen.getByRole('button', { name: 'Event: Study session' }));
    const dialog = screen.getByRole('dialog', { name: 'Manage event' });
    fireEvent.change(within(dialog).getByLabelText('New event task'), { target: { value: 'Prepare notes' } });
    fireEvent.click(within(dialog).getByLabelText('Add event task'));
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Prepare notes' }));
    expect(within(dialog).getByRole('checkbox', { name: 'Prepare notes' })).toHaveAttribute('aria-checked', 'true');
    expect(useWorkspace.getState().calendarEvents[0].checklist?.[0].done).toBe(true);
    expect(syncEngine.publish).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'event.upsert', event: expect.objectContaining({ checklist: [expect.objectContaining({ text: 'Prepare notes', done: true })] }) }));
    fireEvent.click(within(dialog).getByLabelText('Remove Prepare notes'));
    expect(useWorkspace.getState().calendarEvents[0].checklist).toEqual([]);
  });

  it('opens the same checklist in month view and preserves it when editing the event', () => {
    const event = useWorkspace.getState().calendarEvents[0];
    useWorkspace.getState().updateEvent({ ...event, checklist: [{ id: 'item', text: 'Bring book', done: true }] });
    render(<CalendarView />);
    fireEvent.click(screen.getByRole('button', { name: 'month' }));
    fireEvent.click(screen.getByRole('button', { name: 'Event: Study session' }));
    const dialog = screen.getByRole('dialog', { name: 'Manage event' });
    expect(within(dialog).getByRole('checkbox', { name: 'Bring book' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.change(within(dialog).getByLabelText('Title'), { target: { value: 'Updated session' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(useWorkspace.getState().calendarEvents[0]).toEqual(expect.objectContaining({ title: 'Updated session', checklist: [{ id: 'item', text: 'Bring book', done: true }] }));
  });

  it('creates events with optional tasks, ignoring blank lines', () => {
    render(<CalendarView />);
    fireEvent.click(screen.getByRole('button', { name: /^Create$/ }));
    const dialog = screen.getByRole('dialog', { name: 'Create calendar item' });
    fireEvent.change(within(dialog).getByLabelText('Title'), { target: { value: 'New event' } });
    fireEvent.change(within(dialog).getByLabelText('Tasks (one per line)'), { target: { value: 'First task\n\n Second task ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create event' }));
    expect(useWorkspace.getState().calendarEvents.at(-1)?.checklist?.map((item) => [item.text, item.done])).toEqual([['First task', false], ['Second task', false]]);
  });
});

describe('reminder clock placement', () => {
  it('aligns equal times across days, respects minutes and separates simultaneous bells horizontally', () => {
    const monday = new Date(); monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7); monday.setHours(9, 15, 0, 0);
    const tuesday = new Date(monday); tuesday.setDate(tuesday.getDate() + 1);
    const earlier = new Date(monday); earlier.setHours(8, 30);
    const later = new Date(monday); later.setMinutes(45);
    const reminder = (id: string, due: Date) => ({ id, title: id, due: due.toISOString(), done: false, reminder: true, checklist: [] });
    useWorkspace.setState({ tasks: [reminder('earlier', earlier), reminder('Monday', monday), reminder('Tuesday', tuesday), reminder('same time', monday), reminder('later', later)] });
    render(<CalendarView />);
    const left = screen.getByRole('button', { name: 'Reminder: Monday' });
    const right = screen.getByRole('button', { name: 'Reminder: Tuesday' });
    const simultaneous = screen.getByRole('button', { name: 'Reminder: same time' });
    expect(left.style.top).toBeTruthy();
    expect(left.style.top).toBe(right.style.top);
    expect(left.style.top).toBe(simultaneous.style.top);
    expect(left.style.left).not.toBe(simultaneous.style.left);
    expect(left.style.top).not.toBe(screen.getByRole('button', { name: 'Reminder: later' }).style.top);
  });
});

describe('inline reminder editor', () => {
  it('edits title and tasks, saves an all-day date, restores timing and deletes the reminder', () => {
    const due = new Date(); due.setHours(18, 30, 0, 0);
    useWorkspace.setState({ tasks: [{ id: 'editable', title: 'Gastos', reminder: true, done: false, due: due.toISOString(), checklist: [{ id: 'first', text: 'Revisar', done: false }, { id: 'second', text: 'Separar', done: false }] }] });
    render(<CalendarView />);
    fireEvent.click(screen.getByRole('button', { name: 'Reminder: Gastos' }));
    let dialog = screen.getByRole('dialog', { name: 'Manage reminder' });
    fireEvent.change(within(dialog).getByLabelText('Título del recordatorio'), { target: { value: 'Gastos del mes' } });
    fireEvent.change(within(dialog).getByDisplayValue('Revisar'), { target: { value: 'Revisar gastos' } });
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Revisar gastos' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Eliminar tarea Separar' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Añadir tarea' }));
    fireEvent.change(within(dialog).getAllByPlaceholderText('Tarea').at(-1)!, { target: { value: 'Guardar recibos' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Quitar hora' }));
    expect(within(dialog).getByLabelText('Hora del recordatorio')).toBeDisabled();
    expect(within(dialog).getByLabelText('Hora del recordatorio')).toHaveValue('18:30');
    expect(useWorkspace.getState().tasks[0].title).toBe('Gastos');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(useWorkspace.getState().tasks[0].due).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(useWorkspace.getState().tasks[0].checklist.map((item) => [item.text, item.done])).toEqual([['Revisar gastos', true], ['Guardar recibos', false]]);
    expect(screen.getByRole('button', { name: 'Reminder: Gastos del mes' })).toHaveClass('calendar-all-day');
    fireEvent.click(screen.getByRole('button', { name: 'Reminder: Gastos del mes' }));
    dialog = screen.getByRole('dialog', { name: 'Manage reminder' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Activar hora' }));
    fireEvent.change(within(dialog).getByLabelText('Hora del recordatorio'), { target: { value: '10:45' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(new Date(useWorkspace.getState().tasks[0].due!).getMinutes()).toBe(45);
    expect(screen.getByRole('button', { name: 'Reminder: Gastos del mes' })).not.toHaveClass('calendar-all-day');
    fireEvent.click(screen.getByRole('button', { name: 'Reminder: Gastos del mes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete reminder' }));
    expect(useWorkspace.getState().tasks).toHaveLength(0);
  });
});
