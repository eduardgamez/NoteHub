import type { Model } from '@google/genai';

export interface GeminiModelOption { id: string; label: string; profile: 'fast' | 'reasoning' }

function versionOf(id: string): [number, number] {
  const match = id.match(/^gemini-(\d+)(?:\.(\d+))?/);
  return [Number(match?.[1] ?? 0), Number(match?.[2] ?? 0)];
}

function newestFirst(a: Model, b: Model) {
  const left = versionOf(a.name?.replace(/^models\//, '') ?? '');
  const right = versionOf(b.name?.replace(/^models\//, '') ?? '');
  return right[0] - left[0] || right[1] - left[1] || Number(/preview/i.test(a.name ?? '')) - Number(/preview/i.test(b.name ?? ''));
}

export function selectGeminiModels(models: Model[]): GeminiModelOption[] {
  const usable = models.filter((model) => {
    const id = model.name?.replace(/^models\//, '') ?? '';
    if (!/^gemini-\d+(?:\.\d+)?-(?:flash|pro)/.test(id)) return false;
    if (/(?:image|audio|tts|live|embedding|robotics|computer-use|speech)/i.test(id)) return false;
    if (model.supportedActions?.length && !model.supportedActions.some((action) => /generateContent/i.test(action))) return false;
    return versionOf(id)[0] >= 3;
  }).sort(newestFirst);
  const unique = [...new Map(usable.map((model) => [model.name?.replace(/^models\//, '').replace(/-00\d$/, ''), model])).values()];
  const option = (model: Model, profile: GeminiModelOption['profile']): GeminiModelOption => {
    const id = model.name!.replace(/^models\//, '');
    return { id, label: model.displayName ?? id.replaceAll('-', ' '), profile };
  };
  const fast = unique.filter((model) => /flash/i.test(model.name ?? '')).slice(0, 2).map((model) => option(model, 'fast'));
  const reasoningCandidates = [...unique.filter((model) => /pro/i.test(model.name ?? '')), ...unique.filter((model) => !/pro/i.test(model.name ?? '') && model.thinking !== false)];
  const reasoning = reasoningCandidates.slice(0, 2).map((model) => option(model, 'reasoning'));
  return [...fast, ...reasoning];
}
