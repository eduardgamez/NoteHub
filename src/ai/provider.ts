export interface AIContextItem { id: string; type: string; content: string }
export interface AIMessage { role: 'user' | 'assistant'; content: string }
export interface AIResponse { text: string; proposals?: ChangeProposal[] }
export interface ChangeProposal {
  id: string;
  title: string;
  description: string;
  before?: string;
  after: string;
}

export interface AIProvider {
  id: string;
  name: string;
  complete(messages: AIMessage[], context: AIContextItem[]): Promise<AIResponse>;
}

export class LocalDemoProvider implements AIProvider {
  id = 'local-demo';
  name = 'NoteHub demo';

  async complete(messages: AIMessage[], context: AIContextItem[]): Promise<AIResponse> {
    const prompt = messages.at(-1)?.content ?? '';
    await new Promise((resolve) => window.setTimeout(resolve, 450));
    if (/exam|thursday|24th|sensitivity/i.test(prompt)) {
      return {
        text: 'I found three possible workspace updates. I’ll keep them queued and apply only what you approve.',
        proposals: [
          { id: crypto.randomUUID(), title: 'Update exam date', description: 'University → Investigation Operations context', before: 'Not set', after: 'Thursday, 24 September' },
          { id: crypto.randomUUID(), title: 'Update syllabus coverage', description: 'Add topic to exam scope', before: 'Chapters 1–3', after: 'Chapters 1–3 + sensitivity analysis' },
          { id: crypto.randomUUID(), title: 'Plan study session', description: 'Calendar · pending availability check', after: 'Wednesday · 2 hours' },
        ],
      };
    }
    const selectedCount = context.filter((item) => item.type !== 'project-context').length;
    if (selectedCount) return { text: `I’m looking at ${selectedCount} selected block${selectedCount === 1 ? '' : 's'}. The key idea is that sensitivity analysis describes how robust an optimum is when inputs change. Which step should we unpack?` };
    if (context.length) return { text: 'I have the current project memory available, including dates, course focus, and other facts. What would you like to work through?' };
    return { text: 'I can help across this project and turn requests into reviewable changes. Select a few blocks and choose “Ask AI” for focused context.' };
  }
}

// Add OpenAI, Anthropic, Gemini, or local adapters here without changing the UI.
export const aiProvider: AIProvider = new LocalDemoProvider();
