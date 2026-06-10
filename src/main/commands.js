/**
 * Notebook commands — the single implementation behind both the native menu
 * and renderer-initiated actions, so every feature behaves identically no
 * matter how it is invoked. Commands act on the store's active cell.
 */

import { sendToRenderer } from './ipc.js';

function outputSummary(status, outputs) {
  if (status === 'error') {
    const error = outputs.find((o) => o.type === 'error');
    return error ? `${error.ename}: ${error.evalue}` : 'failed';
  }
  const text = outputs
    .filter((o) => o.type === 'stream' || o.type === 'execute_result')
    .map((o) => o.text)
    .join('');
  if (text.trim() === '') return 'no output';
  const trimmed = text.replace(/\n$/, '');
  const lines = trimmed.split('\n');
  // Short outputs are spoken verbatim; long ones are summarized.
  if (lines.length === 1 && trimmed.length <= 160) return `output: ${trimmed}`;
  return `${lines.length} lines of output. First line: ${lines[0]}`;
}

export function createCommands({ store, kernels, getWindow }) {
  const announce = (text, assertive = false) =>
    sendToRenderer(getWindow(), 'announce', { text, assertive });

  const focusCell = (id, edit = false) =>
    sendToRenderer(getWindow(), 'focus-cell', { id, edit });

  async function runCell(id, { advance = false } = {}) {
    const cell = store.getCell(id ?? store.activeCellId);
    if (!cell) return;

    if (cell.type !== 'code') {
      // "Running" a markdown/raw cell renders it (handled by the view via
      // this event) and optionally advances.
      sendToRenderer(getWindow(), 'cell-rendered', { id: cell.id });
      if (advance) advanceFrom(cell.id);
      return;
    }

    const position = store.indexOf(cell.id) + 1;
    announce(`Running cell ${position}`);
    sendToRenderer(getWindow(), 'cell-execution-started', { id: cell.id });

    const { status, outputs, executionCount } = await kernels.execute(
      store.metadata.kernelName,
      cell.source
    );

    // The cell may have been deleted while the kernel was busy.
    if (!store.getCell(cell.id)) return;
    store.setOutputs(cell.id, outputs, executionCount);
    sendToRenderer(getWindow(), 'cell-execution-finished', { id: cell.id, status });
    announce(`Cell ${position} ${status === 'ok' ? 'done' : 'failed'}. ${outputSummary(status, outputs)}`, status === 'error');

    if (advance && status === 'ok') advanceFrom(cell.id);
  }

  function advanceFrom(id) {
    const index = store.indexOf(id);
    if (index === store.cellCount - 1) {
      const cell = store.insertCell({ type: 'code', relativeTo: id, position: 'below' });
      focusCell(cell.id, true);
    } else {
      focusCell(store.cells[index + 1].id, true);
    }
  }

  async function runAll() {
    announce(`Running all ${store.cellCount} cells`);
    for (const id of store.cells.map((c) => c.id)) {
      if (!store.getCell(id)) continue;
      await runCell(id);
    }
    announce('Finished running all cells');
  }

  function insertCell(type, position) {
    const cell = store.insertCell({
      type,
      relativeTo: store.activeCellId,
      position
    });
    const index = store.indexOf(cell.id);
    announce(`${type} cell inserted at position ${index + 1} of ${store.cellCount}`);
    focusCell(cell.id, true);
  }

  function deleteCell() {
    const id = store.activeCellId;
    if (!id) return;
    const index = store.indexOf(id);
    if (!store.deleteCell(id)) {
      announce('Cannot delete the only cell');
      return;
    }
    announce(`Cell ${index + 1} deleted, ${store.cellCount} cells remain`);
    focusCell(store.activeCellId);
  }

  function moveCell(direction) {
    const id = store.activeCellId;
    if (!id) return;
    if (store.moveCell(id, direction)) {
      announce(`Cell moved ${direction} to position ${store.indexOf(id) + 1} of ${store.cellCount}`);
      focusCell(id);
    } else {
      announce(`Cell is already at the ${direction === 'up' ? 'top' : 'bottom'}`);
    }
  }

  function setCellType(type) {
    const id = store.activeCellId;
    if (!id) return;
    store.setCellType(id, type);
    announce(`Cell changed to ${type}`);
    focusCell(id);
  }

  function setKernel(kernelName) {
    store.setKernelName(kernelName);
    const spec = kernels.list().find((k) => k.name === kernelName);
    announce(`Kernel set to ${spec?.displayName ?? kernelName}`);
  }

  function interruptKernel() {
    kernels.interrupt(store.metadata.kernelName);
    announce('Interrupt sent to kernel', true);
  }

  function restartKernel() {
    kernels.restart(store.metadata.kernelName);
    announce('Kernel restarted. All session state was cleared.', true);
  }

  function kernelStatus() {
    const name = store.metadata.kernelName;
    const spec = kernels.list().find((k) => k.name === name);
    announce(`${spec?.displayName ?? name} kernel is ${kernels.status(name)}`);
  }

  function clearOutputs() {
    if (store.activeCellId) {
      store.clearOutputs(store.activeCellId);
      announce('Output cleared');
    }
  }

  function clearAllOutputs() {
    store.clearAllOutputs();
    announce('All outputs cleared');
  }

  return {
    runCell,
    runAll,
    insertCell,
    deleteCell,
    moveCell,
    setCellType,
    setKernel,
    interruptKernel,
    restartKernel,
    kernelStatus,
    clearOutputs,
    clearAllOutputs,
    announce
  };
}
