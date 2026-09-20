import { loadPyodide } from 'https://cdn.jsdelivr.net/pyodide/v314.0.7/full/pyodide.mjs';

const runtimePromise = loadPyodide({ indexURL: 'https://cdn.jsdelivr.net/pyodide/v314.0.7/full/' });

self.onmessage = async (event) => {
  const { id, noteId, code } = event.data;
  try {
    self.postMessage({ id, status: 'loading' });
    const runtime = await runtimePromise;
    await runtime.loadPackagesFromImports(code);
    self.postMessage({ id, status: 'running' });
    runtime.globals.set('__notehub_code', code);
    runtime.globals.set('__notehub_note_id', noteId);
    const raw = await runtime.runPythonAsync(`
import ast, io, json, traceback, contextlib, base64, sys
if '_notehub_sessions' not in globals():
    _notehub_sessions = {}
ns = _notehub_sessions.setdefault(__notehub_note_id, {'__name__': '__main__'})
stdout_buffer = io.StringIO()
result_value = None
error_value = None
html_value = None
image_value = None
try:
    tree = ast.parse(__notehub_code, mode='exec')
    with contextlib.redirect_stdout(stdout_buffer), contextlib.redirect_stderr(stdout_buffer):
        if tree.body and isinstance(tree.body[-1], ast.Expr):
            prefix = ast.Module(body=tree.body[:-1], type_ignores=[])
            if prefix.body:
                exec(compile(prefix, '<notehub>', 'exec'), ns, ns)
            result_value = eval(compile(ast.Expression(tree.body[-1].value), '<notehub>', 'eval'), ns, ns)
        else:
            exec(compile(tree, '<notehub>', 'exec'), ns, ns)
    if result_value is not None and hasattr(result_value, 'to_html'):
        html_value = result_value.to_html()
    if 'matplotlib.pyplot' in sys.modules:
        import matplotlib.pyplot as plt
        if plt.get_fignums():
            buffer = io.BytesIO()
            plt.gcf().savefig(buffer, format='png', bbox_inches='tight', dpi=130)
            image_value = 'data:image/png;base64,' + base64.b64encode(buffer.getvalue()).decode('ascii')
            plt.close('all')
except Exception:
    error_value = traceback.format_exc()
json.dumps({'stdout': stdout_buffer.getvalue(), 'result': None if result_value is None or html_value else repr(result_value), 'html': html_value, 'image': image_value, 'error': error_value})
    `);
    self.postMessage({ id, status: 'complete', result: JSON.parse(String(raw)) });
  } catch (error) {
    self.postMessage({ id, status: 'complete', result: { error: error instanceof Error ? error.message : String(error) } });
  }
};
