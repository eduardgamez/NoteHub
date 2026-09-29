import { useEffect, useState } from 'react';
import { Check, Cloud, KeyRound, Laptop, Moon, RefreshCw, Save, Server, ShieldCheck, Sun, Trash2 } from 'lucide-react';
import { beginCodexLogin, getActiveProvider, getCodexLoginStatus, getProviderStatus, setActiveProvider, type CodexLoginState, type ProviderId, type ProviderStatus } from '../../ai/provider';
import { hasProviderKey, removeProviderKey, saveProviderKey } from '../../ai/keyVault';
import { useTheme } from '../../hooks/useTheme';
import { cloudSync, type CloudSyncStatus } from '../../sync/cloudSync';
import { getAIPermissions, saveAIPermissions, type AIPermissions } from '../../ai/permissions';

const providers: Array<{ id: ProviderId; name: string }> = [
  { id: 'codex', name: 'Codex (ChatGPT)' }, { id: 'openai', name: 'OpenAI' }, { id: 'anthropic', name: 'Anthropic' }, { id: 'gemini', name: 'Google Gemini' },
];

export function SettingsView() {
  const { theme, followsSystem, chooseTheme, useSystemTheme } = useTheme();
  const [active, setActive] = useState<ProviderId>(getActiveProvider());
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [localKeys, setLocalKeys] = useState<Record<ProviderId, boolean>>({ openai: false, anthropic: false, gemini: false, codex: false });
  const [keyDraft, setKeyDraft] = useState('');
  const [keyMessage, setKeyMessage] = useState('');
  const [checking, setChecking] = useState(true);
  const [syncStatus, setSyncStatus] = useState<CloudSyncStatus>({ configured: cloudSync.configured, connected: false });
  const [email, setEmail] = useState('');
  const [emailProof, setEmailProof] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [permissions, setPermissions] = useState<AIPermissions>(getAIPermissions);
  const [codexLogin, setCodexLogin] = useState<CodexLoginState>({ status: 'idle' });
  useEffect(() => {
    void Promise.all(providers.map(async ({ id }) => [id, id === 'codex' ? false : await hasProviderKey(id)] as const)).then((entries) => setLocalKeys(Object.fromEntries(entries) as Record<ProviderId, boolean>));
    void cloudSync.status().then(setSyncStatus);
  }, []);

  useEffect(() => {
    let current = true;
    void getProviderStatus(active === 'codex').then((result) => {
      if (current) { setStatus(result); setChecking(false); }
    });
    return () => { current = false; };
  }, [active]);

  useEffect(() => {
    if (codexLogin.status !== 'pending') return;
    const timer = setInterval(() => {
      void getCodexLoginStatus().then((result) => {
        setCodexLogin(result);
        if (result.status === 'complete') void getProviderStatus(true).then(setStatus);
      }).catch(() => {});
    }, 2000);
    return () => clearInterval(timer);
  }, [codexLogin.status]);

  function choose(id: ProviderId) { setActiveProvider(id); setActive(id); setChecking(true); setKeyDraft(''); setKeyMessage(''); }
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
  async function connectCodex() {
    try { setCodexLogin(await beginCodexLogin()); }
    catch (error) { setCodexLogin({ status: 'failed', message: error instanceof Error ? error.message : 'Could not connect ChatGPT.' }); }
  }
  function togglePermission(key: keyof AIPermissions) { const next = { ...permissions, [key]: !permissions[key] }; setPermissions(next); saveAIPermissions(next); }
  async function connect(event: React.FormEvent) {
    event.preventDefault(); setSyncMessage('');
    try { await cloudSync.sendEmailCode(email); setCodeSent(true); setSyncMessage('Copy the link from the email and paste it below without opening it. If your email has a code, you can enter that instead.'); } catch (error) { setSyncMessage(error instanceof Error ? error.message : 'Could not send sign-in email.'); }
  }
  async function verifyEmail(event: React.FormEvent) {
    event.preventDefault(); setSyncMessage('');
    try {
      if (/^https?:\/\//i.test(emailProof.trim())) await cloudSync.verifyEmailLink(emailProof);
      else await cloudSync.verifyEmailCode(email, emailProof.trim());
      window.location.reload();
    } catch (error) { setSyncMessage(error instanceof Error ? error.message : 'Could not verify email.'); }
  }

  return <div className="module-view settings-view"><div className="module-header"><div><p className="eyebrow">WORKSPACE</p><h1>Settings</h1><p>Appearance, secure AI providers, and synchronization.</p></div></div>
    <section className="settings-section"><div className="settings-copy"><div className="settings-icon"><Sun size={18} /></div><div><h2>Appearance</h2><p>Follow your device or keep a manual theme across sessions.</p></div></div><div className="theme-setting"><button className={followsSystem ? 'active' : ''} onClick={useSystemTheme}><Laptop size={15} /> System</button><button className={!followsSystem && theme === 'light' ? 'active' : ''} onClick={() => chooseTheme('light')}><Sun size={15} /> Light</button><button className={!followsSystem && theme === 'dark' ? 'active' : ''} onClick={() => chooseTheme('dark')}><Moon size={15} /> Dark</button></div></section>
    <section className="settings-section column"><div className="settings-copy"><div className="settings-icon purple"><KeyRound size={18} /></div><div><h2>AI provider</h2><p>Choose Codex for ChatGPT sign-in, or use another provider with an API key.</p></div></div><div className="provider-list">{providers.map((provider) => <button className={active === provider.id ? 'active' : ''} onClick={() => choose(provider.id)} key={provider.id}><span className="provider-logo">{provider.name[0]}</span><span><strong>{provider.name}</strong><small>{provider.id === 'codex' ? active !== 'codex' ? 'ChatGPT account' : checking ? 'Checking this computer…' : status?.codex ? 'Connected on this computer' : status?.codexInstalled ? 'Connect your ChatGPT account' : 'Install Codex first' : localKeys[provider.id] ? 'Saved on this device' : status?.[provider.id] ? 'Configured by server' : 'Not configured'}</small></span><i className={localKeys[provider.id] || (provider.id !== 'codex' || active === 'codex') && status?.[provider.id] ? 'connected' : ''}>{active === provider.id ? <Check size={14} /> : checking ? <RefreshCw size={13} /> : null}</i></button>)}</div>
      {active === 'codex' && <div className="codex-sign-in">
        <p>{checking ? 'Comprobando Codex…' : status?.codex ? 'Tu cuenta de ChatGPT está conectada a Codex en este ordenador.' : status?.codexInstalled ? 'Conecta tu cuenta de ChatGPT para usar Codex sin clave API.' : <>Instala <a href="https://learn.chatgpt.com/docs/codex/cli" target="_blank" rel="noopener noreferrer">Codex</a> en este ordenador y vuelve a abrir Ajustes.</>}</p>
        {!checking && status?.codexInstalled && codexLogin.status !== 'pending' && <button className="secondary-button" type="button" onClick={() => void connectCodex()}>{status?.codex ? 'Cambiar cuenta' : 'Conectar ChatGPT'}</button>}
        {codexLogin.status === 'pending' && codexLogin.verificationUrl && <p>Abre <a href={codexLogin.verificationUrl} target="_blank" rel="noopener noreferrer">ChatGPT</a> e introduce este código: <strong>{codexLogin.userCode}</strong></p>}
        {codexLogin.status === 'complete' && <p>Cuenta conectada.</p>}
        {codexLogin.status === 'failed' && <p>{codexLogin.message}</p>}
        <small>La conexión pertenece a este ordenador. Cada persona conecta su propia cuenta en su instalación de NoteHub.</small>
      </div>}
      {active !== 'codex' && <form className="provider-key-form" onSubmit={saveKey}><label htmlFor="provider-api-key">{providers.find((provider) => provider.id === active)?.name} API key</label><div><input id="provider-api-key" aria-label={`${providers.find((provider) => provider.id === active)?.name} API key`} type="password" autoComplete="off" value={keyDraft} onChange={(event) => setKeyDraft(event.target.value)} placeholder={localKeys[active] ? 'Key saved — enter a new value to replace it' : 'Paste your API key'} /><button className="primary-button" type="submit" disabled={!keyDraft.trim()}><Save size={13} /> Save key</button>{localKeys[active] && <button className="secondary-button danger" type="button" onClick={() => void removeKey()}><Trash2 size={13} /> Remove</button>}</div><small>Stored only in this browser's encrypted IndexedDB vault. Sent to the NoteHub server over HTTPS only when you use AI; it is never added to workspace sync.</small>{keyMessage && <p>{keyMessage}</p>}</form>}
    </section>
    <section className="settings-section column"><div className="settings-copy"><div className="settings-icon purple"><ShieldCheck size={18} /></div><div><h2>AI permissions</h2><p>Read access is explicit. Writes always remain proposal-only regardless of these settings.</p></div></div><div className="permission-grid">{([
      ['readCurrentFile', 'Read current file'], ['searchFiles', 'Search other files'], ['readProjectContext', 'Read project memory'], ['inspectCalendar', 'Inspect calendar & tasks'], ['inspectGym', 'Inspect gym history'],
    ] as Array<[keyof AIPermissions, string]>).map(([key, label]) => <label key={key}><span>{label}</span><button className={permissions[key] ? 'enabled' : ''} onClick={() => togglePermission(key)} aria-pressed={permissions[key]}><i /></button></label>)}</div></section>
    <section className="settings-section sync-settings"><div className="settings-copy"><div className="settings-icon"><Cloud size={18} /></div><div><h2>Multi-device sync</h2><p>{syncStatus.connected ? `Signed in as ${syncStatus.email}. Changes sync live and offline operations remain queued.` : syncStatus.configured ? 'Sign in with the same email on every device to share the workspace.' : 'Local-first mode is active. Configure Supabase to enable real-time device sync.'}</p></div></div>
      {syncStatus.connected ? <button className="secondary-button" onClick={() => void cloudSync.signOut().then(() => setSyncStatus({ configured: true, connected: false }))}>Sign out</button> : syncStatus.configured ? <form onSubmit={codeSent ? verifyEmail : connect}><input type="email" required value={email} onChange={(event) => { setEmail(event.target.value); setCodeSent(false); }} placeholder="you@example.com" />{codeSent && <input type="text" autoComplete="one-time-code" required value={emailProof} onChange={(event) => setEmailProof(event.target.value)} placeholder="Paste email link or code" aria-label="Email link or code" />}<button className="primary-button">{codeSent ? 'Verify email' : 'Send sign-in email'}</button>{syncMessage && <small>{syncMessage}</small>}</form> : <div className="status-chip"><Server size={14} /> Local only</div>}
    </section>
  </div>;
}
