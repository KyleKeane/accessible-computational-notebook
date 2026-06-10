/**
 * Live integration tests for both kernel runners — these spawn real child
 * processes and exercise the full execution path the app uses, no Electron
 * required.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { ProcessKernel } from '../src/main/kernels/process-kernel.js';

const runnersDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../src/main/kernels/runners'
);

function pythonKernel() {
  return new ProcessKernel({
    command: os.platform() === 'win32' ? 'python' : 'python3',
    args: [path.join(runnersDir, 'python-runner.py')],
    displayName: 'Python 3'
  });
}

function jsKernel() {
  return new ProcessKernel({
    command: process.execPath,
    args: [path.join(runnersDir, 'js-runner.mjs')],
    displayName: 'JavaScript (Node.js)'
  });
}

function textOf(outputs, type) {
  return outputs.filter((o) => o.type === type).map((o) => o.text).join('');
}

test('python: state persists across executions', async () => {
  const kernel = pythonKernel();
  try {
    const first = await kernel.execute('x = 21');
    assert.equal(first.status, 'ok');
    const second = await kernel.execute('x * 2');
    assert.equal(second.status, 'ok');
    assert.equal(textOf(second.outputs, 'execute_result'), '42');
    assert.equal(second.executionCount, 2);
  } finally {
    kernel.stop();
  }
});

test('python: stdout, stderr, and trailing expression', async () => {
  const kernel = pythonKernel();
  try {
    const result = await kernel.execute(
      'import sys\nprint("out")\nprint("err", file=sys.stderr)\n"value"'
    );
    assert.equal(result.status, 'ok');
    assert.equal(textOf(result.outputs, 'stream'), 'out\nerr\n');
    assert.equal(textOf(result.outputs, 'execute_result'), "'value'");
  } finally {
    kernel.stop();
  }
});

test('python: multi-line blocks with blank lines work (no REPL scraping)', async () => {
  const kernel = pythonKernel();
  try {
    const result = await kernel.execute(
      'def f(n):\n    if n <= 1:\n        return 1\n\n    return n * f(n - 1)\n\nf(5)'
    );
    assert.equal(result.status, 'ok');
    assert.equal(textOf(result.outputs, 'execute_result'), '120');
  } finally {
    kernel.stop();
  }
});

test('python: errors are structured and the session survives them', async () => {
  const kernel = pythonKernel();
  try {
    const bad = await kernel.execute('1/0');
    assert.equal(bad.status, 'error');
    const error = bad.outputs.find((o) => o.type === 'error');
    assert.equal(error.ename, 'ZeroDivisionError');
    assert.match(error.traceback, /ZeroDivisionError/);
    const after = await kernel.execute('2 + 2');
    assert.equal(after.status, 'ok');
    assert.equal(textOf(after.outputs, 'execute_result'), '4');
  } finally {
    kernel.stop();
  }
});

test('python: output containing ">>> " is not corrupted', async () => {
  const kernel = pythonKernel();
  try {
    const result = await kernel.execute('print(">>> not a prompt")');
    assert.equal(textOf(result.outputs, 'stream'), '>>> not a prompt\n');
  } finally {
    kernel.stop();
  }
});

test('javascript: state persists across executions', async () => {
  const kernel = jsKernel();
  try {
    await kernel.execute('let answer = 40');
    const result = await kernel.execute('answer + 2');
    assert.equal(result.status, 'ok');
    assert.equal(textOf(result.outputs, 'execute_result'), '42');
  } finally {
    kernel.stop();
  }
});

test('javascript: console goes to streams, objects are inspected', async () => {
  const kernel = jsKernel();
  try {
    const result = await kernel.execute('console.log("hi", { a: 1 }); console.error("bad");');
    const stdout = result.outputs.filter((o) => o.type === 'stream' && o.name === 'stdout');
    const stderr = result.outputs.filter((o) => o.type === 'stream' && o.name === 'stderr');
    assert.equal(stdout[0].text, 'hi { a: 1 }\n');
    assert.equal(stderr[0].text, 'bad\n');
  } finally {
    kernel.stop();
  }
});

test('javascript: promise results are awaited; top-level await works', async () => {
  const kernel = jsKernel();
  try {
    const promised = await kernel.execute('Promise.resolve(7)');
    assert.equal(textOf(promised.outputs, 'execute_result'), '7');
    const awaited = await kernel.execute(
      'var v = await new Promise(r => setTimeout(() => r("done"), 10)); console.log(v)'
    );
    assert.equal(awaited.status, 'ok');
    assert.equal(textOf(awaited.outputs, 'stream'), 'done\n');
  } finally {
    kernel.stop();
  }
});

test('javascript: errors are structured and the session survives them', async () => {
  const kernel = jsKernel();
  try {
    const bad = await kernel.execute('nope.nope');
    assert.equal(bad.status, 'error');
    const error = bad.outputs.find((o) => o.type === 'error');
    assert.equal(error.ename, 'ReferenceError');
    const after = await kernel.execute('1 + 1');
    assert.equal(textOf(after.outputs, 'execute_result'), '2');
  } finally {
    kernel.stop();
  }
});

test('restart gives a fresh session', async () => {
  const kernel = pythonKernel();
  try {
    await kernel.execute('x = 1');
    kernel.restart();
    const result = await kernel.execute('"x" in dir()');
    assert.equal(textOf(result.outputs, 'execute_result'), 'False');
  } finally {
    kernel.stop();
  }
});

test('a stopped kernel reports errors instead of hanging', async () => {
  const kernel = pythonKernel();
  const pending = kernel.execute('import time; time.sleep(60)');
  kernel.stop();
  const result = await pending;
  assert.equal(result.status, 'error');
  assert.match(result.outputs[0].evalue, /stopped/);
});

test('python: SIGINT interrupts a running cell, session survives', { skip: os.platform() === 'win32' }, async () => {
  const kernel = pythonKernel();
  try {
    // Make sure the kernel is up and busy before interrupting.
    await kernel.execute('pass');
    const pending = kernel.execute('import time\ntime.sleep(30)');
    await new Promise((r) => setTimeout(r, 300));
    kernel.interrupt();
    const result = await pending;
    assert.equal(result.status, 'error');
    assert.equal(result.outputs.find((o) => o.type === 'error').ename, 'KeyboardInterrupt');
    const after = await kernel.execute('"alive"');
    assert.equal(textOf(after.outputs, 'execute_result'), "'alive'");
  } finally {
    kernel.stop();
  }
});
