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
