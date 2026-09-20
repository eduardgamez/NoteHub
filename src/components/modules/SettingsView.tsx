import { useEffect, useState } from 'react';
import { Check, Cloud, KeyRound, Laptop, Moon, RefreshCw, Save, Server, ShieldCheck, Sun, Trash2 } from 'lucide-react';
import { getActiveProvider, getProviderStatus, setActiveProvider, type ProviderId, type ProviderStatus } from '../../ai/provider';
import { hasProviderKey, removeProviderKey, saveProviderKey } from '../../ai/keyVault';
import { useTheme } from '../../hooks/useTheme';
import { cloudSync, type CloudSyncStatus } from '../../sync/cloudSync';
import { getAIPermissions, saveAIPermissions, type AIPermissions } from '../../ai/permissions';

const providers: Array<{ id: ProviderId; name: string; env: string }> = [
  { id: 'openai', name: 'OpenAI', env: 'OPENAI_API_KEY' }, { id: 'anthropic', name: 'Anthropic', env: 'ANTHROPIC_API_KEY' }, { id: 'gemini', name: 'Google Gemini', env: 'GEMINI_API_KEY' },
];

export function SettingsView() {
  const { theme, followsSystem, chooseTheme, useSystemTheme } = useTheme();
  const [active, setActive] = useState<ProviderId>(getActiveProvider());
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [localKeys, setLocalKeys] = useState<Record<ProviderId, boolean>>({ openai: false, anthropic: false, gemini: false });
  const [keyDraft, setKeyDraft] = useState('');
  const [keyMessage, setKeyMessage] = useState('');
  const [checking, setChecking] = useState(true);
  const [syncStatus, setSyncStatus] = useState<CloudSyncStatus>({ configured: cloudSync.configured, connected: false });
  const [email, setEmail] = useState('');
  const [syncMessage, setSyncMessage] = useState('');
  const [permissions, setPermissions] = useState<AIPermissions>(getAIPermissions);
  useEffect(() => {
    void getProviderStatus().then((result) => { setStatus(result); setChecking(false); });
    void Promise.all(providers.map(async ({ id }) => [id, await hasProviderKey(id)] as const)).then((entries) => setLocalKeys(Object.fromEntries(entries) as Record<ProviderId, boolean>));
    void cloudSync.status().then(setSyncStatus);
  }, []);

  function choose(id: ProviderId) { setActiveProvider(id); setActive(id); setKeyDraft(''); setKeyMessage(''); }
  async function saveKey(event: React.FormEvent) {
    event.preventDefault(); setKeyMessage('');
    try {
      await saveProviderKey(active, keyDraft);
      setLocalKeys((current) => ({ ...current, [active]: true }));
      setKeyDraft(''); setKeyMessage('Key encrypted and saved on this device.');
    } catch (error) { setKeyMessage(error instanceof Error ? error.message : 'Could not save this key.'); }
  }
  async function removeKey() {
    await removeProviderKey(active);
    setLocalKeys((current) => ({ ...current, [active]: false }));
    setKeyDraft(''); setKeyMessage('Saved key removed from this device.');
  }
  function togglePermission(key: keyof AIPermissions) { const next = { ...permissions, [key]: !permissions[key] }; setPermissions(next); saveAIPermissions(next); }
  async function connect(event: React.FormEvent) {
    event.preventDefault(); setSyncMessage('');
    try { await cloudSync.sendMagicLink(email); setSyncMessage('Check your email for the secure sign-in link.'); } catch (error) { setSyncMessage(error instanceof Error ? error.message : 'Could not send sign-in link.'); }
  }

  return <div className="module-view settings-view"><div className="module-header"><div><p className="eyebrow">WORKSPACE</p><h1>Settings</h1><p>Appearance, secure AI providers, and synchronization.</p></div></div>
    <section className="settings-section"><div className="settings-copy"><div className="settings-icon"><Sun size={18} /></div><div><h2>Appearance</h2><p>Follow your device or keep a manual theme across sessions.</p></div></div><div className="theme-setting"><button className={followsSystem ? 'active' : ''} onClick={useSystemTheme}><Laptop size={15} /> System</button><button className={!followsSystem && theme === 'light' ? 'active' : ''} onClick={() => chooseTheme('light')}><Sun size={15} /> Light</button><button className={!followsSystem && theme === 'dark' ? 'active' : ''} onClick={() => chooseTheme('dark')}><Moon size={15} /> Dark</button></div></section>
    <section className="settings-section column"><div className="settings-copy"><div className="settings-icon purple"><KeyRound size={18} /></div><div><h2>AI provider</h2><p>Add your own key here. It is encrypted locally and persists between browser sessions.</p></div></div><div className="provider-list">{providers.map((provider) => <button className={active === provider.id ? 'active' : ''} onClick={() => choose(provider.id)} key={provider.id}><span className="provider-logo">{provider.name[0]}</span><span><strong>{provider.name}</strong><small>{localKeys[provider.id] ? 'Saved on this device' : status?.[provider.id] ? 'Configured by server' : 'Not configured'}</small></span><i className={localKeys[provider.id] || status?.[provider.id] ? 'connected' : ''}>{active === provider.id ? <Check size={14} /> : checking ? <RefreshCw size={13} /> : null}</i></button>)}</div>
      <form className="provider-key-form" onSubmit={saveKey}><label htmlFor="provider-api-key">{providers.find((provider) => provider.id === active)?.name} API key</label><div><input id="provider-api-key" aria-label={`${providers.find((provider) => provider.id === active)?.name} API key`} type="password" autoComplete="off" value={keyDraft} onChange={(event) => setKeyDraft(event.target.value)} placeholder={localKeys[active] ? 'Key saved — enter a new value to replace it' : 'Paste your API key'} /><button className="primary-button" type="submit" disabled={!keyDraft.trim()}><Save size={13} /> Save key</button>{localKeys[active] && <button className="secondary-button danger" type="button" onClick={() => void removeKey()}><Trash2 size={13} /> Remove</button>}</div><small>Stored only in this browser's encrypted IndexedDB vault. Sent to the NoteHub server over HTTPS only when you use AI; it is never added to workspace sync.</small>{keyMessage && <p>{keyMessage}</p>}</form>
    </section>
    <section className="settings-section column"><div className="settings-copy"><div className="settings-icon purple"><ShieldCheck size={18} /></div><div><h2>AI permissions</h2><p>Read access is explicit. Writes always remain proposal-only regardless of these settings.</p></div></div><div className="permission-grid">{([
      ['readCurrentFile', 'Read current file'], ['searchFiles', 'Search other files'], ['readProjectContext', 'Read project memory'], ['inspectCalendar', 'Inspect calendar & tasks'], ['inspectGym', 'Inspect gym history'], ['searchWeb', 'Search the internet'],
    ] as Array<[keyof AIPermissions, string]>).map(([key, label]) => <label key={key}><span>{label}</span><button className={permissions[key] ? 'enabled' : ''} onClick={() => togglePermission(key)} aria-pressed={permissions[key]}><i /></button></label>)}</div></section>
    <section className="settings-section sync-settings"><div className="settings-copy"><div className="settings-icon"><Cloud size={18} /></div><div><h2>Multi-device sync</h2><p>{syncStatus.connected ? `Signed in as ${syncStatus.email}. Changes sync live and offline operations remain queued.` : syncStatus.configured ? 'Sign in with the same email on every device to share the workspace.' : 'Local-first mode is active. Configure Supabase to enable real-time device sync.'}</p></div></div>
      {syncStatus.connected ? <button className="secondary-button" onClick={() => void cloudSync.signOut().then(() => setSyncStatus({ configured: true, connected: false }))}>Sign out</button> : syncStatus.configured ? <form onSubmit={connect}><input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /><button className="primary-button">Email sign-in link</button>{syncMessage && <small>{syncMessage}</small>}</form> : <div className="status-chip"><Server size={14} /> Local only</div>}
    </section>
  </div>;
}
