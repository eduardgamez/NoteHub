import { useRef, useState } from 'react';
import { ArrowUp, Check, ChevronDown, FileText, Globe2, Paperclip, Sparkles, X } from 'lucide-react';
import { aiProvider, type AIMessage, type ChangeProposal } from '../ai/provider';
import { useWorkspace } from '../store/useWorkspace';

const welcome: AIMessage = { role: 'assistant', content: 'Hi Eduard — I’m ready to help with this project. Select anything on the canvas to give me precise context.' };

export function AIPanel() {
  const [messages, setMessages] = useState<AIMessage[]>([welcome]);
  const [proposals, setProposals] = useState<ChangeProposal[]>([]);
  const [thinking, setThinking] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const selectedIds = useWorkspace((state) => state.selectedIds);
  const note = useWorkspace((state) => state.notes[state.activeNoteId]);
  const project = useWorkspace((state) => state.projects.find((item) => item.id === note.projectId));
  const setAiOpen = useWorkspace((state) => state.setAiOpen);
  const selectedBlocks = note.blocks.filter((block) => selectedIds.includes(block.id));

  async function send() {
    const content = inputRef.current?.value.trim();
    if (!content || thinking) return;
    if (inputRef.current) inputRef.current.value = '';
    const nextMessages: AIMessage[] = [...messages, { role: 'user', content }];
    setMessages(nextMessages);
    setThinking(true);
    const context = [
      ...selectedBlocks.map((block) => ({ id: block.id, type: block.type, content: block.content })),
      ...(project?.context.map((item) => ({ id: item.id, type: 'project-context', content: `${item.label}: ${item.value}` })) ?? []),
    ];
    const response = await aiProvider.complete(nextMessages, context);
    setMessages((current) => [...current, { role: 'assistant', content: response.text }]);
    if (response.proposals) setProposals((current) => [...current, ...response.proposals!]);
    setThinking(false);
  }

  function resolve(id: string) { setProposals((current) => current.filter((proposal) => proposal.id !== id)); }

  return <aside className="ai-panel">
    <div className="ai-header">
      <div><div className="ai-title"><Sparkles size={17} /> NoteHub AI <span>Beta</span></div><button className="context-picker">Current project <ChevronDown size={13} /></button></div>
      <button onClick={() => setAiOpen(false)} aria-label="Close AI panel"><X size={18} /></button>
    </div>

    <div className="ai-thread">
      <div className="context-card"><div><FileText size={16} /><span><strong>{note.title}</strong><small>{note.blocks.length} blocks · Current note</small></span></div><Check size={15} /></div>
      {!!project?.context.length && <div className="project-memory"><span>{project.emoji}</span><span>{project.context.length} project facts available to AI</span></div>}
      {selectedBlocks.length > 0 && <div className="selection-context"><Sparkles size={14} /><span>{selectedBlocks.length} selected block{selectedBlocks.length === 1 ? '' : 's'} attached</span></div>}
      {messages.map((message, index) => <div key={index} className={`message ${message.role}`}>
        {message.role === 'assistant' && <div className="ai-avatar"><Sparkles size={13} /></div>}
        <div>{message.content}</div>
      </div>)}
      {thinking && <div className="message assistant"><div className="ai-avatar"><Sparkles size={13} /></div><div className="typing"><i /><i /><i /></div></div>}
      {proposals.length > 0 && <div className="proposal-queue">
        <div className="proposal-heading"><span>Proposed changes</span><span>{proposals.length} pending</span></div>
        {proposals.slice(0, 1).map((proposal) => <div className="proposal" key={proposal.id}>
          <strong>{proposal.title}</strong><p>{proposal.description}</p>
          {proposal.before && <div className="diff-row removed">− {proposal.before}</div>}
          <div className="diff-row added">+ {proposal.after}</div>
          <div className="proposal-actions"><button onClick={() => resolve(proposal.id)}>Skip</button><button className="primary" onClick={() => resolve(proposal.id)}><Check size={14} /> Approve</button></div>
        </div>)}
        {proposals.length > 1 && <small>Next proposal will appear after you review this one.</small>}
      </div>}
    </div>

    <div className="ai-composer">
      <textarea ref={inputRef} rows={3} placeholder="Ask about this project…" onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); } }} />
      <div className="composer-actions">
        <div><button title="Attach"><Paperclip size={16} /></button><button title="Web access"><Globe2 size={16} /></button></div>
        <button className="send-button" onClick={() => void send()} aria-label="Send"><ArrowUp size={17} /></button>
      </div>
      <small>AI can make mistakes. Changes always require approval.</small>
    </div>
  </aside>;
}
