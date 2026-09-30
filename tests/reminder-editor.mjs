import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
const server = spawn('npm', ['run', 'dev:web', '--', '--host', '127.0.0.1', '--port', '5190', '--strictPort'], { stdio: 'ignore' });
let browser;
try {
 browser = await chromium.launch();
 const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: 'es-ES', timezoneId: 'Europe/Madrid' });
 await page.route('**/api/**', (route) => route.fulfill({ json: { providers: {} } }));
 for (let attempt = 0; ; attempt++) {
  try { await page.goto('http://127.0.0.1:5190'); break; } catch (error) { if (attempt >= 20) throw error; await new Promise((resolve) => setTimeout(resolve, 250)); }
 }
 await page.locator('.project-tile').first().waitFor();
 await page.evaluate(async () => {
  const { useWorkspace } = await import('/src/store/useWorkspace.ts');
  const due = new Date(); due.setHours(14, 30, 0, 0);
  useWorkspace.setState({ tasks: [{ id: 'editor', title: 'Recuento de los gastos de septiembre', reminder: true, due: due.toISOString(), done: false, checklist: [{ id: 'review', text: 'Revisar los movimientos', done: true }, { id: 'split', text: 'Separar los gastos compartidos', done: false }] }] });
 });
 await page.getByRole('button', { name: 'Reminder: Recuento de los gastos de septiembre' }).click();
 const dialog = page.getByRole('dialog', { name: 'Manage reminder' });
 await dialog.screenshot({ path: '/tmp/notehub-reminder-editor.png' });
 await dialog.getByRole('button', { name: 'Añadir tarea' }).click();
 await page.locator('.reminder-editor-task input').last().fill('Guardar recibos');
 await dialog.getByRole('button', { name: 'Quitar hora' }).click();
 assert.equal(await dialog.getByLabel('Hora del recordatorio').isDisabled(), true);
 await dialog.getByRole('button', { name: 'Save', exact: true }).click();
 const general = page.getByRole('button', { name: 'Reminder: Recuento de los gastos de septiembre' });
 assert.ok((await general.getAttribute('class')).includes('calendar-all-day'));
 await page.setViewportSize({ width: 375, height: 900 });
 await general.click();
 const box = await dialog.boundingBox();
 assert.ok(box.x >= 0 && box.x + box.width <= 375);
 await dialog.screenshot({ path: '/tmp/notehub-reminder-editor-mobile.png' });
 console.log('Reminder editor passed: inline task, date-only save, all-day placement and mobile fit.');
} finally { await browser?.close(); server.kill('SIGTERM'); }
