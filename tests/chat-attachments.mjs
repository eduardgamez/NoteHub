import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import JSZip from 'jszip';
const server = spawn('npm', ['run', 'dev:web', '--', '--host', '127.0.0.1', '--port', '5187', '--strictPort'], { stdio: 'ignore' });
let browser;

function samplePdf() {
  const stream = 'BT /F1 18 Tf 40 120 Td (PDF test: total 42) Tj ET';
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 250 180] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let pdf = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n `).join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}

try {
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 375, height: 900 } });
  await page.route('**/api/ai/status*', (route) => route.fulfill({ json: { providers: { openai: true }, models: { openai: 'gpt-5-mini' } } }));
  const requests = [];
  await page.route('**/api/ai/complete', async (route) => { requests.push(route.request().postDataJSON()); await route.fulfill({ json: { text: 'Attachments received and read.', proposals: [] } }); });
  for (let attempt = 0; ; attempt++) {
    try { await page.goto('http://127.0.0.1:5187'); break; }
    catch (error) { if (attempt >= 20) throw error; await new Promise((resolve) => setTimeout(resolve, 250)); }
  }
  await page.locator('.project-tile').first().waitFor();
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>DOCX test: planning notes</w:t></w:r></w:p></w:body></w:document>');
  const image = await page.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width = 30; canvas.height = 30; canvas.getContext('2d').fillRect(0, 0, 30, 30); return canvas.toDataURL('image/png'); });
  await page.getByLabel('Archivos para el chat').setInputFiles([
    { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('Text file: budget 123') },
    { name: 'picture.png', mimeType: 'image/png', buffer: Buffer.from(image.split(',')[1], 'base64') },
    { name: 'report.pdf', mimeType: 'application/pdf', buffer: samplePdf() },
    { name: 'notes.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: await zip.generateAsync({ type: 'nodebuffer' }) },
  ]);
  await page.waitForFunction(() => document.querySelectorAll('.chat-attachment-chip').length === 4);
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await page.getByText('Attachments received and read.', { exact: true }).waitFor();
  const context = requests[0].context;
  assert.ok(context.some((item) => item.content.includes('budget 123')));
  assert.ok(context.some((item) => item.content.includes('PDF test: total 42')));
  assert.ok(context.some((item) => item.content.includes('DOCX test: planning notes')));
  assert.equal(context.filter((item) => item.type === 'image').length, 2);
  assert.equal(await page.locator('.chat-message-attachments > div').count(), 4);
  await page.locator('.home-ai textarea').fill('What was in the files?');
  const followupRequest = page.waitForRequest('**/api/ai/complete');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await followupRequest;
  await page.waitForTimeout(50);
  assert.equal(requests[1].context.filter((item) => item.type === 'image').length, 2);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.locator('.home-ai').evaluate((element, image) => {
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File([Uint8Array.from(atob(image.split(',')[1]), (character) => character.charCodeAt(0))], 'screenshot.png', { type: 'image/png' }));
    element.querySelector('.ai-chat').dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
  }, image);
  await page.getByText('screenshot.png', { exact: true }).waitFor();
  assert.equal(await page.locator('.chat-attachment-chip img').count(), 1);
  console.log('Chat attachment checks passed: TXT, image, real PDF and DOCX read in browser, included in model request and retained for follow-up questions.');
} finally { await browser?.close(); server.kill('SIGTERM'); }
