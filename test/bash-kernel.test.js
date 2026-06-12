/**
 * Live integration tests for the Bash kernel runner. Skipped on Windows
 * (the runner needs bash and POSIX process groups).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { ProcessKernel } from '../src/main/kernels/process-kernel.js';

const skip = os.platform() === 'win32';

const runnersDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../src/main/kernels/runners'
);

function bashKernel() {
  return new ProcessKernel({
    command: 'python3',
    args: [path.join(runnersDir, 'bash-runner.py')],
    displayName: 'Bash (shell)'
  });
}

async function executeCollect(kernel, code, options = {}) {
  const streams = [];
  const result = await kernel.execute(code, {
    ...options,
    onStream: ({ name, text }) => streams.push({ name, text })
  });
  const streamText = (name) =>
    streams.filter((s) => s.name === name).map((s) => s.text).join('');
  return { ...result, stdout: streamText('stdout'), stderr: streamText('stderr') };
}

test('bash: variables persist between cells', { skip }, async () => {
  const kernel = bashKernel();
  try {
    await kernel.execute('GREETING="hello from cell one"');
    const result = await executeCollect(kernel, 'echo "$GREETING"');
    assert.equal(result.status, 'ok');
    assert.equal(result.stdout, 'hello from cell one\n');
  } finally {
    kernel.stop();
  }
});

test('bash: functions and the working directory persist', { skip }, async () => {
  const kernel = bashKernel();
  try {
    await kernel.execute('where() { pwd; }\ncd /tmp');
    const result = await executeCollect(kernel, 'where');
    assert.equal(result.status, 'ok');
    assert.equal(result.stdout.trim(), os.platform() === 'darwin' ? '/private/tmp' : '/tmp');
  } finally {
    kernel.stop();
  }
});

test('bash: stderr is a separate stream', { skip }, async () => {
  const kernel = bashKernel();
  try {
    const result = await executeCollect(kernel, 'echo out; echo err >&2');
    assert.equal(result.stdout, 'out\n');
    assert.equal(result.stderr, 'err\n');
  } finally {
    kernel.stop();
  }
});

test('bash: non-zero exit status is a structured error; session survives', { skip }, async () => {
  const kernel = bashKernel();
  try {
    const bad = await kernel.execute('exit 3');
    assert.equal(bad.status, 'error');
    assert.equal(bad.outputs[0].ename, 'ExitStatus');
    assert.match(bad.outputs[0].evalue, /status 3/);
    const after = await executeCollect(kernel, 'echo still here');
    assert.equal(after.status, 'ok');
    assert.equal(after.stdout, 'still here\n');
  } finally {
    kernel.stop();
  }
});

test('bash: a slow command is stopped by the timeout; session survives', { skip }, async () => {
  const kernel = bashKernel();
  try {
    await kernel.execute(':'); // warm up
    const result = await kernel.execute('sleep 60', { timeoutMs: 500 });
    assert.equal(result.status, 'error');
    assert.equal(result.outputs[0].ename, 'TimeoutError');
    const after = await executeCollect(kernel, 'echo recovered');
    assert.equal(after.stdout, 'recovered\n');
  } finally {
    kernel.stop();
  }
});

test('bash: multi-line scripts with pipes and loops work', { skip }, async () => {
  const kernel = bashKernel();
  try {
    const result = await executeCollect(
      kernel,
      'for i in 1 2 3; do\n  echo "line $i"\ndone | grep -c line'
    );
    assert.equal(result.status, 'ok');
    assert.equal(result.stdout, '3\n');
  } finally {
    kernel.stop();
  }
});
