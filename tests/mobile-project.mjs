import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const server = spawn('npm', ['run', 'dev:web', '--', '--host', '127.0.0.1', '--port', '5186', '--strictPort'], { stdio: 'ignore' });
let browser;
try {
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.route('**/api/**', (route) => route.fulfill({ json: { providers: {}, models: {} } }));
  for (let attempt = 0; ; attempt++) {
    try { await page.goto('http://127.0.0.1:5186'); break; }
    catch (error) { if (attempt >= 20) throw error; await new Promise((resolve) => setTimeout(resolve, 250)); }
  }
  await page.locator('.project-tile').first().waitFor();
  await page.evaluate(async () => {
    const { useWorkspace } = await import('/src/store/useWorkspace.ts');
    const { makeBlock } = await import('/src/lib/blockFactory.ts');
    const state = useWorkspace.getState(), note = state.notes.sensitivity;
    const blocks = [note.blocks.find((block) => block.isTitle), { ...makeBlock('drawing', 0, 0), id: 'drawing' }, { ...makeBlock('text', 0, 0), id: 'text', content: '<p>Long content repeated to check stable line wrapping. '.repeat(6) + '</p>', layoutGroupId: 'drawing', layoutColumnId: 'right' }, { ...makeBlock('text', 0, 0), id: 'third' }];
    useWorkspace.setState({ activeView: 'note', activeProjectId: note.projectId, activeNoteId: note.id, aiOpen: false, sidebarOpen: false, tool: 'select', notes: { ...state.notes, [note.id]: { ...note, blocks, strokes: [{ id: 'original-ink', anchorBlockId: 'drawing', space: 'block', color: '#000', width: 2, points: [{ x: 40, y: 60 }, { x: 100, y: 90 }], bounds: { x: 40, y: 60, width: 60, height: 30 } }] } } });
    await document.fonts.ready;
  });
  const geometry = () => page.evaluate(async () => {
    const { readDocumentLayout } = await import('/src/lib/documentInk.ts');
    const layout = readDocumentLayout(document.querySelector('.document-page'));
    for (const rect of Object.values(layout)) for (const key of Object.keys(rect)) rect[key] = Math.round(rect[key] * 100) / 100;
    return { layout, ink: document.querySelector('.ink-layer path')?.getAttribute('d')?.replace(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/g, (number) => String(Math.round(Number(number) * 100) / 100)) };
  });
  const wide = await geometry();
  for (const width of [320, 375, 600, 800]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(100);
    const metrics = await page.locator('.document-viewport').evaluate((element) => ({ scroll: element.scrollWidth, width: element.clientWidth }));
    assert.ok(metrics.scroll <= metrics.width + 1, `two columns overflow at ${width}`);
    assert.deepEqual(await geometry(), wide);
    const toolbar = await page.locator('.canvas-toolbar').boundingBox();
    for (const label of ['Open project explorer', 'Open AI panel']) {
      const button = await page.getByRole('button', { name: label, exact: true }).boundingBox();
      assert.ok(button.y > toolbar.y + toolbar.height);
      assert.ok(button.y + button.height <= 900);
      assert.ok(button.y > 700);
    }
    await page.getByRole('button', { name: 'Open project explorer', exact: true }).click();
    await page.getByRole('button', { name: 'Close project explorer', exact: true }).waitFor({ state: 'visible' });
    await page.getByRole('button', { name: 'Open AI panel', exact: true }).click();
    assert.equal(await page.locator('.project-sidebar').count(), 0);
    await page.getByRole('button', { name: 'Open project explorer', exact: true }).click();
    assert.equal(await page.locator('.ai-panel').count(), 0);
    await page.getByRole('button', { name: 'Close project explorer', exact: true }).click();
  }
  // Ink entered while fitted must be stored in the same coordinates as desktop ink.
  await page.evaluate(async () => {
    const { useWorkspace } = await import('/src/store/useWorkspace.ts');
    useWorkspace.getState().setTool('ink');
  });
  const box = await page.locator('[data-block-id="drawing"]').boundingBox();
  const zoom = Number(await page.locator('.canvas-shell').getAttribute('data-document-scale'));
  await page.mouse.move(box.x + 20 * zoom, box.y + 30 * zoom);
  await page.mouse.down();
  await page.mouse.move(box.x + 60 * zoom, box.y + 80 * zoom, { steps: 5 });
  await page.mouse.up();
  const created = await page.evaluate(async () => (await import('/src/store/useWorkspace.ts')).useWorkspace.getState().notes.sensitivity.strokes.at(-1));
  assert.equal(created.anchorBlockId, 'drawing');
  assert.ok(Math.abs(created.points[0].x - 20) < .1);
  assert.ok(Math.abs(created.points[0].y - 30) < .1);
  await page.evaluate(async () => {
    const { useWorkspace } = await import('/src/store/useWorkspace.ts');
    useWorkspace.getState().setTool('select');
    useWorkspace.getState().reorderBlock('sensitivity', 'third', 'drawing', false, true);
  });
  await page.setViewportSize({ width: 375, height: 900 });
  await page.waitForTimeout(100);
  const scrolling = await page.locator('.document-viewport').evaluate((element) => element.scrollWidth > element.clientWidth + 1);
  assert.equal(scrolling, false);
  assert.ok(Number(await page.locator('.canvas-shell').getAttribute('data-document-scale')) < 1);
  const threeColumns = await geometry();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.waitForTimeout(100);
  assert.deepEqual(await geometry(), threeColumns);
  await page.evaluate(async () => {
    const { useWorkspace } = await import('/src/store/useWorkspace.ts');
    useWorkspace.setState({ selectedIds: ['third'] });
    useWorkspace.getState().removeSelectedBlocks();
  });
  await page.setViewportSize({ width: 375, height: 900 });
  await page.waitForTimeout(100);
  assert.ok(Number(await page.locator('.canvas-shell').getAttribute('data-document-scale')) < 1);
  const { third: removed, ...remainingLayout } = wide.layout;
  assert.deepEqual((await geometry()).layout, remainingLayout);
  await page.screenshot({ path: '/tmp/notehub-mobile-project.png' });
  await page.evaluate(async () => {
    const { useWorkspace } = await import('/src/store/useWorkspace.ts');
    const { makeBlock } = await import('/src/lib/blockFactory.ts');
    useWorkspace.getState().upsertBlock('sensitivity', { ...makeBlock('table', 0, 0), id: 'scaled-table', content: JSON.stringify([['A', 'B'], ['one', 'two']]), tableColumnWidths: [100, 100] });
  });
  const separator = page.locator('[data-block-id="scaled-table"]').getByRole('separator', { name: 'Resize column 1' }).first();
  await separator.scrollIntoViewIfNeeded();
  const resizeBox = await separator.boundingBox();
  const fittedScale = Number(await page.locator('.canvas-shell').getAttribute('data-document-scale'));
  await page.mouse.move(resizeBox.x + resizeBox.width / 2, resizeBox.y + resizeBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(resizeBox.x + resizeBox.width / 2 + 20 * fittedScale, resizeBox.y + resizeBox.height / 2, { steps: 5 });
  await page.mouse.up();
  const tableWidth = await page.evaluate(async () => (await import('/src/store/useWorkspace.ts')).useWorkspace.getState().notes.sensitivity.blocks.find((block) => block.id === 'scaled-table').tableColumnWidths[0]);
  assert.equal(tableWidth, 120);
  console.log('Mobile project checks passed: bottom controls, exclusive panels, closing explorer, fitted ink coordinates, stable layouts, fitted 2→3→2 column layouts and table resizing.');
} finally {
  await browser?.close(); server.kill('SIGTERM');
}
