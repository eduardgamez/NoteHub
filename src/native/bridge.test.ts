import { afterEach, expect, it, vi } from 'vitest';
import { apiUrl, nativeItems } from './bridge';
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
it('moves the old NoteHub deployment to the configured replacement', () => {
  localStorage.setItem('notehub-api-origin', 'https://notehub-ai-tcu9.onrender.com/');
  vi.stubEnv('VITE_API_ORIGIN', 'https://replacement.example.com');
  expect(apiUrl('/api/ai/complete')).toBe('https://replacement.example.com/api/ai/complete');
  expect(localStorage.getItem('notehub-api-origin')).toBe('https://replacement.example.com');
});

it('passes event end times to iOS so only events in progress are selected', () => {
  const start = '2026-10-01T10:00:00+02:00';
  const end = '2026-10-01T11:00:00+02:00';
  const items = nativeItems([], [{ id: 'class', title: 'Clase', start, end, color: 'green' }]);
  expect(items[0]).toMatchObject({ id: 'event:class', kind: 'event', due: new Date(start).getTime() / 1000, end: new Date(end).getTime() / 1000 });
});
