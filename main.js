const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const notebookManager = require('./src/notebook/NotebookManager');

let mainWindow;
let windowId = 0;

function createWindow() {
  const currentWindowId = windowId++;

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Register notebook for this window
  notebookManager.registerNotebook(currentWindowId);

  // Send notebook updates to frontend
  notebookManager.on('cell-created', (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('notebook-update', {
        type: 'cell-created',
        data
      });
    }
  });

  notebookManager.on('cell-updated', (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('notebook-update', {
        type: 'cell-updated',
        data
      });
    }
  });

  notebookManager.on('cell-output', (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('notebook-update', {
        type: 'cell-output',
        data
      });
    }
  });

  mainWindow.loadFile('index.html');

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    notebookManager.clear(currentWindowId);
    mainWindow = null;
  });

  return currentWindowId;
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC handlers for interpreter communication
ipcMain.handle('execute-code', async (event, { interpreter, code, cellIndex }) => {
  const InterpreterManager = require('./src/interpreters/InterpreterManager');
  const manager = new InterpreterManager();

  try {
    // Execute code with notebook context
    const result = await manager.execute(interpreter, code, {
      cellIndex,
      notebookManager
    });
    return { success: true, result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-interpreters', async () => {
  const InterpreterManager = require('./src/interpreters/InterpreterManager');
  const manager = new InterpreterManager();
  return manager.getAvailableInterpreters();
});

// IPC handlers for notebook backend API
ipcMain.handle('notebook-sync', async (event, notebookData) => {
  notebookManager.syncFromFrontend(notebookData);
  return { success: true };
});

ipcMain.handle('notebook-get', async () => {
  return notebookManager.getNotebook();
});

ipcMain.handle('notebook-create-cell', async (event, { type, content, position }) => {
  const result = notebookManager.createCell(type, content, position);
  return result;
});

ipcMain.handle('notebook-set-cell-content', async (event, { cellIndex, content }) => {
  const result = notebookManager.setCellContent(cellIndex, content);
  return result;
});

ipcMain.handle('notebook-delete-cell', async (event, { cellIndex }) => {
  const result = notebookManager.deleteCell(cellIndex);
  return result;
});

ipcMain.handle('notebook-get-cell', async (event, { cellIndex }) => {
  const result = notebookManager.getCell(cellIndex);
  return result;
});
