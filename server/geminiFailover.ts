export function isGeminiUnavailable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { status?: unknown; code?: unknown; message?: unknown };
  return candidate.status === 503 || candidate.code === 503 ||
    (typeof candidate.message === 'string' && (/"code"\s*:\s*503/.test(candidate.message) || /503\s+UNAVAILABLE/i.test(candidate.message)));
}

export function isGeminiQuotaExceeded(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { status?: unknown; code?: unknown; message?: unknown };
  return candidate.status === 429 || candidate.code === 429 ||
    (typeof candidate.message === 'string' && (/"code"\s*:\s*429/.test(candidate.message) || /429\s+RESOURCE_EXHAUSTED/i.test(candidate.message)));
}

const wait = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export async function runGeminiWithFailover<T>(
  request: (model: string) => Promise<T>,
  primaryModel: string,
  pause: (milliseconds: number) => Promise<void> = wait,
  fallbackModels?: string[],
): Promise<{ value: T; model: string }> {
  const models = [primaryModel, ...(fallbackModels ?? (primaryModel === 'gemini-3.8-flash' ? ['gemini-3.7-flash'] : []))];
  let unavailable: unknown;
  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try { return { value: await request(model), model }; }
      catch (error) {
        if (!isGeminiUnavailable(error)) throw error;
        unavailable = error;
        if (attempt === 0) await pause(500 + Math.floor(Math.random() * 150));
      }
    }
  }
  throw unavailable;
}
