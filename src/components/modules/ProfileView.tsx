import { useState } from 'react';
import { ChevronDown, Eye, EyeOff, FileText } from 'lucide-react';
import { profileQuestions } from '../../ai/personalProfile';
import { useWorkspace } from '../../store/useWorkspace';

function fitText(element: HTMLTextAreaElement, minHeight = 24) {
  element.style.height = '0px';
  element.style.height = `${Math.max(minHeight, element.scrollHeight + 2)}px`;
}

function maskText(value: string) { return value.replace(/[^\n]/g, '•'); }

export function ProfileView() {
  const profile = useWorkspace((state) => state.personalProfile);
  const setProfileField = useWorkspace((state) => state.setProfileField);
  const [isMasked, setIsMasked] = useState(true);

  function toggleMask() {
    const focused = document.activeElement;
    if (focused instanceof HTMLTextAreaElement && focused.closest('.profile-document')) focused.blur();
    setIsMasked((current) => !current);
  }

  return <main className="profile-view">
    <div className="profile-document">
      <header className="profile-heading"><div className="profile-icon"><FileText size={25} /></div><div className="profile-heading-copy"><h1>Memoria personal</h1><p>La IA podrá añadir información y consultarla libremente, y la tendrá en cuenta para contestar. Puedes añadirla manualmente o ya la irá recopilando la IA.</p></div><button type="button" className="profile-visibility" aria-label={isMasked ? 'Mostrar memoria personal' : 'Ocultar memoria personal'} title={isMasked ? 'Mostrar memoria' : 'Ocultar memoria'} aria-pressed={!isMasked} onClick={toggleMask}>{isMasked ? <EyeOff size={21} /> : <Eye size={21} />}</button></header>
      <div className="profile-questions">{profileQuestions.map(({ field, label }) => <details key={field} className="profile-prompt" open onToggle={(event) => { if (event.currentTarget.open && !isMasked) { const input = event.currentTarget.querySelector('textarea'); if (input) { fitText(input); input.focus(); } } }}><summary><span>{label}</span><ChevronDown size={15} /></summary>{isMasked ? <div className="profile-masked profile-masked-field" aria-hidden="true">{maskText(profile.answers[field] ?? '')}</div> : <textarea key={`${field}:${profile.answers[field] ?? ''}`} ref={(element) => { if (element && element.closest('details')?.open) fitText(element); }} rows={1} aria-label={label} defaultValue={profile.answers[field] ?? ''} onInput={(event) => fitText(event.currentTarget)} onBlur={(event) => { const value = event.target.value.trim(); if (value !== (profile.answers[field] ?? '')) setProfileField(field, value); }} />}</details>)}</div>
      {isMasked ? <div className="profile-free-space profile-masked" aria-label="Contenido oculto">{profile.notes ? maskText(profile.notes) : <span className="profile-empty-placeholder">Más información...</span>}</div> : <textarea className="profile-free-space" key={`notes:${profile.notes}`} ref={(element) => { if (element) fitText(element, 420); }} aria-label="Memoria libre" placeholder="Más información..." defaultValue={profile.notes} onInput={(event) => fitText(event.currentTarget, 420)} onBlur={(event) => { const value = event.target.value.trim(); if (value !== profile.notes) setProfileField('notes', value); }} />}
    </div>
  </main>;
}
