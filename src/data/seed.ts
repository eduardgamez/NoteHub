import type { WorkspaceStateData } from '../types';

export const seedWorkspace: WorkspaceStateData = {
  activeNoteId: 'sensitivity',
  projects: [
    {
      id: 'university', title: 'University', emoji: '🎓', context: [
        { id: 'professor', label: 'Professor', value: 'Dr. Elena Martín' },
        { id: 'next-exam', label: 'Next exam', value: 'Thursday, 24 September' },
        { id: 'focus', label: 'Current focus', value: 'Sensitivity analysis · Chapter 4' },
      ],
    },
    { id: 'gym', title: 'Gym', emoji: '◒', context: [{ id: 'split', label: 'Current split', value: 'Upper / Lower · 4 days' }] },
    { id: 'personal', title: 'Personal', emoji: '⌂', context: [] },
  ],
  notes: {
    sensitivity: {
      id: 'sensitivity', title: 'Sensitivity analysis', emoji: '◇', projectId: 'university', updatedAt: Date.now(), strokes: [],
      blocks: [
        {
          id: 'intro', type: 'text', x: 110, y: 90, width: 460, height: 230,
          content: '<p class="eyebrow">INVESTIGATION OPERATIONS · WEEK 4</p><h1>Sensitivity analysis</h1><p>How much can the inputs of a linear program change before the optimal solution changes?</p><p><mark>Key idea:</mark> work with ranges, not a single answer.</p>',
        },
        {
          id: 'formula', type: 'text', x: 620, y: 120, width: 350, height: 185,
          content: '<h3>Shadow price</h3><p>The change in the objective value caused by a one-unit increase in a constraint’s right-hand side.</p><p class="formula">ΔZ = yᵢ · Δbᵢ</p>',
        },
        {
          id: 'python', type: 'code', x: 145, y: 370, width: 510, height: 285, language: 'python',
          content: 'from scipy.optimize import linprog\n\nprofit = [-40, -30]\nresources = [[2, 1], [1, 1]]\ncapacity = [100, 80]\n\nresult = linprog(profit, A_ub=resources, b_ub=capacity)\nprint(result.fun)',
        },
        {
          id: 'check', type: 'checklist', x: 710, y: 365, width: 330, height: 245,
          content: JSON.stringify([
            { id: 'c1', text: 'Review allowable increase', done: true },
            { id: 'c2', text: 'Solve exercise 4.3', done: false },
            { id: 'c3', text: 'Ask about reduced costs', done: false },
          ]),
        },
      ],
    },
    architecture: {
      id: 'architecture', title: 'Cache memory', emoji: '▦', projectId: 'university', updatedAt: Date.now() - 86400000, strokes: [],
      blocks: [{ id: 'cache-intro', type: 'text', x: 120, y: 100, width: 520, height: 260, content: '<p class="eyebrow">COMPUTER ARCHITECTURE</p><h1>Cache memory</h1><p>Temporal locality: recently accessed data is likely to be used again.</p><p>Spatial locality: nearby memory addresses are likely to be accessed soon.</p>' }],
    },
    workout: {
      id: 'workout', title: 'Upper A', emoji: '↗', projectId: 'gym', updatedAt: Date.now() - 7200000, strokes: [],
      blocks: [{ id: 'workout-table', type: 'text', x: 120, y: 100, width: 620, height: 330, content: '<p class="eyebrow">TODAY · 58 MIN</p><h1>Upper A</h1><table><tbody><tr><th>Exercise</th><th>Sets</th><th>Top set</th></tr><tr><td>Incline press</td><td>3</td><td>32 kg × 8</td></tr><tr><td>Chest-supported row</td><td>3</td><td>55 kg × 10</td></tr><tr><td>Lateral raise</td><td>4</td><td>10 kg × 12</td></tr></tbody></table>' }],
    },
    ideas: {
      id: 'ideas', title: 'Ideas & scraps', emoji: '✦', projectId: 'personal', updatedAt: Date.now() - 172800000, strokes: [],
      blocks: [{ id: 'ideas-text', type: 'text', x: 120, y: 100, width: 500, height: 220, content: '<p class="eyebrow">PERSONAL</p><h1>Ideas & scraps</h1><p>A quiet place for things that do not have a home yet.</p>' }],
    },
  },
};
