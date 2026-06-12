/**
 * Tests for kernel intelligence: variable inspection, completion, symbol
 * docs, and working-directory control — live against all three runners.
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

const make = {
  python: () => new ProcessKernel({
    command: os.platform() === 'win32' ? 'python' : 'python3',
    args: [path.join(runnersDir, 'python-runner.py')],
    displayName: 'Python 3'
  }),
  javascript: () => new ProcessKernel({
    command: process.execPath,
    args: [path.join(runnersDir, 'js-runner.mjs')],
    displayName: 'JavaScript (Node.js)'
  }),
  bash: () => new ProcessKernel({
    command: 'python3',
    args: [path.join(runnersDir, 'bash-runner.py')],
    displayName: 'Bash (shell)'
  })
};

test('python: inspect lists variables with type, preview, and size', async () => {
  const kernel = make.python();
  try {
    await kernel.execute('answer = 42\nitems = [1, 2, 3]\ndef helper(): pass\nimport json');
    const { variables } = await kernel.request('inspect');
    const byName = Object.fromEntries(variables.map((v) => [v.name, v]));
    assert.equal(byName.answer.type, 'int');
    assert.equal(byName.answer.preview, '42');
    assert.match(byName.items.type, /list, length 3/);
    assert.equal(byName.json.type, 'module');
    assert.ok(byName.helper);
    assert.equal(byName._, undefined); // private names hidden
    assert.equal(byName.notebook, undefined); // injected API hidden
  } finally {
    kernel.stop();
  }
});

test('python: completion on plain names and attributes', async () => {
  const kernel = make.python();
  try {
    await kernel.execute('magic_number = 1\nmagic_word = "x"');
    const code = 'mag';
    const plain = await kernel.request('complete', { code, cursor: code.length });
    assert.deepEqual(plain.matches, ['magic_number', 'magic_word']);
    assert.equal(plain.replaceFrom, 0);

    const attr = 'magic_word.up';
    const dotted = await kernel.request('complete', { code: attr, cursor: attr.length });
    assert.deepEqual(dotted.matches, ['upper']);
    assert.equal(dotted.replaceFrom, attr.length - 2);
  } finally {
    kernel.stop();
  }
});

test('python: docs return signature and docstring', async () => {
  const kernel = make.python();
  try {
    await kernel.execute('def area(width, height):\n    "Area of a rectangle."\n    return width * height');
    const code = 'area';
    const { symbol, text } = await kernel.request('docs', { code, cursor: code.length });
    assert.equal(symbol, 'area');
    assert.match(text, /area\(width, height\)/);
    assert.match(text, /Area of a rectangle\./);

    const missing = await kernel.request('docs', { code: 'nope', cursor: 4 });
    assert.match(missing.text, /not defined/);
  } finally {
    kernel.stop();
  }
});

test('javascript: inspect, completion, and docs', async () => {
  const kernel = make.javascript();
  try {
    await kernel.execute('let total = 7; var names = ["a", "b"]; function greet(who) { return "hi " + who }');
    const { variables } = await kernel.request('inspect');
    const byName = Object.fromEntries(variables.map((v) => [v.name, v]));
    assert.equal(byName.total.preview, '7');
    assert.match(byName.names.type, /length 2/);
    assert.equal(byName.console, undefined); // injected names hidden

    const code = 'names.sli';
    const completion = await kernel.request('complete', { code, cursor: code.length });
    assert.ok(completion.matches.includes('slice'));
    assert.equal(completion.replaceFrom, code.length - 3);

    const docs = await kernel.request('docs', { code: 'greet', cursor: 5 });
    assert.match(docs.text, /function greet\(who\)/);
  } finally {
    kernel.stop();
  }
});

test('bash: inspect and docs', { skip: os.platform() === 'win32' }, async () => {
  const kernel = make.bash();
  try {
    await kernel.execute('FRUIT=apple\nbox() { echo boxed; }');
    const { variables } = await kernel.request('inspect');
    const byName = Object.fromEntries(variables.map((v) => [v.name, v]));
    assert.equal(byName.FRUIT.type, 'variable');
    assert.match(byName.FRUIT.preview, /apple/);
    assert.equal(byName.box.type, 'function');

    const docs = await kernel.request('docs', { code: 'cd', cursor: 2 });
    assert.match(docs.text, /builtin|shell/i);
  } finally {
    kernel.stop();
  }
});

test('bash: completion of commands', { skip: os.platform() === 'win32' }, async () => {
  const kernel = make.bash();
  try {
    const code = 'ech';
    const { matches } = await kernel.request('complete', { code, cursor: code.length });
    assert.ok(matches.includes('echo'));
  } finally {
    kernel.stop();
  }
});

test('chdir notify moves a live python kernel', async () => {
  const kernel = make.python();
  try {
    await kernel.execute('pass');
    kernel.notify('chdir', { path: os.tmpdir() });
    const result = await kernel.execute('import os\nos.getcwd()');
    const value = result.outputs.find((o) => o.type === 'execute_result').text;
    assert.ok(value.includes(os.tmpdir().replace(/\/private/, '')) || value.includes(os.tmpdir()));
  } finally {
    kernel.stop();
  }
});

test('getCwd spec spawns the kernel in that directory', async () => {
  const kernel = new ProcessKernel({
    command: os.platform() === 'win32' ? 'python' : 'python3',
    args: [path.join(runnersDir, 'python-runner.py')],
    displayName: 'Python 3',
    getCwd: () => os.tmpdir()
  });
  try {
    const result = await kernel.execute('import os\nos.getcwd()');
    const value = result.outputs.find((o) => o.type === 'execute_result').text;
    assert.match(value, /tmp|Temp/);
  } finally {
    kernel.stop();
  }
});
