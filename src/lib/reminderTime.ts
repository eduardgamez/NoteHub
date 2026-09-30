import type { Task } from '../types';

export function isAllDayReminder(task: Pick<Task, 'due'>): boolean { return /^\d{4}-\d{2}-\d{2}$/.test(task.due ?? ''); }
export function reminderDate(due: string): Date { return /^\d{4}-\d{2}-\d{2}$/.test(due) ? new Date(`${due}T00:00:00`) : new Date(due); }
export function reminderDone(task: Task, now = new Date()): boolean {
  if (!task.reminder) return task.done;
  if (!task.due) return false;
  const deadline = reminderDate(task.due);
  if (isAllDayReminder(task)) deadline.setDate(deadline.getDate() + 1);
  return !Number.isNaN(deadline.getTime()) && now.getTime() >= deadline.getTime();
}
