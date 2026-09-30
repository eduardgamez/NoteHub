import { afterEach, expect, it, vi } from 'vitest';
import { apiUrl } from './bridge';
afterEach(() => { localStorage.removeItem('notehub-api-origin'); vi.unstubAllEnvs(); });
it('uses the configured AI server in the browser', () => {
  localStorage.setItem('notehub-api-origin', 'https://api.example.com/');
  expect(apiUrl('/api/ai/complete')).toBe('https://api.example.com/api/ai/complete');
});
it('uses the build-time AI server on the web', () => {
  vi.stubEnv('VITE_API_ORIGIN', 'https://api.example.com');
  expect(apiUrl('/api/ai/status')).toBe('https://api.example.com/api/ai/status');
});
it('retains the local development proxy when no server is configured', () => {
  vi.stubEnv('VITE_API_ORIGIN', '');
  expect(apiUrl('/api/ai/status')).toBe('/api/ai/status');
});
