import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const server = spawn('npm', ['run', 'preview', '--', '--host', '127.0.0.1'], { stdio: 'ignore' });
const api = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], { stdio: 'ignore' });
const errors = [];

try {
  await new Promise((resolve) => setTimeout(resolve, 1200));
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark' });
  const page = await context.newPage();
  await page.route('**/api/ai/status', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ providers: { openai: false, anthropic: false, gemini: false } }) }));
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error' && !message.text().includes('ERR_INTERNET_DISCONNECTED')) errors.push(`${message.text()} at ${message.location().url}`); });

  await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
  await page.getByText('Sensitivity analysis', { exact: true }).first().waitFor();
  if (await page.locator('html').getAttribute('data-theme') !== 'dark') throw new Error('System dark theme was not applied');

  await page.getByLabel('Use light theme').click();
  if (await page.locator('html').getAttribute('data-theme') !== 'light') throw new Error('Manual light theme was not applied');
  await page.reload({ waitUntil: 'networkidle' });
  if (await page.locator('html').getAttribute('data-theme') !== 'light') throw new Error('Manual theme did not persist');

  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('OpenAI API key').fill('e2e-key-that-is-never-sent');
  await page.getByRole('button', { name: 'Save key' }).click();
  await page.getByText('Key encrypted and saved on this device.', { exact: true }).waitFor();
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByText('Saved on this device', { exact: true }).waitFor();
  await page.getByText('Sensitivity analysis', { exact: true }).first().click();

  const initialBlocks = await page.locator('.canvas-block').count();
  await page.getByTitle('Text block').click();
  await page.locator('.canvas-block').nth(initialBlocks).waitFor();

  await page.getByRole('button', { name: 'Calendar' }).click();
  await page.locator('.week-calendar').waitFor();
  await page.getByRole('button', { name: 'Tasks & reminders' }).click();
  await page.getByText('Leaving for university', { exact: true }).first().waitFor();
  await page.getByRole('button', { name: 'Gym', exact: true }).click();
  await page.getByText('Incline dumbbell press', { exact: true }).first().waitFor();
  await page.getByRole('button', { name: /AI inbox/ }).click();
  await page.getByText('Your workspace inbox', { exact: true }).waitFor();

  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload({ waitUntil: 'networkidle' });
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByText('Sensitivity analysis', { exact: true }).first().waitFor();
  await context.setOffline(false);

  const mobile = await context.newPage();
  await mobile.setViewportSize({ width: 768, height: 1024 });
  await mobile.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
  await mobile.getByLabel('Toggle sidebar').waitFor();

  await browser.close();
  if (errors.length) throw new Error(`Browser errors:\n${errors.join('\n')}`);
  console.log('Smoke test passed: themes, encrypted API-key persistence, canvas, modules, offline PWA, and tablet shell.');
} finally {
  server.kill('SIGTERM');
  api.kill('SIGTERM');
}
