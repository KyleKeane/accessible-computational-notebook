/**
 * Preload bridge. The renderer gets exactly two capabilities:
 * sending notebook commands and subscribing to notebook events.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('notebook', {
  getState: () => ipcRenderer.invoke('notebook:get-state'),
  command: (name, args) => ipcRenderer.invoke('notebook:command', { name, args }),
  onEvent: (handler) => {
    ipcRenderer.on('notebook-event', (_event, { channel, payload }) => {
      handler(channel, payload);
    });
  }
});
