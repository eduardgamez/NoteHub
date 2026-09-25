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
  await page.route('**/api/ai/status', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ providers: { openai: false, anthropic: false, gemini: false }, models: { openai: 'gpt-5-mini', anthropic: 'claude-sonnet', gemini: 'gemini-flash' } }) }));
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error' && !message.text().includes('ERR_INTERNET_DISCONNECTED')) errors.push(`${message.text()} at ${message.location().url}`); });

  await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
  await page.locator('.project-tile').first().waitFor();
  if (await page.locator('.project-tile').count() !== 3) throw new Error('Home project cards missing');
  await page.getByText('AI · Quick Access').waitFor();
  await page.locator('.week-calendar').waitFor();
  if (await page.locator('html').getAttribute('data-theme') !== 'dark') throw new Error('System dark theme was not applied');
  await page.getByLabel('Change theme').click();
  if (await page.locator('html').getAttribute('data-theme') !== 'light') throw new Error('Light theme was not applied');
  await page.reload({ waitUntil: 'networkidle' });
  if (await page.locator('html').getAttribute('data-theme') !== 'light') throw new Error('Theme did not persist');

  await page.getByRole('button', { name: 'Open University' }).click();
  await page.locator('.document-title h1', { hasText: 'Sensitivity analysis' }).waitFor();
  if (await page.locator('.document-title > span').count()) throw new Error('Document title still has a symbol');
  await page.getByRole('button', { name: 'Cache memory' }).click();
  await page.locator('.document-title h1', { hasText: 'Cache memory' }).waitFor();
  await page.getByRole('button', { name: 'Sensitivity analysis' }).click();
  const initialBlocks = await page.locator('.canvas-block').count();
  await page.getByTitle('Text block').click();
  await page.locator('.canvas-block').nth(initialBlocks).waitFor();
  await page.locator('.ai-panel').waitFor();
  await page.getByLabel('Close AI panel').click();
  await page.getByLabel('Open AI panel').click();
  await page.getByRole('button', { name: 'Back to home' }).click();
  await page.locator('.project-tile').first().waitFor();

  await page.getByLabel('Show project controls').click();
  await page.getByLabel('Add project').click();
  if (await page.getByRole('dialog', { name: 'New project' }).count()) throw new Error('New project opened a dialog');
  await page.getByRole('textbox', { name: 'New project symbol' }).fill('✧');
  await page.getByRole('textbox', { name: 'New project title' }).fill('Design test');
  await page.getByLabel('Edit project').click();
  await page.getByRole('button', { name: 'Open Design test' }).waitFor();
  await page.getByLabel('Edit project').click();
  if (await page.getByLabel('Edit project').getAttribute('aria-pressed') !== 'true') throw new Error('Project edit mode did not activate');
  if (await page.getByRole('dialog', { name: 'Edit project' }).count()) throw new Error('Project edit opened a dialog');
  await page.getByRole('textbox', { name: 'Design test symbol' }).fill('🎨');
  await page.getByRole('textbox', { name: 'Design test title' }).fill('Renamed project');
  await page.getByLabel('Edit project').click();
  await page.getByRole('button', { name: 'Open Renamed project' }).waitFor();
  if (!await page.getByRole('button', { name: 'Open Renamed project' }).getByText('🎨').count()) throw new Error('Inline project symbol was not saved');
  await page.getByRole('button', { name: 'Open Renamed project' }).click();
  await page.getByText('Your project is ready').waitFor();
  await page.getByRole('button', { name: 'Add folder or document' }).click();
  page.once('dialog', (dialog) => dialog.accept('First document'));
  await page.getByRole('button', { name: 'New document' }).click();
  await page.locator('.document-title h1', { hasText: 'First document' }).waitFor();
  await page.getByRole('button', { name: 'Back to home' }).click();
  await page.getByLabel('Show project controls').click();
  await page.getByLabel('Add project').click();
  await page.getByRole('textbox', { name: 'New project title' }).fill('Incomplete project');
  await page.locator('.home-calendar h1').click();
  if (await page.getByRole('button', { name: 'Open Incomplete project' }).count()) throw new Error('Incomplete project was saved');
  for (let index = 0; index < 5; index++) {
    await page.getByLabel('Add project').click();
    await page.getByRole('textbox', { name: 'New project symbol' }).fill('✦');
    await page.getByRole('textbox', { name: 'New project title' }).fill(`Extra project ${index}`);
    await page.getByLabel('Edit project').click();
  }
  await page.locator('.project-grid.scrollable').waitFor();
  const projectGridScrolls = await page.locator('.project-grid').evaluate((element) => element.scrollHeight > element.clientHeight);
  if (!projectGridScrolls) throw new Error('Project grid did not scroll after eight projects');
  await page.getByLabel('Delete project').click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Delete Renamed project' }).click();
  if (await page.locator('.project-grid.scrollable').count()) throw new Error('Project grid still scrolls with eight projects');

  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('OpenAI API key').fill('e2e-key-that-is-never-sent');
  await page.getByRole('button', { name: 'Save key' }).click();
  await page.getByText('Key encrypted and saved on this device.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'NoteHub home' }).click();
  await page.getByText('Using OpenAI gpt-5-mini', { exact: true }).waitFor();
  await page.getByLabel('Search in notes').fill('Cache memory');
  await page.locator('.header-search-results').getByRole('button', { name: /Cache memory/ }).click();
  await page.locator('.document-title h1', { hasText: 'Cache memory' }).waitFor();
  await page.getByText('Using OpenAI gpt-5-mini', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'NoteHub home' }).click();

  const reminderDate = new Date(); reminderDate.setHours(12, 0, 0, 0);
  const reminderLocal = `${reminderDate.getFullYear()}-${String(reminderDate.getMonth() + 1).padStart(2, '0')}-${String(reminderDate.getDate()).padStart(2, '0')}T12:00`;
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.getByRole('button', { name: 'Reminder', exact: true }).click();
  await page.getByRole('dialog', { name: 'Create calendar item' }).getByLabel('Title').fill('Calendar reminder check');
  await page.getByRole('dialog', { name: 'Create calendar item' }).getByLabel('When').fill(reminderLocal);
  await page.getByRole('button', { name: 'Create reminder' }).click();
  await page.getByRole('button', { name: 'Reminder: Calendar reminder check' }).hover();
  await page.getByRole('tooltip', { name: 'Calendar reminder check' }).waitFor();
  await page.getByRole('button', { name: 'Reminder: Calendar reminder check' }).click();
  if (await page.getByRole('tooltip').count()) throw new Error('Reminder tooltip stayed open after click');
  await page.getByRole('dialog', { name: 'Manage reminder' }).getByRole('button', { name: 'Mark done' }).click();
  await page.locator('.calendar-reminder.done[aria-label="Reminder: Calendar reminder check"]').waitFor();
  await page.getByRole('button', { name: 'Open Gym' }).click();
  await page.getByText('Incline dumbbell press', { exact: true }).first().waitFor();

  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload({ waitUntil: 'networkidle' });
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Open University' }).waitFor();
  await context.setOffline(false);

  const mobile = await context.newPage();
  await mobile.setViewportSize({ width: 768, height: 1024 });
  await mobile.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
  await mobile.getByRole('button', { name: 'Open University' }).click();
  await mobile.getByLabel('Toggle sidebar').waitFor();

  await browser.close();
  if (errors.length) throw new Error(`Browser errors:\n${errors.join('\n')}`);
  console.log('Smoke test passed: home, projects, documents, AI, calendar, settings, offline PWA, and tablet shell.');
} finally {
  server.kill('SIGTERM');
  api.kill('SIGTERM');
}
