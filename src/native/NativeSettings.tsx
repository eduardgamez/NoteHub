import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { isNativeIOS, nativeBridge } from './bridge';

export function NativeSettings({ onServerChange }: { onServerChange?: () => void }) {
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState('');
  const [origin, setOrigin] = useState(() => localStorage.getItem('notehub-api-origin') ?? import.meta.env.VITE_API_ORIGIN ?? '');
  useEffect(() => {
    if (!isNativeIOS()) return;
    // Notifications are always on in NoteHub; this only reflects the iPhone setting, which is the one switch.
    const check = () => { if (!document.hidden) void nativeBridge.permission({ request: false }).then((result) => setEnabled(result.enabled)).catch(() => {}); };
    check();
    document.addEventListener('visibilitychange', check);
    return () => document.removeEventListener('visibilitychange', check);
  }, []);
  const native = isNativeIOS();
  return <section className="settings-section column"><div className="settings-copy"><div className="settings-icon"><Bell size={18} /></div><div><h2>{native ? 'Notificaciones del iPhone' : 'Servidor de IA'}</h2><p>{!native ? 'Conecta la web con tu servidor de IA mediante una dirección HTTPS.' : <>Los avisos se programan en este iPhone y funcionan con NoteHub cerrado. Los recordatorios sin hora avisan a las 9:00. Abre la app para recoger cambios de otros dispositivos y renovar los siguientes avisos.</>}</p></div></div>
    {native && (enabled ? <p role="status">Notificaciones activadas.</p> : <div><p role="status">Las notificaciones están desactivadas en Ajustes del iPhone. NoteHub no puede avisarte hasta que las actives allí.</p><button className="secondary-button" onClick={() => { void nativeBridge.openSettings().catch(() => {}); }}>Abrir Ajustes del iPhone</button></div>)}
    <form className="provider-key-form" onSubmit={(event) => { event.preventDefault(); try { const url = new URL(origin); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error(); localStorage.setItem('notehub-api-origin', url.origin); onServerChange?.(); setMessage('Dirección guardada. Usa HTTPS fuera de tu red local.'); } catch { setMessage('Introduce una dirección http o https válida.'); } }}><label htmlFor="native-api-origin">Servidor de IA</label><div><input id="native-api-origin" type="url" value={origin} onChange={(event) => setOrigin(event.target.value)} placeholder="https://tu-servidor" required /><button className="secondary-button">Guardar</button></div><small>Usa una dirección HTTPS accesible desde tus dispositivos. localhost se refiere al dispositivo donde abres NoteHub.</small></form>{message && <p role="status">{message}</p>}
  </section>;
}
