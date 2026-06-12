/**
 * IPC wiring: routes renderer requests to the store/commands and forwards
 * store events to the renderer as granular updates.
 */

import { ipcMain } from 'electron';
import { createCommands } from './commands.js';
import { createNotebookApi, handleApiRequest } from './kernels/notebook-api.js';

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

export function registerIpc({ store, kernels, getWindow, settings, getFilePath }) {
  const commands = createCommands({ store, kernels, getWindow, settings, getFilePath });

  for (const event of FORWARDED_STORE_EVENTS) {
    store.on(event, (payload) => sendToRenderer(getWindow(), event, payload));
  }

  kernels.on('status-changed', ({ name, status }) => {
    sendToRenderer(getWindow(), 'kernel-status-changed', { name, status });
  });

  // Notebook automation requests made by code running inside a kernel.
  const notebookApi = createNotebookApi(store);
  kernels.on('api-request', ({ request, respond }) => {
    try {
      respond(handleApiRequest(notebookApi, request) ?? null, null);
    } catch (error) {
      respond(null, error.message);
    }
  });

  ipcMain.handle('notebook:get-state', () => ({
    ...store.getState(),
    kernels: kernels.list(),
    kernelStatus: kernels.status(store.metadata.kernelName),
    settings: settings.values
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
      case 'set-ui-state':
        return commands.setUiState(args);
      case 'run-cell':
        return commands.runCell(args.id, { advance: args.advance ?? false });
      case 'run-all':
        return commands.runAll();
      case 'insert-cell':
        return commands.insertCell(args.type ?? 'code', args.position ?? 'below');
      case 'delete-cell':
        return commands.deleteCell();
      case 'cut-cell':
        return commands.cutCell();
      case 'copy-cell':
        return commands.copyCell();
      case 'paste-cell':
        return commands.pasteCell();
      case 'split-cell':
        return commands.splitCell(args.id, args.offset);
      case 'merge-below':
        return commands.mergeBelow();
      case 'run-snippet':
        return commands.runSnippet(args.code);
      case 'describe-notebook':
        return commands.describeNotebook();
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
      case 'undo-cell-operation':
        return commands.undoCellOperation();
      case 'redo-cell-operation':
        return commands.redoCellOperation();
      case 'run-all-above':
        return commands.runAllAbove();
      case 'run-all-below':
        return commands.runAllBelow();
      case 'set-image-description':
        return commands.setImageDescription(args.id, args.outputIndex, args.text);
      case 'list-variables':
        return commands.listVariables();
      case 'complete':
        return commands.complete(args.code, args.cursor);
      case 'symbol-docs':
        return commands.symbolDocs(args.code, args.cursor);
      case 'set-settings':
        return commands.updateSettings(args.values);
      default:
        throw new Error(`Unknown command: ${name}`);
    }
  });

  return commands;
}
