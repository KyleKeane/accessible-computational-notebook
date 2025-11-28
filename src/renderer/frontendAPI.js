/**
 * FrontEnd API - Similar to Wolfram Notebook FrontEnd Tokens
 * Provides programmatic control over the notebook interface
 */

class FrontEndAPI {
  constructor() {
    this.tokens = this.defineTokens();
    this.exposeToWindow();
  }

  defineTokens() {
    return {
      // Cell manipulation tokens
      CreateCell: (type = 'code', content = '', position = 'below') => {
        const currentIndex = window.notebook.currentCellIndex;
        const insertIndex =
          position === 'above' ? currentIndex - 1 : currentIndex;
        return window.notebook.createCell(type, content, insertIndex);
      },

      DeleteCell: (index = null) => {
        const targetIndex = index !== null ? index : window.notebook.currentCellIndex;
        window.notebook.deleteCell(targetIndex);
      },

      SelectCell: (index) => {
        window.notebook.focusCell(index);
      },

      MoveCellUp: () => {
        const currentIndex = window.notebook.currentCellIndex;
        if (currentIndex > 0) {
          const cell = window.notebook.cells[currentIndex];
          window.notebook.cells.splice(currentIndex, 1);
          window.notebook.cells.splice(currentIndex - 1, 0, cell);

          const cellElement = window.notebook.container.children[currentIndex];
          window.notebook.container.removeChild(cellElement);
          window.notebook.container.insertBefore(
            cellElement,
            window.notebook.container.children[currentIndex - 1]
          );

          window.notebook.focusCell(currentIndex - 1);
        }
      },

      MoveCellDown: () => {
        const currentIndex = window.notebook.currentCellIndex;
        if (currentIndex < window.notebook.cells.length - 1) {
          const cell = window.notebook.cells[currentIndex];
          window.notebook.cells.splice(currentIndex, 1);
          window.notebook.cells.splice(currentIndex + 1, 0, cell);

          const cellElement = window.notebook.container.children[currentIndex];
          window.notebook.container.removeChild(cellElement);
          window.notebook.container.insertBefore(
            cellElement,
            window.notebook.container.children[currentIndex + 1]
          );

          window.notebook.focusCell(currentIndex + 1);
        }
      },

      EvaluateCell: async (index = null) => {
        const targetIndex = index !== null ? index : window.notebook.currentCellIndex;
        await window.notebook.runCell(targetIndex);
      },

      EvaluateAllCells: async () => {
        await window.notebook.runAllCells();
      },

      // Cell content tokens
      GetCellContent: (index = null) => {
        const targetIndex = index !== null ? index : window.notebook.currentCellIndex;
        return window.notebook.cells[targetIndex]?.content || '';
      },

      SetCellContent: (content, index = null) => {
        const targetIndex = index !== null ? index : window.notebook.currentCellIndex;
        const cell = window.notebook.cells[targetIndex];
        if (cell) {
          cell.content = content;
          const cellElement = window.notebook.container.children[targetIndex];
          const editor = cellElement.querySelector('.cell-editor');
          editor.value = content;
          window.notebook.autoResize(editor);
        }
      },

      GetCellOutput: (index = null) => {
        const targetIndex = index !== null ? index : window.notebook.currentCellIndex;
        return window.notebook.cells[targetIndex]?.output || '';
      },

      ClearCellOutput: (index = null) => {
        const targetIndex = index !== null ? index : window.notebook.currentCellIndex;
        const cell = window.notebook.cells[targetIndex];
        if (cell) {
          cell.output = '';
          const cellElement = window.notebook.container.children[targetIndex];
          const outputDiv = cellElement.querySelector('.cell-output');
          outputDiv.textContent = '';
        }
      },

      // Notebook-level tokens
      GetNotebook: () => {
        return window.notebook.toJSON();
      },

      SetNotebook: (data) => {
        window.notebook.fromJSON(data);
      },

      GetCellCount: () => {
        return window.notebook.cells.length;
      },

      GetCurrentCellIndex: () => {
        return window.notebook.currentCellIndex;
      },

      // Style and appearance tokens
      SetCellStyle: (style, index = null) => {
        const targetIndex = index !== null ? index : window.notebook.currentCellIndex;
        const cellElement = window.notebook.container.children[targetIndex];
        if (cellElement) {
          Object.assign(cellElement.style, style);
        }
      },

      SetTheme: (theme) => {
        document.body.setAttribute('data-theme', theme);
        window.accessibility.announce(`Theme changed to ${theme}`);
      },

      // Utility tokens
      ShowMessage: (message, type = 'info') => {
        window.accessibility.announce(message);
        const statusText = document.getElementById('status-text');
        if (statusText) {
          statusText.textContent = message;
          statusText.className = `status-${type}`;
        }
      },

      ExecuteCommand: (command) => {
        const commands = {
          'save': () => window.keyboardManager.saveNotebook(),
          'shortcuts': () => window.keyboardManager.showShortcutsDialog(),
          'describe': () => window.keyboardManager.describeCurrent(),
          'reset': () => {
            window.notebook.fromJSON({ cells: [] });
            window.notebook.createCell('code', '');
          }
        };

        if (commands[command]) {
          commands[command]();
        } else {
          throw new Error(`Unknown command: ${command}`);
        }
      },

      // Batch operations
      BatchExecute: async (operations) => {
        const results = [];
        for (const operation of operations) {
          try {
            const result = await operation();
            results.push({ success: true, result });
          } catch (error) {
            results.push({ success: false, error: error.message });
          }
        }
        return results;
      },

      // Metadata tokens
      GetCellMetadata: (index = null) => {
        const targetIndex = index !== null ? index : window.notebook.currentCellIndex;
        return window.notebook.cells[targetIndex]?.metadata || {};
      },

      SetCellMetadata: (metadata, index = null) => {
        const targetIndex = index !== null ? index : window.notebook.currentCellIndex;
        const cell = window.notebook.cells[targetIndex];
        if (cell) {
          cell.metadata = { ...cell.metadata, ...metadata };
        }
      },

      // Selection and navigation
      SelectNextCell: () => {
        window.keyboardManager.navigateDown();
      },

      SelectPreviousCell: () => {
        window.keyboardManager.navigateUp();
      },

      // Cell type conversion
      ConvertCellType: (newType, index = null) => {
        const targetIndex = index !== null ? index : window.notebook.currentCellIndex;
        const cell = window.notebook.cells[targetIndex];
        if (cell) {
          cell.type = newType;
          const cellElement = window.notebook.container.children[targetIndex];
          cellElement.setAttribute('data-type', newType);

          const typeLabel = cellElement.querySelector('.cell-type');
          if (typeLabel) {
            typeLabel.textContent = newType;
          }

          window.accessibility.announce(`Cell converted to ${newType}`);
        }
      }
    };
  }

  exposeToWindow() {
    window.FrontEnd = {};

    Object.keys(this.tokens).forEach((tokenName) => {
      window.FrontEnd[tokenName] = this.tokens[tokenName];
    });

    console.log('FrontEnd API initialized with tokens:', Object.keys(this.tokens));
  }

  getToken(name) {
    return this.tokens[name];
  }

  registerCustomToken(name, handler) {
    if (this.tokens[name]) {
      console.warn(`Token ${name} already exists and will be overwritten`);
    }

    this.tokens[name] = handler;
    window.FrontEnd[name] = handler;

    console.log(`Custom token registered: ${name}`);
  }

  unregisterToken(name) {
    delete this.tokens[name];
    delete window.FrontEnd[name];

    console.log(`Token unregistered: ${name}`);
  }
}

window.frontEndAPI = new FrontEndAPI();

console.log(`
FrontEnd API initialized!

Example usage:
  FrontEnd.CreateCell('code', 'console.log("Hello World")')
  FrontEnd.EvaluateCell()
  FrontEnd.GetCellContent()
  FrontEnd.SetCellContent('2 + 2')
  FrontEnd.ShowMessage('Processing complete', 'success')

For a complete list of tokens, check window.FrontEnd
`);
