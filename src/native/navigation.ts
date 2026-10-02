import { create } from 'zustand';
import { useWorkspace } from '../store/useWorkspace';
import type { NativeNavigation } from './bridge';

export const useNotificationNavigation = create<{ request: NativeNavigation | null }>(() => ({ request: null }));

export function openNotification(request: NativeNavigation) {
  useWorkspace.getState().setActiveView('calendar');
  useNotificationNavigation.setState({ request });
}
