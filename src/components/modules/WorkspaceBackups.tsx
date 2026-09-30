import { useEffect, useState } from 'react';
import { Download, History } from 'lucide-react';
import { workspaceDataFrom, useWorkspace } from '../../store/useWorkspace';
import { workspaceBackups, type WorkspaceBackup } from '../../lib/storage';
import type { WorkspaceStateData } from '../../types';
function download(data: WorkspaceStateData, stamp: number) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `NoteHub-${new Date(stamp).toISOString().replace(/[:.]/g, '-')}.json`; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function WorkspaceBackups() {
  const [backups, setBackups] = useState<WorkspaceBackup[]>([]);
  useEffect(() => { void workspaceBackups().then(setBackups); }, []);
  return <section className="settings-section column"><div className="settings-copy"><div className="settings-icon"><History size={18} /></div><div><h2>Copias de seguridad</h2><p>Se conserva una copia local antes de cargar datos y periódicamente mientras trabajas. Las copias permanecen en este dispositivo.</p></div></div><button className="secondary-button" onClick={() => download(workspaceDataFrom(useWorkspace.getState()), Date.now())}><Download size={14} />Descargar datos actuales</button>{backups.length > 0 && <details className="workspace-backups"><summary>Versiones anteriores ({backups.length})</summary>{backups.map((backup, index) => <div key={`${backup.savedAt}-${index}`}><span>{new Date(backup.savedAt).toLocaleString('es-ES')}<small>{backup.data.calendarEvents.length} eventos · {backup.data.tasks.length} tareas · {Object.values(backup.data.chatThreads).reduce((sum, messages) => sum + messages.length, 0)} mensajes</small></span><button className="secondary-button" onClick={() => download(backup.data, backup.savedAt)} aria-label={`Descargar copia ${index + 1}`}><Download size={14} /></button></div>)}</details>}</section>;
}
