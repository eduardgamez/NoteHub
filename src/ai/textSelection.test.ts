import { describe, expect, it } from 'vitest';
import { captureTextSelection } from './textSelection';

describe('selected text context', () => {
  it('keeps the exact excerpt and all intersected block ids', () => {
    const page = document.createElement('div');
    page.innerHTML = '<article class="canvas-block" data-block-id="first"><p>Primera frase.</p></article><article class="canvas-block" data-block-id="second"><p>Segunda frase.</p></article>';
    const first = page.querySelectorAll('p')[0].firstChild!;
    const second = page.querySelectorAll('p')[1].firstChild!;
    const range = document.createRange();
    range.setStart(first, 8);
    range.setEnd(second, 7);

    expect(captureTextSelection(range, 'note-1', page)).toEqual({ noteId: 'note-1', text: range.toString().trim(), blockIds: ['first', 'second'] });
  });

  it('ignores text outside the document', () => {
    const page = document.createElement('div');
    const elsewhere = document.createTextNode('Outside');
    const range = document.createRange();
    range.selectNodeContents(elsewhere);
    expect(captureTextSelection(range, 'note-1', page)).toBeNull();
  });
});
