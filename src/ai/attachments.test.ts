import { describe, expect, it } from 'vitest';
import { attachmentContext, MAX_ATTACHMENT_BYTES, prepareAttachment } from './attachments';
import type { ChatAttachment } from '../types';

const attachment: ChatAttachment = { id: 'a', name: 'notes.pdf', mime: 'application/pdf', size: 100, text: 'Budget: 42', images: ['data:image/jpeg;base64,aGVsbG8='] };

describe('chat attachments', () => {
  it('reads text files as content instead of sending only their names', async () => {
    const result = await prepareAttachment({ name: 'notes.csv', type: 'text/csv', size: 10, text: async () => 'topic,value\nbudget,42' } as File);
    expect(result.text).toContain('budget,42');
    expect(result.images).toEqual([]);
  });
  it('rejects large and unsupported files without silently treating them as readable', async () => {
    await expect(prepareAttachment({ name: 'large.pdf', size: MAX_ATTACHMENT_BYTES + 1 } as File)).rejects.toThrow('8 MB');
    await expect(prepareAttachment({ name: 'archive.zip', type: 'application/zip', size: 10 } as File)).rejects.toThrow('no compatible');
  });
  it('supplies readable text and native image context for current and prior attachments', () => {
    const context = attachmentContext([{ id: 'message', role: 'user', content: 'Read it', createdAt: 1, attachments: [attachment] }]);
    expect(context[0].content).toContain('Budget: 42');
    expect(context[0].content).toContain('notes.pdf');
    expect(context[1]).toEqual({ id: 'a:page:1', type: 'image', content: attachment.images[0] });
  });
});
