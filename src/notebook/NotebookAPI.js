/**
 * NotebookAPI - Functions available to interpreter sandboxes
 *
 * Similar to Mathematica's notebook manipulation functions like:
 * - NotebookWrite
 * - NotebookRead
 * - NotebookGet
 * - SelectionMove
 * etc.
 */

class NotebookAPI {
  constructor(notebookManager, context = {}) {
    this.notebookManager = notebookManager;
    this.context = context; // Contains cellIndex, etc.
  }

  /**
   * Write content to a cell
   * Similar to Mathematica's NotebookWrite
   */
  NotebookWrite(content, position = 'below', type = 'code') {
    const result = this.notebookManager.createCell(type, String(content), position);
    return result ? result.index : null;
  }

  /**
   * Write output to the next cell
   */
  NotebookWriteNext(content, type = 'code') {
    return this.NotebookWrite(content, 'below', type);
  }

  /**
   * Write to current cell
   */
  NotebookWriteCurrent(content) {
    const cellIndex = this.context.cellIndex;
    if (cellIndex === undefined) return null;

    return this.notebookManager.setCellContent(cellIndex, String(content));
  }

  /**
   * Append to current cell
   */
  NotebookAppend(content) {
    const cellIndex = this.context.cellIndex;
    if (cellIndex === undefined) return null;

    const cell = this.notebookManager.getCell(cellIndex);
    if (!cell) return null;

    const newContent = cell.content + String(content);
    return this.notebookManager.setCellContent(cellIndex, newContent);
  }

  /**
   * Read cell content
   */
  NotebookRead(cellIndex = null) {
    const index = cellIndex !== null ? cellIndex : this.context.cellIndex;
    const cell = this.notebookManager.getCell(index);
    return cell ? cell.content : null;
  }

  /**
   * Get current cell content
   */
  NotebookReadCurrent() {
    return this.NotebookRead(this.context.cellIndex);
  }

  /**
   * Get cell at offset from current
   */
  NotebookReadRelative(offset) {
    const index = (this.context.cellIndex || 0) + offset;
    return this.NotebookRead(index);
  }

  /**
   * Get entire notebook data
   */
  NotebookGet() {
    return this.notebookManager.getNotebook();
  }

  /**
   * Get all cells
   */
  NotebookGetCells() {
    return this.notebookManager.getAllCells();
  }

  /**
   * Delete a cell
   */
  NotebookDelete(cellIndex) {
    return this.notebookManager.deleteCell(cellIndex);
  }

  /**
   * Get current cell index
   */
  CurrentCellIndex() {
    return this.context.cellIndex !== undefined ? this.context.cellIndex : null;
  }

  /**
   * Get cell count
   */
  NotebookCellCount() {
    return this.notebookManager.getCellCount();
  }

  /**
   * Find cells by predicate
   */
  NotebookFind(predicate) {
    if (typeof predicate === 'string') {
      // Search by content
      const searchTerm = predicate;
      return this.notebookManager.findCells(
        (cell) => cell.content.includes(searchTerm)
      );
    } else if (typeof predicate === 'function') {
      // Search by function
      return this.notebookManager.findCells(predicate);
    }
    return [];
  }

  /**
   * Set cell metadata
   */
  NotebookSetMetadata(cellIndex, metadata) {
    return this.notebookManager.setCellMetadata(cellIndex, metadata);
  }

  /**
   * Get cell metadata
   */
  NotebookGetMetadata(cellIndex = null) {
    const index = cellIndex !== null ? cellIndex : this.context.cellIndex;
    const cell = this.notebookManager.getCell(index);
    return cell ? cell.metadata : null;
  }

  /**
   * Move selection (update current cell index)
   */
  SelectionMove(direction) {
    const currentIndex = this.notebookManager.getCurrentCellIndex();
    let newIndex = currentIndex;

    if (direction === 'next' || direction === 'down') {
      newIndex = currentIndex + 1;
    } else if (direction === 'previous' || direction === 'up') {
      newIndex = currentIndex - 1;
    } else if (direction === 'first') {
      newIndex = 0;
    } else if (direction === 'last') {
      newIndex = this.notebookManager.getCellCount() - 1;
    }

    const cellCount = this.notebookManager.getCellCount();
    if (newIndex >= 0 && newIndex < cellCount) {
      this.notebookManager.setCurrentCellIndex(newIndex);
      return newIndex;
    }

    return currentIndex;
  }

  /**
   * Create a table/grid of cells
   * Useful for creating structured output
   */
  NotebookCreateGrid(rows, columns, type = 'code') {
    const cells = [];
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < columns; j++) {
        const result = this.NotebookWrite(`Cell [${i},${j}]`, 'end', type);
        cells.push(result);
      }
    }
    return cells;
  }

  /**
   * Execute all cells
   * Returns promise for async execution
   */
  async NotebookEvaluateAll() {
    // This would need to be handled by the frontend
    // For now, return a marker that frontend can detect
    return { action: 'evaluate-all' };
  }

  /**
   * Create cells from array
   */
  NotebookCreateFromArray(contentArray, type = 'code') {
    const indices = [];
    contentArray.forEach((content) => {
      const result = this.NotebookWrite(String(content), 'end', type);
      indices.push(result);
    });
    return indices;
  }

  /**
   * Get all cell outputs
   */
  NotebookGetOutputs() {
    const cells = this.notebookManager.getAllCells();
    return cells.map((cell) => cell.output);
  }

  /**
   * Clear all outputs
   */
  NotebookClearOutputs() {
    const cells = this.notebookManager.getAllCells();
    cells.forEach((cell, index) => {
      this.notebookManager.setCellOutput(index, '');
    });
    return true;
  }

  /**
   * Replace current cell with result
   * Useful for inline computations
   */
  ReplaceWithResult(result) {
    const cellIndex = this.context.cellIndex;
    if (cellIndex === undefined) return null;

    return this.notebookManager.setCellContent(
      cellIndex,
      String(result)
    );
  }

  /**
   * Insert result as new cell
   */
  InsertResult(result, position = 'below', type = 'code') {
    return this.NotebookWrite(String(result), position, type);
  }
}

module.exports = NotebookAPI;
