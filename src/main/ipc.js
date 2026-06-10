/**
 * IPC wiring: routes renderer requests to the store/commands and forwards
 * store events to the renderer as granular updates.
 */

import { ipcMain } from 'electron';
import { createCommands } from './commands.js';

export function sendToRenderer(window, channel, payload) {
  if (window && !window.isDestroyed()) {
    window.webContents.send('notebook-event', { channel, payload });
  }
}

const FORWARDED_STORE_EVENTS = [
  'notebook-replaced',
  'cell-inserted',
  'cell-deleted',
  'cell-source-changed',
  'cell-type-changed',
  'cell-moved',
  'cell-outputs-changed',
  'active-cell-changed',
  'kernel-name-changed',
  'dirty-changed'
];

export function registerIpc({ store, kernels, getWindow }) {
  const commands = createCommands({ store, kernels, getWindow });

  for (const event of FORWARDED_STORE_EVENTS) {
    store.on(event, (payload) => sendToRenderer(getWindow(), event, payload));
  }

  kernels.on('status-changed', ({ name, status }) => {
    sendToRenderer(getWindow(), 'kernel-status-changed', { name, status });
  });

  ipcMain.handle('notebook:get-state', () => ({
    ...store.getState(),
    kernels: kernels.list(),
    kernelStatus: kernels.status(store.metadata.kernelName)
  }));

  // Mutations initiated from the renderer (typing, focus, toolbar).
  ipcMain.handle('notebook:command', async (_event, { name, args = {} }) => {
    switch (name) {
      case 'update-source':
        store.updateSource(args.id, args.source);
        return;
      case 'set-active-cell':
        store.setActiveCell(args.id);
        return;
      case 'run-cell':
        return commands.runCell(args.id, { advance: args.advance ?? false });
      case 'run-all':
        return commands.runAll();
      case 'insert-cell':
        return commands.insertCell(args.type ?? 'code', args.position ?? 'below');
      case 'delete-cell':
        return commands.deleteCell();
      case 'move-cell':
        return commands.moveCell(args.direction);
      case 'set-cell-type':
        return commands.setCellType(args.type);
      case 'set-kernel':
        return commands.setKernel(args.kernelName);
      case 'interrupt-kernel':
        return commands.interruptKernel();
      case 'restart-kernel':
        return commands.restartKernel();
      case 'kernel-status':
        return commands.kernelStatus();
      case 'clear-outputs':
        return commands.clearOutputs();
      case 'clear-all-outputs':
        return commands.clearAllOutputs();
      default:
        throw new Error(`Unknown command: ${name}`);
    }
  });

  return commands;
}
