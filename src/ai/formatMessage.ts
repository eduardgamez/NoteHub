import { recoverResponseText } from './responseText';

function mathBody(value: string) { return value.trim().replace(/\\_/g, '_'); }

export function formatAssistantMessage(content: string): string {
  return (recoverResponseText(content) ?? content).split(/(```[\s\S]*?```)/g).map((part) => {
    if (part.startsWith('```')) return part;
    return part
      .replace(/\\\[\s*([\s\S]*?)\s*\\\]/g, (_match, formula: string) => `\n\n$$\n${mathBody(formula)}\n$$\n\n`)
      .replace(/^\[\s*\n([\s\S]*?)\n\s*\]$/gm, (match, formula: string) => /\\[a-zA-Z]|[=^_]/.test(formula) ? `$$\n${mathBody(formula)}\n$$` : match)
      .replace(/\\\(([\s\S]*?)\\\)/g, (_match, formula: string) => `$${mathBody(formula)}$`)
      .replace(/\(([^()\n]*\\[a-zA-Z][^()\n]*)\)/g, (_match, formula: string) => `$${mathBody(formula)}$`)
      .replace(/[ \t]+-\s+(?=\*\*[^*\n]+(?::\*\*|\*\*:))/g, '\n\n- ');
  }).join('');
}
