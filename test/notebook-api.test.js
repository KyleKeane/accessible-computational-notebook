/**
 * Tests for the in-kernel notebook automation API: the main-side dispatch
 * against a real store, and the full loop through real kernel processes,
 * wired exactly the way src/main/ipc.js wires production.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { ProcessKernel } from '../src/main/kernels/process-kernel.js';
import { createNotebookApi, handleApiRequest } from '../src/main/kernels/notebook-api.js';
import { NotebookStore } from '../src/core/notebook-store.js';

const runnersDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../src/main/kernels/runners'
);

function wireApi(kernel, store) {
  const api = createNotebookApi(store);
  kernel.on('api-request', ({ request, respond }) => {
    try {
      respond(handleApiRequest(api, request) ?? null, null);
    } catch (error) {
      respond(null, error.message);
    }
  });
}

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

test('dispatch: insert, read, modify, delete against a real store', () => {
  const store = new NotebookStore();
  const api = createNotebookApi(store);

  const { index } = handleApiRequest(api, {
    method: 'insert_cell',
    args: { source: 'x = 1', type: 'code' }
  });
  assert.equal(index, 1);
  assert.equal(handleApiRequest(api, { method: 'cell_count' }), 2);
  assert.equal(handleApiRequest(api, { method: 'get_source', args: { index: 1 } }), 'x = 1');

  handleApiRequest(api, { method: 'set_source', args: { index: 1, source: 'x = 2' } });
  assert.equal(store.cells[1].source, 'x = 2');

  const cells = handleApiRequest(api, { method: 'get_cells' });
  assert.equal(cells.length, 2);
  assert.equal(cells[1].source, 'x = 2');

  handleApiRequest(api, { method: 'delete_cell', args: { index: 1 } });
  assert.equal(store.cellCount, 1);

  assert.throws(() => handleApiRequest(api, { method: 'get_source', args: { index: 9 } }), /No cell at index 9/);
  assert.throws(() => handleApiRequest(api, { method: 'nope' }), /Unknown notebook API method/);
});

test('python: notebook API works from inside a cell', async () => {
  const store = new NotebookStore();
  const kernel = pythonKernel();
  wireApi(kernel, store);
  try {
    const result = await kernel.execute(
      'created = notebook.insert_cell(source="print(42)")\n' +
        '(created["index"], notebook.cell_count(), notebook.get_source(created["index"]))'
    );
    assert.equal(result.status, 'ok');
    const value = result.outputs.find((o) => o.type === 'execute_result').text;
    assert.equal(value, "(1, 2, 'print(42)')");
    assert.equal(store.cellCount, 2);
    assert.equal(store.cells[1].source, 'print(42)');
  } finally {
    kernel.stop();
  }
});

test('python: API errors raise catchable exceptions', async () => {
  const store = new NotebookStore();
  const kernel = pythonKernel();
  wireApi(kernel, store);
  try {
    const result = await kernel.execute(
      'try:\n' +
        '    notebook.delete_cell(99)\n' +
        'except RuntimeError as e:\n' +
        '    msg = str(e)\n' +
        'msg'
    );
    assert.equal(result.status, 'ok');
    assert.match(result.outputs.find((o) => o.type === 'execute_result').text, /No cell at index 99/);
  } finally {
    kernel.stop();
  }
});

test('javascript: notebook API works with await', async () => {
  const store = new NotebookStore();
  const kernel = jsKernel();
  wireApi(kernel, store);
  try {
    const result = await kernel.execute(
      'var created = await notebook.insertCell({ source: "1 + 1" });\n' +
        'var count = await notebook.cellCount();\n' +
        '[created.index, count]'
    );
    assert.equal(result.status, 'ok');
    assert.equal(result.outputs.find((o) => o.type === 'execute_result').text, '[ 1, 2 ]');
    assert.equal(store.cells[1].source, '1 + 1');
  } finally {
    kernel.stop();
  }
});
