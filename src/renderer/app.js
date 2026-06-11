/**
 * Renderer bootstrap: initial render, event subscription, toolbar wiring.
 */

import { NotebookView } from './view.js';
import { setupKeyboard } from './keyboard.js';
import { setupFind } from './find.js';
import { setupIntelligence } from './intelligence.js';
import { setupNavigation } from './navigation.js';

const api = window.notebook;
const view = new NotebookView(api);
const find = setupFind(api, view);
const intelligence = setupIntelligence(api, view);
const navigation = setupNavigation(api, view);

async function refresh() {
  const state = await api.getState();
  const select = document.getElementById('kernel-select');
  select.textContent = '';
  for (const kernel of state.kernels) {
    const option = document.createElement('option');
    option.value = kernel.name;
    option.textContent = kernel.displayName;
    select.appendChild(option);
  }
  select.value = state.metadata.kernelName;
  document.getElementById('status-kernel').textContent = `Kernel: ${state.kernelStatus}`;
  document.getElementById('status-dirty').textContent = state.dirty ? 'Modified' : '';
  view.renderAll(state);
}

api.onEvent((channel, payload) => {
  if (channel === 'notebook-replaced') {
    refresh();
    return;
  }
  if (channel === 'show-find') {
    find.open();
    return;
  }
  if (channel === 'show-settings') {
    openSettings();
    return;
  }
  if (intelligence.handleEvent(channel, payload)) return;
  if (navigation.handleEvent(channel, payload)) return;
  view.handleEvent(channel, payload);
});

/* ---------- settings dialog ---------- */

async function openSettings() {
  const { settings } = await api.getState();
  document.getElementById('setting-timeout').value = settings.executionTimeoutSeconds;
  document.getElementById('setting-announce-length').value = settings.maxAnnouncedOutputLength;
  document.getElementById('setting-autosave').value = settings.autosaveIntervalSeconds;
  const dialog = document.getElementById('settings-dialog');
  dialog.showModal();
  document.getElementById('setting-timeout').focus();
}

document.getElementById('settings-save').addEventListener('click', async () => {
  await api.command('set-settings', {
    values: {
      executionTimeoutSeconds: Number(document.getElementById('setting-timeout').value),
      maxAnnouncedOutputLength: Number(document.getElementById('setting-announce-length').value),
      autosaveIntervalSeconds: Number(document.getElementById('setting-autosave').value)
    }
  });
  document.getElementById('settings-dialog').close();
});
document.getElementById('settings-cancel').addEventListener('click', () => {
  document.getElementById('settings-dialog').close();
});

/* ---------- image description dialog ---------- */

document.getElementById('image-desc-save').addEventListener('click', async () => {
  const dialog = document.getElementById('image-desc-dialog');
  await api.command('set-image-description', {
    id: dialog.dataset.cellId,
    outputIndex: Number(dialog.dataset.outputIndex),
    text: document.getElementById('image-desc-text').value.trim()
  });
  dialog.close();
});
document.getElementById('image-desc-cancel').addEventListener('click', () => {
  document.getElementById('image-desc-dialog').close();
});

document.getElementById('btn-insert-code').addEventListener('click', () => {
  api.command('insert-cell', { type: 'code', position: 'below' });
});
document.getElementById('btn-run').addEventListener('click', () => {
  api.command('run-cell', {});
});
document.getElementById('btn-run-all').addEventListener('click', () => {
  api.command('run-all', {});
});
document.getElementById('kernel-select').addEventListener('change', (event) => {
  api.command('set-kernel', { kernelName: event.target.value });
});

setupKeyboard(view);
refresh();
