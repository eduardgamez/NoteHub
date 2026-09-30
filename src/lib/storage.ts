import { get, set } from 'idb-keyval';
import type { WorkspaceStateData } from '../types';
import { cloudSync } from '../sync/cloudSync';

const STORAGE_KEY = 'notehub-workspace-v1';
const BACKUPS_KEY = 'notehub-workspace-backups-v1';
export interface WorkspaceBackup { savedAt: number; data: WorkspaceStateData }
let writes = Promise.resolve();

export async function loadWorkspace(): Promise<WorkspaceStateData | undefined> {
  return get<WorkspaceStateData>(STORAGE_KEY);
}
export async function workspaceBackups(): Promise<WorkspaceBackup[]> { return (await get<WorkspaceBackup[]>(BACKUPS_KEY)) ?? []; }
export async function preserveWorkspace(data: WorkspaceStateData): Promise<void> {
  const backups = await workspaceBackups();
  if (backups[0] && JSON.stringify(backups[0].data) === JSON.stringify(data)) return;
  await set(BACKUPS_KEY, [{ savedAt: Date.now(), data }, ...backups].slice(0, 8));
}
export function saveWorkspace(data: WorkspaceStateData): Promise<void> {
  const write = writes.catch(() => {}).then(async () => {
    const previous = await loadWorkspace();
    const backups = await workspaceBackups().catch(() => []);
    if (previous && (!backups[0] || Date.now() - backups[0].savedAt > 5 * 60000)) {
      try { await preserveWorkspace(previous); } catch { /* Saving current data takes priority if the backup quota is full. */ }
    }
    await set(STORAGE_KEY, data);
  });
  writes = write;
  return write;
}
let saveTimer: number | undefined;
export function scheduleSave(data: WorkspaceStateData): void {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => void saveWorkspace(data), 350);
  cloudSync.scheduleSnapshot(data);
}
