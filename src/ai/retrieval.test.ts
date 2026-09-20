import { describe, expect, it } from 'vitest';
import { seedWorkspace } from '../data/seed';
import { retrieveWorkspaceContext } from './retrieval';

describe('workspace retrieval', () => {
  it('retrieves relevant structured workout data for fitness questions', () => {
    const context = retrieveWorkspaceContext('Have I progressed in incline press?', seedWorkspace);
    expect(context.some((item) => item.type === 'workout' && item.content.includes('Incline dumbbell press'))).toBe(true);
  });

  it('always prioritizes selected blocks', () => {
    const context = retrieveWorkspaceContext('explain', seedWorkspace, { projectId: 'university', selectedBlockIds: ['formula'] });
    expect(context[0].id).toBe('sensitivity:formula');
  });
});
