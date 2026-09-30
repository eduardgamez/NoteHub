import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
const server = spawn('npm', ['run', 'preview', '--', '--host', '127.0.0.1', '--port', '4187', '--strictPort'], { stdio: 'ignore' });
let browser;
try {
  const worker = readFileSync(new URL('../dist/sw.js', import.meta.url), 'utf8');
  let current = false;
  browser = await chromium.launch();
  const context = await browser.newContext();
  await context.route('**/sw.js', (route) => route.fulfill({ contentType: 'application/javascript', headers: { 'cache-control': 'no-store' }, body: current ? worker : worker.replace(/const CACHE = '[^']+';/, "const CACHE = 'notehub-shell-test-previous';") }));
  await context.route('**/api/**', (route) => route.fulfill({ json: { providers: {}, models: {} } }));
  const page = await context.newPage();
  for (let attempt = 0; ; attempt++) {
    try { await page.goto('http://127.0.0.1:4187'); break; }
    catch (error) { if (attempt >= 20) throw error; await new Promise((resolve) => setTimeout(resolve, 250)); }
  }
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await page.locator('.project-tile').first().waitFor();
  current = true;
  await page.evaluate(async () => (await navigator.serviceWorker.ready).update());
  await page.getByText('NoteHub update ready', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Update', exact: true }).click();
  await page.waitForFunction(async () => !(await caches.keys()).includes('notehub-shell-test-previous'));
  await page.locator('.project-tile').first().waitFor();
  assert.equal(await page.getByText('NoteHub update ready', { exact: true }).count(), 0);
  console.log('PWA update checks passed: new build detected, Update activates it, old shell cache removed.');
} finally {
  await browser?.close(); server.kill('SIGTERM');
}
