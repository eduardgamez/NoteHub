import { describe, expect, it, vi } from 'vitest';
import { isGeminiQuotaExceeded, isGeminiUnavailable, runGeminiWithFailover } from './geminiFailover';

describe('Gemini temporary outages', () => {
  it('recognizes the 503 response returned by the Gemini SDK', () => {
    expect(isGeminiUnavailable(new Error('{"error":{"code":503,"message":"High demand","status":"UNAVAILABLE"}}'))).toBe(true);
    expect(isGeminiUnavailable({ status: 503 })).toBe(true);
    expect(isGeminiUnavailable({ status: 403, message: 'Invalid API key' })).toBe(false);
  });

  it('recognizes API quota errors without treating them as a busy model', () => {
    const error = new Error('{"error":{"code":429,"status":"RESOURCE_EXHAUSTED"}}');
    expect(isGeminiQuotaExceeded(error)).toBe(true);
    expect(isGeminiUnavailable(error)).toBe(false);
  });

  it('retries 3.8 and reports 3.7 when fallback succeeds', async () => {
    const request = vi.fn(async (model: string) => {
      if (model === 'gemini-3.8-flash') throw { status: 503 };
      return 'answer';
    });
    const result = await runGeminiWithFailover(request, 'gemini-3.8-flash', async () => undefined);
    expect(result).toEqual({ value: 'answer', model: 'gemini-3.7-flash' });
    expect(request.mock.calls.map(([model]) => model)).toEqual(['gemini-3.8-flash', 'gemini-3.8-flash', 'gemini-3.7-flash']);
  });

  it('does not retry errors that require account or request changes', async () => {
    const request = vi.fn(async () => { throw { status: 403 }; });
    await expect(runGeminiWithFailover(request, 'gemini-3.8-flash', async () => undefined)).rejects.toEqual({ status: 403 });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('uses discovered alternatives when a newer model is busy', async () => {
    const request = vi.fn(async (model: string) => {
      if (model === 'gemini-4-flash') throw { status: 503 };
      return 'answer';
    });
    const result = await runGeminiWithFailover(request, 'gemini-4-flash', async () => undefined, ['gemini-3.8-flash']);
    expect(result).toEqual({ value: 'answer', model: 'gemini-3.8-flash' });
  });
});
