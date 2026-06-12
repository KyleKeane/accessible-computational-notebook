/**
 * NotebookStore — the single source of truth for notebook state.
 *
 * Lives in the Electron main process but has no Electron dependency, so it is
 * unit-tested directly under Node. Cells are identified by stable ids; no
 * index is ever stored. All mutations go through methods that emit granular
 * events; the renderer is a pure view of those events.
 *
 * Cell shape:
 *   { id, type: 'code'|'markdown'|'raw', source, outputs, executionCount }
 * Output shapes (subset mirrors nbformat):
 *   { type: 'stream', name: 'stdout'|'stderr', text }
 *   { type: 'execute_result', text }
 *   { type: 'error', ename, evalue, traceback }
 *   { type: 'passthrough', raw }   // preserved unknown nbformat output
 */

import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';

export const CELL_TYPES = ['code', 'markdown', 'raw'];

export class NotebookStore extends EventEmitter {
  #replaying = false;

  constructor() {
    super();
    this.reset();
  }

  /** Replace all state with an empty single-cell notebook. */
  reset() {
    this.cells = [];
    this.metadata = { kernelName: 'python' };
    this.activeCellId = null;
    this.dirty = false;
    this.undoStack = [];
    this.redoStack = [];
    const cell = this.insertCell({ type: 'code' });
    this.activeCellId = cell.id;
    this.dirty = false;
    this.undoStack = []; // the initial cell is not undoable
    this.emit('notebook-replaced');
  }

  /** Replace state from a deserialized notebook (see ipynb.js). */
  load({ cells, metadata }) {
    this.cells = cells.map((cell) => ({
      id: cell.id ?? randomUUID(),
      type: CELL_TYPES.includes(cell.type) ? cell.type : 'raw',
      source: cell.source ?? '',
      outputs: cell.outputs ?? [],
      executionCount: cell.executionCount ?? null,
      nbMetadata: cell.nbMetadata ?? {},
      attachments: cell.attachments
    }));
    this.metadata = { kernelName: 'python', ...metadata };
    if (this.cells.length === 0) {
      this.cells.push(this.#makeCell({ type: 'code' }));
    }
    this.activeCellId = this.cells[0].id;
    this.dirty = false;
    this.undoStack = [];
    this.redoStack = [];
    this.emit('notebook-replaced');
  }

  /** Snapshot for the renderer or for serialization. */
  getState() {
    return {
      cells: this.cells.map((cell) => ({ ...cell, outputs: [...cell.outputs] })),
      metadata: { ...this.metadata },
      activeCellId: this.activeCellId,
      dirty: this.dirty
    };
  }

  getCell(id) {
    return this.cells.find((cell) => cell.id === id) ?? null;
  }

  indexOf(id) {
    return this.cells.findIndex((cell) => cell.id === id);
  }

  get cellCount() {
    return this.cells.length;
  }

  #makeCell({ type = 'code', source = '' } = {}) {
    return { id: randomUUID(), type, source, outputs: [], executionCount: null, nbMetadata: {} };
  }

  #markDirty() {
    if (!this.dirty) {
      this.dirty = true;
      this.emit('dirty-changed', true);
    }
  }

  markClean() {
    if (this.dirty) {
      this.dirty = false;
      this.emit('dirty-changed', false);
    }
  }

  /* ---------- undo/redo of structural operations ----------
     Text edits are not recorded (the editor's native undo covers them);
     insert/delete/move/type-change are. Entries run in stack order, so the
     indices captured at operation time stay valid during sequential undo. */

  #record(entry) {
    if (this.#replaying) return;
    this.undoStack.push(entry);
    if (this.undoStack.length > 100) this.undoStack.shift();
    this.redoStack.length = 0;
  }

  #replay(fn) {
    this.#replaying = true;
    try {
      fn();
    } finally {
      this.#replaying = false;
    }
  }

  /** Undo the last structural operation. Returns its label, or null. */
  undo() {
    const entry = this.undoStack.pop();
    if (!entry) return null;
    this.#replay(entry.undo);
    this.redoStack.push(entry);
    return entry.label;
  }

  /** Redo the last undone structural operation. Returns its label, or null. */
  redo() {
    const entry = this.redoStack.pop();
    if (!entry) return null;
    this.#replay(entry.redo);
    this.undoStack.push(entry);
    return entry.label;
  }

  /** Insert a fully-formed cell (with its existing id) at an index. */
  #insertExisting(cell, index) {
    this.cells.splice(Math.min(index, this.cells.length), 0, cell);
    this.activeCellId = cell.id;
    this.#markDirty();
    this.emit('cell-inserted', { cell: { ...cell, outputs: [...cell.outputs] }, index: this.indexOf(cell.id) });
  }

  #deleteById(id) {
    const index = this.indexOf(id);
    if (index === -1) return;
    this.cells.splice(index, 1);
    if (this.activeCellId === id) {
      this.activeCellId = this.cells[Math.min(index, this.cells.length - 1)]?.id ?? null;
    }
    this.#markDirty();
    this.emit('cell-deleted', { id, index, nextActiveId: this.activeCellId });
  }

  /**
   * Insert a cell. `relativeTo` + `position` ('above'|'below') place it next
   * to an existing cell; otherwise it is appended.
   * Returns the new cell.
   */
  insertCell({ type = 'code', source = '', relativeTo = null, position = 'below' } = {}) {
    if (!CELL_TYPES.includes(type)) {
      throw new Error(`Unknown cell type: ${type}`);
    }
    const cell = this.#makeCell({ type, source });
    let index = this.cells.length;
    if (relativeTo !== null) {
      const anchor = this.indexOf(relativeTo);
      if (anchor === -1) throw new Error(`No such cell: ${relativeTo}`);
      index = position === 'above' ? anchor : anchor + 1;
    }
    this.cells.splice(index, 0, cell);
    this.#markDirty();
    this.emit('cell-inserted', { cell: { ...cell }, index });
    // Snapshot at undo time, not insert time, so redo restores the cell
    // exactly as it was when it disappeared (source edits, outputs, …).
    let snapshot = null;
    this.#record({
      label: `insert ${type} cell`,
      undo: () => {
        const current = this.getCell(cell.id);
        snapshot = current ? { ...current, outputs: [...current.outputs] } : null;
        this.#deleteById(cell.id);
      },
      redo: () => {
        if (snapshot) this.#insertExisting({ ...snapshot, outputs: [...snapshot.outputs] }, index);
      }
    });
    return cell;
  }

  /** Delete a cell. The last remaining cell cannot be deleted. */
  deleteCell(id) {
    const index = this.indexOf(id);
    if (index === -1) throw new Error(`No such cell: ${id}`);
    if (this.cells.length === 1) return null;
    const [removed] = this.cells.splice(index, 1);
    if (this.activeCellId === id) {
      this.activeCellId = this.cells[Math.min(index, this.cells.length - 1)].id;
    }
    this.#markDirty();
    this.emit('cell-deleted', { id, index, nextActiveId: this.activeCellId });
    const snapshot = { ...removed, outputs: [...removed.outputs] };
    this.#record({
      label: `delete ${removed.type} cell`,
      undo: () => this.#insertExisting({ ...snapshot, outputs: [...snapshot.outputs] }, index),
      redo: () => this.#deleteById(id)
    });
    return removed;
  }

  updateSource(id, source) {
    const cell = this.getCell(id);
    if (!cell) throw new Error(`No such cell: ${id}`);
    if (cell.source === source) return;
    cell.source = source;
    this.#markDirty();
    this.emit('cell-source-changed', { id, source });
  }

  setCellType(id, type) {
    if (!CELL_TYPES.includes(type)) {
      throw new Error(`Unknown cell type: ${type}`);
    }
    const cell = this.getCell(id);
    if (!cell) throw new Error(`No such cell: ${id}`);
    if (cell.type === type) return;
    const previous = { type: cell.type, outputs: cell.outputs, executionCount: cell.executionCount };
    cell.type = type;
    cell.outputs = [];
    cell.executionCount = null;
    // A cell that is no longer markdown cannot head a collapsed section.
    if (cell.nbMetadata?.heading_collapsed) {
      cell.nbMetadata = { ...cell.nbMetadata };
      delete cell.nbMetadata.heading_collapsed;
      this.emit('cell-collapse-changed', { id, collapsed: false });
    }
    this.#markDirty();
    this.emit('cell-type-changed', { id, type });
    this.#record({
      label: `change cell to ${type}`,
      undo: () => {
        cell.type = previous.type;
        cell.outputs = previous.outputs;
        cell.executionCount = previous.executionCount;
        this.#markDirty();
        this.emit('cell-type-changed', { id, type: previous.type });
        this.emit('cell-outputs-changed', { id, outputs: [...cell.outputs], executionCount: cell.executionCount });
      },
      redo: () => this.setCellType(id, type)
    });
  }

  /** Move a cell one step. Returns true if it moved. */
  moveCell(id, direction) {
    const index = this.indexOf(id);
    if (index === -1) throw new Error(`No such cell: ${id}`);
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= this.cells.length) return false;
    const [cell] = this.cells.splice(index, 1);
    this.cells.splice(target, 0, cell);
    this.#markDirty();
    this.emit('cell-moved', { id, from: index, to: target });
    this.#record({
      label: `move cell ${direction}`,
      undo: () => this.moveCell(id, direction === 'up' ? 'down' : 'up'),
      redo: () => this.moveCell(id, direction)
    });
    return true;
  }

  setOutputs(id, outputs, executionCount = null) {
    const cell = this.getCell(id);
    if (!cell) throw new Error(`No such cell: ${id}`);
    cell.outputs = outputs;
    if (executionCount !== null) cell.executionCount = executionCount;
    this.#markDirty();
    this.emit('cell-outputs-changed', {
      id,
      outputs: [...outputs],
      executionCount: cell.executionCount
    });
  }

  /**
   * Append one output (used for streaming). Consecutive stream chunks on the
   * same channel are coalesced so the output reads as continuous text.
   */
  appendOutput(id, output) {
    const cell = this.getCell(id);
    if (!cell) throw new Error(`No such cell: ${id}`);
    const last = cell.outputs[cell.outputs.length - 1];
    if (output.type === 'stream' && last?.type === 'stream' && last.name === output.name) {
      last.text += output.text;
    } else {
      cell.outputs.push({ ...output });
    }
    this.#markDirty();
    this.emit('cell-outputs-changed', {
      id,
      outputs: [...cell.outputs],
      executionCount: cell.executionCount
    });
  }

  setExecutionCount(id, executionCount) {
    const cell = this.getCell(id);
    if (!cell) throw new Error(`No such cell: ${id}`);
    cell.executionCount = executionCount;
    this.emit('cell-outputs-changed', {
      id,
      outputs: [...cell.outputs],
      executionCount
    });
  }

  clearOutputs(id) {
    this.setOutputs(id, [], null);
  }

  clearAllOutputs() {
    for (const cell of this.cells) {
      if (cell.outputs.length > 0 || cell.executionCount !== null) {
        cell.outputs = [];
        cell.executionCount = null;
        this.emit('cell-outputs-changed', { id: cell.id, outputs: [], executionCount: null });
      }
    }
    this.#markDirty();
  }

  /**
   * Attach a description to an image output (stored in the output's
   * nbformat metadata, so it persists in the .ipynb file).
   */
  setImageDescription(id, outputIndex, text) {
    const cell = this.getCell(id);
    if (!cell) throw new Error(`No such cell: ${id}`);
    const output = cell.outputs[outputIndex];
    if (!output) throw new Error(`No output ${outputIndex} in cell`);
    if (output.type === 'passthrough') {
      output.raw = { ...output.raw, metadata: { ...output.raw.metadata, alt: text } };
    } else {
      output.metadata = { ...output.metadata, alt: text };
    }
    this.#markDirty();
    this.emit('cell-outputs-changed', {
      id,
      outputs: [...cell.outputs],
      executionCount: cell.executionCount
    });
  }

  /**
   * Split a cell at a source offset: the original keeps the text before
   * the offset (and its outputs); a new cell of the same type below gets
   * the rest. One undo entry reverses the whole operation.
   */
  splitCell(id, offset) {
    const cell = this.getCell(id);
    if (!cell) throw new Error(`No such cell: ${id}`);
    const original = cell.source;
    const before = original.slice(0, offset).replace(/\n$/, '');
    const after = original.slice(offset).replace(/^\n/, '');
    const newCell = this.#makeCell({ type: cell.type, source: after });
    const apply = () => {
      cell.source = before;
      this.emit('cell-source-changed', { id, source: before });
      this.#insertExisting({ ...newCell }, this.indexOf(id) + 1);
    };
    this.#replay(apply);
    this.#markDirty();
    this.#record({
      label: 'split cell',
      undo: () => {
        this.#deleteById(newCell.id);
        cell.source = original;
        this.emit('cell-source-changed', { id, source: original });
        this.#markDirty();
      },
      redo: apply
    });
    return newCell;
  }

  /**
   * Merge a cell with the one below it. The merged cell keeps the upper
   * cell's outputs; the lower cell's outputs are dropped. Returns the
   * merged cell, or null if there is nothing below.
   */
  mergeWithBelow(id) {
    const index = this.indexOf(id);
    if (index === -1) throw new Error(`No such cell: ${id}`);
    const cell = this.cells[index];
    const below = this.cells[index + 1];
    if (!below) return null;
    const originalSource = cell.source;
    const belowSnapshot = { ...below, outputs: [...below.outputs] };
    const merged = [cell.source, below.source].filter((s) => s !== '').join('\n');
    const apply = () => {
      cell.source = merged;
      this.emit('cell-source-changed', { id, source: merged });
      this.#deleteById(below.id);
    };
    this.#replay(apply);
    this.#markDirty();
    this.#record({
      label: 'merge cells',
      undo: () => {
        cell.source = originalSource;
        this.emit('cell-source-changed', { id, source: originalSource });
        this.#insertExisting({ ...belowSnapshot, outputs: [...belowSnapshot.outputs] }, this.indexOf(id) + 1);
      },
      redo: apply
    });
    return cell;
  }

  /**
   * Mark a heading cell's section as collapsed. Stored in the cell's
   * nbformat metadata under Jupyter's collapsible-headings convention, so
   * the state round-trips through .ipynb and other tools.
   */
  setCollapsed(id, collapsed) {
    const cell = this.getCell(id);
    if (!cell) throw new Error(`No such cell: ${id}`);
    const nbMetadata = { ...cell.nbMetadata };
    if (collapsed) nbMetadata.heading_collapsed = true;
    else delete nbMetadata.heading_collapsed;
    cell.nbMetadata = nbMetadata;
    this.#markDirty();
    this.emit('cell-collapse-changed', { id, collapsed });
  }

  /** Ids of heading cells currently marked collapsed. */
  collapsedHeadingIds() {
    return this.cells.filter((c) => c.nbMetadata?.heading_collapsed).map((c) => c.id);
  }

  setActiveCell(id) {
    if (id !== null && !this.getCell(id)) return;
    if (this.activeCellId === id) return;
    this.activeCellId = id;
    this.emit('active-cell-changed', { id });
  }

  setKernelName(kernelName) {
    if (this.metadata.kernelName === kernelName) return;
    this.metadata.kernelName = kernelName;
    this.#markDirty();
    this.emit('kernel-name-changed', { kernelName });
  }
}
