export function recoverResponseText(raw: string): string | null {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  if (!cleaned.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(cleaned);
    if (typeof parsed.text === 'string') return parsed.text;
  } catch { /* Recover the text field when LaTeX backslashes break JSON escaping. */ }
  const match = /"text"\s*:\s*"/.exec(cleaned);
  if (!match) return null;
  let result = '';
  for (let index = match.index + match[0].length; index < cleaned.length; index++) {
    const char = cleaned[index];
    if (char === '"') return result;
    if (char !== '\\') { result += char; continue; }
    const next = cleaned[++index];
    if (next === undefined) break;
    if (next === 'n') result += '\n';
    else if (next === 'r') result += '\r';
    else if (next === 't') result += '\t';
    else if (next === '"' || next === '\\' || next === '/') result += next;
    else result += `\\${next}`;
  }
  return null;
}
