import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { isAllDayReminder, reminderDate } from '../lib/reminderTime';
import type { CalendarEvent, ChecklistEntry, Task } from '../types';

export const isNativeIOS = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
export interface NativeItem { id: string; title: string; kind: 'task' | 'event'; due: number; end?: number; checklist: ChecklistEntry[] }
export interface NativeAction { id: string; targetId: string; kind: 'delete' | 'check'; itemId?: string; done?: boolean }
export interface NativeNavigation { id: string; targetId: string }
interface NativeBridge {
  authGet(options: { key: string }): Promise<{ value?: string }>;
  authSet(options: { key: string; value: string }): Promise<void>;
  authRemove(options: { key: string }): Promise<void>;
  pendingNavigation(): Promise<{ navigation?: NativeNavigation } | undefined>;
  acknowledgeNavigation(options: { id: string }): Promise<void>;
  addListener(event: 'notificationOpened' | 'permissionChanged' | 'actionsChanged', listener: () => void): Promise<PluginListenerHandle>;
  permission(options: { request: boolean }): Promise<{ enabled: boolean }>;
  openSettings(): Promise<void>;
  sync(options: { items: NativeItem[] }): Promise<{ scheduled: number }>;
  refreshActivity(): Promise<void>;
  pendingActions(): Promise<{ actions: NativeAction[] }>;
  acknowledge(options: { ids: string[] }): Promise<void>;
  keyboardLock(options: { locked: boolean }): Promise<void>;
}
export const nativeBridge = registerPlugin<NativeBridge>('NoteHubNative');
// iOS decodes the whole list at once, so one malformed entry (synced from an older client) would cancel every notice.
function nativeChecklist(checklist: unknown): ChecklistEntry[] {
  return Array.isArray(checklist) ? checklist.filter((item) => item && typeof item.id === 'string').map((item) => ({ id: item.id, text: String(item.text ?? ''), done: item.done === true })) : [];
}
export function nativeItems(tasks: Task[], events: CalendarEvent[]): NativeItem[] {
  return [
    ...tasks.filter((task) => task.reminder && task.due).map((task): NativeItem => {
      const date = reminderDate(task.due!);
      if (isAllDayReminder(task)) date.setHours(9, 0, 0, 0);
      return { id: `task:${task.id}`, title: String(task.title ?? ''), kind: 'task', due: date.getTime() / 1000, checklist: nativeChecklist(task.checklist) };
    }),
    ...events.map((event): NativeItem => {
      const end = new Date(event.end).getTime() / 1000;
      return { id: `event:${event.id}`, title: String(event.title ?? ''), kind: 'event', due: new Date(event.start).getTime() / 1000, ...(Number.isFinite(end) ? { end } : {}), checklist: nativeChecklist(event.checklist) };
    }),
  ].filter((item) => Number.isFinite(item.due));
}
export function apiUrl(path: string): string {
  let savedOrigin = localStorage.getItem('notehub-api-origin');
  const configuredOrigin = import.meta.env.VITE_API_ORIGIN;
  // Migrate this app's previous deployment while preserving custom servers.
  if (savedOrigin?.replace(/\/$/, '') === 'https://notehub-ai-tcu9.onrender.com' && configuredOrigin && configuredOrigin !== savedOrigin) {
    savedOrigin = configuredOrigin;
    localStorage.setItem('notehub-api-origin', configuredOrigin);
  }
  const origin = savedOrigin ?? configuredOrigin;
  if (!origin) {
    if (isNativeIOS() || window.location.hostname.endsWith('.github.io')) throw new Error('Configura el Servidor de IA en Ajustes con una dirección HTTPS. La web publicada necesita un servidor de IA accesible.');
    return path;
  }
  return `${origin.replace(/\/$/, '')}${path}`;
}
