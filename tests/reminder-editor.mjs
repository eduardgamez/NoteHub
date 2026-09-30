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
 const shortSize = await dialog.evaluate((element) => ({ height: element.clientHeight, content: element.scrollHeight }));
 assert.ok(shortSize.content <= shortSize.height + 1, 'Short editors should not scroll');
 await dialog.screenshot({ path: '/tmp/notehub-reminder-editor.png' });
 await dialog.getByRole('button', { name: 'Añadir tarea' }).click();
 await page.locator('.reminder-editor-task input').last().fill('Guardar recibos');
 const handle = await dialog.getByRole('button', { name: 'Mover tarea Revisar los movimientos' }).boundingBox();
 const last = await dialog.locator('.reminder-editor-task').last().boundingBox();
 await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
 await page.mouse.down();
 await page.mouse.move(handle.x + handle.width / 2, last.y + last.height / 2, { steps: 8 });
 await page.mouse.up();
 assert.deepEqual(await dialog.locator('.reminder-editor-task input').evaluateAll((elements) => elements.map((element) => element.value)), ['Separar los gastos compartidos', 'Guardar recibos', 'Revisar los movimientos']);
 await dialog.getByRole('button', { name: 'Quitar hora' }).click();
 assert.equal(await dialog.getByLabel('Hora del recordatorio').isDisabled(), true);
 await dialog.getByRole('button', { name: 'Save', exact: true }).click();
 const savedOrder = await page.evaluate(async () => (await import('/src/store/useWorkspace.ts')).useWorkspace.getState().tasks[0].checklist);
 assert.equal(savedOrder[2].text, 'Revisar los movimientos');
 assert.equal(savedOrder[2].done, true);
 const general = page.getByRole('button', { name: 'Reminder: Recuento de los gastos de septiembre' });
 assert.ok((await general.getAttribute('class')).includes('calendar-all-day'));
 await page.setViewportSize({ width: 375, height: 900 });
 await general.click();
 const box = await dialog.boundingBox();
 assert.ok(box.x >= 0 && box.x + box.width <= 375);
 await dialog.screenshot({ path: '/tmp/notehub-reminder-editor-mobile.png' });
 await dialog.getByRole('button', { name: 'Close reminder' }).click();
 await page.setViewportSize({ width: 1280, height: 900 });
 await page.evaluate(async () => {
  const { useWorkspace } = await import('/src/store/useWorkspace.ts');
  const task = useWorkspace.getState().tasks[0];
  useWorkspace.setState({ tasks: [{ ...task, checklist: Array.from({ length: 12 }, (_, index) => ({ id: `row-${index}`, text: `Tarea ${index}`, done: false })) }] });
 });
 await general.click();
 const grown = await dialog.evaluate((element) => ({ height: element.clientHeight, content: element.scrollHeight }));
 assert.ok(grown.height > 420, 'Editors should grow beyond the previous fixed limit');
 assert.ok(grown.content <= grown.height + 1, 'Medium editors should grow without scrolling');
 await dialog.getByRole('button', { name: 'Close reminder' }).click();
 await page.evaluate(async () => {
  const { useWorkspace } = await import('/src/store/useWorkspace.ts');
  const task = useWorkspace.getState().tasks[0];
  useWorkspace.setState({ tasks: [{ ...task, checklist: Array.from({ length: 35 }, (_, index) => ({ id: `row-${index}`, text: `Tarea ${index}`, done: false })) }] });
 });
 await general.click();
 const crowded = await dialog.evaluate((element) => ({ height: element.getBoundingClientRect().height, content: element.scrollHeight, visible: element.clientHeight, top: element.getBoundingClientRect().top }));
 assert.ok(crowded.height <= 900 * .82 + 1);
 assert.ok(crowded.content > crowded.visible);
 assert.ok(crowded.top >= 12 && crowded.top + crowded.height <= 888);
 await dialog.getByRole('button', { name: 'Close reminder' }).click();
 await page.evaluate(async () => {
  const { useWorkspace } = await import('/src/store/useWorkspace.ts');
  const start = new Date(); start.setHours(10, 0, 0, 0);
  useWorkspace.setState({ calendarEvents: [{ id: 'event-editor', title: 'Sesión de estudio', start: start.toISOString(), end: new Date(start.getTime() + 3600000).toISOString(), color: 'green', checklist: [{ id: 'notes', text: 'Preparar notas', done: false }] }] });
 });
 await page.getByRole('button', { name: 'Event: Sesión de estudio' }).click();
 const eventDialog = page.getByRole('dialog', { name: 'Manage event' });
 assert.equal(await eventDialog.getByRole('button', { name: 'Quitar hora' }).count(), 0);
 await eventDialog.getByLabel('Hora de inicio').fill('10:15');
 await eventDialog.getByLabel('Hora de fin').fill('12:45');
 await eventDialog.screenshot({ path: '/tmp/notehub-event-editor.png' });
 await page.setViewportSize({ width: 375, height: 900 });
 await page.waitForFunction(() => { const box = document.querySelector('.event-editor')?.getBoundingClientRect(); return box && box.x >= 12 && box.right <= 363; });
 const eventBox = await eventDialog.boundingBox();
 assert.ok(eventBox.x >= 12 && eventBox.x + eventBox.width <= 363);
 await eventDialog.screenshot({ path: '/tmp/notehub-event-editor-mobile.png' });
 await eventDialog.getByRole('button', { name: 'Save', exact: true }).click();
 const savedEvent = await page.evaluate(async () => (await import('/src/store/useWorkspace.ts')).useWorkspace.getState().calendarEvents[0]);
 assert.equal(new Date(savedEvent.end).getUTCMinutes(), 45);
 console.log('Editors passed: pointer reorder and persistence, natural height, large-list scrolling, event dates and mobile fit.');
} finally { await browser?.close(); server.kill('SIGTERM'); }
