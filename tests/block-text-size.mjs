import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const server = spawn('npm', ['run', 'dev:web', '--', '--host', '127.0.0.1', '--port', '5187', '--strictPort'], { stdio: 'ignore' });
let browser;
// Text written before the size change carries sizes inside its own HTML, in
// every shape WebKit's editing, pasting and older content produce. All of it
// must follow the block's text size; only the S/M/L/XL menu scales it.
const body = 25;
const shapes = [
  ['plain', '<p>x</p>', body],
  ['span px', '<p><span style="font-size: 14px;">x</span></p>', body],
  ['block px', '<div style="font-size: 14px; line-height: 1.55;">x</div>', body],
  ['uppercase', '<div style="FONT-SIZE:14px">x</div>', body],
  ['keyword', '<span style="font-size: medium;">x</span>', body],
  ['font color + px', '<font color="#c0392b" style="font-size: 14px;">x</font>', body],
  ['font shorthand', '<p style="font: 14px / 20px Helvetica;">x</p>', body],
  ['font shorthand no space', '<p style="font:12px Helvetica">x</p>', body],
  ['nested px', '<span style="font-size: 14px;"><b style="font-size: 13px;">x</b></span>', body],
  ['pre', '<pre>x</pre>', body],
  ['code', '<p><code>x</code></p>', body],
  ['M', '<font size="3">x</font>', body],
  ['L', '<font size="4">x</font>', body * 1.125],
  ['XL inside frozen px', '<span style="font-size: 14px;"><font size="5">x</font></span>', body * 1.5],
  ['L with frozen px', '<font size="4" style="font-size: 14px;">x</font>', body * 1.125],
  ['paragraph inside heading', '<h2>t</h2><h2><p style="font-family: Inter; font-size: 14px;">x</p></h2>', body, 1],
  ['clean paragraph inside heading', '<h2><p>x</p></h2>', body],
];
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.route('**/api/**', (route) => route.fulfill({ json: { providers: {}, models: {} } }));
  for (let attempt = 0; ; attempt++) {
    try { await page.goto('http://127.0.0.1:5187'); break; }
    catch (error) { if (attempt >= 20) throw error; await new Promise((resolve) => setTimeout(resolve, 250)); }
  }
  await page.locator('.project-tile').first().waitFor();
  await page.evaluate(async (shapes) => {
    const { useWorkspace } = await import('/src/store/useWorkspace.ts');
    const { makeBlock } = await import('/src/lib/blockFactory.ts');
    const state = useWorkspace.getState(), note = state.notes.sensitivity;
    const blocks = [note.blocks.find((block) => block.isTitle), ...shapes.map(([name, html]) => ({ ...makeBlock('text', 0, 0), id: `shape-${name}`, content: html }))];
    useWorkspace.setState({ activeView: 'note', activeProjectId: note.projectId, activeNoteId: note.id, aiOpen: false, sidebarOpen: false, tool: 'select', notes: { ...state.notes, [note.id]: { ...note, blocks, strokes: [] } } });
  }, shapes);
  await page.locator('[data-block-id="shape-plain"] .rich-block').waitFor();
  const failures = [];
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(100);
    for (const [name, , expected, skip = 0] of shapes) {
      const size = await page.locator(`[data-block-id="shape-${name}"] .rich-block`).evaluate((block, skip) => {
        const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
        let text = walker.nextNode();
        for (let index = 0; index < skip; index++) text = walker.nextNode();
        return parseFloat(getComputedStyle(text.parentElement).fontSize);
      }, skip);
      if (Math.abs(size - expected) >= .05) failures.push(`${name} at ${width}px: ${size}px instead of ${expected}px`);
    }
  }
  assert.deepEqual(failures, []);
  console.log('block text size ok');
} finally {
  await browser?.close();
  server.kill();
}
