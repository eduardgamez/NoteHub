import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const server = spawn('npm', ['run', 'dev:web', '--', '--host', '127.0.0.1', '--port', '5185', '--strictPort'], { stdio: 'ignore' });
let browser;
try {
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  await page.route('**/api/**', (route) => route.fulfill({ json: { providers: {}, models: {} } }));
  for (let attempt = 0; ; attempt++) {
    try { await page.goto('http://127.0.0.1:5185'); break; }
    catch (error) { if (attempt >= 20) throw error; await new Promise((resolve) => setTimeout(resolve, 250)); }
  }
  await page.locator('.project-tile').first().waitFor();
  await page.evaluate(async () => {
    const { useWorkspace } = await import('/src/store/useWorkspace.ts');
    const state = useWorkspace.getState();
    const id = state.createChatSession('global');
    state.appendChatMessage(id, { id: 'mobile-user', role: 'user', content: 'Una pregunta larga '.repeat(12), createdAt: Date.now() });
    state.appendChatMessage(id, { id: 'mobile-assistant', role: 'assistant', content: 'Respuesta con texto largo: ' + 'palabra'.repeat(60) + '\n\n```python\n' + 'x'.repeat(120) + '\n```', createdAt: Date.now() });
  });
  for (const width of [320, 375, 430, 768]) {
    await page.setViewportSize({ width, height: 812 });
    await page.locator('.home-layout').evaluate((element) => { element.scrollTop = 0; });
    const bounds = await page.evaluate(() => {
      const rect = (selector) => { const r = document.querySelector(selector).getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; };
      return { ai: rect('.home-ai'), calendar: rect('.home-calendar'), projects: rect('.home-projects'), composer: rect('.home-ai .ai-composer'), send: rect('.home-ai .send-button'), messages: [...document.querySelectorAll('.home-ai .message')].map((el) => ({ left: el.getBoundingClientRect().left, right: el.getBoundingClientRect().right })), threadOverflow: document.querySelector('.home-ai .ai-thread').scrollWidth > document.querySelector('.home-ai .ai-thread').clientWidth + 1 };
    });
    assert.ok(bounds.ai.bottom <= bounds.calendar.top + 1);
    assert.ok(bounds.calendar.bottom <= bounds.projects.top + 1);
    for (const box of [bounds.ai, bounds.calendar, bounds.projects, bounds.composer, bounds.send, ...bounds.messages]) assert.ok(box.left >= -1 && box.right <= width + 1, `overflow at ${width}: ${JSON.stringify(box)}`);
    assert.equal(bounds.threadOverflow, false);
    for (const mode of ['week', 'day', 'month']) {
      await page.getByRole('button', { name: mode, exact: true }).click();
      const calendar = await page.locator(mode === 'month' ? '.month-calendar' : '.week-calendar').evaluate((element) => ({ width: element.getBoundingClientRect().width, viewport: window.innerWidth, overflow: element.scrollWidth > element.clientWidth + 1 }));
      assert.ok(calendar.width <= width);
      assert.equal(calendar.overflow, false, `${mode} overflows at ${width}`);
    }
  }
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole('button', { name: 'week', exact: true }).click();
  await page.locator('.home-layout').evaluate((element) => { element.scrollTop = 0; });
  await page.screenshot({ path: '/tmp/notehub-mobile-home.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  const desktop = await page.evaluate(() => ({ projects: document.querySelector('.home-projects').getBoundingClientRect().left, ai: document.querySelector('.home-ai').getBoundingClientRect().left }));
  assert.ok(desktop.projects < desktop.ai);
  console.log('Mobile home checks passed at 320, 375, 430 and 768px: section order, chat controls/messages, all calendar modes and desktop columns.');
} finally {
  await browser?.close(); server.kill('SIGTERM');
}
