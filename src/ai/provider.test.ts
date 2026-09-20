import { describe, expect, it } from 'vitest';
import { LocalDemoProvider } from './provider';

describe('LocalDemoProvider', () => {
  it('queues reviewable changes instead of mutating workspace data', async () => {
    const provider = new LocalDemoProvider();
    const response = await provider.complete([{ role: 'user', content: 'The exam moved to Thursday the 24th' }], []);
    expect(response.proposals).toHaveLength(3);
    expect(response.proposals?.[0]).toMatchObject({ title: 'Update exam date' });
  });

  it('acknowledges selected canvas context', async () => {
    const provider = new LocalDemoProvider();
    const response = await provider.complete([{ role: 'user', content: 'Explain this' }], [{ id: 'a', type: 'text', content: 'Shadow price' }]);
    expect(response.text).toContain('1 selected block');
  });
});
