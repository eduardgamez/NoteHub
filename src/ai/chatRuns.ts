import { create } from 'zustand';

export interface ChatRunError { threadId: string; message: string; settings?: boolean; quota?: boolean; retryContent?: string }
interface ChatRun { running: boolean; progress: string[]; error?: ChatRunError }
// Lives outside panels: navigating or closing a panel does not cancel its active request.
export const useChatRuns = create<{ runs: Record<string, ChatRun> }>(() => ({ runs: {} }));
export function startChatRun(threadId: string): boolean {
  if (useChatRuns.getState().runs[threadId]?.running) return false;
  useChatRuns.setState((state) => ({ runs: { ...state.runs, [threadId]: { running: true, progress: ['Preparando el contexto…'] } } }));
  return true;
}
export function chatProgress(threadId: string, message: string) {
  useChatRuns.setState((state) => {
    const run = state.runs[threadId];
    if (!run?.running || !message.trim() || run.progress.at(-1) === message.trim()) return state;
    return { runs: { ...state.runs, [threadId]: { ...run, progress: [...run.progress, message.trim().slice(0, 1000)].slice(-8) } } };
  });
}
export function setChatRunError(threadId: string, error?: ChatRunError) {
  useChatRuns.setState((state) => ({ runs: { ...state.runs, [threadId]: { ...(state.runs[threadId] ?? { running: false, progress: [] }), error } } }));
}
export function finishChatRun(threadId: string) {
  useChatRuns.setState((state) => ({ runs: { ...state.runs, [threadId]: { ...state.runs[threadId], running: false } } }));
}
