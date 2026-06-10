/**
 * JavaScript kernel runner.
 *
 * A persistent `node:vm` context in a child process, speaking the same JSON
 * lines protocol as the Python runner: stream messages are emitted while a
 * cell runs, the final result carries execute_result/error outputs, and the
 * `notebook` object lets cell code call back into the app (async — use
 * `await notebook.cellCount()` etc.).
 *
 * Running notebook code in a separate process keeps the app responsive and
 * lets "restart kernel" work by killing the child. As in Jupyter, notebook
 * code is trusted user code — the vm context is for session isolation and
 * robustness, not a security boundary.
 */

import vm from 'node:vm';
import util from 'node:util';
import readline from 'node:readline';
import { createRequire } from 'node:module';

let executionCount = 0;
let currentExecuteId = null;

function send(message) {
  process.stdout.write(JSON.stringify(message) + '\n');
}

function emitStream(name, text) {
  send({ id: currentExecuteId, type: 'stream', name, text });
}

function captureConsole() {
  const write = (name) => (...args) => {
    const text = args.map((a) => (typeof a === 'string' ? a : util.inspect(a))).join(' ') + '\n';
    emitStream(name, text);
  };
  return {
    log: write('stdout'),
    info: write('stdout'),
    debug: write('stdout'),
    warn: write('stderr'),
    error: write('stderr')
  };
}

/* ---------- notebook automation API (kernel → app) ---------- */

let nextApiId = 0;
const pendingApi = new Map();

function apiCall(method, args = {}) {
  nextApiId += 1;
  const apiId = nextApiId;
  return new Promise((resolve, reject) => {
    pendingApi.set(apiId, { resolve, reject });
    send({ type: 'api', apiId, method, args });
  });
}

const notebookApi = {
  cellCount: () => apiCall('cell_count'),
  getCells: () => apiCall('get_cells'),
  getSource: (index) => apiCall('get_source', { index }),
  setSource: (index, source) => apiCall('set_source', { index, source }),
  insertCell: ({ source = '', type = 'code', index = null } = {}) =>
    apiCall('insert_cell', { source, type, index }),
  deleteCell: (index) => apiCall('delete_cell', { index })
};

/* ---------- execution ---------- */

const sandbox = {
  console: captureConsole(),
  notebook: notebookApi,
  require: createRequire(import.meta.url),
  setTimeout,
  setInterval,
  clearTimeout,
  clearInterval,
  queueMicrotask,
  URL,
  TextEncoder,
  TextDecoder,
  fetch: globalThis.fetch,
  process: { env: process.env, platform: process.platform, version: process.version }
};
sandbox.globalThis = sandbox;
const context = vm.createContext(sandbox);

/**
 * Compile a cell that needs top-level await: wrap it in an async IIFE. The
 * arrow body swallows the completion value, so if the cell's last line
 * compiles as a standalone expression it becomes the return value — which
 * covers the common notebook pattern of ending a cell with an expression.
 * (Caveats: multi-line trailing expressions are not captured, and `var` /
 * global assignments are the persistent bindings inside the wrapper.)
 */
function compileWithAwait(code) {
  const lastNewline = code.lastIndexOf('\n');
  const head = code.slice(0, lastNewline + 1);
  const tail = code.slice(lastNewline + 1).trim().replace(/;+$/, '');
  if (tail) {
    try {
      new vm.Script(`(${tail})`);
      return new vm.Script(`(async () => { ${head}\nreturn (${tail}); })()`, { filename: '<cell>' });
    } catch {
      // The last line is not a standalone expression; fall through.
    }
  }
  return new vm.Script(`(async () => { ${code}\n })()`, { filename: '<cell>' });
}

async function runCell(code) {
  const outputs = [];
  let status = 'ok';
  try {
    let script;
    try {
      script = new vm.Script(code, { filename: '<cell>' });
    } catch (error) {
      if (error instanceof SyntaxError && /await/.test(code)) {
        script = compileWithAwait(code);
      } else {
        throw error;
      }
    }
    let result = script.runInContext(context);
    if (result instanceof Promise || (result && typeof result.then === 'function')) {
      result = await result;
    }
    if (result !== undefined) {
      context._ = result;
      outputs.push({ type: 'execute_result', text: util.inspect(result) });
    }
  } catch (error) {
    status = 'error';
    outputs.push({
      type: 'error',
      ename: error?.name ?? 'Error',
      evalue: error?.message ?? String(error),
      traceback: error?.stack ?? String(error)
    });
  }
  return { status, outputs };
}

const rl = readline.createInterface({ input: process.stdin, terminal: false });
let queue = Promise.resolve();

rl.on('line', (line) => {
  if (!line.trim()) return;
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return;
  }
  if (message.type === 'api-result') {
    const pending = pendingApi.get(message.apiId);
    if (pending) {
      pendingApi.delete(message.apiId);
      if (message.error) pending.reject(new Error(message.error));
      else pending.resolve(message.value);
    }
    return;
  }
  if (message.type !== 'execute') return;
  queue = queue.then(async () => {
    executionCount += 1;
    currentExecuteId = message.id;
    const { status, outputs } = await runCell(message.code ?? '');
    send({
      id: message.id,
      type: 'result',
      status,
      outputs,
      executionCount
    });
    currentExecuteId = null;
  });
});

rl.on('close', () => process.exit(0));
