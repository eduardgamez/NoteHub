import type { AIResponse } from './provider';

export async function readProgressStream(response: Response, onProgress?: (text: string) => void): Promise<AIResponse> {
  if (!response.body) throw new Error('El servidor no ha enviado una respuesta.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result: AIResponse | undefined;
  const parse = (frame: string) => {
    const data = frame.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n');
    if (!data) return;
    const event = JSON.parse(data);
    if (event.type === 'progress' && typeof event.text === 'string') onProgress?.(event.text);
    if (event.type === 'result') result = event.result;
    if (event.type === 'error') throw new Error(event.error || 'La solicitud de IA ha fallado.');
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done }).replace(/\r\n/g, '\n');
      let end;
      while ((end = buffer.indexOf('\n\n')) >= 0) { parse(buffer.slice(0, end)); buffer = buffer.slice(end + 2); }
      if (done) { if (buffer.trim()) parse(buffer); break; }
    }
    if (!result || typeof result.text !== 'string') throw new Error('La conexión terminó antes de recibir la respuesta final.');
    return result;
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
