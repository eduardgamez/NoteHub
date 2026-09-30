import { describe, expect, it } from 'vitest';
import { isAllDayReminder, reminderDate, reminderDone } from './reminderTime';
import type { Task } from '../types';
const task = (due?: string, done = false): Task => ({ id: 'reminder', title: 'Reminder', reminder: true, due, done, checklist: [] });
describe('automatic reminder status', () => {
  it('uses the scheduled instant even if the saved status disagrees', () => {
    const now = new Date('2026-09-30T12:00:00Z');
    expect(reminderDone(task('2026-09-30T12:01:00Z', true), now)).toBe(false);
    expect(reminderDone(task('2026-09-30T11:59:00Z'), now)).toBe(true);
    expect(reminderDone(task('2026-09-30T12:00:00Z'), now)).toBe(true);
    expect(reminderDone(task(undefined, true), now)).toBe(false);
  });
  it('keeps a general reminder open until the local day ends', () => {
    const reminder = task('2026-09-30');
    expect(isAllDayReminder(reminder)).toBe(true);
    expect(reminderDate(reminder.due!).getDate()).toBe(30);
    expect(reminderDone(reminder, new Date(2026, 8, 30, 23, 59))).toBe(false);
    expect(reminderDone(reminder, new Date(2026, 9, 1, 0, 0))).toBe(true);
  });
  it('preserves manual completion for ordinary tasks', () => {
    expect(reminderDone({ ...task('2099-01-01', true), reminder: false })).toBe(true);
  });
});
