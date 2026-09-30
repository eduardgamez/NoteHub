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
    const data = { ...seedWorkspace, calendarEvents: [{ id: 'exam', title: 'Exam', start: '2026-10-01T09:00:00Z', end: '2026-10-01T10:00:00Z', color: 'green' as const }] };
    const calendar = readWorkspaceSection(data, 'calendar', 'exam');
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


describe('complete calendar access in every chat', () => {
  const data = structuredClone(seedWorkspace);
  data.calendarEvents = Array.from({ length: 75 }, (_, index) => ({ id: `event-${index}`, title: index === 0 ? 'Exam' : `Meeting ${index}`, start: '2026-10-01T09:00:00Z', end: '2026-10-01T10:00:00Z', color: 'green' as const, projectId: index % 2 ? 'other-project' : undefined, notes: 'Notas del evento', checklist: [{ id: 'item', text: 'Traer apuntes', done: false }] }));
  data.tasks = Array.from({ length: 75 }, (_, index) => ({ id: `task-${index}`, title: index === 0 ? 'Exam reminder' : `Reminder ${index}`, done: index % 2 === 0, reminder: true, projectId: 'other-project', due: index % 2 ? undefined : '2000-10-01T08:00:00Z', checklist: [] }));

  it('returns all events and reminders without project, match or 40-item filtering', () => {
    const calendar = readWorkspaceSection(data, 'calendar', 'Exam', { projectId: 'university' });
    expect(calendar.filter((item) => item.type === 'calendar-event')).toHaveLength(75);
    expect(calendar.filter((item) => item.type === 'task')).toHaveLength(75);
    expect(calendar.find((item) => item.id === 'event-74')?.content).toContain('Traer apuntes');
    expect(calendar.find((item) => item.id === 'task-74')?.content).toContain('Done');
    expect(readWorkspaceSection(data, 'calendar', 'Exam')).toEqual(calendar);
  });

  it('returns every reminder including undated and completed items when reading tasks', () => {
    expect(readWorkspaceSection(data, 'tasks', 'Exam', { projectId: 'university' })).toHaveLength(75);
  });

  it('still respects the calendar access setting', () => {
    const permissions = { readCurrentFile: true, searchFiles: true, readProjectContext: true, inspectCalendar: false, inspectGym: true };
    expect(readWorkspaceSection(data, 'calendar', 'Exam', { permissions }).every((item) => item.type === 'workspace-section')).toBe(true);
  });
});
