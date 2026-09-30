import { validProfileUpdates } from '../src/ai/personalProfile';
import { recoverResponseText } from '../src/ai/responseText';

export function parseModelResponse(raw: string) {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    const parsed = JSON.parse(cleaned);
    return { text: typeof parsed.text === 'string' ? parsed.text : cleaned, proposals: Array.isArray(parsed.proposals) ? parsed.proposals : [], profileUpdates: validProfileUpdates(parsed.profileUpdates), readFiles: Array.isArray(parsed.readFiles) ? parsed.readFiles.filter((id: unknown): id is string => typeof id === 'string') : [], readBlocks: Array.isArray(parsed.readBlocks) ? parsed.readBlocks.filter((id: unknown): id is string => typeof id === 'string') : [], readInk: Array.isArray(parsed.readInk) ? parsed.readInk.filter((id: unknown): id is string => typeof id === 'string') : [], readWorkspace: Array.isArray(parsed.readWorkspace) ? parsed.readWorkspace.filter((name: unknown): name is 'calendar' | 'tasks' | 'gym' | 'context' | 'profile' => name === 'calendar' || name === 'tasks' || name === 'gym' || name === 'context' || name === 'profile') : [], searchWeb: parsed.searchWeb === true };
  } catch {
    return { text: recoverResponseText(cleaned) ?? raw, proposals: [] };
  }
}
