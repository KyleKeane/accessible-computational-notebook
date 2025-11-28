/**
 * Main application initialization
 */

class NotebookApp {
  constructor() {
    this.initialized = false;
    this.init();
  }

  async init() {
    console.log('Initializing Accessible Computational Notebook...');

    this.setupToolbar();
    this.createInitialCell();
    this.loadInterpreters();
    this.setupEventListeners();
    this.announceReady();

    this.initialized = true;
  }

  setupToolbar() {
    const addCodeBtn = document.getElementById('add-code-cell-btn');
    const addMarkdownBtn = document.getElementById('add-markdown-cell-btn');
    const runCellBtn = document.getElementById('run-cell-btn');
    const runAllBtn = document.getElementById('run-all-btn');

    addCodeBtn.addEventListener('click', () => {
      window.keyboardManager.addCodeCell();
    });

    addMarkdownBtn.addEventListener('click', () => {
      window.keyboardManager.addMarkdownCell();
    });

    runCellBtn.addEventListener('click', () => {
      window.keyboardManager.runCell();
    });

    runAllBtn.addEventListener('click', () => {
      window.keyboardManager.runAllCells();
    });
  }

  createInitialCell() {
    if (window.notebook.cells.length === 0) {
      window.notebook.createCell('code', '// Welcome to Accessible Computational Notebook!\n// Press Shift+Enter to run this cell\n\nconsole.log("Hello, World!");\n');
    }
  }

  async loadInterpreters() {
    try {
      const interpreters = await window.electronAPI.getInterpreters();
      const select = document.getElementById('interpreter-select');

      select.innerHTML = '';

      interpreters.forEach((interpreter) => {
        const option = document.createElement('option');
        option.value = interpreter.name;
        option.textContent = interpreter.displayName;
        select.appendChild(option);
      });

      console.log('Available interpreters:', interpreters);
    } catch (error) {
      console.error('Failed to load interpreters:', error);
      window.accessibility.announce('Failed to load interpreters');
    }
  }

  setupEventListeners() {
    document.addEventListener('DOMContentLoaded', () => {
      console.log('DOM loaded');
    });

    window.addEventListener('beforeunload', (e) => {
      if (window.notebook.cells.some(cell => cell.content.length > 0)) {
        e.preventDefault();
        e.returnValue = '';
        return 'You have unsaved changes. Are you sure you want to leave?';
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        window.keyboardManager.saveNotebook();
      }
    });
  }

  announceReady() {
    window.accessibility.announce(
      'Accessible Computational Notebook ready. Press Ctrl+/ for keyboard shortcuts.'
    );

    const statusText = document.getElementById('status-text');
    if (statusText) {
      statusText.textContent = 'Ready';
    }
  }

  showWelcomeMessage() {
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  Accessible Computational Notebook                            ║
║  Version 1.0.0                                                ║
╟───────────────────────────────────────────────────────────────╢
║  Features:                                                    ║
║  • Full keyboard navigation (Ctrl+/ for shortcuts)            ║
║  • Screen reader optimized                                    ║
║  • Modular interpreter backends (Python, JavaScript)          ║
║  • FrontEnd scripting API                                     ║
╟───────────────────────────────────────────────────────────────╢
║  Quick Start:                                                 ║
║  1. Type code in a cell                                       ║
║  2. Press Shift+Enter to run                                  ║
║  3. Press Alt+C to add a new code cell                        ║
║  4. Press Alt+M to add a markdown cell                        ║
╟───────────────────────────────────────────────────────────────╢
║  FrontEnd API Examples:                                       ║
║  FrontEnd.CreateCell('code', 'console.log("test")')           ║
║  FrontEnd.EvaluateAllCells()                                  ║
║  FrontEnd.GetCellContent()                                    ║
╚═══════════════════════════════════════════════════════════════╝
    `);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.app = new NotebookApp();
  window.app.showWelcomeMessage();
});
