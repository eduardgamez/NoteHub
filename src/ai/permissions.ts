export interface AIPermissions {
  readCurrentFile: boolean;
  searchFiles: boolean;
  readProjectContext: boolean;
  inspectCalendar: boolean;
  inspectGym: boolean;
  searchWeb: boolean;
}

const KEY = 'notehub-ai-permissions';
export const defaultPermissions: AIPermissions = { readCurrentFile: true, searchFiles: true, readProjectContext: true, inspectCalendar: true, inspectGym: true, searchWeb: false };

export function getAIPermissions(): AIPermissions {
  try { return { ...defaultPermissions, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { return defaultPermissions; }
}
export function saveAIPermissions(permissions: AIPermissions) { localStorage.setItem(KEY, JSON.stringify(permissions)); }
