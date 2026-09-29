import { describe, expect, it } from 'vitest';
import { seedWorkspace } from '../data/seed';
import { readWorkspaceBlocks, readWorkspaceFiles, readWorkspaceSection, retrieveWorkspaceContext, workspaceFileMap } from './retrieval';
import { saveInkTranscript } from './inkTranscript';

describe('workspace retrieval', () => {
  it('retrieves relevant structured workout data for fitness questions', () => {
    const context = retrieveWorkspaceContext('Have I progressed in incline press?', seedWorkspace);
    expect(context.some((item) => item.type === 'workout' && item.content.includes('Incline dumbbell press'))).toBe(true);
  });

  it('always prioritizes selected blocks', () => {
    const context = retrieveWorkspaceContext('explain', seedWorkspace, { projectId: 'university', selectedBlockIds: ['formula'] });
    expect(context[0].id).toBe('sensitivity:formula');
  });

  it('shows the complete hierarchy before selectively reading document sections', () => {
    const map = workspaceFileMap(seedWorkspace);
    expect(map.content).toContain('project university "University"');
    expect(map.content).toContain('folder io project=university');
    expect(map.content).toContain('file sensitivity project=university folder=io');
    expect(map.content).toContain('file workout project=gym');
    expect(map.content).not.toContain('Shadow price');

    const outline = readWorkspaceFiles(seedWorkspace, ['sensitivity']);
    expect(outline).toHaveLength(1);
    expect(outline[0].content).toContain('sensitivity:formula');
    expect(outline[0].content).not.toContain('print(result.fun)');

    const blocks = readWorkspaceBlocks(seedWorkspace, ['sensitivity:formula']);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].content).toContain('one-unit increase');
    expect(blocks[0].content).not.toContain('scipy.optimize');
  });

  it('reads non-file workspace sections only when requested', () => {
    const calendar = readWorkspaceSection(seedWorkspace, 'calendar', 'exam');
    expect(calendar.some((item) => item.type === 'calendar-event')).toBe(true);
    expect(calendar.every((item) => item.type !== 'note-text' && item.type !== 'file-outline')).toBe(true);
  });

  it('keeps other files inaccessible when file search is disabled', () => {
    const permissions = { readCurrentFile: true, searchFiles: false, readProjectContext: true, inspectCalendar: true, inspectGym: true };
    const options = { permissions, currentNoteId: 'sensitivity' };
    expect(workspaceFileMap(seedWorkspace, options).content).not.toContain('file architecture');
    expect(readWorkspaceFiles(seedWorkspace, ['architecture'], options)).toEqual([]);
    expect(readWorkspaceBlocks(seedWorkspace, ['architecture:cache-intro'], options)).toEqual([]);
    expect(readWorkspaceBlocks(seedWorkspace, ['sensitivity:formula'], options)).toHaveLength(1);
  });

  it('signals handwritten content in the map and the block outline', () => {
    const data = structuredClone(seedWorkspace);
    data.notes.sensitivity.strokes.push({ id: 'handwritten', color: '#222', width: 2, anchorBlockId: 'formula', space: 'block', points: [{ x: 5, y: 10 }, { x: 30, y: 10 }], bounds: { x: 5, y: 10, width: 25, height: 1 } });
    expect(workspaceFileMap(data).content).toContain('file sensitivity project=university folder=io blocks=4 ink=1');
    expect(readWorkspaceFiles(data, ['sensitivity'])[0].content).toContain('sensitivity:formula:ink type=drawing strokes=1');
    saveInkTranscript(data.notes.sensitivity, 'sensitivity:formula:ink', 'precio sombra');
    expect(readWorkspaceFiles(data, ['sensitivity'])[0].content).toContain('handwriting="precio sombra"');
    data.notes.sensitivity.strokes[0].points[1].x = 40;
    expect(readWorkspaceFiles(data, ['sensitivity'])[0].content).not.toContain('handwriting="precio sombra"');
  });
});
