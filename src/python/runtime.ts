import type { CodeExecution } from '../types';

interface WorkerMessage { id: string; status: 'loading' | 'running' | 'complete'; result?: Omit<CodeExecution, 'status'> }
interface PendingRun { startedAt: number; onStatus?: (status: CodeExecution['status']) => void; resolve: (result: CodeExecution) => void }

export interface PythonRuntime {
  run(noteId: string, code: string, onStatus?: (status: CodeExecution['status']) => void): Promise<CodeExecution>;
  dispose(): void;
}

class PyodideWorkerRuntime implements PythonRuntime {
  private worker = new Worker('/pyodide-worker.mjs', { type: 'module' });
  private pending = new Map<string, PendingRun>();

  constructor() {
    this.worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const pending = this.pending.get(event.data.id); if (!pending) return;
      if (event.data.status !== 'complete') { pending.onStatus?.(event.data.status); return; }
      this.pending.delete(event.data.id);
      pending.resolve({ ...event.data.result, status: event.data.result?.error ? 'error' : 'success', durationMs: Date.now() - pending.startedAt });
    };
  }

  run(noteId: string, code: string, onStatus?: (status: CodeExecution['status']) => void) {
    const id = crypto.randomUUID();
    onStatus?.('loading');
    return new Promise<CodeExecution>((resolve) => {
      this.pending.set(id, { startedAt: Date.now(), onStatus, resolve });
      this.worker.postMessage({ id, noteId, code });
    });
  }

  dispose() { this.worker.terminate(); this.pending.clear(); }
}

export const pythonRuntime: PythonRuntime = new PyodideWorkerRuntime();
