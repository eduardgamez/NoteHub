import { useEffect, useState } from 'react';
import { Download, RefreshCw, X } from 'lucide-react';

interface InstallPromptEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

export function PWAStatus() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const captureInstall = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPromptEvent); };
    const refreshAfterActivation = () => window.location.reload();
    window.addEventListener('beforeinstallprompt', captureInstall);
    navigator.serviceWorker?.addEventListener('controllerchange', refreshAfterActivation);
    if ('serviceWorker' in navigator && import.meta.env.PROD) {
      void navigator.serviceWorker.register('/sw.js').then((registration) => {
        if (registration.waiting) setWaiting(registration.waiting);
        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          worker?.addEventListener('statechange', () => { if (worker.state === 'installed' && navigator.serviceWorker.controller) setWaiting(worker); });
        });
      });
    }
    return () => { window.removeEventListener('beforeinstallprompt', captureInstall); navigator.serviceWorker?.removeEventListener('controllerchange', refreshAfterActivation); };
  }, []);

  if (dismissed || (!installPrompt && !waiting)) return null;
  return <div className="pwa-toast">{waiting ? <RefreshCw size={16} /> : <Download size={16} />}<div><strong>{waiting ? 'NoteHub update ready' : 'Install NoteHub'}</strong><small>{waiting ? 'Reload to use the latest version.' : 'Use it like an app, even when the network drops.'}</small></div><button onClick={() => { if (waiting) waiting.postMessage({ type: 'SKIP_WAITING' }); else void installPrompt?.prompt(); }}>{waiting ? 'Update' : 'Install'}</button><button className="dismiss" onClick={() => setDismissed(true)}><X size={14} /></button></div>;
}
