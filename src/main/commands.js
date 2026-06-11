/**
 * Notebook commands — the single implementation behind both the native menu
 * and renderer-initiated actions, so every feature behaves identically no
 * matter how it is invoked. Commands act on the store's active cell.
 */

import { sendToRenderer } from './ipc.js';
import { outputSummary } from '../core/output-summary.js';

/** A blind user's progress indicator: periodic "still running" updates. */
const STILL_RUNNING_INTERVAL_MS = 30000;

export function createCommands({ store, kernels, getWindow, settings }) {
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
    store.clearOutputs(cell.id);

    const startedAt = Date.now();
    const stillRunning = setInterval(() => {
      const seconds = Math.round((Date.now() - startedAt) / 1000);
      announce(`Cell ${position} still running, ${seconds} seconds`);
    }, STILL_RUNNING_INTERVAL_MS);

    const { status, outputs, executionCount } = await kernels.execute(
      store.metadata.kernelName,
      cell.source,
      {
        timeoutMs: (settings?.values.executionTimeoutSeconds ?? 0) * 1000,
        // Stream output appears in the cell as it is produced.
        onStream: ({ name, text }) => {
          if (store.getCell(cell.id)) {
            store.appendOutput(cell.id, { type: 'stream', name, text });
          }
        }
      }
    );

    clearInterval(stillRunning);
    // The cell may have been deleted while the kernel was busy.
    if (!store.getCell(cell.id)) return;
    for (const output of outputs) store.appendOutput(cell.id, output);
    store.setExecutionCount(cell.id, executionCount);
    sendToRenderer(getWindow(), 'cell-execution-finished', { id: cell.id, status });
    const allOutputs = store.getCell(cell.id).outputs;
    const summary = outputSummary(status, allOutputs, settings?.values.maxAnnouncedOutputLength);
    announce(`Cell ${position} ${status === 'ok' ? 'done' : 'failed'}. ${summary}`, status === 'error');

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

  async function runMany(ids, what) {
    if (ids.length === 0) {
      announce(`No cells ${what}`);
      return;
    }
    announce(`Running ${ids.length} cell${ids.length === 1 ? '' : 's'} ${what}`);
    for (const id of ids) {
      if (!store.getCell(id)) continue;
      await runCell(id);
    }
    announce(`Finished running cells ${what}`);
  }

  async function runAll() {
    await runMany(store.cells.map((c) => c.id), 'in the notebook');
  }

  async function runAllAbove() {
    const index = store.indexOf(store.activeCellId);
    if (index === -1) return;
    await runMany(store.cells.slice(0, index).map((c) => c.id), 'above');
  }

  async function runAllBelow() {
    const index = store.indexOf(store.activeCellId);
    if (index === -1) return;
    await runMany(store.cells.slice(index).map((c) => c.id), 'from here down');
  }

  function setImageDescription(id, outputIndex, text) {
    store.setImageDescription(id ?? store.activeCellId, outputIndex, text);
    announce('Image description saved');
  }

  async function updateSettings(values) {
    await settings.save(values);
    announce('Settings saved');
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

  function undoCellOperation() {
    const label = store.undo();
    announce(label ? `Undid ${label}` : 'Nothing to undo');
    if (label && store.activeCellId) focusCell(store.activeCellId);
  }

  function redoCellOperation() {
    const label = store.redo();
    announce(label ? `Redid ${label}` : 'Nothing to redo');
    if (label && store.activeCellId) focusCell(store.activeCellId);
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
    runAllAbove,
    runAllBelow,
    setImageDescription,
    updateSettings,
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
    undoCellOperation,
    redoCellOperation,
    announce
  };
}
