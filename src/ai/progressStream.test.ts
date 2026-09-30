import { describe, expect, it } from 'vitest';
import { readProgressStream } from './progressStream';

function streamResponse(frames: object[]) {
  const data = new TextEncoder().encode(frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join(''));
  return new Response(new ReadableStream({ start(controller) { for (let i = 0; i < data.length; i += 3) controller.enqueue(data.slice(i, i + 3)); controller.close(); } }));
}
describe('live AI progress', () => {
  it('handles split UTF-8 frames and separates progress from the final response', async () => {
    const progress: string[] = [];
    expect(await readProgressStream(streamResponse([{ type: 'progress', text: 'Revisando información…' }, { type: 'result', result: { text: 'Respuesta', proposals: [] } }]), (text) => progress.push(text))).toEqual({ text: 'Respuesta', proposals: [] });
    expect(progress).toEqual(['Revisando información…']);
  });
  it('reports interrupted streams and streamed errors', async () => {
    await expect(readProgressStream(streamResponse([{ type: 'progress', text: 'Procesando' }]))).rejects.toThrow('antes de recibir');
    await expect(readProgressStream(streamResponse([{ type: 'error', error: 'Codex falló' }]))).rejects.toThrow('Codex falló');
  });
});
