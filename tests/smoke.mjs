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
  await page.locator('.week-calendar').waitFor();
  if (await page.locator('.ai-panel').count()) throw new Error('AI panel opened on the home view');
  await page.getByText('Sensitivity analysis', { exact: true }).first().waitFor();
  await page.locator('.folder-notes .note-row', { hasText: 'Sensitivity analysis' }).click();
  await page.locator('.document-title h1', { hasText: 'Sensitivity analysis' }).waitFor();
  await page.getByRole('button', { name: 'Calendar', exact: true }).click();
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
  await page.getByRole('heading', { name: 'Calendar', exact: true }).waitFor();
  const reminderDate = new Date(); reminderDate.setHours(12, 0, 0, 0);
  const reminderLocal = `${reminderDate.getFullYear()}-${String(reminderDate.getMonth() + 1).padStart(2, '0')}-${String(reminderDate.getDate()).padStart(2, '0')}T12:00`;
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.getByRole('button', { name: 'Reminder', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Title').fill('Calendar reminder check');
  await page.getByRole('dialog').getByLabel('When').fill(reminderLocal);
  await page.getByRole('button', { name: 'Create reminder' }).click();
  await page.locator('.calendar-reminder', { hasText: 'Calendar reminder check' }).click();
  await page.getByLabel('New checklist item').fill('Bring keys');
  await page.getByRole('button', { name: 'Add checklist item' }).click();
  await page.getByRole('dialog', { name: 'Manage reminder' }).getByText('Bring keys').waitFor();
  await page.getByRole('dialog', { name: 'Manage reminder' }).getByLabel('Title').fill('Edited reminder');
  await page.getByRole('dialog', { name: 'Manage reminder' }).getByRole('button', { name: 'Save' }).click();
  await page.locator('.calendar-reminder', { hasText: 'Edited reminder' }).waitFor();
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.getByRole('button', { name: 'Event', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Title').fill('Calendar event check');
  await page.getByRole('dialog').getByLabel('Starts').fill(reminderLocal);
  const eventEnd = `${reminderLocal.slice(0, 11)}13:00`;
  await page.getByRole('dialog').getByLabel('Ends').fill(eventEnd);
  await page.getByRole('button', { name: 'Create event' }).click();
  await page.locator('.calendar-event', { hasText: 'Calendar event check' }).waitFor();
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.getByRole('button', { name: 'Reminder', exact: true }).click();
  await page.getByRole('dialog', { name: 'Create calendar item' }).getByLabel('Checklist template').selectOption('template-university');
  await page.getByRole('dialog', { name: 'Create calendar item' }).getByLabel('Title').fill('Template reminder check');
  await page.getByRole('dialog', { name: 'Create calendar item' }).getByLabel('When').fill(reminderLocal);
  await page.getByRole('button', { name: 'Create reminder' }).click();
  await page.locator('.calendar-reminder', { hasText: 'Template reminder check' }).click();
  await page.getByRole('dialog', { name: 'Manage reminder' }).getByText('Keys', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Delete reminder' }).click();
  await page.getByRole('button', { name: 'month', exact: true }).click();
  await page.locator('.month-reminder', { hasText: 'Edited reminder' }).click();
  await page.getByRole('dialog', { name: 'Manage reminder' }).getByRole('button', { name: 'Mark done' }).click();
  await page.locator('.month-reminder.done', { hasText: 'Edited reminder' }).waitFor();
  await page.locator('.folder-notes .note-row', { hasText: 'Sensitivity analysis' }).click();
  await page.locator('.document-title h1', { hasText: 'Sensitivity analysis' }).waitFor();
  await page.getByRole('button', { name: 'Gym', exact: true }).click();
  await page.getByText('Incline dumbbell press', { exact: true }).first().waitFor();
  await page.getByLabel('Open AI panel').click();
  await page.locator('.ai-panel').waitFor();
  await page.getByLabel('Close AI panel').click();

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

  const shortDesktop = await context.newPage();
  await shortDesktop.setViewportSize({ width: 1100, height: 650 });
  await shortDesktop.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
  await shortDesktop.getByRole('button', { name: 'Settings', exact: true }).click();
  const settingsView = shortDesktop.locator('.settings-view');
  await settingsView.hover();
  await shortDesktop.mouse.wheel(0, 500);
  await shortDesktop.waitForTimeout(100);
  if (await settingsView.evaluate((element) => element.scrollTop) === 0) throw new Error('Settings center panel did not scroll vertically');

  await browser.close();
  if (errors.length) throw new Error(`Browser errors:\n${errors.join('\n')}`);
  console.log('Smoke test passed: themes, key persistence, canvas, modules, settings scroll, offline PWA, and tablet shell.');
} finally {
  server.kill('SIGTERM');
  api.kill('SIGTERM');
}
