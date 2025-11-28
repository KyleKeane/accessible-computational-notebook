/**
 * NotebookManager - Backend notebook state management
 *
 * This class maintains the authoritative notebook state in the main process
 * and provides an API for backend interpreters to manipulate notebooks,
 * similar to Mathematica's NotebookWrite, NotebookRead, etc.
 */

const { EventEmitter } = require('events');

class NotebookManager extends EventEmitter {
  constructor() {
    super();
    this.notebooks = new Map(); // windowId -> notebook state
    this.activeNotebook = null;
  }

  /**
   * Register a notebook instance
   */
  registerNotebook(windowId, initialState = null) {
    const notebook = initialState || {
      cells: [],
      metadata: {
        version: '1.0.0',
        created: new Date().toISOString(),
        modified: new Date().toISOString()
      },
      selection: {
        currentCellIndex: -1
      }
    };

    this.notebooks.set(windowId, notebook);
    this.activeNotebook = windowId;

    console.log(`[NotebookManager] Registered notebook for window ${windowId}`);
    return notebook;
  }

  /**
   * Get notebook state
   */
  getNotebook(windowId = null) {
    const id = windowId || this.activeNotebook;
    return this.notebooks.get(id);
  }

  /**
   * Update entire notebook state
   */
  setNotebook(notebook, windowId = null) {
    const id = windowId || this.activeNotebook;
    this.notebooks.set(id, {
      ...notebook,
      metadata: {
        ...notebook.metadata,
        modified: new Date().toISOString()
      }
    });

    this.emit('notebook-changed', { windowId: id, notebook });
    return notebook;
  }

  /**
   * Get a specific cell
   */
  getCell(cellIndex, windowId = null) {
    const notebook = this.getNotebook(windowId);
    if (!notebook) return null;

    return notebook.cells[cellIndex];
  }

  /**
   * Get current (selected) cell
   */
  getCurrentCell(windowId = null) {
    const notebook = this.getNotebook(windowId);
    if (!notebook) return null;

    const index = notebook.selection.currentCellIndex;
    return notebook.cells[index];
  }

  /**
   * Create a new cell
   * Similar to Mathematica's NotebookWrite
   */
  createCell(type, content, position = 'below', windowId = null) {
    const notebook = this.getNotebook(windowId);
    if (!notebook) return null;

    const newCell = {
      id: `cell-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: type,
      content: content,
      output: '',
      metadata: {
        executionCount: null,
        lastExecuted: null,
        created: new Date().toISOString()
      }
    };

    let insertIndex;
    if (position === 'below') {
      insertIndex = notebook.selection.currentCellIndex + 1;
    } else if (position === 'above') {
      insertIndex = notebook.selection.currentCellIndex;
    } else if (position === 'end') {
      insertIndex = notebook.cells.length;
    } else if (position === 'start') {
      insertIndex = 0;
    } else if (typeof position === 'number') {
      insertIndex = position;
    } else {
      insertIndex = notebook.cells.length;
    }

    notebook.cells.splice(insertIndex, 0, newCell);
    notebook.metadata.modified = new Date().toISOString();

    this.emit('cell-created', {
      windowId: windowId || this.activeNotebook,
      cell: newCell,
      index: insertIndex
    });

    return { cell: newCell, index: insertIndex };
  }

  /**
   * Update cell content
   */
  setCellContent(cellIndex, content, windowId = null) {
    const notebook = this.getNotebook(windowId);
    if (!notebook || cellIndex < 0 || cellIndex >= notebook.cells.length) {
      return null;
    }

    notebook.cells[cellIndex].content = content;
    notebook.metadata.modified = new Date().toISOString();

    this.emit('cell-updated', {
      windowId: windowId || this.activeNotebook,
      cellIndex,
      field: 'content',
      value: content
    });

    return notebook.cells[cellIndex];
  }

  /**
   * Update cell output
   */
  setCellOutput(cellIndex, output, windowId = null) {
    const notebook = this.getNotebook(windowId);
    if (!notebook || cellIndex < 0 || cellIndex >= notebook.cells.length) {
      return null;
    }

    notebook.cells[cellIndex].output = output;
    notebook.cells[cellIndex].metadata.lastExecuted = new Date().toISOString();
    notebook.cells[cellIndex].metadata.executionCount =
      (notebook.cells[cellIndex].metadata.executionCount || 0) + 1;

    this.emit('cell-output', {
      windowId: windowId || this.activeNotebook,
      cellIndex,
      output
    });

    return notebook.cells[cellIndex];
  }

  /**
   * Delete a cell
   */
  deleteCell(cellIndex, windowId = null) {
    const notebook = this.getNotebook(windowId);
    if (!notebook || cellIndex < 0 || cellIndex >= notebook.cells.length) {
      return false;
    }

    const deleted = notebook.cells.splice(cellIndex, 1)[0];
    notebook.metadata.modified = new Date().toISOString();

    // Adjust current selection if needed
    if (notebook.selection.currentCellIndex >= notebook.cells.length) {
      notebook.selection.currentCellIndex = notebook.cells.length - 1;
    }

    this.emit('cell-deleted', {
      windowId: windowId || this.activeNotebook,
      cellIndex,
      cell: deleted
    });

    return true;
  }

  /**
   * Update cell metadata
   */
  setCellMetadata(cellIndex, metadata, windowId = null) {
    const notebook = this.getNotebook(windowId);
    if (!notebook || cellIndex < 0 || cellIndex >= notebook.cells.length) {
      return null;
    }

    notebook.cells[cellIndex].metadata = {
      ...notebook.cells[cellIndex].metadata,
      ...metadata
    };

    this.emit('cell-metadata-updated', {
      windowId: windowId || this.activeNotebook,
      cellIndex,
      metadata
    });

    return notebook.cells[cellIndex];
  }

  /**
   * Get current cell index
   */
  getCurrentCellIndex(windowId = null) {
    const notebook = this.getNotebook(windowId);
    return notebook ? notebook.selection.currentCellIndex : -1;
  }

  /**
   * Set current cell index
   */
  setCurrentCellIndex(index, windowId = null) {
    const notebook = this.getNotebook(windowId);
    if (!notebook) return false;

    notebook.selection.currentCellIndex = index;

    this.emit('selection-changed', {
      windowId: windowId || this.activeNotebook,
      cellIndex: index
    });

    return true;
  }

  /**
   * Get all cells
   */
  getAllCells(windowId = null) {
    const notebook = this.getNotebook(windowId);
    return notebook ? notebook.cells : [];
  }

  /**
   * Get cell count
   */
  getCellCount(windowId = null) {
    const notebook = this.getNotebook(windowId);
    return notebook ? notebook.cells.length : 0;
  }

  /**
   * Find cells by criteria
   */
  findCells(predicate, windowId = null) {
    const notebook = this.getNotebook(windowId);
    if (!notebook) return [];

    return notebook.cells
      .map((cell, index) => ({ cell, index }))
      .filter(({ cell }) => predicate(cell));
  }

  /**
   * Replace cell
   */
  replaceCell(cellIndex, newCell, windowId = null) {
    const notebook = this.getNotebook(windowId);
    if (!notebook || cellIndex < 0 || cellIndex >= notebook.cells.length) {
      return null;
    }

    notebook.cells[cellIndex] = {
      ...newCell,
      id: notebook.cells[cellIndex].id // Keep original ID
    };
    notebook.metadata.modified = new Date().toISOString();

    this.emit('cell-replaced', {
      windowId: windowId || this.activeNotebook,
      cellIndex,
      cell: notebook.cells[cellIndex]
    });

    return notebook.cells[cellIndex];
  }

  /**
   * Sync state from frontend
   */
  syncFromFrontend(notebookData, windowId = null) {
    const id = windowId || this.activeNotebook;
    this.notebooks.set(id, notebookData);
    console.log(`[NotebookManager] Synced notebook state from frontend (window ${id})`);
  }

  /**
   * Clear notebook
   */
  clear(windowId = null) {
    const id = windowId || this.activeNotebook;
    this.notebooks.delete(id);
    console.log(`[NotebookManager] Cleared notebook for window ${id}`);
  }
}

// Singleton instance
const notebookManager = new NotebookManager();

module.exports = notebookManager;
