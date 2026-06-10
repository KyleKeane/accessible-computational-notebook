/**
 * Renderer bootstrap: initial render, event subscription, toolbar wiring.
 */

import { NotebookView } from './view.js';
import { setupKeyboard } from './keyboard.js';
import { setupFind } from './find.js';

const api = window.notebook;
const view = new NotebookView(api);
const find = setupFind(api, view);

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
  view.handleEvent(channel, payload);
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
