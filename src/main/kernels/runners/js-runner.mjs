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
// `_` is the last result; Out[n] is the result of execution n.
sandbox.Out = {};
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

async function runCell(code, execCount = null) {
  const outputs = [];
  let status = 'ok';
  // Wolfram-style information escape: "?symbol" answers with docs.
  const stripped = code.trim();
  if (stripped.startsWith('?') && !stripped.includes('\n')) {
    const symbol = stripped.replace(/^\?+/, '').trim();
    const docs = docsFor(symbol, symbol.length);
    return { status: 'ok', outputs: [{ type: 'execute_result', text: docs.text }] };
  }
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
      if (execCount !== null) sandbox.Out[execCount] = result;
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

/* ---------- kernel intelligence: inspect / complete / docs ---------- */

const INJECTED = new Set([
  'console', 'notebook', 'require', 'setTimeout', 'setInterval', 'clearTimeout',
  'clearInterval', 'queueMicrotask', 'URL', 'TextEncoder', 'TextDecoder',
  'fetch', 'process', 'globalThis', '_', 'Out'
]);

function preview(value) {
  const text = util.inspect(value, { depth: 1, breakLength: Infinity });
  return text.length > 80 ? text.slice(0, 77) + '...' : text;
}

// Top-level let/const/class persist across cells but live in the context's
// lexical environment, which has no reflection API — so their names are
// recorded as cells execute and resolved individually for the inspector.
const lexicalNames = new Set();

function recordLexicalNames(code) {
  for (const match of code.matchAll(/(?:^|[\n;{])\s*(?:let|const|class)\s+([A-Za-z_$][\w$]*)/g)) {
    lexicalNames.add(match[1]);
  }
}

function describeVariable(name, value) {
  const type = typeof value === 'object' && value !== null
    ? value.constructor?.name ?? 'object'
    : typeof value;
  const lengthInfo = Array.isArray(value) ? `, length ${value.length}` : '';
  return { name, type: type + lengthInfo, preview: preview(value) };
}

function inspectVariables() {
  const seen = new Map();
  for (const name of Object.keys(sandbox)) {
    if (!INJECTED.has(name)) seen.set(name, describeVariable(name, sandbox[name]));
  }
  for (const name of lexicalNames) {
    if (seen.has(name)) continue;
    try {
      seen.set(name, describeVariable(name, vm.runInContext(name, context)));
    } catch {
      // Recorded from a cell that failed or was inside a block; skip.
    }
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function symbolBefore(code, cursor) {
  const match = code.slice(0, cursor).match(/[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\.?$/);
  return match ? match[0] : '';
}

function propertyNames(object) {
  const names = new Set();
  let current = object;
  while (current !== null && current !== undefined && names.size < 500) {
    for (const name of Object.getOwnPropertyNames(current)) names.add(name);
    current = Object.getPrototypeOf(current);
  }
  return [...names];
}

function complete(code, cursor) {
  const symbol = symbolBefore(code, cursor);
  let prefix = symbol;
  let candidates;
  if (symbol.includes('.')) {
    const at = symbol.lastIndexOf('.');
    prefix = symbol.slice(at + 1);
    try {
      const base = vm.runInContext(symbol.slice(0, at), context);
      candidates = propertyNames(base);
    } catch {
      return { matches: [], replaceFrom: cursor };
    }
  } else {
    candidates = [...Object.keys(sandbox), ...propertyNames(globalThis)];
  }
  const matches = [...new Set(candidates)]
    .filter((c) => c.startsWith(prefix) && (prefix ? true : !c.startsWith('_')))
    .sort();
  return { matches: matches.slice(0, 200), replaceFrom: cursor - prefix.length };
}

function docsFor(code, cursor) {
  const symbol = symbolBefore(code, cursor).replace(/\.$/, '');
  if (!symbol) return { symbol: '', text: 'No symbol at the cursor' };
  let value;
  try {
    value = vm.runInContext(symbol, context);
  } catch {
    return { symbol, text: `${symbol} is not defined` };
  }
  if (typeof value === 'function') {
    const source = String(value);
    const head = source.slice(0, source.indexOf('{')).trim() || source.slice(0, 120);
    return { symbol, text: `${head}\n\n(function, ${value.length} declared parameter${value.length === 1 ? '' : 's'})` };
  }
  const type = typeof value === 'object' && value !== null
    ? value.constructor?.name ?? 'object'
    : typeof value;
  return { symbol, text: `${symbol}: ${type} = ${preview(value)}` };
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
  if (message.type === 'chdir') {
    try {
      process.chdir(message.path ?? '.');
    } catch {
      // Missing directory: stay where we are.
    }
    return;
  }
  if (message.type === 'inspect') {
    send({ id: message.id, type: 'inspect-result', variables: inspectVariables() });
    return;
  }
  if (message.type === 'complete') {
    send({ id: message.id, type: 'complete-result', ...complete(message.code ?? '', message.cursor ?? 0) });
    return;
  }
  if (message.type === 'docs') {
    send({ id: message.id, type: 'docs-result', ...docsFor(message.code ?? '', message.cursor ?? 0) });
    return;
  }
  if (message.type !== 'execute') return;
  queue = queue.then(async () => {
    executionCount += 1;
    currentExecuteId = message.id;
    recordLexicalNames(message.code ?? '');
    const { status, outputs } = await runCell(message.code ?? '', executionCount);
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
