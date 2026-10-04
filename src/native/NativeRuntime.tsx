import { openNotification } from './navigation';
import { applyNativeAction } from './actions';
import { useEffect } from 'react';
import { useWorkspace, workspaceDataFrom } from '../store/useWorkspace';
import { saveWorkspace } from '../lib/storage';
import { isNativeIOS, nativeBridge, nativeItems } from './bridge';

export function NativeRuntime() {
  const hydrated = useWorkspace((state) => state.hydrated);
  useEffect(() => {
    if (!hydrated || !isNativeIOS()) return;
    document.documentElement.classList.add('native-ios');
    let running = false, again = false, stopped = false;
    let lastSynced: Pick<ReturnType<typeof useWorkspace.getState>, 'tasks' | 'calendarEvents'> | undefined;
    let syncedAt = 0;
    let permissionAsked = false;
    const refresh = async () => {
      if (running) { again = true; return; }
      running = true;
      try {
        do {
          again = false;
          const { actions } = await nativeBridge.pendingActions();
          actions.forEach(applyNativeAction);
          if (actions.length) {
            await saveWorkspace(workspaceDataFrom(useWorkspace.getState()));
            await nativeBridge.acknowledge({ ids: actions.map((action) => action.id) });
          }
          const navigation = (await nativeBridge.pendingNavigation())?.navigation;
          if (navigation) {
            openNotification(navigation);
            await nativeBridge.acknowledgeNavigation({ id: navigation.id });
          }
          const state = useWorkspace.getState();
          if (!lastSynced || state.tasks !== lastSynced.tasks || state.calendarEvents !== lastSynced.calendarEvents || Date.now() - syncedAt > 15 * 60000) {
            const items = nativeItems(state.tasks, state.calendarEvents);
            // Without asking, iOS silently drops every scheduled notice until the user finds the button in Settings.
            if (!permissionAsked && items.some((item) => item.due > Date.now() / 1000)) {
              permissionAsked = true;
              await nativeBridge.permission({ request: true }).catch(() => undefined);
            }
            await nativeBridge.sync({ items });
            lastSynced = state; syncedAt = Date.now();
          } else { await nativeBridge.refreshActivity(); }
        } while (again && !stopped);
      } catch (error) { console.warn('NoteHub native reminders:', error); }
      finally { running = false; }
    };
    const visible = () => { if (!document.hidden) void refresh(); };
    const foreground = () => { syncedAt = 0; visible(); };
    const unsubscribe = useWorkspace.subscribe((state, previous) => { if (state.tasks !== previous.tasks || state.calendarEvents !== previous.calendarEvents) void refresh(); });
    document.addEventListener('visibilitychange', foreground);
    window.addEventListener('focus', foreground);
    const navigationListener = nativeBridge.addListener('notificationOpened', () => { void refresh(); });
    const timer = window.setInterval(visible, 5000);
    void refresh();
    return () => { stopped = true; void navigationListener.then((listener) => listener.remove()).catch(() => {}); unsubscribe(); clearInterval(timer); document.removeEventListener('visibilitychange', foreground); window.removeEventListener('focus', foreground); };
  }, [hydrated]);
  return null;
}
