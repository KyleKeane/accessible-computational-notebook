class KeyboardManager {
  constructor() {
    this.mode = 'navigation';
    this.shortcuts = this.defineShortcuts();
    this.setupKeyboardListeners();
  }

  defineShortcuts() {
    return {
      navigation: {
        'ArrowUp': {
          action: () => this.navigateUp(),
          description: 'Move to cell above',
          condition: () => !this.isInEditMode()
        },
        'ArrowDown': {
          action: () => this.navigateDown(),
          description: 'Move to cell below',
          condition: () => !this.isInEditMode()
        },
        'Enter': {
          action: () => this.enterEditMode(),
          description: 'Enter edit mode',
          condition: () => !this.isInEditMode()
        },
        'Escape': {
          action: () => this.exitEditMode(),
          description: 'Exit edit mode',
          condition: () => this.isInEditMode()
        }
      },
      cell: {
        'Shift+Enter': {
          action: () => this.runCellAndMoveNext(),
          description: 'Run cell and move to next'
        },
        'Ctrl+Enter': {
          action: () => this.runCell(),
          description: 'Run cell'
        },
        'Alt+Enter': {
          action: () => this.runCellAndInsertBelow(),
          description: 'Run cell and insert below'
        },
        'Alt+c': {
          action: () => this.addCodeCell(),
          description: 'Add code cell below'
        },
        'Alt+m': {
          action: () => this.addMarkdownCell(),
          description: 'Add markdown cell below'
        },
        'Alt+Delete': {
          action: () => this.deleteCurrentCell(),
          description: 'Delete current cell'
        },
        'Alt+Shift+Enter': {
          action: () => this.runAllCells(),
          description: 'Run all cells'
        }
      },
      editor: {
        'Tab': {
          action: (e) => this.handleTab(e),
          description: 'Insert tab or move focus'
        },
        'Shift+Tab': {
          action: (e) => this.handleShiftTab(e),
          description: 'Unindent or move focus back'
        }
      },
      global: {
        'Ctrl+s': {
          action: () => this.saveNotebook(),
          description: 'Save notebook'
        },
        'Ctrl+/': {
          action: () => this.showShortcutsDialog(),
          description: 'Show keyboard shortcuts'
        },
        'Alt+h': {
          action: () => this.describeCurrent(),
          description: 'Describe current cell'
        }
      }
    };
  }

  setupKeyboardListeners() {
    document.addEventListener('keydown', (e) => {
      this.handleKeyDown(e);
    });

    document.addEventListener('focusin', (e) => {
      if (e.target.classList.contains('cell-editor')) {
        this.mode = 'edit';
      }
    });

    document.addEventListener('focusout', (e) => {
      if (e.target.classList.contains('cell-editor')) {
        this.mode = 'navigation';
      }
    });
  }

  handleKeyDown(e) {
    const key = this.getKeyString(e);

    this.checkShortcut(key, e, this.shortcuts.global) ||
    this.checkShortcut(key, e, this.shortcuts.cell) ||
    this.checkShortcut(key, e, this.shortcuts.editor) ||
    this.checkShortcut(key, e, this.shortcuts.navigation);
  }

  checkShortcut(key, event, shortcuts) {
    const shortcut = shortcuts[key];

    if (shortcut) {
      if (!shortcut.condition || shortcut.condition()) {
        event.preventDefault();
        shortcut.action(event);
        return true;
      }
    }

    return false;
  }

  getKeyString(e) {
    const parts = [];

    if (e.ctrlKey) parts.push('Ctrl');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');

    const key = e.key;
    if (key !== 'Control' && key !== 'Alt' && key !== 'Shift') {
      parts.push(key);
    }

    return parts.join('+');
  }

  isInEditMode() {
    return (
      document.activeElement &&
      document.activeElement.classList.contains('cell-editor')
    );
  }

  navigateUp() {
    const currentIndex = window.notebook.currentCellIndex;
    if (currentIndex > 0) {
      window.notebook.focusCell(currentIndex - 1);
      window.accessibility.announce(
        `Moved to cell ${currentIndex} of ${window.notebook.cells.length}`
      );
    } else {
      window.accessibility.announce('Already at first cell');
    }
  }

  navigateDown() {
    const currentIndex = window.notebook.currentCellIndex;
    if (currentIndex < window.notebook.cells.length - 1) {
      window.notebook.focusCell(currentIndex + 1);
      window.accessibility.announce(
        `Moved to cell ${currentIndex + 2} of ${window.notebook.cells.length}`
      );
    } else {
      window.accessibility.announce('Already at last cell');
    }
  }

  enterEditMode() {
    const currentIndex = window.notebook.currentCellIndex;
    if (currentIndex >= 0) {
      const cellElement = document.querySelector(
        `[data-cell-id="${window.notebook.cells[currentIndex].id}"]`
      );
      const editor = cellElement.querySelector('.cell-editor');
      editor.focus();
      window.accessibility.announce('Edit mode');
    }
  }

  exitEditMode() {
    if (document.activeElement) {
      document.activeElement.blur();
      const currentIndex = window.notebook.currentCellIndex;
      if (currentIndex >= 0) {
        window.notebook.focusCell(currentIndex);
      }
      window.accessibility.announce('Navigation mode');
    }
  }

  async runCell() {
    const currentIndex = window.notebook.currentCellIndex;
    if (currentIndex >= 0) {
      await window.notebook.runCell(currentIndex);
    }
  }

  async runCellAndMoveNext() {
    const currentIndex = window.notebook.currentCellIndex;
    if (currentIndex >= 0) {
      await window.notebook.runCell(currentIndex);

      if (currentIndex < window.notebook.cells.length - 1) {
        window.notebook.focusCell(currentIndex + 1);
        this.enterEditMode();
      } else {
        const newCell = window.notebook.createCell('code', '', currentIndex);
        this.enterEditMode();
      }
    }
  }

  async runCellAndInsertBelow() {
    const currentIndex = window.notebook.currentCellIndex;
    if (currentIndex >= 0) {
      await window.notebook.runCell(currentIndex);
      window.notebook.createCell('code', '', currentIndex);
      this.enterEditMode();
    }
  }

  addCodeCell() {
    const currentIndex = window.notebook.currentCellIndex;
    window.notebook.createCell('code', '', currentIndex);
    this.enterEditMode();
  }

  addMarkdownCell() {
    const currentIndex = window.notebook.currentCellIndex;
    window.notebook.createCell('markdown', '', currentIndex);
    this.enterEditMode();
  }

  deleteCurrentCell() {
    const currentIndex = window.notebook.currentCellIndex;
    if (currentIndex >= 0) {
      window.notebook.deleteCell(currentIndex);
    }
  }

  async runAllCells() {
    await window.notebook.runAllCells();
  }

  handleTab(e) {
    if (this.isInEditMode()) {
      e.preventDefault();
      const editor = document.activeElement;
      const start = editor.selectionStart;
      const end = editor.selectionEnd;

      const before = editor.value.substring(0, start);
      const after = editor.value.substring(end);

      editor.value = before + '  ' + after;

      editor.selectionStart = editor.selectionEnd = start + 2;

      editor.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  handleShiftTab(e) {
    if (this.isInEditMode()) {
      e.preventDefault();
      const editor = document.activeElement;
      const start = editor.selectionStart;
      const value = editor.value;
      const lineStart = value.lastIndexOf('\n', start - 1) + 1;
      const beforeLine = value.substring(0, lineStart);
      const line = value.substring(lineStart);

      if (line.startsWith('  ')) {
        editor.value = beforeLine + line.substring(2);
        editor.selectionStart = editor.selectionEnd = Math.max(
          lineStart,
          start - 2
        );
        editor.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  }

  saveNotebook() {
    const data = JSON.stringify(window.notebook.toJSON(), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `notebook-${Date.now()}.json`;
    a.click();

    URL.revokeObjectURL(url);

    window.accessibility.announce('Notebook saved');
  }

  showShortcutsDialog() {
    const dialog = document.getElementById('shortcuts-dialog');
    dialog.showModal();

    const closeBtn = document.getElementById('close-shortcuts-btn');
    closeBtn.focus();

    closeBtn.addEventListener('click', () => {
      dialog.close();
    });

    dialog.addEventListener('close', () => {
      window.accessibility.announce('Shortcuts dialog closed');
    });

    window.accessibility.announce('Keyboard shortcuts dialog opened');
  }

  describeCurrent() {
    const currentIndex = window.notebook.currentCellIndex;
    if (currentIndex >= 0) {
      const description = window.accessibility.describeCellStructure(
        currentIndex,
        window.notebook.cells.length
      );
      window.accessibility.announce(description);
    }
  }
}

window.keyboardManager = new KeyboardManager();
