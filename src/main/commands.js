/**
 * Notebook commands — the single implementation behind both the native menu
 * and renderer-initiated actions, so every feature behaves identically no
 * matter how it is invoked. Commands act on the store's active cell.
 */

import { sendToRenderer } from './ipc.js';
import { outputSummary } from '../core/output-summary.js';
import { extractOutline, sectionRange } from '../core/outline.js';

/** A blind user's progress indicator: periodic "still running" updates. */
const STILL_RUNNING_INTERVAL_MS = 30000;

/** Fast cells skip the "Running" announcement: hearing "Running cell 2"
    immediately followed by "Cell 2 done" is the chattiest pattern in the
    app, and the completion line carries all the information. */
const RUNNING_ANNOUNCE_DELAY_MS = 400;

export function createCommands({ store, kernels, getWindow, settings, getFilePath }) {
  const announce = (text, assertive = false) =>
    sendToRenderer(getWindow(), 'announce', { text, assertive });

  const focusCell = (id, edit = false) =>
    sendToRenderer(getWindow(), 'focus-cell', { id, edit });

  // Menu accelerators bypass <dialog> inertness; while a modal dialog is
  // open, mutating the notebook invisibly behind it would be silent chaos.
  let modalOpen = false;

  function setUiState({ modalOpen: open }) {
    modalOpen = Boolean(open);
  }

  function blockedByDialog() {
    if (!modalOpen) return false;
    announce('Close the open dialog first');
    return true;
  }

  async function runCell(id, options = {}) {
    if (blockedByDialog()) return;
    return runCellInternal(id, options);
  }

  async function runCellInternal(id, { advance = false } = {}) {
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
    sendToRenderer(getWindow(), 'cell-execution-started', { id: cell.id });
    store.clearOutputs(cell.id);

    const startedAt = Date.now();
    const runningTimer = setTimeout(() => {
      announce(`Running cell ${position}`);
    }, RUNNING_ANNOUNCE_DELAY_MS);
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

    clearTimeout(runningTimer);
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
    if (blockedByDialog()) return;
    if (ids.length === 0) {
      announce(`No cells ${what}`);
      return;
    }
    announce(`Running ${ids.length} cell${ids.length === 1 ? '' : 's'} ${what}`);
    for (const id of ids) {
      if (!store.getCell(id)) continue;
      await runCellInternal(id);
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

  async function listVariables() {
    const reply = await kernels.request(store.metadata.kernelName, 'inspect');
    if (reply.error) {
      announce(reply.error, true);
      return;
    }
    const variables = reply.variables ?? [];
    if (variables.length === 0) {
      announce('No variables defined yet');
      return;
    }
    announce(`${variables.length} variable${variables.length === 1 ? '' : 's'}`);
    sendToRenderer(getWindow(), 'show-variables', { variables });
  }

  function complete(code, cursor) {
    return kernels.request(store.metadata.kernelName, 'complete', { code, cursor });
  }

  function symbolDocs(code, cursor) {
    return kernels.request(store.metadata.kernelName, 'docs', { code, cursor });
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
    if (blockedByDialog()) return;
    const cell = store.insertCell({
      type,
      relativeTo: store.activeCellId,
      position
    });
    // Focus moves to the new editor, whose label carries type and
    // position — announcing them again would be double speech.
    announce('Inserted');
    focusCell(cell.id, true);
  }

  function deleteCell() {
    if (blockedByDialog()) return;
    const id = store.activeCellId;
    if (!id) return;
    if (!store.deleteCell(id)) {
      announce('Cannot delete the only cell');
      return;
    }
    // Focus lands on the neighbour, whose label gives the new position.
    announce('Deleted');
    focusCell(store.activeCellId);
  }

  function moveCell(direction) {
    if (blockedByDialog()) return;
    const id = store.activeCellId;
    if (!id) return;
    if (store.moveCell(id, direction)) {
      // Re-focusing the same element is silent, so position matters here.
      announce(`Moved ${direction} to ${store.indexOf(id) + 1} of ${store.cellCount}`);
      focusCell(id);
    } else {
      announce(`Cell is already at the ${direction === 'up' ? 'top' : 'bottom'}`);
    }
  }

  /* Cell clipboard: lives in the main process so it works regardless of
     which surface (menu, future windows) triggers it. */
  let cellClipboard = null;

  function copyCell() {
    const cell = store.getCell(store.activeCellId);
    if (!cell) return;
    cellClipboard = { type: cell.type, source: cell.source };
    announce(`${cell.type} cell copied`);
  }

  function cutCell() {
    if (blockedByDialog()) return;
    const cell = store.getCell(store.activeCellId);
    if (!cell) return;
    if (store.cellCount === 1) {
      announce('Cannot cut the only cell');
      return;
    }
    cellClipboard = { type: cell.type, source: cell.source };
    deleteCell();
  }

  function pasteCell() {
    if (blockedByDialog()) return;
    if (!cellClipboard) {
      announce('Nothing to paste; cut or copy a cell first');
      return;
    }
    const cell = store.insertCell({
      ...cellClipboard,
      relativeTo: store.activeCellId,
      position: 'below'
    });
    announce('Pasted');
    focusCell(cell.id);
  }

  function splitCell(id, offset) {
    if (blockedByDialog()) return;
    const cellId = id ?? store.activeCellId;
    if (!store.getCell(cellId)) return;
    const newCell = store.splitCell(cellId, offset);
    announce('Cell split');
    focusCell(newCell.id, true);
  }

  function mergeBelow() {
    if (blockedByDialog()) return;
    const id = store.activeCellId;
    if (!id) return;
    const merged = store.mergeWithBelow(id);
    if (!merged) {
      announce('No cell below to merge with');
      return;
    }
    announce('Cells merged');
    focusCell(merged.id, true);
  }

  /** Evaluate selected text without touching any cell's outputs —
      Wolfram-style in-place exploration; the result is only spoken. */
  async function runSnippet(code) {
    if (blockedByDialog()) return;
    if (!code || code.trim() === '') {
      announce('Select some code first');
      return;
    }
    const { status, outputs } = await kernels.execute(store.metadata.kernelName, code, {
      timeoutMs: (settings?.values.executionTimeoutSeconds ?? 0) * 1000
    });
    const summary = outputSummary(status, outputs, settings?.values.maxAnnouncedOutputLength);
    announce(`Selection: ${summary}`, status === 'error');
  }

  /** Collapse or expand the section starting at the active heading cell. */
  function toggleSection() {
    if (blockedByDialog()) return;
    const cell = store.getCell(store.activeCellId);
    if (!cell) return;
    const range = sectionRange(store.cells, cell.id);
    if (!range) {
      announce('Not on a section heading. Sections start at markdown headings.');
      return;
    }
    const collapsed = !cell.nbMetadata?.heading_collapsed;
    store.setCollapsed(cell.id, collapsed);
    const count = range.endIndex - range.startIndex;
    announce(
      collapsed
        ? `${range.title} collapsed, ${count} cell${count === 1 ? '' : 's'} hidden`
        : `${range.title} expanded`
    );
    focusCell(cell.id);
  }

  /** One-keystroke orientation: where am I, what is this notebook. */
  function describeNotebook() {
    const name = getFilePath?.() ?? null;
    const counts = { code: 0, markdown: 0, raw: 0 };
    for (const cell of store.cells) counts[cell.type] += 1;
    const sections = extractOutline(store.cells).length;
    const kernelName = store.metadata.kernelName;
    const spec = kernels.list().find((k) => k.name === kernelName);
    const parts = [
      name ? name.split(/[\\/]/).pop() : 'Untitled notebook',
      store.dirty ? 'modified' : 'saved',
      `${store.cellCount} cell${store.cellCount === 1 ? '' : 's'}: ` +
        Object.entries(counts).filter(([, n]) => n > 0).map(([t, n]) => `${n} ${t}`).join(', '),
      sections > 0 ? `${sections} section${sections === 1 ? '' : 's'}` : null,
      `${spec?.displayName ?? kernelName} kernel ${kernels.status(kernelName)}`
    ];
    announce(parts.filter(Boolean).join('. '));
  }

  function setCellType(type) {
    if (blockedByDialog()) return;
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
    if (blockedByDialog()) return;
    const label = store.undo();
    announce(label ? `Undid ${label}` : 'Nothing to undo');
    if (label && store.activeCellId) focusCell(store.activeCellId);
  }

  function redoCellOperation() {
    if (blockedByDialog()) return;
    const label = store.redo();
    announce(label ? `Redid ${label}` : 'Nothing to redo');
    if (label && store.activeCellId) focusCell(store.activeCellId);
  }

  function clearOutputs() {
    if (blockedByDialog()) return;
    if (store.activeCellId) {
      store.clearOutputs(store.activeCellId);
      announce('Output cleared');
    }
  }

  function clearAllOutputs() {
    if (blockedByDialog()) return;
    store.clearAllOutputs();
    announce('All outputs cleared');
  }

  return {
    runCell,
    runAll,
    runAllAbove,
    runAllBelow,
    listVariables,
    complete,
    symbolDocs,
    setImageDescription,
    updateSettings,
    insertCell,
    deleteCell,
    copyCell,
    cutCell,
    pasteCell,
    splitCell,
    mergeBelow,
    runSnippet,
    describeNotebook,
    toggleSection,
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
    setUiState,
    announce
  };
}
