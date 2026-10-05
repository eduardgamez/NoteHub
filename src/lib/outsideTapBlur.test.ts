import { afterEach, expect, it } from 'vitest';
import { watchOutsideTapBlur } from './outsideTapBlur';
let stop: (() => void) | undefined;
afterEach(() => { stop?.(); document.body.innerHTML = ''; });
const tap = (element: Element) => element.dispatchEvent(new Event('pointerdown', { bubbles: true }));
it('removes the caret when tapping outside the text box', () => {
  document.body.innerHTML = '<div id="block" contenteditable="true">Hola</div><div id="page"></div><textarea id="field"></textarea>';
  stop = watchOutsideTapBlur();
  const block = document.getElementById('block')!;
  block.focus();
  tap(block);
  expect(document.activeElement).toBe(block);
  tap(document.getElementById('page')!);
  expect(document.activeElement).not.toBe(block);
  const field = document.getElementById('field')!;
  field.focus();
  tap(document.body);
  expect(document.activeElement).not.toBe(field);
});
it('keeps the caret when tapping a button such as the formatting tools', () => {
  document.body.innerHTML = '<div id="block" contenteditable="true">Hola</div><button id="bold"><span id="icon"></span></button>';
  stop = watchOutsideTapBlur();
  const block = document.getElementById('block')!;
  block.focus();
  tap(document.getElementById('icon')!);
  expect(document.activeElement).toBe(block);
});
