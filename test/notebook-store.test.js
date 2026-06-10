import test from 'node:test';
import assert from 'node:assert/strict';
import { NotebookStore } from '../src/core/notebook-store.js';

test('a new store has one empty code cell and is clean', () => {
  const store = new NotebookStore();
  assert.equal(store.cellCount, 1);
  assert.equal(store.cells[0].type, 'code');
  assert.equal(store.cells[0].source, '');
  assert.equal(store.dirty, false);
  assert.equal(store.activeCellId, store.cells[0].id);
});

test('insertCell places cells relative to an anchor', () => {
  const store = new NotebookStore();
  const first = store.cells[0];
  const below = store.insertCell({ relativeTo: first.id, position: 'below', source: 'b' });
  const above = store.insertCell({ relativeTo: first.id, position: 'above', source: 'a' });
  assert.deepEqual(store.cells.map((c) => c.id), [above.id, first.id, below.id]);
  assert.equal(store.dirty, true);
});

test('insertCell emits cell-inserted with the index', () => {
  const store = new NotebookStore();
  let event = null;
  store.on('cell-inserted', (e) => { event = e; });
  const cell = store.insertCell({ relativeTo: store.cells[0].id, position: 'below' });
  assert.equal(event.cell.id, cell.id);
  assert.equal(event.index, 1);
});

test('deleteCell refuses to delete the last cell', () => {
  const store = new NotebookStore();
  assert.equal(store.deleteCell(store.cells[0].id), null);
  assert.equal(store.cellCount, 1);
});

test('deleteCell moves the active cell to a neighbour', () => {
  const store = new NotebookStore();
  const a = store.cells[0];
  const b = store.insertCell({ relativeTo: a.id, position: 'below' });
  const c = store.insertCell({ relativeTo: b.id, position: 'below' });
  store.setActiveCell(c.id);
  store.deleteCell(c.id);
  assert.equal(store.activeCellId, b.id);
  store.setActiveCell(a.id);
  store.deleteCell(a.id);
  assert.equal(store.activeCellId, b.id);
});

test('moveCell swaps neighbours and reports edges', () => {
  const store = new NotebookStore();
  const a = store.cells[0];
  const b = store.insertCell({ relativeTo: a.id, position: 'below' });
  assert.equal(store.moveCell(a.id, 'up'), false);
  assert.equal(store.moveCell(a.id, 'down'), true);
  assert.deepEqual(store.cells.map((c) => c.id), [b.id, a.id]);
});

test('setCellType clears outputs and rejects unknown types', () => {
  const store = new NotebookStore();
  const cell = store.cells[0];
  store.setOutputs(cell.id, [{ type: 'stream', name: 'stdout', text: 'hi\n' }], 1);
  store.setCellType(cell.id, 'markdown');
  assert.equal(store.getCell(cell.id).type, 'markdown');
  assert.deepEqual(store.getCell(cell.id).outputs, []);
  assert.equal(store.getCell(cell.id).executionCount, null);
  assert.throws(() => store.setCellType(cell.id, 'banana'));
});

test('updateSource is a no-op for identical text', () => {
  const store = new NotebookStore();
  const cell = store.cells[0];
  store.updateSource(cell.id, 'x = 1');
  store.markClean();
  store.updateSource(cell.id, 'x = 1');
  assert.equal(store.dirty, false);
});

test('load replaces state and tolerates empty notebooks', () => {
  const store = new NotebookStore();
  store.load({ cells: [], metadata: { kernelName: 'javascript' } });
  assert.equal(store.cellCount, 1);
  assert.equal(store.metadata.kernelName, 'javascript');
  assert.equal(store.dirty, false);
});

test('clearAllOutputs clears every cell', () => {
  const store = new NotebookStore();
  const a = store.cells[0];
  const b = store.insertCell({ relativeTo: a.id, position: 'below' });
  store.setOutputs(a.id, [{ type: 'execute_result', text: '1' }], 1);
  store.setOutputs(b.id, [{ type: 'execute_result', text: '2' }], 2);
  store.clearAllOutputs();
  assert.deepEqual(store.getCell(a.id).outputs, []);
  assert.equal(store.getCell(b.id).executionCount, null);
});
