import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const server = spawn('npm', ['run', 'preview', '--', '--host', '127.0.0.1'], { stdio: 'ignore' });
const errors = [];

try {
  await new Promise((resolve) => setTimeout(resolve, 1200));
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });

  await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
  await page.getByText('Sensitivity analysis', { exact: true }).first().waitFor();

  const initialBlocks = await page.locator('.canvas-block').count();
  await page.getByTitle('Text block').click();
  await page.locator('.canvas-block').nth(initialBlocks).waitFor();

  await page.getByPlaceholder('Ask about this project…').fill('The exam moved to Thursday the 24th');
  await page.getByLabel('Send').click();
  await page.getByText('Proposed changes', { exact: true }).waitFor();

  const mobile = await context.newPage();
  await mobile.setViewportSize({ width: 768, height: 1024 });
  await mobile.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
  await mobile.getByLabel('Toggle sidebar').waitFor();

  await browser.close();
  if (errors.length) throw new Error(`Browser errors:\n${errors.join('\n')}`);
  console.log('Smoke test passed: desktop editor, block creation, AI proposals, and tablet shell.');
} finally {
  server.kill('SIGTERM');
}
