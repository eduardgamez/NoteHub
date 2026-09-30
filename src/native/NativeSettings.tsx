import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { isNativeIOS, nativeBridge, nativeItems } from './bridge';
import { useWorkspace } from '../store/useWorkspace';

export function NativeSettings({ onServerChange }: { onServerChange?: () => void }) {
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState('');
  const [origin, setOrigin] = useState(() => localStorage.getItem('notehub-api-origin') ?? import.meta.env.VITE_API_ORIGIN ?? '');
  useEffect(() => { if (isNativeIOS()) void nativeBridge.permission({ request: false }).then((result) => setEnabled(result.enabled)).catch(() => {}); }, []);
  if (!isNativeIOS()) return null;
  return <section className="settings-section column"><div className="settings-copy"><div className="settings-icon"><Bell size={18} /></div><div><h2>Notificaciones del iPhone</h2><p>Los avisos se programan en este iPhone y funcionan con NoteHub cerrado. Los recordatorios sin hora avisan a las 9:00. Abre la app para recoger cambios de otros dispositivos y renovar los siguientes avisos.</p></div></div>
    <button className="secondary-button" disabled={enabled} onClick={async () => { try { const result = await nativeBridge.permission({ request: true }); setEnabled(result.enabled); if (result.enabled) { const state = useWorkspace.getState(); await nativeBridge.sync({ items: nativeItems(state.tasks, state.calendarEvents) }); setMessage('Notificaciones activadas.'); } else setMessage('Activa las notificaciones en Ajustes del iPhone → NoteHub.'); } catch (error) { setMessage(String(error)); } }}>{enabled ? 'Notificaciones activadas' : 'Activar notificaciones'}</button>
    <form className="provider-key-form" onSubmit={(event) => { event.preventDefault(); try { const url = new URL(origin); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error(); localStorage.setItem('notehub-api-origin', url.origin); onServerChange?.(); setMessage('Dirección guardada. Usa HTTPS fuera de tu red local.'); } catch { setMessage('Introduce una dirección http o https válida.'); } }}><label htmlFor="native-api-origin">Servidor de IA</label><div><input id="native-api-origin" type="url" value={origin} onChange={(event) => setOrigin(event.target.value)} placeholder="https://tu-servidor" required /><button className="secondary-button">Guardar</button></div><small>La app usa el mismo servidor de IA que la web. localhost en el iPhone se refiere al propio teléfono.</small></form>{message && <p role="status">{message}</p>}
  </section>;
}
