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

test('appendOutput coalesces consecutive same-channel streams', () => {
  const store = new NotebookStore();
  const id = store.cells[0].id;
  store.appendOutput(id, { type: 'stream', name: 'stdout', text: 'a' });
  store.appendOutput(id, { type: 'stream', name: 'stdout', text: 'b' });
  store.appendOutput(id, { type: 'stream', name: 'stderr', text: 'c' });
  store.appendOutput(id, { type: 'execute_result', text: '1' });
  assert.deepEqual(store.getCell(id).outputs, [
    { type: 'stream', name: 'stdout', text: 'ab' },
    { type: 'stream', name: 'stderr', text: 'c' },
    { type: 'execute_result', text: '1' }
  ]);
});

test('undo/redo: insert and delete are inverses, outputs survive', () => {
  const store = new NotebookStore();
  const first = store.cells[0];
  const inserted = store.insertCell({ relativeTo: first.id, position: 'below', source: 'x' });
  store.setOutputs(inserted.id, [{ type: 'execute_result', text: '7' }], 3);

  assert.equal(store.undo(), 'insert code cell');
  assert.equal(store.cellCount, 1);
  assert.equal(store.redo(), 'insert code cell');
  assert.equal(store.cells[1].source, 'x');

  store.deleteCell(store.cells[1].id);
  assert.equal(store.cellCount, 1);
  assert.equal(store.undo(), 'delete code cell');
  assert.equal(store.cellCount, 2);
  assert.equal(store.cells[1].source, 'x');
  assert.deepEqual(store.cells[1].outputs, [{ type: 'execute_result', text: '7' }]);
  assert.equal(store.cells[1].executionCount, 3);
});

test('undo/redo: move and type change', () => {
  const store = new NotebookStore();
  const a = store.cells[0];
  const b = store.insertCell({ relativeTo: a.id, position: 'below' });
  store.moveCell(a.id, 'down');
  assert.deepEqual(store.cells.map((c) => c.id), [b.id, a.id]);
  assert.equal(store.undo(), 'move cell down');
  assert.deepEqual(store.cells.map((c) => c.id), [a.id, b.id]);

  store.setOutputs(a.id, [{ type: 'execute_result', text: '1' }], 1);
  store.setCellType(a.id, 'markdown');
  assert.deepEqual(store.getCell(a.id).outputs, []);
  assert.equal(store.undo(), 'change cell to markdown');
  assert.equal(store.getCell(a.id).type, 'code');
  assert.deepEqual(store.getCell(a.id).outputs, [{ type: 'execute_result', text: '1' }]);
});

test('undo stack: a new operation clears the redo stack; empty stacks return null', () => {
  const store = new NotebookStore();
  assert.equal(store.undo(), null);
  assert.equal(store.redo(), null);
  const a = store.cells[0];
  store.insertCell({ relativeTo: a.id, position: 'below' });
  store.undo();
  store.insertCell({ relativeTo: a.id, position: 'below', type: 'markdown' });
  assert.equal(store.redo(), null);
});

test('undo: sequential undo restores the original order exactly', () => {
  const store = new NotebookStore();
  const a = store.cells[0];
  store.updateSource(a.id, 'first');
  const b = store.insertCell({ relativeTo: a.id, position: 'below', source: 'second' });
  store.insertCell({ relativeTo: b.id, position: 'below', source: 'third' });
  store.moveCell(b.id, 'down');
  store.deleteCell(a.id);

  while (store.undo()) { /* unwind everything */ }
  assert.deepEqual(store.cells.map((c) => c.source), ['first']);
});

test('reset and load clear the undo history', () => {
  const store = new NotebookStore();
  store.insertCell({ relativeTo: store.cells[0].id, position: 'below' });
  store.load({ cells: [{ type: 'code', source: 'x' }], metadata: {} });
  assert.equal(store.undo(), null);
});

test('splitCell divides at the offset and is undoable as one step', () => {
  const store = new NotebookStore();
  const cell = store.cells[0];
  store.updateSource(cell.id, 'x = 1\ny = 2');
  store.setOutputs(cell.id, [{ type: 'execute_result', text: '1' }], 1);
  const newCell = store.splitCell(cell.id, 6); // right after "x = 1\n"
  assert.equal(store.cellCount, 2);
  assert.equal(store.cells[0].source, 'x = 1');
  assert.equal(store.cells[1].source, 'y = 2');
  assert.equal(store.cells[1].id, newCell.id);
  assert.deepEqual(store.cells[0].outputs, [{ type: 'execute_result', text: '1' }]);
  assert.deepEqual(store.cells[1].outputs, []);

  assert.equal(store.undo(), 'split cell');
  assert.equal(store.cellCount, 1);
  assert.equal(store.cells[0].source, 'x = 1\ny = 2');
  assert.equal(store.redo(), 'split cell');
  assert.equal(store.cells[1].source, 'y = 2');
});

test('mergeWithBelow joins sources, keeps upper outputs, undo restores both', () => {
  const store = new NotebookStore();
  const a = store.cells[0];
  store.updateSource(a.id, 'top');
  const b = store.insertCell({ relativeTo: a.id, position: 'below', source: 'bottom' });
  store.setOutputs(b.id, [{ type: 'execute_result', text: 'gone' }], 2);
  const merged = store.mergeWithBelow(a.id);
  assert.equal(merged.id, a.id);
  assert.equal(store.cellCount, 1);
  assert.equal(store.cells[0].source, 'top\nbottom');

  assert.equal(store.undo(), 'merge cells');
  assert.equal(store.cellCount, 2);
  assert.equal(store.cells[0].source, 'top');
  assert.equal(store.cells[1].source, 'bottom');
  assert.deepEqual(store.cells[1].outputs, [{ type: 'execute_result', text: 'gone' }]);
});

test('mergeWithBelow on the last cell returns null', () => {
  const store = new NotebookStore();
  assert.equal(store.mergeWithBelow(store.cells[0].id), null);
  assert.equal(store.undo(), null);
});

test('toggleInitCell flips the flag and initCellIds lists code cells only', () => {
  const store = new NotebookStore();
  const a = store.cells[0];
  assert.equal(store.toggleInitCell(a.id), true);
  assert.equal(store.getCell(a.id).nbMetadata.init_cell, true);
  assert.deepEqual(store.initCellIds(), [a.id]);
  assert.equal(store.toggleInitCell(a.id), false);
  assert.deepEqual(store.initCellIds(), []);
  assert.equal('init_cell' in store.getCell(a.id).nbMetadata, false);
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
