import { get, set } from 'idb-keyval';
import type { WorkspaceStateData } from '../types';
import { cloudSync } from '../sync/cloudSync';

const STORAGE_KEY = 'notehub-workspace-v1';

export async function loadWorkspace(): Promise<WorkspaceStateData | undefined> {
  return get<WorkspaceStateData>(STORAGE_KEY);
}

export async function saveWorkspace(data: WorkspaceStateData): Promise<void> {
  await set(STORAGE_KEY, data);
}

let saveTimer: number | undefined;
export function scheduleSave(data: WorkspaceStateData): void {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => void saveWorkspace(data), 350);
  cloudSync.scheduleSnapshot(data);
}
