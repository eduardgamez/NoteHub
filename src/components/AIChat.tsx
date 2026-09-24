import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, CalendarDays, Check, Dumbbell, FileText, Pencil, Settings, Sparkles } from 'lucide-react';
import { AIConfigurationError, aiProvider, getActiveProvider, getProviderStatus } from '../ai/provider';
import { hasProviderKey } from '../ai/keyVault';
import { renderSelectedInk, retrieveWorkspaceContext } from '../ai/retrieval';
import { readDocumentLayout } from '../lib/documentInk';
import { useWorkspace } from '../store/useWorkspace';
import type { AIMessage } from '../ai/provider';
import type { WorkspaceStateData } from '../types';
import { getAIPermissions } from '../ai/permissions';

interface AIChatProps { global?: boolean; compact?: boolean }

export function AIChat({ global = false, compact = false }: AIChatProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState('');
  const [providerConnected, setProviderConnected] = useState<boolean | null>(null);
  const state = useWorkspace();
  const note = state.notes[state.activeNoteId];
  const project = state.projects.find((item) => item.id === note.projectId);
  const threadId = global ? 'global' : `project:${project?.id ?? 'unknown'}`;
  const messages = state.chatThreads[threadId] ?? [];
  const pending = state.pendingProposals.filter((proposal) => proposal.threadId === threadId && proposal.status === 'pending');
  const providerId = getActiveProvider();
  const providerName = { openai: 'OpenAI', anthropic: 'Anthropic', gemini: 'Gemini' }[providerId];
  const greeting = global
    ? 'Tell me anything, ask across your workspace, or describe something you want to change. I’ll keep every proposed action queued for review.'
    : `I can help with ${project?.title ?? 'this project'}, including its notes and contextual memory. Select blocks on the canvas for focused help.`;

  useEffect(() => {
    let current = true;
    void Promise.all([hasProviderKey(providerId), getProviderStatus()]).then(([local, server]) => { if (current) setProviderConnected(local || Boolean(server?.[providerId])); });
    return () => { current = false; };
  }, [providerId]);

  const data = useMemo<WorkspaceStateData>(() => ({
    version: state.version, projects: state.projects, folders: state.folders, notes: state.notes, activeNoteId: state.activeNoteId,
    calendarEvents: state.calendarEvents, tasks: state.tasks, reminderTemplates: state.reminderTemplates, exercises: state.exercises,
    routines: state.routines, workouts: state.workouts, chatThreads: state.chatThreads, pendingProposals: state.pendingProposals,
  }), [state.version, state.projects, state.folders, state.notes, state.activeNoteId, state.calendarEvents, state.tasks, state.reminderTemplates, state.exercises, state.routines, state.workouts, state.chatThreads, state.pendingProposals]);

  async function send(prefill?: string) {
    const content = (prefill ?? inputRef.current?.value ?? '').trim();
    if (!content || thinking) return;
    if (inputRef.current) inputRef.current.value = '';
    setError('');
    const userMessage = { id: crypto.randomUUID(), role: 'user' as const, content, createdAt: Date.now() };
    state.appendChatMessage(threadId, userMessage);
    setThinking(true);
    try {
      const permissions = getAIPermissions();
      const context = retrieveWorkspaceContext(content, data, { ...(global ? {} : { projectId: project?.id }), currentNoteId: note.id, selectedBlockIds: state.selectedIds, permissions });
      const page = document.querySelector<HTMLElement>('.document-page');
      const inkImage = renderSelectedInk(note, state.selectedIds, page ? readDocumentLayout(page) : undefined); if (inkImage) context.push(inkImage);
      const history: AIMessage[] = [...messages, userMessage].slice(-20).map(({ role, content: messageContent }) => ({ role, content: messageContent }));
      const response = await aiProvider.complete(history, context, { global, web: true });
      state.appendChatMessage(threadId, { id: crypto.randomUUID(), role: 'assistant', content: response.text, createdAt: Date.now() });
      if (response.proposals?.length) state.enqueueProposals(response.proposals.map((proposal) => ({ ...proposal, id: crypto.randomUUID(), threadId, status: 'pending' as const, createdAt: Date.now() })));
    } catch (caught) {
      setError(caught instanceof AIConfigurationError ? 'This provider has no server-side API key yet. Open Settings to configure it securely.' : caught instanceof Error ? caught.message : 'The assistant could not respond.');
    } finally { setThinking(false); }
  }

  function modify(id: string, current: string) {
    const after = window.prompt('Edit the proposed result', current);
    if (after?.trim()) {
      const proposal = state.pendingProposals.find((item) => item.id === id);
      const payload = proposal ? { ...proposal.payload } : {};
      if (proposal?.kind === 'context.update') payload.value = after.trim();
      if (proposal?.kind === 'task.create' || proposal?.kind === 'calendar.create') payload.title = after.trim();
      state.updateProposal(id, { after: after.trim(), payload });
    }
  }

  return <div className={`ai-chat ${compact ? 'compact' : ''} ${global && !compact ? 'global-chat' : ''}`}>
    {global && !compact && <div className="global-ai-intro"><div className="global-ai-mark"><Sparkles size={22} /></div><div><p className="eyebrow">NOTEHUB AI</p><h1>Your workspace inbox</h1><p>Ask a question or turn a thought into reviewed, structured actions.</p></div><span className="provider-pill">{getActiveProvider()}</span></div>}
    <div className="ai-thread">
      {compact && messages.length === 0 && providerConnected !== null && <div className="provider-empty">{providerConnected ? `API from ${providerName}` : 'No API connected'}</div>}
      {messages.length === 0 && !compact && <div className="message assistant"><div className="ai-avatar"><Sparkles size={13} /></div><div>{greeting}</div></div>}
      {messages.map((message) => <div key={message.id} className={`message ${message.role}`}>{message.role === 'assistant' && !compact && <div className="ai-avatar"><Sparkles size={13} /></div>}<div>{message.content}</div></div>)}
      {thinking && <div className="message assistant">{!compact && <div className="ai-avatar"><Sparkles size={13} /></div>}<div className="typing"><i /><i /><i /></div></div>}
      {error && <div className="ai-error"><Settings size={16} /><span>{error}</span><button onClick={() => state.setActiveView('settings')}>Open settings</button></div>}
      {pending.length > 0 && <div className="proposal-queue"><div className="proposal-heading"><span>First proposal</span><span>{pending.length} pending</span></div>
        <div className="proposal"><strong>{pending[0].title}</strong><p>{pending[0].description}</p>{pending[0].before && <div className="diff-row removed">− {pending[0].before}</div>}<div className="diff-row added">+ {pending[0].after}</div>
          <div className="proposal-actions"><button onClick={() => state.resolveProposal(pending[0].id, 'rejected')}>Reject</button><button onClick={() => modify(pending[0].id, pending[0].after)}><Pencil size={13} /> Modify</button><button className="primary" onClick={() => state.resolveProposal(pending[0].id, 'approved')}><Check size={14} /> Approve</button></div>
        </div>{pending.length > 1 && <small>The next proposal appears after this one is reviewed. You can keep asking questions meanwhile.</small>}</div>}
      {global && messages.length === 0 && !compact && <div className="prompt-suggestions"><button onClick={() => void send('When is my next exam?')}><CalendarDays size={15} />When is my next exam?</button><button onClick={() => void send('What did I train last week?')}><Dumbbell size={15} />What did I train last week?</button><button onClick={() => void send('Summarize my recent university notes')}><FileText size={15} />Summarize recent notes</button></div>}
    </div>
    <div className="ai-composer"><textarea ref={inputRef} rows={global ? 4 : 3} placeholder={global ? 'Ask anything or capture an update…' : 'Ask about this project…'} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); } }} /><div className="composer-actions"><button className="send-button" onClick={() => void send()} aria-label="Send"><ArrowUp size={17} /></button></div></div>
  </div>;
}
