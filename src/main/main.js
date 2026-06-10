/**
 * Electron main process: window lifecycle, native dialogs, and wiring
 * between the NotebookStore, the KernelManager, and the renderer.
 */

import { app, BrowserWindow, dialog } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { NotebookStore } from '../core/notebook-store.js';
import { parseIpynb, serializeIpynb } from '../core/ipynb.js';
import { KernelManager } from './kernels/kernel-manager.js';
import { buildMenu } from './menu.js';
import { registerIpc, sendToRenderer } from './ipc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const store = new NotebookStore();
const kernels = new KernelManager();
let window = null;
let filePath = null;

function updateTitle() {
  if (!window) return;
  const name = filePath ? path.basename(filePath) : 'Untitled notebook';
  // Screen readers announce the window title on focus; keep it informative.
  window.setTitle(`${name}${store.dirty ? ' — modified' : ''} — Accessible Notebook`);
}

const FILE_FILTERS = [{ name: 'Jupyter notebooks', extensions: ['ipynb'] }];

async function saveTo(target) {
  await fs.writeFile(target, serializeIpynb(store.getState()), 'utf8');
  filePath = target;
  store.markClean();
  updateTitle();
  sendToRenderer(window, 'announce', { text: `Saved ${path.basename(target)}` });
}

export async function saveNotebook() {
  if (filePath) return saveTo(filePath);
  return saveNotebookAs();
}

export async function saveNotebookAs() {
  const { canceled, filePath: target } = await dialog.showSaveDialog(window, {
    title: 'Save notebook',
    defaultPath: filePath ?? 'notebook.ipynb',
    filters: FILE_FILTERS
  });
  if (canceled || !target) return false;
  await saveTo(target);
  return true;
}

/** Returns true if it is OK to discard the current notebook. */
async function confirmDiscard() {
  if (!store.dirty) return true;
  const { response } = await dialog.showMessageBox(window, {
    type: 'warning',
    title: 'Unsaved changes',
    message: 'The notebook has unsaved changes.',
    detail: 'Save them before continuing?',
    buttons: ['Save', 'Discard changes', 'Cancel'],
    defaultId: 0,
    cancelId: 2,
    noLink: true
  });
  if (response === 0) return saveNotebook().then(() => !store.dirty);
  return response === 1;
}

export async function newNotebook() {
  if (!(await confirmDiscard())) return;
  filePath = null;
  store.reset();
  updateTitle();
}

export async function openNotebook() {
  if (!(await confirmDiscard())) return;
  const { canceled, filePaths } = await dialog.showOpenDialog(window, {
    title: 'Open notebook',
    filters: FILE_FILTERS,
    properties: ['openFile']
  });
  if (canceled || filePaths.length === 0) return;
  try {
    const json = await fs.readFile(filePaths[0], 'utf8');
    store.load(parseIpynb(json));
    filePath = filePaths[0];
    updateTitle();
    sendToRenderer(window, 'announce', {
      text: `Opened ${path.basename(filePaths[0])}, ${store.cellCount} cells`
    });
  } catch (error) {
    dialog.showMessageBox(window, {
      type: 'error',
      title: 'Could not open notebook',
      message: `Could not open ${path.basename(filePaths[0])}`,
      detail: error.message
    });
  }
}

function createWindow() {
  window = new BrowserWindow({
    width: 1100,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  window.loadFile(path.join(__dirname, '../renderer/index.html'));
  updateTitle();

  let allowClose = false;
  window.on('close', (event) => {
    if (allowClose || !store.dirty) return;
    event.preventDefault();
    confirmDiscard().then((ok) => {
      if (ok) {
        allowClose = true;
        window.close();
      }
    });
  });

  window.on('closed', () => {
    window = null;
  });
}

app.whenReady().then(() => {
  const commands = registerIpc({ store, kernels, getWindow: () => window });
  const menuContext = {
    store,
    kernels,
    getWindow: () => window,
    actions: { newNotebook, openNotebook, saveNotebook, saveNotebookAs },
    commands
  };
  buildMenu(menuContext);
  // Rebuild so the kernel radio items track the notebook's kernel.
  store.on('kernel-name-changed', () => buildMenu(menuContext));
  store.on('notebook-replaced', () => buildMenu(menuContext));
  store.on('dirty-changed', updateTitle);
  store.on('notebook-replaced', updateTitle);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  kernels.stopAll();
  app.quit();
});

app.on('will-quit', () => {
  kernels.stopAll();
});
