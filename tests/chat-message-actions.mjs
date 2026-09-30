import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
const server = spawn('npm', ['run', 'dev:web', '--', '--host', '127.0.0.1', '--port', '5186', '--strictPort'], { stdio: 'ignore' });
let browser;
try {
 browser = await chromium.launch();
 const page = await browser.newPage();
 await page.route('**/api/ai/status*', (route) => route.fulfill({ json: { providers: { openai: true }, models: { openai: 'gpt-5-mini' } } }));
 const requests = [];
 await page.route('**/api/ai/complete', async (route) => { requests.push(route.request().postDataJSON()); await route.fulfill({ json: { text: 'Respuesta al mensaje elegido.', proposals: [] } }); });
 for (let attempt = 0; ; attempt++) {
  try { await page.goto('http://127.0.0.1:5186'); break; } catch (error) { if (attempt >= 20) throw error; await new Promise((resolve) => setTimeout(resolve, 250)); }
 }
 await page.locator('.project-tile').first().waitFor();
 const panel = await page.locator('.home-ai').boundingBox();
 const scrollArea = await page.locator('.home-ai .ai-thread').boundingBox();
 assert.ok(Math.abs(panel.width - scrollArea.width) < 2);

 const threadId = await page.evaluate(async () => {
  const { useWorkspace } = await import('/src/store/useWorkspace.ts');
  const store = useWorkspace.getState(); const id = store.createChatSession('global');
  const add = (idMessage, role, content, attachments) => store.appendChatMessage(id, { id: idMessage, role, content, createdAt: Date.now(), attachments });
  add('old-user', 'user', 'Pregunta antigua'); add('answer', 'assistant', 'Respuesta anterior');
  add('first', 'user', 'Revisa todo', [{ id: 'attachment', name: 'context.txt', mime: 'text/plain', size: 7, text: 'Datos adjuntos importantes', images: [] }]);
  add('second', 'user', 'dale'); return id;
 });
 assert.equal(await page.locator('.chat-message-actions').count(), 2);
 const second = page.locator('.message.user').filter({ hasText: 'dale' });
 await second.hover();
 const bubble = await second.boundingBox();
 const trash = await second.getByRole('button', { name: 'Eliminar mensaje', exact: true }).boundingBox();
 const retry = await second.getByRole('button', { name: 'Reintentar desde este mensaje', exact: true }).boundingBox();
 assert.ok(trash.x >= bubble.x + bubble.width);
 assert.ok(retry.y >= trash.y + trash.height);
 await second.getByRole('button', { name: 'Eliminar mensaje', exact: true }).click();
 assert.equal(await page.locator('.message.user').filter({ hasText: 'dale' }).count(), 0);
 assert.equal(await page.locator('.message.user').filter({ hasText: 'Revisa todo' }).count(), 1);
 assert.equal(await page.getByRole('button', { name: 'Eliminar mensaje', exact: true }).count(), 0);
 await page.evaluate(async (threadId) => {
  const { useWorkspace } = await import('/src/store/useWorkspace.ts');
  useWorkspace.getState().appendChatMessage(threadId, { id: 'third', role: 'user', content: 'Mensaje posterior que se descarta', createdAt: Date.now() });
 }, threadId);
 const first = page.locator('.message.user').filter({ hasText: 'Revisa todo' });
 await first.hover(); await first.getByRole('button', { name: 'Reintentar desde este mensaje', exact: true }).click();
 await page.getByText('Respuesta al mensaje elegido.', { exact: true }).waitFor();
 assert.equal(await page.getByText('Mensaje posterior que se descarta', { exact: true }).count(), 0);
 assert.deepEqual(requests[0].messages.map((message) => message.content), ['Pregunta antigua', 'Respuesta anterior', 'Revisa todo']);
 assert.ok(requests[0].context.some((item) => item.content.includes('Datos adjuntos importantes')));
 assert.equal(await page.locator('.message.user').filter({ hasText: 'Revisa todo' }).count(), 1);
 await page.locator('.home-ai .ai-thread-content').evaluate((element) => { const spacer = document.createElement('div'); spacer.style.height = '2000px'; element.prepend(spacer); });
 await page.locator('.home-ai .ai-thread').evaluate((element) => { element.scrollTop = 0; });
 await page.mouse.move(scrollArea.x + 3, scrollArea.y + scrollArea.height / 2);
 await page.mouse.wheel(0, 200);
 await page.waitForFunction(() => document.querySelector('.home-ai .ai-thread').scrollTop > 0);
 console.log('Chat actions passed: delete one unanswered message, retry earlier message, trim later messages, preserve history and attachments.');
} finally { await browser?.close(); server.kill('SIGTERM'); }
