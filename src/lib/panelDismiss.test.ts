import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { watchPanelDismiss } from './panelDismiss';
let stop: (() => void) | undefined;
let narrow = true;
beforeEach(() => { narrow = true; window.matchMedia = vi.fn(() => ({ matches: narrow })) as unknown as typeof window.matchMedia; });
afterEach(() => { stop?.(); document.body.innerHTML = ''; });
const tap = (element: Element) => element.dispatchEvent(new Event('pointerdown', { bubbles: true }));
const touch = (element: Element, type: string, x: number, y: number) => {
  const point = { clientX: x, clientY: y, target: element } as unknown as Touch;
  const event = new Event(type, { bubbles: true }) as TouchEvent;
  Object.defineProperty(event, 'touches', { value: type === 'touchend' ? [] : [point] });
  Object.defineProperty(event, 'changedTouches', { value: [point] });
  element.dispatchEvent(event);
};
const swipe = (element: Element, dx: number, dy = 0) => { touch(element, 'touchstart', 150, 300); touch(element, 'touchend', 150 + dx, 300 + dy); };
const layout = '<aside class="project-sidebar"><button id="doc">Doc</button></aside><section id="page"></section><aside class="ai-panel"><p id="chat">Hola</p></aside>';

it('closes the open panels when tapping outside them and swallows that tap', () => {
  document.body.innerHTML = layout;
  const close = vi.fn();
  stop = watchPanelDismiss(close);
  const page = document.getElementById('page')!;
  tap(page);
  expect(close.mock.calls.map(([panel]) => panel)).toEqual(['sidebar', 'ai']);
  const click = new MouseEvent('click', { bubbles: true, cancelable: true });
  page.dispatchEvent(click);
  expect(click.defaultPrevented).toBe(true);
});
it('keeps the panels open when tapping inside them or on wide screens', () => {
  document.body.innerHTML = layout;
  const close = vi.fn();
  stop = watchPanelDismiss(close);
  tap(document.getElementById('doc')!);
  tap(document.getElementById('chat')!);
  narrow = false;
  tap(document.getElementById('page')!);
  expect(close).not.toHaveBeenCalled();
});
it('closes a panel when swiping it toward its edge', () => {
  document.body.innerHTML = layout;
  const close = vi.fn();
  stop = watchPanelDismiss(close);
  swipe(document.getElementById('doc')!, 80);
  swipe(document.getElementById('chat')!, -80);
  swipe(document.getElementById('doc')!, -30);
  swipe(document.getElementById('doc')!, -80, 120);
  expect(close).not.toHaveBeenCalled();
  swipe(document.getElementById('doc')!, -80);
  swipe(document.getElementById('chat')!, 80);
  expect(close.mock.calls.map(([panel]) => panel)).toEqual(['sidebar', 'ai']);
});
