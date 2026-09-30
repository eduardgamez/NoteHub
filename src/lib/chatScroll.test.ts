import { afterEach, expect, it, vi } from 'vitest';
import { watchChatScroll } from './chatScroll';
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it('opens at the bottom, follows delayed rendering, and preserves a short background visit', () => {
  let resized = () => {};
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { resized = callback; }
    observe() {}
    disconnect() {}
  });
  let hidden = false;
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
  const thread = document.createElement('div');
  thread.innerHTML = '<div class="ai-thread-content"></div>';
  let height = 1000;
  let top = 0;
  Object.defineProperties(thread, {
    clientHeight: { get: () => 200 },
    scrollHeight: { get: () => height },
    scrollTop: { get: () => top, set: (value: number) => { top = Math.min(height - 200, value); } },
  });
  const stop = watchChatScroll(thread);
  expect(top).toBe(800);
  height = 1500; resized();
  expect(top).toBe(1300);
  thread.scrollTop = 400; thread.dispatchEvent(new Event('scroll'));
  height = 2000; resized();
  expect(top).toBe(400);
  hidden = true; document.dispatchEvent(new Event('visibilitychange'));
  height = 2500; resized();
  expect(top).toBe(400);
  thread.scrollTop = 0;
  hidden = false; document.dispatchEvent(new Event('visibilitychange'));
  expect(top).toBe(400);
  stop();
});
