import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
const server = spawn('npm', ['run', 'dev:web', '--', '--host', '127.0.0.1', '--port', '5188', '--strictPort'], { stdio: 'ignore' });
let browser;
try {
  browser = await chromium.launch();
  const page = await browser.newPage();
  await page.route('**/api/ai/status*', (route) => route.fulfill({ json: { providers: { openai: true }, models: { openai: 'gpt-5-mini' } } }));
  let scenario = 'repeat', count = 0;
  const requests = [];
  await page.route('**/api/ai/complete', async (route) => {
    const request = route.request().postDataJSON(); requests.push(request); count++;
    const response = scenario === 'repeat'
      ? count <= 2 ? { text: '', readWorkspace: ['profile', 'calendar', 'tasks'] } : { text: 'Revisión completada con los datos disponibles.' }
      : scenario === 'missing'
        ? count === 1 ? { text: '', readFiles: ['missing-file'] } : { text: 'Ese archivo no está disponible.' }
        : { text: '', readWorkspace: ['profile'] };
    await route.fulfill({ json: response });
  });
  for (let attempt = 0; ; attempt++) {
    try { await page.goto('http://127.0.0.1:5188'); break; }
    catch (error) { if (attempt >= 20) throw error; await new Promise((resolve) => setTimeout(resolve, 250)); }
  }
  await page.locator('.project-tile').first().waitFor();
  await page.locator('.home-ai textarea').fill('Revisa toda mi información y calendario');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await page.getByText('Revisión completada con los datos disponibles.', { exact: true }).waitFor();
  assert.equal(count, 3);
  assert.ok(requests[2].context.some((item) => item.type === 'tool-status' && item.content.includes('already supplied')));
  assert.equal(requests[2].context.filter((item) => item.type === 'personal-profile').length, 1);
  assert.equal(await page.locator('.ai-error').count(), 0);
  scenario = 'missing'; count = 0;
  await page.locator('.home-ai textarea').fill('Lee un archivo que falta');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await page.getByText('Ese archivo no está disponible.', { exact: true }).waitFor();
  assert.equal(count, 2);
  scenario = 'loop'; count = 0;
  await page.locator('.home-ai textarea').fill('Revisa el perfil otra vez');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await page.getByText('La IA está repitiendo solicitudes de lectura. No ha completado la revisión; vuelve a intentarlo.', { exact: true }).waitFor();
  assert.equal(count, 3);
  console.log('Chat read recovery passed: repeated sections, missing IDs, and bounded loops.');
} finally { await browser?.close(); server.kill('SIGTERM'); }
