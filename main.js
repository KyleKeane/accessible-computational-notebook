const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile('index.html');

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
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
ipcMain.handle('execute-code', async (event, { interpreter, code }) => {
  // This will be handled by the interpreter manager
  const InterpreterManager = require('./src/interpreters/InterpreterManager');
  const manager = new InterpreterManager();

  try {
    const result = await manager.execute(interpreter, code);
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
