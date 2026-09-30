import { isNativeIOS } from '../native/bridge';
import { useEffect, useState } from 'react';
import { Download, RefreshCw, X } from 'lucide-react';

interface InstallPromptEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

export function PWAStatus() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (isNativeIOS()) return;
    const captureInstall = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPromptEvent); };
    const refreshAfterActivation = () => window.location.reload();
    window.addEventListener('beforeinstallprompt', captureInstall);
    navigator.serviceWorker?.addEventListener('controllerchange', refreshAfterActivation);
    let registration: ServiceWorkerRegistration | undefined;
    const checkUpdate = () => { if (!document.hidden) void registration?.update().catch(() => {}); };
    window.addEventListener('focus', checkUpdate);
    document.addEventListener('visibilitychange', checkUpdate);
    if ('serviceWorker' in navigator && import.meta.env.DEV) {
      void navigator.serviceWorker.getRegistrations().then(async (registrations) => {
        const base = new URL(import.meta.env.BASE_URL, location.origin).href;
        const ours = registrations.filter((item) => item.scope === base && [item.active, item.waiting, item.installing].some((worker) => worker?.scriptURL === `${base}sw.js`));
        await Promise.all(ours.map((item) => item.unregister()));
        if ('caches' in window) await Promise.all((await caches.keys()).filter((key) => key.startsWith('notehub-shell-')).map((key) => caches.delete(key)));
        if (ours.length && navigator.serviceWorker.controller && !sessionStorage.getItem('notehub-dev-cache-cleared')) { sessionStorage.setItem('notehub-dev-cache-cleared', '1'); location.reload(); }
      });
    }
    if ('serviceWorker' in navigator && import.meta.env.PROD) {
      void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { updateViaCache: 'none' }).then((registered) => {
        registration = registered;
        checkUpdate();
        if (registered.waiting) { setWaiting(registered.waiting); setDismissed(false); }
        registered.addEventListener('updatefound', () => {
          const worker = registered.installing;
          worker?.addEventListener('statechange', () => { if (worker.state === 'installed' && navigator.serviceWorker.controller) { setWaiting(worker); setDismissed(false); } });
        });
      });
    }
    return () => { window.removeEventListener('focus', checkUpdate); document.removeEventListener('visibilitychange', checkUpdate); window.removeEventListener('beforeinstallprompt', captureInstall); navigator.serviceWorker?.removeEventListener('controllerchange', refreshAfterActivation); };
  }, []);

  if (dismissed || (!installPrompt && !waiting)) return null;
  return <div className="pwa-toast">{waiting ? <RefreshCw size={16} /> : <Download size={16} />}<div><strong>{waiting ? 'NoteHub update ready' : 'Install NoteHub'}</strong><small>{waiting ? 'Reload to use the latest version.' : 'Use it like an app, even when the network drops.'}</small></div><button onClick={() => { if (waiting) waiting.postMessage({ type: 'SKIP_WAITING' }); else void installPrompt?.prompt(); }}>{waiting ? 'Update' : 'Install'}</button><button className="dismiss" onClick={() => setDismissed(true)}><X size={14} /></button></div>;
}
