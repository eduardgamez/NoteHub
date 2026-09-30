import { useWorkspace } from '../store/useWorkspace';
import type { NativeAction } from './bridge';

export function applyNativeAction(action: NativeAction) {
  const state = useWorkspace.getState();
  const [kind, ...parts] = action.targetId.split(':');
  const id = parts.join(':');
  if (kind === 'task') {
    const task = state.tasks.find((item) => item.id === id);
    if (!task) return;
    if (action.kind === 'delete') state.removeTask(id);
    else if (action.itemId && typeof action.done === 'boolean') state.updateTask({ ...task, checklist: task.checklist.map((item) => item.id === action.itemId ? { ...item, done: action.done! } : item) });
  } else if (kind === 'event') {
    const event = state.calendarEvents.find((item) => item.id === id);
    if (!event) return;
    if (action.kind === 'delete') state.removeEvent(id);
    else if (action.itemId && typeof action.done === 'boolean') state.updateEvent({ ...event, checklist: (event.checklist ?? []).map((item) => item.id === action.itemId ? { ...item, done: action.done! } : item) });
  }
}
