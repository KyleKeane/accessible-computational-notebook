const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  executeCode: (interpreter, code) =>
    ipcRenderer.invoke('execute-code', { interpreter, code }),

  getInterpreters: () =>
    ipcRenderer.invoke('get-interpreters'),

  // Frontend scripting API (similar to Wolfram FrontEnd tokens)
  frontEnd: {
    // Will be populated by the frontend API module
  }
});
