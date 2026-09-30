import { Capacitor, registerPlugin } from '@capacitor/core';
import { isAllDayReminder, reminderDate } from '../lib/reminderTime';
import type { CalendarEvent, ChecklistEntry, Task } from '../types';

export const isNativeIOS = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
export interface NativeItem { id: string; title: string; kind: 'task' | 'event'; due: number; checklist: ChecklistEntry[] }
export interface NativeAction { id: string; targetId: string; kind: 'delete' | 'check'; itemId?: string; done?: boolean }
interface NativeBridge {
  permission(options: { request: boolean }): Promise<{ enabled: boolean }>;
  sync(options: { items: NativeItem[] }): Promise<{ scheduled: number }>;
  pendingActions(): Promise<{ actions: NativeAction[] }>;
  acknowledge(options: { ids: string[] }): Promise<void>;
  showReminder(options: { id: string }): Promise<void>;
}
export const nativeBridge = registerPlugin<NativeBridge>('NoteHubNative');
export function nativeItems(tasks: Task[], events: CalendarEvent[]): NativeItem[] {
  return [
    ...tasks.filter((task) => task.reminder && task.due).map((task): NativeItem => {
      const date = reminderDate(task.due!);
      if (isAllDayReminder(task)) date.setHours(9, 0, 0, 0);
      return { id: `task:${task.id}`, title: task.title, kind: 'task', due: date.getTime() / 1000, checklist: task.checklist };
    }),
    ...events.map((event): NativeItem => ({ id: `event:${event.id}`, title: event.title, kind: 'event', due: new Date(event.start).getTime() / 1000, checklist: event.checklist ?? [] })),
  ].filter((item) => Number.isFinite(item.due));
}
export function apiUrl(path: string): string {
  const origin = localStorage.getItem('notehub-api-origin') ?? import.meta.env.VITE_API_ORIGIN;
  if (!origin) {
    if (isNativeIOS() || window.location.hostname.endsWith('.github.io')) throw new Error('Configura el Servidor de IA en Ajustes con una dirección HTTPS. La web publicada necesita un servidor de IA accesible.');
    return path;
  }
  return `${origin.replace(/\/$/, '')}${path}`;
}
