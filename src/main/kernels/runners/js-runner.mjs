/**
 * JavaScript kernel runner.
 *
 * A persistent `node:vm` context in a child process, speaking the same JSON
 * lines protocol as the Python runner. Running notebook code in a separate
 * process keeps the app responsive and lets "restart kernel" work by killing
 * the child. As in Jupyter, notebook code is trusted user code — the vm
 * context is for session isolation and robustness, not a security boundary.
 *
 * Features: persistent globals across cells, captured console output,
 * awaited promise results, top-level await (via async wrapping on demand),
 * and the value of the last expression as an execute_result.
 */

import vm from 'node:vm';
import util from 'node:util';
import readline from 'node:readline';
import { createRequire } from 'node:module';

let executionCount = 0;
let streams = [];

function captureConsole() {
  const write = (name) => (...args) => {
    const text = args.map((a) => (typeof a === 'string' ? a : util.inspect(a))).join(' ') + '\n';
    streams.push({ type: 'stream', name, text });
  };
  return {
    log: write('stdout'),
    info: write('stdout'),
    debug: write('stdout'),
    warn: write('stderr'),
    error: write('stderr')
  };
}

const sandbox = {
  console: captureConsole(),
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

async function runCell(code) {
  streams = [];
  const outputs = [];
  let status = 'ok';
  try {
    let script;
    try {
      script = new vm.Script(code, { filename: '<cell>' });
    } catch (error) {
      // Retry with an async wrapper so top-level await works. The wrapper
      // body can't introduce persistent bindings via let/const, but `var`
      // and assignments to globals still persist, which matches what users
      // need from an awaited cell.
      if (error instanceof SyntaxError && /await/.test(code)) {
        script = new vm.Script(`(async () => { ${code}\n })()`, { filename: '<cell>' });
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
  return { status, outputs: [...streams, ...outputs] };
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
  if (message.type !== 'execute') return;
  queue = queue.then(async () => {
    executionCount += 1;
    const { status, outputs } = await runCell(message.code ?? '');
    process.stdout.write(
      JSON.stringify({
        id: message.id,
        type: 'result',
        status,
        outputs,
        executionCount
      }) + '\n'
    );
  });
});

rl.on('close', () => process.exit(0));
