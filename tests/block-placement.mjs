import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const server = spawn('npm', ['run', 'dev:web', '--', '--host', '127.0.0.1', '--port', '5184', '--strictPort'], { stdio: 'ignore' });
let browser;
try {
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await page.route('**/api/**', (route) => route.fulfill({ json: { providers: {}, models: {} } }));
  for (let attempt = 0; ; attempt++) {
    try { await page.goto('http://127.0.0.1:5184'); break; }
    catch (error) { if (attempt >= 20) throw error; await new Promise((resolve) => setTimeout(resolve, 250)); }
  }
  await page.locator('.project-tile').first().waitFor();
  await page.evaluate(async () => {
    const { useWorkspace } = await import('/src/store/useWorkspace.ts');
    const { makeBlock } = await import('/src/lib/blockFactory.ts');
    const state = useWorkspace.getState();
    const note = state.notes.sensitivity;
    const create = (id, type = 'text', group) => ({ ...makeBlock(type, 0, 0), id, layoutGroupId: group });
    useWorkspace.setState({ activeNoteId: note.id, activeProjectId: note.projectId, activeView: 'note', aiOpen: false, sidebarOpen: false, tool: 'select', selectedIds: [], activeBlockId: null, notes: { ...state.notes, [note.id]: { ...note, strokes: [], blocks: [note.blocks.find((block) => block.isTitle), create('source'), create('drawing', 'drawing'), create('neighbour', 'text', 'source'), create('last')] } } });
  });
  const drawing = page.locator('[data-block-id="drawing"]');
  const source = page.locator('[data-block-id="source"]');
  await source.hover();
  const handle = await source.getByRole('button', { name: 'Move block', exact: true }).boundingBox();
  const target = await drawing.boundingBox();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width - 8, target.y + target.height / 2, { steps: 15 });
  await page.locator('[data-block-id="drawing"].drop-right').waitFor();
  await page.mouse.up();
  await page.waitForFunction(() => document.querySelector('[data-block-id="source"]')?.closest('.document-block-row') === document.querySelector('[data-block-id="drawing"]')?.closest('.document-block-row'));
  const rowIds = await page.locator('.document-block-row').evaluateAll((rows) => rows.map((row) => [...row.querySelectorAll('[data-block-id]')].map((block) => block.dataset.blockId)));
  assert.deepEqual(rowIds.slice(1), [['neighbour'], ['drawing', 'source'], ['last']]);
  const halfWidth = (await drawing.boundingBox()).width;
  await page.evaluate(async () => {
    const { useWorkspace } = await import('/src/store/useWorkspace.ts');
    useWorkspace.setState({ selectedIds: ['source'] });
    useWorkspace.getState().removeSelectedBlocks();
  });
  await page.waitForFunction(() => document.querySelector('[data-block-id="drawing"]').getBoundingClientRect().width > 600);
  const width = await drawing.evaluate((element) => ({ block: element.getBoundingClientRect().width, row: element.closest('.document-block-row').getBoundingClientRect().width, columns: element.closest('.document-block-row').children.length }));
  assert.equal(width.columns, 1);
  assert.ok(Math.abs(width.block - width.row) < 2);
  assert.ok(width.block > halfWidth * 1.8);
  await page.evaluate(async () => {
    const { useWorkspace } = await import('/src/store/useWorkspace.ts');
    useWorkspace.getState().addStroke('sensitivity', { id: 'alignment-test', space: 'block', anchorBlockId: 'drawing', anchorOrigin: { x: 58, y: 58 }, color: '#000', width: 2, points: [{ x: 40, y: 50 }, { x: 80, y: 90 }], bounds: { x: 40, y: 50, width: 40, height: 40 } });
  });
  await page.evaluate(() => document.fonts.ready);
  const geometry = async () => page.evaluate(async () => {
    const { readDocumentLayout } = await import('/src/lib/documentInk.ts');
    const layout = readDocumentLayout(document.querySelector('.document-page'));
    for (const rect of Object.values(layout)) for (const key of Object.keys(rect)) rect[key] = Math.round(rect[key] * 100) / 100;
    return { layout, ink: [...document.querySelectorAll('.ink-layer path')].map((path) => path.getAttribute('d')?.replace(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/g, (number) => String(Math.round(Number(number) * 100) / 100))) };
  });
  const canonical = await geometry();
  for (const viewportWidth of [900, 600, 1440]) {
    await page.setViewportSize({ width: viewportWidth, height: 1100 });
    await page.waitForTimeout(100);
    const widths = await drawing.evaluate((element) => [element.getBoundingClientRect().width, element.closest('.document-block-row').getBoundingClientRect().width]);
    assert.ok(Math.abs(widths[0] - widths[1]) < 2);
    assert.deepEqual(await geometry(), canonical);
  }
  await page.evaluate(async () => {
    const { useWorkspace } = await import('/src/store/useWorkspace.ts');
    useWorkspace.getState().undo('sensitivity');
    useWorkspace.getState().undo('sensitivity');
  });
  await source.waitFor();
  assert.equal(await drawing.locator('xpath=../..').locator('.document-block-column').count(), 2);
  await page.evaluate(async () => {
    const { useWorkspace } = await import('/src/store/useWorkspace.ts');
    useWorkspace.getState().reorderBlock('sensitivity', 'last', 'drawing', true, true);
  });
  const three = await drawing.locator('xpath=../..').locator('.document-block-column').count();
  assert.equal(three, 3);
  const threeWidth = (await drawing.boundingBox()).width;
  await page.evaluate(async () => {
    const { useWorkspace } = await import('/src/store/useWorkspace.ts');
    useWorkspace.setState({ selectedIds: ['last'] });
    useWorkspace.getState().removeSelectedBlocks();
  });
  assert.ok((await drawing.boundingBox()).width > threeWidth);
  const multiColumnGeometry = await geometry();
  await page.setViewportSize({ width: 600, height: 1100 });
  await page.waitForTimeout(100);
  assert.deepEqual(await geometry(), multiColumnGeometry);
  console.log('Block placement browser checks passed: legacy rows, real drag, 3→2→1 column widths, stable document/ink geometry across screen sizes and undo.');
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
