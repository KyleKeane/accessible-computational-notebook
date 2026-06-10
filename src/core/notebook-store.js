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
    const cell = this.insertCell({ type: 'code' });
    this.activeCellId = cell.id;
    this.dirty = false;
    this.emit('notebook-replaced');
  }

  /** Replace state from a deserialized notebook (see ipynb.js). */
  load({ cells, metadata }) {
    this.cells = cells.map((cell) => ({
      id: cell.id ?? randomUUID(),
      type: CELL_TYPES.includes(cell.type) ? cell.type : 'raw',
      source: cell.source ?? '',
      outputs: cell.outputs ?? [],
      executionCount: cell.executionCount ?? null
    }));
    this.metadata = { kernelName: 'python', ...metadata };
    if (this.cells.length === 0) {
      this.cells.push(this.#makeCell({ type: 'code' }));
    }
    this.activeCellId = this.cells[0].id;
    this.dirty = false;
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
    return { id: randomUUID(), type, source, outputs: [], executionCount: null };
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
    cell.type = type;
    cell.outputs = [];
    cell.executionCount = null;
    this.#markDirty();
    this.emit('cell-type-changed', { id, type });
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
