import type { Note } from '../types';

function textOf(html: string) {
  const element = document.createElement('div');
  element.innerHTML = html;
  return (element.innerText ?? element.textContent ?? '').replace(/\s+/g, ' ').trim();
}

export function titleFromBlock(content: string) {
  return textOf(content) || 'Untitled';
}

export function ensureTitleBlock(note: Note): Note {
  if (note.blocks.some((block) => block.isTitle)) return note;
  const blocks = [...note.blocks];
  let content = `<h1>${note.title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</h1>`;
  const matchingIndex = blocks.findIndex((block) => block.type === 'text' && [...block.content.matchAll(/<h1\b[^>]*>[\s\S]*?<\/h1>/gi)].some(([heading]) => textOf(heading) === note.title));
  if (matchingIndex >= 0) {
    const original = blocks[matchingIndex];
    const heading = [...original.content.matchAll(/<h1\b[^>]*>[\s\S]*?<\/h1>/gi)].find(([value]) => textOf(value) === note.title)?.[0];
    if (heading) {
      content = heading;
      const remaining = original.content.replace(heading, '');
      if (remaining.trim() || note.strokes.some((stroke) => stroke.anchorBlockId === original.id)) blocks[matchingIndex] = { ...original, content: remaining };
      else blocks.splice(matchingIndex, 1);
    }
  }
  return { ...note, blocks: [{ id: `note-title-${note.id}`, type: 'text', isTitle: true, x: 0, y: 0, width: 600, height: 70, content }, ...blocks] };
}
