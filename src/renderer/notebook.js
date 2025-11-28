class Notebook {
  constructor() {
    this.cells = [];
    this.currentCellIndex = -1;
    this.container = document.getElementById('notebook');
    this.cellCounter = 0;
  }

  createCell(type = 'code', content = '', insertAfterIndex = -1) {
    const cellId = `cell-${this.cellCounter++}`;
    const cell = {
      id: cellId,
      type: type,
      content: content,
      output: '',
      metadata: {
        executionCount: null,
        lastExecuted: null
      }
    };

    const insertIndex =
      insertAfterIndex >= 0 ? insertAfterIndex + 1 : this.cells.length;
    this.cells.splice(insertIndex, 0, cell);

    const cellElement = this.createCellElement(cell, insertIndex);

    if (insertAfterIndex >= 0 && insertAfterIndex < this.container.children.length) {
      const afterElement = this.container.children[insertAfterIndex];
      afterElement.insertAdjacentElement('afterend', cellElement);
    } else {
      this.container.appendChild(cellElement);
    }

    this.focusCell(insertIndex);
    this.updateCellInfo();

    window.accessibility.announce(
      `${type} cell created at position ${insertIndex + 1}`
    );

    return cell;
  }

  createCellElement(cell, index) {
    const cellDiv = document.createElement('div');
    cellDiv.className = 'cell';
    cellDiv.setAttribute('data-cell-id', cell.id);
    cellDiv.setAttribute('data-type', cell.type);
    cellDiv.setAttribute('role', 'article');
    cellDiv.setAttribute(
      'aria-label',
      `${cell.type} cell ${index + 1} of ${this.cells.length}`
    );
    cellDiv.tabIndex = 0;

    const header = document.createElement('div');
    header.className = 'cell-header';

    const typeLabel = document.createElement('span');
    typeLabel.className = 'cell-type';
    typeLabel.textContent = cell.type;
    typeLabel.setAttribute('aria-hidden', 'true');

    const actions = document.createElement('div');
    actions.className = 'cell-actions';

    const runBtn = this.createCellActionButton(
      'Run',
      'Run this cell',
      () => this.runCell(index)
    );
    const deleteBtn = this.createCellActionButton(
      'Delete',
      'Delete this cell',
      () => this.deleteCell(index)
    );

    actions.appendChild(runBtn);
    actions.appendChild(deleteBtn);

    header.appendChild(typeLabel);
    header.appendChild(actions);

    const inputDiv = document.createElement('div');
    inputDiv.className = 'cell-input';

    const editor = document.createElement('textarea');
    editor.className = 'cell-editor';
    editor.value = cell.content;
    editor.setAttribute('aria-label', `${cell.type} input`);
    editor.setAttribute('spellcheck', 'false');
    editor.setAttribute('autocomplete', 'off');
    editor.setAttribute('autocorrect', 'off');
    editor.setAttribute('autocapitalize', 'off');

    editor.addEventListener('input', (e) => {
      cell.content = e.target.value;
      this.autoResize(editor);
    });

    editor.addEventListener('focus', () => {
      const cellIndex = this.getCellIndex(cell.id);
      this.currentCellIndex = cellIndex;
      this.updateCellInfo();
    });

    this.autoResize(editor);

    inputDiv.appendChild(editor);

    const outputDiv = document.createElement('div');
    outputDiv.className = 'cell-output';
    outputDiv.setAttribute('role', 'log');
    outputDiv.setAttribute('aria-label', 'Cell output');
    outputDiv.setAttribute('aria-live', 'polite');

    cellDiv.appendChild(header);
    cellDiv.appendChild(inputDiv);
    cellDiv.appendChild(outputDiv);

    cellDiv.addEventListener('focus', () => {
      this.focusCell(index);
    });

    return cellDiv;
  }

  createCellActionButton(text, ariaLabel, onClick) {
    const btn = document.createElement('button');
    btn.className = 'cell-action-btn';
    btn.textContent = text;
    btn.setAttribute('aria-label', ariaLabel);
    btn.addEventListener('click', onClick);
    return btn;
  }

  autoResize(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
  }

  focusCell(index) {
    if (index < 0 || index >= this.cells.length) return;

    document.querySelectorAll('.cell.focused').forEach((cell) => {
      cell.classList.remove('focused');
    });

    this.currentCellIndex = index;
    const cellElement = this.container.children[index];
    cellElement.classList.add('focused');
    cellElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    this.updateCellInfo();
  }

  async runCell(index) {
    if (index < 0 || index >= this.cells.length) return;

    const cell = this.cells[index];
    const cellElement = this.container.children[index];
    const outputDiv = cellElement.querySelector('.cell-output');

    if (cell.type === 'markdown') {
      this.renderMarkdown(cell, outputDiv);
      return;
    }

    const interpreter = document.getElementById('interpreter-select').value;

    window.accessibility.announce(`Running ${cell.type} cell ${index + 1}`);

    outputDiv.textContent = 'Running...';
    outputDiv.className = 'cell-output';

    try {
      const result = await window.electronAPI.executeCode(
        interpreter,
        cell.content
      );

      if (result.success) {
        outputDiv.textContent = result.result;
        outputDiv.classList.add('success');
        cell.output = result.result;
        window.accessibility.announce(`Cell ${index + 1} executed successfully`);
      } else {
        outputDiv.textContent = `Error: ${result.error}`;
        outputDiv.classList.add('error');
        window.accessibility.announce(
          `Cell ${index + 1} execution failed: ${result.error}`
        );
      }

      cell.metadata.executionCount = (cell.metadata.executionCount || 0) + 1;
      cell.metadata.lastExecuted = new Date().toISOString();
    } catch (error) {
      outputDiv.textContent = `Error: ${error.message}`;
      outputDiv.classList.add('error');
      window.accessibility.announce(`Cell execution error: ${error.message}`);
    }
  }

  renderMarkdown(cell, outputDiv) {
    const lines = cell.content.split('\n');
    let html = '';

    for (const line of lines) {
      if (line.startsWith('# ')) {
        html += `<h1>${this.escapeHtml(line.substring(2))}</h1>`;
      } else if (line.startsWith('## ')) {
        html += `<h2>${this.escapeHtml(line.substring(3))}</h2>`;
      } else if (line.startsWith('### ')) {
        html += `<h3>${this.escapeHtml(line.substring(4))}</h3>`;
      } else if (line.includes('`')) {
        html += `<p>${this.processInlineCode(line)}</p>`;
      } else {
        html += `<p>${this.escapeHtml(line)}</p>`;
      }
    }

    outputDiv.innerHTML = html;
    outputDiv.className = 'cell-output cell-content';
  }

  processInlineCode(text) {
    return text.replace(
      /`([^`]+)`/g,
      (match, code) => `<code>${this.escapeHtml(code)}</code>`
    );
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  async runAllCells() {
    window.accessibility.announce('Running all cells');
    for (let i = 0; i < this.cells.length; i++) {
      await this.runCell(i);
    }
    window.accessibility.announce('All cells executed');
  }

  deleteCell(index) {
    if (index < 0 || index >= this.cells.length) return;
    if (this.cells.length === 1) {
      window.accessibility.announce('Cannot delete the last cell');
      return;
    }

    this.cells.splice(index, 1);
    this.container.children[index].remove();

    if (this.currentCellIndex >= this.cells.length) {
      this.currentCellIndex = this.cells.length - 1;
    }

    this.focusCell(this.currentCellIndex);
    this.updateCellInfo();

    window.accessibility.announce(`Cell ${index + 1} deleted`);
  }

  getCellIndex(cellId) {
    return this.cells.findIndex((cell) => cell.id === cellId);
  }

  updateCellInfo() {
    const cellInfo = document.getElementById('cell-info');
    cellInfo.textContent = `Cell ${this.currentCellIndex + 1} of ${
      this.cells.length
    }`;
  }

  moveToPreviousCell() {
    if (this.currentCellIndex > 0) {
      this.focusCell(this.currentCellIndex - 1);
      const editor = this.container.children[
        this.currentCellIndex
      ].querySelector('.cell-editor');
      editor.focus();
    }
  }

  moveToNextCell() {
    if (this.currentCellIndex < this.cells.length - 1) {
      this.focusCell(this.currentCellIndex + 1);
      const editor = this.container.children[
        this.currentCellIndex
      ].querySelector('.cell-editor');
      editor.focus();
    }
  }

  toJSON() {
    return {
      cells: this.cells,
      metadata: {
        version: '1.0.0',
        created: new Date().toISOString()
      }
    };
  }

  fromJSON(data) {
    this.cells = [];
    this.container.innerHTML = '';
    this.cellCounter = 0;

    if (data.cells && Array.isArray(data.cells)) {
      data.cells.forEach((cellData) => {
        this.createCell(cellData.type, cellData.content);
      });
    }
  }
}

window.notebook = new Notebook();
