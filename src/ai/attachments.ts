import type { ChatAttachment, ChatMessageRecord } from '../types';
import type { AIContextItem } from './provider';

export const ATTACHMENT_ACCEPT = 'image/*,.pdf,.docx,.txt,.md,.csv,.tsv,.json,.xml,.html,.css,.js,.jsx,.ts,.tsx,.py,.ipynb,.yaml,.yml,.tex,.log,.c,.cpp,.h,.java,.rs,.go';
export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const MAX_TEXT = 100_000;
const textExtensions = /\.(txt|md|csv|tsv|json|xml|html?|css|[cm]?jsx?|tsx?|py|ipynb|ya?ml|tex|log|c|cpp|h|java|rs|go)$/i;

function checkText(text: string): string {
  if (text.length > MAX_TEXT) throw new Error('El documento es demasiado largo. Divide el archivo en partes más pequeñas.');
  return text;
}

async function imageData(source: string): Promise<string> {
  const image = new Image();
  await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('No se pudo leer esta imagen. Prueba con PNG, JPEG o WebP.')); image.src = source; });
  const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No se pudo preparar la imagen.');
  context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', .85);
}

export async function prepareAttachment(file: File): Promise<ChatAttachment> {
  if (file.size > MAX_ATTACHMENT_BYTES) throw new Error(`${file.name}: el máximo por archivo es 8 MB.`);
  const base = { id: crypto.randomUUID(), name: file.name, mime: file.type, size: file.size };
  if (file.type.startsWith('image/')) {
    const url = URL.createObjectURL(file);
    try { return { ...base, text: '', images: [await imageData(url)] }; }
    finally { URL.revokeObjectURL(url); }
  }
  if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
    const [pdfjs, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), useSystemFonts: true });
    try {
      const pdf = await task.promise;
      if (pdf.numPages > 12) throw new Error('Los PDF pueden tener hasta 12 páginas. Divide este PDF en partes.');
      const texts: string[] = [], images: string[] = [];
      for (let index = 1; index <= pdf.numPages; index++) {
        const page = await pdf.getPage(index);
        const content = await page.getTextContent();
        texts.push(`Página ${index}:\n${content.items.map((item) => 'str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '').join('')}`);
        checkText(texts.join('\n'));
        const natural = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: Math.min(2, 1600 / Math.max(natural.width, natural.height)) });
        const canvas = document.createElement('canvas'); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        await page.render({ canvas, viewport }).promise;
        images.push(canvas.toDataURL('image/jpeg', .8)); page.cleanup();
      }
      return { ...base, text: texts.join('\n\n'), images };
    } finally { await task.destroy(); }
  }
  if (/\.docx$/i.test(file.name)) {
    const { default: mammoth } = await import('mammoth');
    const images: string[] = [];
    const result = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() }, { convertImage: mammoth.images.imgElement(async (image) => {
      if (images.length >= 12) throw new Error('El documento tiene demasiadas imágenes. Divide el archivo en partes.');
      images.push(await imageData(`data:${image.contentType};base64,${await image.read('base64')}`));
      return { src: '' };
    }) });
    if (images.length > 12) throw new Error('El documento tiene demasiadas imágenes. Divide el archivo en partes.');
    const document = new DOMParser().parseFromString(result.value, 'text/html');
    document.querySelectorAll('p, li, tr, br').forEach((element) => element.append('\n'));
    document.querySelectorAll('td, th').forEach((element) => element.append('\t'));
    return { ...base, text: checkText(document.body.textContent ?? ''), images };
  }
  if (file.type.startsWith('text/') || textExtensions.test(file.name)) return { ...base, text: checkText(await file.text()), images: [] };
  throw new Error(`${file.name}: formato no compatible. Usa imágenes, PDF, DOCX o archivos de texto/CSV.`);
}

export function attachmentSize(attachments: ChatAttachment[]): number {
  return attachments.reduce((total, item) => total + item.text.length + item.images.reduce((sum, image) => sum + image.length, 0), 0);
}

export function attachmentContext(messages: ChatMessageRecord[]): AIContextItem[] {
  const context: AIContextItem[] = [];
  let used = 0;
  for (const message of [...messages].reverse()) for (const attachment of message.attachments ?? []) {
    const size = attachmentSize([attachment]);
    const label = `Archivo adjunto por el usuario: ${attachment.name}. Mensaje: ${message.content}. Imágenes/páginas: ${attachment.images.length}.`;
    if (used + size > MAX_ATTACHMENT_BYTES) { context.push({ id: attachment.id, type: 'attachment', content: `${label}\nContenido fuera del límite de contexto. No afirmes haberlo leído; pide volver a adjuntarlo si lo necesitas.` }); continue; }
    used += size;
    context.push({ id: attachment.id, type: 'attachment', content: `${label}\n${attachment.text}` });
    attachment.images.forEach((content, index) => context.push({ id: `${attachment.id}:page:${index + 1}`, type: 'image', content }));
  }
  return context;
}
