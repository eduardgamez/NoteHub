import { watchChatScroll } from '../lib/chatScroll';
import { deletionPreview } from '../ai/deletionProposal';
import { useChatRuns, startChatRun, chatProgress, setChatRunError, finishChatRun, type ChatRunError } from '../ai/chatRuns';
import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, CalendarDays, Check, ChevronDown, Clock3, Dumbbell, FileText, Lightbulb, Paperclip, Pencil, Plus, RotateCcw, Settings, Sparkles, Trash2, X } from 'lucide-react';
import { AIConfigurationError, AIQuotaError, AIUnavailableError, aiProvider, getActiveProvider, getCodexModels, getGeminiModels, getProviderStatus } from '../ai/provider';
import { ATTACHMENT_ACCEPT, MAX_ATTACHMENT_BYTES, attachmentContext, attachmentSize, prepareAttachment } from '../ai/attachments';
import { hasProviderKey } from '../ai/keyVault';
import { readWorkspaceBlocks, readWorkspaceFiles, readWorkspaceSection, renderWorkspaceBlockVisual, renderWorkspaceInk, workspaceFileMap } from '../ai/retrieval';
import { readDocumentLayout } from '../lib/documentInk';
import { useWorkspace } from '../store/useWorkspace';
import type { AIContextItem, AIMessage, AIResponse, CodexModelOption, GeminiModelOption } from '../ai/provider';
import type { ChatAttachment, ChatMessageRecord, ProfileUpdate, WorkspaceStateData } from '../types';
import { getAIPermissions } from '../ai/permissions';
import { getInkTranscript } from '../ai/inkTranscript';
import { profileDetails, profileSummary, validProfileUpdates } from '../ai/personalProfile';

interface AIChatProps { global?: boolean; compact?: boolean; home?: boolean }
const AIMessageContent = lazy(() => import('./AIMessageContent').then((module) => ({ default: module.AIMessageContent })));

function formatModelLabel(providerName: string, modelName: string) {
  if (/^gemini(?:[\s-]|$)/i.test(modelName)) {
    const name = modelName.replace(/^(?:gemini[\s-]+)+/i, '').replaceAll('-', ' ');
    return `Gemini ${name.replace(/\b[a-z]/g, (letter) => letter.toUpperCase())}`.trim();
  }
  if (/^(?:OpenAI|Anthropic)\s/i.test(modelName)) return modelName;
  return modelName.toLowerCase().startsWith(providerName.toLowerCase()) ? modelName : `${providerName} ${modelName}`.trim();
}

function effortLabel(effort: string) {
  return ({ minimal: 'Minimal', low: 'Low', medium: 'Medium', high: 'High', xhigh: 'Extra high', max: 'Max', ultra: 'Ultra' } as Record<string, string>)[effort] ?? effort;
}

function newChatMessage(role: ChatMessageRecord['role'], content: string, sources?: ChatMessageRecord['sources']): ChatMessageRecord {
  return { id: crypto.randomUUID(), role, content, sources, createdAt: Date.now() };
}

function cachedTranscripts(data: WorkspaceStateData, visuals: AIContextItem[]): AIContextItem[] {
  const transcripts: AIContextItem[] = [];
  for (const visual of visuals) {
    const regionId = visual.id.endsWith(':visual') ? `${visual.id.slice(0, -7)}:ink` : visual.id;
    const sourceNote = Object.values(data.notes).find((item) => regionId.startsWith(`${item.id}:`));
    if (!sourceNote) continue;
    const transcript = getInkTranscript(sourceNote, regionId);
    if (transcript) transcripts.push({ id: regionId, type: 'handwriting-transcript', content: transcript });
  }
  return transcripts;
}

export function AIChat({ global = false, compact = false, home = false }: AIChatProps) {
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<Record<string, ChatAttachment[]>>({});
  const [preparing, setPreparing] = useState(false);
  const [attachmentError, setAttachmentError] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const contextHelpRef = useRef<HTMLButtonElement>(null);
  const runs = useChatRuns((state) => state.runs);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [contextTipOpen, setContextTipOpen] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [modelOptions, setModelOptions] = useState<GeminiModelOption[]>([]);
  const [codexModels, setCodexModels] = useState<CodexModelOption[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [selectedCodexModel, setSelectedCodexModel] = useState('');
  const [selectedCodexEffort, setSelectedCodexEffort] = useState('');
  const [extendedReasoning, setExtendedReasoning] = useState(() => localStorage.getItem('notehub-gemini-extended-reasoning') === 'true');
  const [providerConnected, setProviderConnected] = useState<boolean | null>(null);
  const [modelName, setModelName] = useState('');
  const state = useWorkspace();
  const note = state.notes[state.activeNoteId] ?? Object.values(state.notes)[0];
  const project = state.projects.find((item) => item.id === state.activeProjectId) ?? state.projects.find((item) => item.id === note?.projectId);
  const scope = global ? 'global' : `project:${project?.id ?? 'unknown'}`;
  const sessions = Object.values(state.chatSessions).filter((item) => item.scope === scope).sort((a, b) => b.updatedAt - a.updatedAt);
  const threadId = state.chatSessions[state.activeChatIds[scope]]?.scope === scope ? state.activeChatIds[scope] : '';
  useEffect(() => {
    setHistoryOpen(false);
    setModelMenuOpen(false);
    if (inputRef.current) { inputRef.current.value = ''; inputRef.current.style.height = ''; }
  }, [scope, threadId]);
  const draftKey = `${scope}:${threadId}`;
  const draftAttachments = attachments[draftKey] ?? [];
  const session = state.chatSessions[threadId];
  const messages = state.chatThreads[threadId] ?? [];
  const lastAnswerIndex = messages.reduce((last, message, index) => message.role === 'assistant' ? index : last, -1);
  const unansweredCount = messages.length - lastAnswerIndex - 1;
  const pending = state.pendingProposals.filter((proposal) => proposal.threadId === threadId && proposal.status === 'pending');
  const run = runs[threadId];
  const thinking = run?.running ?? false;
  const error = run?.error;
  const setError = (value: ChatRunError | null) => setChatRunError(value?.threadId ?? threadId, value ?? undefined);
  const providerId = getActiveProvider();
  const providerName = { openai: 'OpenAI', anthropic: 'Anthropic', gemini: 'Gemini', codex: 'Codex' }[providerId];
  const currentModelLabel = providerId === 'codex' ? codexModels.find((item) => item.id === selectedCodexModel)?.label ?? modelName : formatModelLabel(providerName, providerId === 'gemini' ? selectedModel || modelName : modelName);
  const codexModel = codexModels.find((item) => item.id === selectedCodexModel);
  const codexEfforts = codexModel?.supportedReasoningEfforts ?? [];
  const codexEffort = codexEfforts.some((item) => item.reasoningEffort === selectedCodexEffort) ? selectedCodexEffort : codexModel?.defaultReasoningEffort || codexEfforts[0]?.reasoningEffort || '';
  const codexEffortText = codexEffort ? effortLabel(codexEffort) : '';
  const greeting = global
    ? 'Tell me anything, ask across your workspace, or describe something you want to change. I’ll keep every proposed action queued for review.'
    : `I can help with ${project?.title ?? 'this project'}, including its notes and contextual memory. Select blocks on the canvas for focused help.`;

  async function attachFiles(files: File[]) {
    if (!files.length || preparing) return;
    const key = draftKey;
    const existing = attachments[key] ?? [];
    if (existing.length + files.length > 6) { setAttachmentError('Puedes adjuntar hasta 6 archivos por mensaje.'); return; }
    setPreparing(true); setAttachmentError('');
    const ready = [...existing];
    const errors: string[] = [];
    for (const file of files) {
      try {
        const attachment = await prepareAttachment(file);
        if (attachmentSize([...ready, attachment]) > MAX_ATTACHMENT_BYTES) throw new Error('Los adjuntos preparados superan 8 MB. Envía menos archivos por mensaje.');
        ready.push(attachment);
      } catch (error) { errors.push(error instanceof Error ? error.message : `No se pudo leer ${file.name}.`); }
    }
    setAttachments((current) => ({ ...current, [key]: ready }));
    setAttachmentError(errors.join(' ')); setPreparing(false);
  }

  function resizeComposer() {
    const textarea = inputRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    const style = getComputedStyle(textarea);
    const maxHeight = parseFloat(style.lineHeight) * 3 + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight + 1 ? 'auto' : 'hidden';
  }

  useEffect(() => {
    let current = true;
    void Promise.all([providerId === 'codex' ? Promise.resolve(false) : hasProviderKey(providerId), getProviderStatus(providerId === 'codex')]).then(([local, server]) => { if (current) { setProviderConnected(local || Boolean(server?.[providerId])); setModelName(server?.models?.[providerId] ?? { openai: 'gpt-5-mini', anthropic: 'Claude Sonnet', gemini: 'Gemini Flash', codex: 'Codex' }[providerId]); } });
    return () => { current = false; };
  }, [providerId]);

  useEffect(() => {
    if (providerId !== 'codex') return;
    let current = true;
    void getCodexModels().then((options) => {
      if (!current) return;
      const visibleModels = options.filter((option) => {
        const tier = option.id.match(/^gpt-5\.6-(sol|luna)$/)?.[1];
        return !tier || !options.some((candidate) => candidate.id === `gpt-6-${tier}`);
      });
      setCodexModels(visibleModels);
      const saved = localStorage.getItem('notehub-codex-model');
      const selected = visibleModels.find((option) => option.id === saved) ?? visibleModels.find((option) => option.id === 'gpt-6-sol') ?? visibleModels.find((option) => option.default) ?? visibleModels[0];
      setSelectedCodexModel(selected?.id ?? '');
      setSelectedCodexEffort(selected ? localStorage.getItem(`notehub-codex-effort:${selected.id}`) ?? '' : '');
    }).catch(() => { if (current) setCodexModels([]); });
    return () => { current = false; };
  }, [providerId]);

  useEffect(() => {
    if (providerId !== 'gemini') return;
    let current = true;
    void getGeminiModels().then((options) => {
      if (!current) return;
      setModelOptions(options);
      const saved = localStorage.getItem('notehub-gemini-model');
      setSelectedModel(options.find((option) => option.id === saved)?.id ?? options.find((option) => option.profile === 'fast')?.id ?? options[0]?.id ?? '');
    }).catch(() => { if (current) setModelOptions([]); });
    return () => { current = false; };
  }, [providerId]);

  useEffect(() => {
    if (!historyOpen && !modelMenuOpen) return;
    const close = (event: PointerEvent) => { if (event.target instanceof Node && !toolbarRef.current?.contains(event.target)) { setHistoryOpen(false); setModelMenuOpen(false); } };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [historyOpen, modelMenuOpen]);

  useEffect(() => {
    if (!contextTipOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && contextHelpRef.current?.contains(event.target)) return;
      setContextTipOpen(false);
      contextHelpRef.current?.blur();
    };
    document.addEventListener('pointerdown', closeOutside, true);
    return () => document.removeEventListener('pointerdown', closeOutside, true);
  }, [contextTipOpen]);

  useLayoutEffect(() => {
    if (!modelMenuOpen || !modelMenuRef.current) return;
    const menu = modelMenuRef.current;
    const updateHeight = () => {
      const panel = menu.closest('.home-ai, .ai-panel');
      const bottom = Math.min(window.innerHeight, panel?.getBoundingClientRect().bottom ?? window.innerHeight);
      menu.style.maxHeight = `${Math.max(0, Math.min(390, bottom - menu.getBoundingClientRect().top - 12))}px`;
    };
    updateHeight();
    window.addEventListener('resize', updateHeight);
    document.addEventListener('scroll', updateHeight, true);
    return () => {
      window.removeEventListener('resize', updateHeight);
      document.removeEventListener('scroll', updateHeight, true);
    };
  }, [modelMenuOpen]);

  useLayoutEffect(() => {
    const thread = threadRef.current;
    if (thread) return watchChatScroll(thread);
  }, [scope, threadId]);

  const data = useMemo<WorkspaceStateData>(() => ({
    version: state.version, projects: state.projects, folders: state.folders, notes: state.notes, activeNoteId: state.activeNoteId,
    calendarEvents: state.calendarEvents, tasks: state.tasks, reminderTemplates: state.reminderTemplates, exercises: state.exercises,
    routines: state.routines, workouts: state.workouts, chatThreads: state.chatThreads, chatSessions: state.chatSessions, activeChatIds: state.activeChatIds, pendingProposals: state.pendingProposals, personalProfile: state.personalProfile,
  }), [state.version, state.projects, state.folders, state.notes, state.activeNoteId, state.calendarEvents, state.tasks, state.reminderTemplates, state.exercises, state.routines, state.workouts, state.chatThreads, state.chatSessions, state.activeChatIds, state.pendingProposals, state.personalProfile]);

  async function send(prefill?: string, retry = false) {
    const sendingMessages = useWorkspace.getState().chatThreads[threadId] ?? [];
    const content = (prefill ?? inputRef.current?.value ?? '').trim() || (!retry && draftAttachments.length ? 'Lee los archivos adjuntos.' : '');
    if (preparing) return;
    const greetingOnly = /^(?:hola+|hello|hi|hey|buenas|buenos d[ií]as|buenas tardes|buenas noches)[!¡?.\s]*$/i.test(content) && !state.aiTextSelection && !draftAttachments.length && !(retry && sendingMessages.at(-1)?.attachments?.length);
    if (!content || (threadId && useChatRuns.getState().runs[threadId]?.running)) return;
    const reuseLastMessage = retry && sendingMessages.at(-1)?.role === 'user' && sendingMessages.at(-1)?.content === content;
    if (!retry && inputRef.current) { inputRef.current.value = ''; resizeComposer(); }
    const sendingThreadId = threadId || state.createChatSession(scope);
    const profileAtSend = useWorkspace.getState().personalProfile;
    const priorProfileReadAt = useWorkspace.getState().chatSessions[sendingThreadId]?.profileReadAt;
    const profileChanged = priorProfileReadAt !== undefined && priorProfileReadAt !== profileAtSend.updatedAt;
    const personalSummary = profileChanged ? profileSummary(profileAtSend) : state.readProfileForChat(sendingThreadId);
    if (modelName) state.setChatSessionModel(sendingThreadId, currentModelLabel);
    setError(null);
    const userMessage = reuseLastMessage ? sendingMessages.at(-1)! : { ...newChatMessage('user', content), ...(draftAttachments.length ? { attachments: draftAttachments } : {}) };
    if (!retry) setAttachments((current) => ({ ...current, [draftKey]: [] }));
    if (!reuseLastMessage) state.appendChatMessage(sendingThreadId, userMessage);
    if (!startChatRun(sendingThreadId)) return;
    const progress = (message: string) => chatProgress(sendingThreadId, message);
    try {
      const conversation = (reuseLastMessage ? sendingMessages : [...sendingMessages, userMessage]).slice(-20);
      const permissions = getAIPermissions();
      const access = global ? { permissions } : { projectId: project?.id, currentNoteId: note?.id, selectedBlockIds: state.selectedIds, permissions };
      const context: AIContextItem[] = [
        ...attachmentContext(conversation),
        { id: 'personal-profile-summary', type: 'personal-profile-summary', content: personalSummary || '(empty profile)' },
        ...(!greetingOnly ? [{ id: 'personal-profile', type: 'personal-profile', content: profileDetails(profileAtSend) }] : []),
        ...(!greetingOnly ? [workspaceFileMap(data, access), ...(!global && note ? [{ id: note.id, type: 'current-file', content: `Open file: ${note.title}; project: ${project?.title ?? note.projectId}` }] : [])] : []),
      ];
      const page = document.querySelector<HTMLElement>('.document-page');
      const textSelection = !global && note && state.aiTextSelection?.noteId === note.id ? state.aiTextSelection : null;
      const selectedBlockIds = !global && note ? note.blocks.filter((block) => state.selectedIds.includes(block.id) || textSelection?.blockIds.includes(block.id)).map((block) => `${note.id}:${block.id}`) : [];
      if (textSelection) context.push({ id: 'selected-text', type: 'selected-text', content: `Exact selected text from file ${note.id}, blocks ${textSelection.blockIds.join(', ')}:\n${textSelection.text}` });
      if (!greetingOnly && selectedBlockIds.length) {
        const selectedAccess = { ...access, permissions: { ...permissions, readCurrentFile: true } };
        const selectedBlocks = readWorkspaceBlocks(data, selectedBlockIds, selectedAccess);
        const selectedVisuals = (await Promise.all(selectedBlockIds.map((id) => renderWorkspaceBlockVisual(data, id, selectedAccess, page ? readDocumentLayout(page) : undefined)))).filter((item): item is NonNullable<typeof item> => item !== null);
        context.push({ id: 'selected-blocks', type: 'selection', content: selectedBlockIds.join(', ') }, ...selectedBlocks, ...selectedVisuals, ...cachedTranscripts(data, selectedVisuals));
      }
      const history: AIMessage[] = conversation.map(({ role, content: messageContent }) => ({ role, content: messageContent }));
      const readIds = new Set<string>();
      const attemptedFileReads = new Set<string>();
      const readBlockIds = new Set<string>();
      const readInkIds = new Set<string>();
      const readWorkspaceSections = new Set<string>(greetingOnly ? [] : ['profile']);
      let readRecoveryAttempts = 0;
      const sourceLinks = new Map<string, { title: string; url: string }>();
      const profileUpdates: ProfileUpdate[] = [];
      let webEnabled = providerId !== 'gemini' && !greetingOnly;
      let response: AIResponse | undefined;
      for (let round = 0; round < 6; round++) {
        response = await aiProvider.complete(history, context, { global, web: webEnabled, model: providerId === 'gemini' ? selectedModel || undefined : providerId === 'codex' ? selectedCodexModel || undefined : undefined, thinking: providerId === 'gemini' ? extendedReasoning ? 'extended' : 'standard' : undefined, effort: providerId === 'codex' ? codexEffort || undefined : undefined, onProgress: progress });
        if (response.progress?.trim()) progress(response.progress);
        profileUpdates.splice(0, profileUpdates.length, ...validProfileUpdates(response.profileUpdates));
        response.sources?.forEach((source) => { if (/^https?:\/\//.test(source.url)) sourceLinks.set(source.url, source); });
        const searchRequested = providerId === 'gemini' && !greetingOnly && !webEnabled && response.searchWeb === true;
        if (searchRequested) webEnabled = true;
        const noteForRegion = (id: string) => Object.values(data.notes).find((item) => id.startsWith(`${item.id}:`))?.id;
        const requiresOutline = [...(response.readBlocks ?? []), ...(response.readInk ?? [])].map(noteForRegion).filter((id): id is string => typeof id === 'string' && !readIds.has(id));
        const requestedFiles = [...new Set([...(response.readFiles ?? []), ...requiresOutline])].filter((id) => !attemptedFileReads.has(id) && Boolean(data.notes[id]));
        const selectedRegions = new Set(selectedBlockIds.flatMap((id) => [id, `${id}:ink`]));
        const mayReadRegion = (id: string) => { const noteId = noteForRegion(id); return selectedRegions.has(id) || Boolean(noteId && readIds.has(noteId)); };
        const requestedBlocks = (response.readBlocks ?? []).filter((id) => !readBlockIds.has(id) && mayReadRegion(id));
        const requestedInk = (response.readInk ?? []).filter((id) => !readInkIds.has(id) && mayReadRegion(id));
        const requestedSections = (response.readWorkspace ?? []).filter((section) => !readWorkspaceSections.has(section));
        if (!requestedFiles.length && !requestedBlocks.length && !requestedInk.length && !requestedSections.length && !searchRequested) {
          if ((response.readFiles?.length || response.readBlocks?.length || response.readInk?.length || response.readWorkspace?.length) && !response.text?.trim()) {
            if (++readRecoveryAttempts > 2 || round === 5) throw new Error('La IA está repitiendo solicitudes de lectura. No ha completado la revisión; vuelve a intentarlo.');
            context.push({ id: `read-status-${round}`, type: 'tool-status', content: `No new content was read by this request. Sections already supplied: ${[...readWorkspaceSections].join(', ')}. File outlines already supplied: ${[...readIds].join(', ')}. Block contents already supplied: ${[...readBlockIds].join(', ')}. Inspect the context already provided instead of requesting it again. Any requested ID absent from the supplied accessible file map is unavailable; do not invent it. Now answer the user using the available evidence, noting any missing information, or request different accessible content if genuinely needed. Do not claim a complete review of unread content.` });
            continue;
          }
          break;
        }
        if (round === 5) throw new Error('The assistant needs more document sections to finish this request. Try narrowing the question.');
        const files = readWorkspaceFiles(data, requestedFiles, access);
        const workspaceSections = requestedSections.flatMap((section) => section === 'profile'
          ? [{ id: 'personal-profile', type: 'personal-profile', content: profileDetails(useWorkspace.getState().personalProfile) }]
          : readWorkspaceSection(data, section, content, access));
        const linkedInkBlocks = requestedInk.map((id) => id.endsWith(':ink') ? id.slice(0, -4) : '').filter((id) => Object.values(data.notes).some((item) => item.blocks.some((block) => `${item.id}:${block.id}` === id)));
        const contentBlockIds = [...new Set([...requestedBlocks, ...linkedInkBlocks])];
        const blocks = readWorkspaceBlocks(data, contentBlockIds, access);
        const blockVisuals = (await Promise.all(contentBlockIds.map((id) => renderWorkspaceBlockVisual(data, id, access, note?.blocks.some((block) => `${note.id}:${block.id}` === id) && page ? readDocumentLayout(page) : undefined)))).filter((item): item is NonNullable<typeof item> => item !== null);
        const ink = requestedInk.map((id) => renderWorkspaceInk(data, id, access)).filter((item): item is NonNullable<typeof item> => item !== null);
        if (!files.length && !workspaceSections.length && !blocks.length && !blockVisuals.length && !ink.length && !searchRequested) context.push({ id: `unavailable-read-${round}`, type: 'tool-status', content: 'The requested content is unavailable or access is disabled. Explain that limitation; use accessible context or request a different accessible section. Do not repeat this request or claim to have read it.' });
        const transcripts = cachedTranscripts(data, [...blockVisuals, ...ink.filter((item) => !linkedInkBlocks.includes(item.id.slice(0, -4)))]);
        requestedFiles.forEach((id) => attemptedFileReads.add(id));
        files.forEach((item) => readIds.add(item.id));
        blocks.forEach((item) => readBlockIds.add(item.id));
        requestedInk.forEach((id) => readInkIds.add(id));
        requestedSections.forEach((section) => readWorkspaceSections.add(section));
        context.push(...files, ...workspaceSections, ...blocks, ...blockVisuals, ...ink, ...transcripts);
        if (searchRequested) context.push({ id: 'web-search-ready', type: 'tool-status', content: 'Web search is now available. Use it if current public information is needed.' });
      }
      if (!response) throw new Error('The assistant could not respond.');
      const invalidDeletion = response.proposals?.some((proposal) => {
        if (proposal.kind !== 'calendar.delete' && proposal.kind !== 'task.delete') return false;
        const event = proposal.kind === 'calendar.delete';
        const id = event ? proposal.payload.eventId : proposal.payload.taskId;
        return typeof id !== 'string' || !context.some((item) => item.id === id && item.type === (event ? 'calendar-event' : 'task'));
      });
      if (invalidDeletion) throw new Error('La IA debe consultar el evento o recordatorio exacto antes de proponer su eliminación.');
      const uninspectedFileChange = response.proposals?.some((proposal) => {
        if (proposal.kind !== 'file.update' && proposal.kind !== 'file.block.create' && proposal.kind !== 'file.block.delete') return false;
        const noteId = proposal.payload.noteId;
        if (typeof noteId !== 'string' || !data.notes[noteId]) return true;
        if (proposal.kind === 'file.block.create') return !readIds.has(noteId) && !selectedBlockIds.some((id) => id.startsWith(`${noteId}:`));
        const blockId = proposal.payload.blockId;
        return typeof blockId !== 'string' || !data.notes[noteId].blocks.some((block) => block.id === blockId && (proposal.kind !== 'file.block.delete' || !block.isTitle)) || !readBlockIds.has(`${noteId}:${blockId}`) && !selectedBlockIds.includes(`${noteId}:${blockId}`);
      });
      if (uninspectedFileChange) throw new Error('The assistant must inspect the target document before proposing a change. Please try again.');
      const invalidNewFile = response.proposals?.some((proposal) => {
        if (proposal.kind !== 'file.create') return false;
        const { projectId, folderId, title, content: fileContent } = proposal.payload;
        return typeof projectId !== 'string' || projectId === 'gym' || !data.projects.some((item) => item.id === projectId) || typeof title !== 'string' || !title.trim() || typeof fileContent !== 'string' || (folderId !== undefined && !data.folders.some((item) => item.id === folderId && item.projectId === projectId));
      });
      if (invalidNewFile) throw new Error('The assistant could not choose a valid project or folder for the new document. Please try again.');
      if (useWorkspace.getState().chatSessions[sendingThreadId]) {
        if (profileChanged && !greetingOnly && useWorkspace.getState().personalProfile.updatedAt === profileAtSend.updatedAt) state.readProfileForChat(sendingThreadId);
        if (response.model) state.setChatSessionModel(sendingThreadId, providerId === 'codex' ? codexModels.find((item) => item.id === response.model)?.label ?? response.model : formatModelLabel(providerName, response.model));
        state.appendChatMessage(sendingThreadId, newChatMessage('assistant', response.text, [...sourceLinks.values()]));
        if (profileUpdates.length && useWorkspace.getState().personalProfile.updatedAt === profileAtSend.updatedAt) state.applyProfileUpdates(profileUpdates);
        if (response.proposals?.length) state.enqueueProposals(response.proposals.map((proposal) => {
          if (proposal.kind === 'calendar.delete' || proposal.kind === 'task.delete') {
            const event = proposal.kind === 'calendar.delete';
            const target = event ? data.calendarEvents.find((item) => item.id === proposal.payload.eventId) : data.tasks.find((item) => item.id === proposal.payload.taskId);
            const date = target && ('start' in target ? target.start : target.due);
            return { ...proposal, before: `${target?.title ?? ''}${date ? ` · ${new Date(date).toLocaleString()}` : ''}`, after: event ? 'Eliminar evento' : 'Eliminar recordatorio/tarea', payload: { ...proposal.payload, expected: JSON.stringify(target) }, id: crypto.randomUUID(), threadId: sendingThreadId, status: 'pending' as const, createdAt: Date.now() };
          }
          const block = proposal.kind === 'file.block.delete' ? data.notes[proposal.payload.noteId as string]?.blocks.find((item) => item.id === proposal.payload.blockId) : undefined;
          return { ...proposal, ...(block ? { before: block.type === 'image' ? `[Image] ${block.caption ?? ''}` : block.content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160) || `[${block.type} block]`, after: 'Block deleted' } : {}), id: crypto.randomUUID(), threadId: sendingThreadId, status: 'pending' as const, createdAt: Date.now() };
        }));
        if (textSelection && useWorkspace.getState().aiTextSelection === textSelection) state.setAiTextSelection(null);
      }
    } catch (caught) {
      if (useWorkspace.getState().chatSessions[sendingThreadId]) setError({ threadId: sendingThreadId, message: caught instanceof AIQuotaError ? 'Has alcanzado un límite de Gemini API. Prueba otro modelo o consulta tu cuota.' : caught instanceof AIConfigurationError ? 'This provider has no server-side API key yet. Open Settings to configure it securely.' : caught instanceof AIUnavailableError ? 'Gemini is busy right now. Please try again shortly.' : caught instanceof Error ? caught.message : 'The assistant could not respond.', settings: caught instanceof AIConfigurationError, quota: caught instanceof AIQuotaError, retryContent: content });
    } finally { finishChatRun(sendingThreadId); }
  }

  function removeUnanswered(messageId: string) {
    if (useChatRuns.getState().runs[threadId]?.running) return;
    if (state.removeUnansweredChatMessages(threadId, [messageId])) setError(null);
  }

  function retryMessage(messageId: string) {
    if (useChatRuns.getState().runs[threadId]?.running) return;
    const current = useWorkspace.getState().chatThreads[threadId] ?? [];
    const index = current.findIndex((message) => message.id === messageId);
    if (index < 0 || current[index].role !== 'user' || current.slice(index + 1).some((message) => message.role !== 'user')) return;
    const following = current.slice(index + 1).map((message) => message.id);
    if (following.length && !state.removeUnansweredChatMessages(threadId, following)) return;
    setError(null);
    void send(current[index].content, true);
  }

  function reviewChangedDeletion(proposalId: string) {
    const latest = useWorkspace.getState();
    const proposal = latest.pendingProposals.find((item) => item.id === proposalId && item.status === 'pending');
    if (!proposal || !['calendar.delete', 'task.delete'].includes(proposal.kind)) return;
    const target = proposal.kind === 'calendar.delete' ? latest.calendarEvents.find((item) => item.id === proposal.payload.eventId) : latest.tasks.find((item) => item.id === proposal.payload.taskId);
    if (!target) { latest.resolveProposal(proposalId, 'approved'); setError(null); return; }
    latest.updateProposal(proposalId, { before: deletionPreview(target), description: 'Datos actuales del elemento que se eliminará. Revisa el contenido y vuelve a aprobar si quieres borrarlo.', payload: { ...proposal.payload, expected: JSON.stringify(target) } });
    setError(null);
  }

  function modify(id: string, current: string) {
    const after = window.prompt('Edit the proposed result', current);
    if (after?.trim()) {
      const proposal = state.pendingProposals.find((item) => item.id === id);
      const payload = proposal ? { ...proposal.payload } : {};
      if (proposal?.kind === 'context.update') payload.value = after.trim();
      if (proposal?.kind === 'task.create' || proposal?.kind === 'calendar.create') payload.title = after.trim();
      if (proposal?.kind === 'file.update' || proposal?.kind === 'file.block.create' || proposal?.kind === 'file.create') payload.content = after.trim();
      state.updateProposal(id, { after: after.trim(), payload });
    }
  }

  const headerModel = providerId === 'codex' ? `${currentModelLabel}${codexEffortText ? ` · ${codexEffortText}` : ''}` : formatModelLabel(providerName, providerId === 'gemini' ? selectedModel || session?.model || modelName : session?.model || modelName);
  const canChooseModel = providerId === 'gemini' || providerId === 'codex';
  const titleContent = <><strong>{home ? 'AI · Quick Access' : 'AI'}</strong><span>· {headerModel || providerName}</span>{canChooseModel && !home && <ChevronDown size={12} aria-hidden="true" />}</>;
  const selectedCount = !global && note ? note.blocks.filter((block) => state.selectedIds.includes(block.id)).length : 0;
  const textSelection = !global && state.aiTextSelection?.noteId === note?.id ? state.aiTextSelection : null;
  const contextLabel = textSelection ? `Texto seleccionado · ${textSelection.blockIds.length} ${textSelection.blockIds.length === 1 ? 'bloque' : 'bloques'}` : selectedCount ? `${note.title} · ${selectedCount} selected block${selectedCount === 1 ? '' : 's'}` : state.activeView === 'note' ? note?.title ?? 'Document' : project?.title ?? 'Project';

  return <div className={`ai-chat ${compact ? 'compact' : ''} ${global && !compact ? 'global-chat' : ''}`} onDragOver={(event) => { if (event.dataTransfer.types.includes('Files')) event.preventDefault(); }} onDrop={(event) => { if (event.dataTransfer.files.length) { event.preventDefault(); void attachFiles(Array.from(event.dataTransfer.files)); } }}>
    {compact && <div className={`ai-chat-toolbar ${home ? 'home-chat-toolbar' : ''}`} ref={toolbarRef}>
      {home ? <div className="ai-chat-title"><strong>AI · Quick Access</strong>{canChooseModel ? <button type="button" className="ai-chat-model-trigger home-chat-model-trigger" title={headerModel} aria-label="Choose AI model" aria-expanded={modelMenuOpen} onClick={() => { setModelMenuOpen(!modelMenuOpen); setHistoryOpen(false); }}><span>· {headerModel || providerName}</span><ChevronDown size={12} aria-hidden="true" /></button> : <span>· {headerModel || providerName}</span>}</div> : canChooseModel ? <button type="button" className="ai-chat-title ai-chat-model-trigger" title={headerModel} aria-label="Choose AI model" aria-expanded={modelMenuOpen} onClick={() => { setModelMenuOpen(!modelMenuOpen); setHistoryOpen(false); }}>{titleContent}</button> : <div className="ai-chat-title">{titleContent}</div>}
        <div className="ai-chat-toolbar-actions">
        <button type="button" title="Chat history" aria-label="Chat history" aria-expanded={historyOpen} onClick={() => { setHistoryOpen(!historyOpen); setModelMenuOpen(false); }}><Clock3 size={17} /></button>
        <button type="button" title="New chat" aria-label="New chat" onClick={() => { if (!session || messages.length > 0) state.createChatSession(scope); state.setAiTextSelection(null); setHistoryOpen(false); setModelMenuOpen(false); setError(null); if (inputRef.current) { inputRef.current.value = ''; resizeComposer(); } inputRef.current?.focus(); }}><Plus size={18} /></button>
        {!home && <button type="button" className="ai-chat-close" title="Close AI panel" aria-label="Close AI panel" onClick={() => state.setAiOpen(false)}><X size={17} /></button>}
      </div>
      {modelMenuOpen && <div className="ai-model-menu" ref={modelMenuRef} role="dialog" aria-label="AI models">
        {providerId === 'codex' ? codexModels.length ? <>
          <div className="ai-model-group"><strong>Reasoning effort</strong>{codexEfforts.length ? codexEfforts.map((option) => <button type="button" key={option.reasoningEffort} className={option.reasoningEffort === codexEffort ? 'selected' : ''} title={option.description || undefined} onClick={() => { setSelectedCodexEffort(option.reasoningEffort); localStorage.setItem(`notehub-codex-effort:${selectedCodexModel}`, option.reasoningEffort); setModelMenuOpen(false); }}><span>{effortLabel(option.reasoningEffort)}</span>{option.reasoningEffort === codexEffort && <Check size={13} />}</button>) : <p>Default for this model</p>}</div>
          <div className="ai-model-group"><strong>Model</strong>{codexModels.map((option) => <button type="button" key={option.id} className={option.id === selectedCodexModel ? 'selected' : ''} onClick={() => { setSelectedCodexModel(option.id); setSelectedCodexEffort(localStorage.getItem(`notehub-codex-effort:${option.id}`) ?? ''); localStorage.setItem('notehub-codex-model', option.id); }}><span>{option.label}</span>{option.id === selectedCodexModel && <Check size={13} />}</button>)}</div>
        </> : <p>Models unavailable right now</p> : modelOptions.length === 0 ? <p>Models unavailable right now</p> : (['fast', 'reasoning'] as const).map((profile) => {
          const options = modelOptions.filter((option) => option.profile === profile);
          return options.length > 0 && <div className="ai-model-group" key={profile}><strong>{profile === 'fast' ? 'Fast' : 'Reasoning'}</strong>{options.map((option) => {
            const duplicate = modelOptions.some((other) => other.id === option.id && other.profile !== profile);
            const active = option.id === selectedModel && (!duplicate || extendedReasoning === (profile === 'reasoning'));
            return <button type="button" key={`${profile}:${option.id}`} className={active ? 'selected' : ''} onClick={() => { const extended = profile === 'reasoning'; setSelectedModel(option.id); setExtendedReasoning(extended); localStorage.setItem('notehub-gemini-model', option.id); localStorage.setItem('notehub-gemini-extended-reasoning', String(extended)); setModelMenuOpen(false); }}><span>{formatModelLabel(providerName, option.id)}{duplicate && profile === 'reasoning' ? ' · Extended' : ''}</span>{active && <Check size={13} />}</button>;
          })}</div>;
        })}
      </div>}
      {historyOpen && <div className="ai-chat-history" role="dialog" aria-label="Chat history">
        <strong>Previous chats</strong>
        {sessions.length === 0 ? <p>No chats yet</p> : sessions.map((item) => <div className={`ai-chat-history-row ${item.id === threadId ? 'active' : ''}`} key={item.id}>
          <button type="button" className="ai-chat-history-open" onClick={() => { state.selectChatSession(scope, item.id); setHistoryOpen(false); setError(null); }} title={item.title}>{item.title}</button>
          <button type="button" className="ai-chat-history-delete" aria-label={`Delete ${item.title}`} title="Delete chat" onClick={() => { if (window.confirm(`Delete “${item.title}”?`)) state.deleteChatSession(item.id); }}><Trash2 size={14} /></button>
        </div>)}
      </div>}
    </div>}
    {global && !compact && <div className="global-ai-intro"><div className="global-ai-mark"><Sparkles size={22} /></div><div><p className="eyebrow">NOTEHUB AI</p><h1>Your workspace inbox</h1><p>Ask a question or turn a thought into reviewed, structured actions.</p></div><span className="provider-pill">{getActiveProvider()}</span></div>}
    <div className="ai-thread" ref={threadRef}><div className="ai-thread-content">
      {compact && messages.length === 0 && providerConnected !== null && <div className="provider-empty">{providerConnected ? `Using ${currentModelLabel}${providerId === 'codex' && codexEffortText ? ` · ${codexEffortText}` : ''}` : 'No API connected'}</div>}
      {messages.length === 0 && !compact && <div className="message assistant"><div className="ai-avatar"><Sparkles size={13} /></div><div>{greeting}</div></div>}
      {messages.map((message, index) => <div key={message.id} className={`message ${message.role}${message.role === 'user' && index > lastAnswerIndex ? ' unanswered' : ''}`}>{message.role === 'user' && index > lastAnswerIndex && <div className="chat-message-actions">{unansweredCount > 1 && <button type="button" disabled={thinking} aria-label="Eliminar mensaje" title="Eliminar este mensaje" onClick={() => removeUnanswered(message.id)}><Trash2 size={14} /></button>}<button type="button" disabled={thinking} aria-label="Reintentar desde este mensaje" title="Reenviar hasta este mensaje y eliminar los posteriores" onClick={() => retryMessage(message.id)}><RotateCcw size={14} /></button></div>}{message.role === 'assistant' && !compact && <div className="ai-avatar"><Sparkles size={13} /></div>}<div className="message-body">{message.role === 'assistant' ? <Suspense fallback={null}><AIMessageContent content={message.content} /></Suspense> : <>{message.content}{message.attachments?.length ? <div className="chat-message-attachments">{message.attachments.map((attachment) => <div key={attachment.id}><Paperclip size={13} /><span>{attachment.name}</span>{attachment.images[0] && <img src={attachment.images[0]} alt={attachment.name} />}</div>)}</div> : null}</>}{message.sources && message.sources.length > 0 && <div className="message-sources">Sources: {message.sources.map((source, index) => <a key={`${source.url}:${index}`} href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a>)}</div>}</div></div>)}
      {thinking && <div className="message assistant">{!compact && <div className="ai-avatar"><Sparkles size={13} /></div>}<div className="chat-progress" role="status" aria-live="polite"><div className="typing"><i /><i /><i /></div>{run?.progress.at(-1) && <p>{run.progress.at(-1)}</p>}</div></div>}
      {error?.threadId === threadId && <div className="ai-error"><Settings size={16} /><span>{error.message}</span>{error.proposalId && <button onClick={() => reviewChangedDeletion(error.proposalId!)}>Revisar datos actuales</button>}{error.retryContent && !error.settings && <button onClick={() => void send(error.retryContent, true)}>Reintentar</button>}{error.settings && <button onClick={() => state.setActiveView('settings')}>Open settings</button>}{error.quota && <>{compact && <button onClick={() => setModelMenuOpen(true)}>Cambiar modelo</button>}<a href="https://ai.dev/rate-limit" target="_blank" rel="noopener noreferrer">Ver cuota</a></>}</div>}
      {pending.length > 0 && <div className="proposal-queue"><div className="proposal-heading"><span>First proposal</span><span>{pending.length} pending</span></div>
        <div className="proposal"><strong>{pending[0].title}</strong><p>{pending[0].description}</p>{pending[0].before && <div className="diff-row removed">− {pending[0].before}</div>}<div className="diff-row added">+ {pending[0].after}</div>
          <div className="proposal-actions"><button onClick={() => { state.resolveProposal(pending[0].id, 'rejected'); if (error?.proposalId === pending[0].id) setError(null); }}>Reject</button>{!['file.block.delete', 'calendar.delete', 'task.delete'].includes(pending[0].kind) && <button onClick={() => modify(pending[0].id, pending[0].after)}><Pencil size={13} /> Modify</button>}<button className="primary" onClick={() => { state.resolveProposal(pending[0].id, 'approved'); if (['calendar.delete', 'task.delete'].includes(pending[0].kind) && useWorkspace.getState().pendingProposals.find((item) => item.id === pending[0].id)?.status === 'pending') setError({ threadId, proposalId: pending[0].id, message: 'Este elemento cambió desde que la IA lo consultó. Revisa sus datos actuales antes de aprobar.' }); else if (error?.proposalId === pending[0].id) setError(null); }}><Check size={14} /> Approve</button></div>
        </div>{pending.length > 1 && <small>The next proposal appears after this one is reviewed. You can keep asking questions meanwhile.</small>}</div>}
      {global && messages.length === 0 && !compact && <div className="prompt-suggestions"><button onClick={() => void send('When is my next exam?')}><CalendarDays size={15} />When is my next exam?</button><button onClick={() => void send('What did I train last week?')}><Dumbbell size={15} />What did I train last week?</button><button onClick={() => void send('Summarize my recent university notes')}><FileText size={15} />Summarize recent notes</button></div>}
    </div></div>
    <div className="ai-composer-wrap">
      <input ref={attachmentInputRef} type="file" multiple accept={ATTACHMENT_ACCEPT} hidden aria-label="Archivos para el chat" onChange={(event) => { void attachFiles(Array.from(event.currentTarget.files ?? [])); event.currentTarget.value = ''; }} />
      {(draftAttachments.length > 0 || preparing || attachmentError) && <div className="chat-attachment-drafts">{draftAttachments.map((attachment) => <div className="chat-attachment-chip" key={attachment.id}>{attachment.images[0] ? <img src={attachment.images[0]} alt="" /> : <FileText size={15} />}<span title={attachment.name}>{attachment.name}</span><button type="button" aria-label={`Quitar ${attachment.name}`} disabled={preparing} onClick={() => setAttachments((current) => ({ ...current, [draftKey]: (current[draftKey] ?? []).filter((item) => item.id !== attachment.id) }))}><X size={13} /></button></div>)}{preparing && <small role="status">Preparando archivos…</small>}{attachmentError && <small role="alert">{attachmentError}</small>}</div>}
      {!global && <div className="ai-context-tag"><span className="ai-context-text" title={textSelection?.text ?? contextLabel}>{contextLabel}</span>{textSelection && <button type="button" className="ai-context-remove" aria-label="Quitar texto seleccionado del contexto" onClick={() => state.setAiTextSelection(null)}><X size={12} /></button>}<button ref={contextHelpRef} type="button" className="ai-context-help" aria-label="Ayuda para seleccionar bloques" aria-expanded={contextTipOpen} onClick={() => setContextTipOpen((open) => !open)} onBlur={() => setContextTipOpen(false)}><Lightbulb size={12} /></button><span className={`ai-context-tip ${contextTipOpen ? 'open' : ''}`} role="tooltip">Mayús + clic para seleccionar bloques</span></div>}<div className="ai-composer"><textarea ref={inputRef} rows={1} placeholder={global ? 'Ask or update anything...' : 'Ask about this project…'} onPaste={(event) => { const files = Array.from(event.clipboardData.files); if (files.length) { event.preventDefault(); void attachFiles(files); } }} onInput={resizeComposer} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); } }} /><div className="composer-actions"><button type="button" aria-label="Adjuntar archivos" title="Adjuntar imágenes, PDF, documentos o texto" disabled={preparing || thinking} onClick={() => attachmentInputRef.current?.click()}><Paperclip size={17} /></button><button disabled={preparing || thinking} className="send-button" onClick={() => void send()} aria-label="Send"><ArrowUp size={17} /></button></div></div></div>
  </div>;
}
