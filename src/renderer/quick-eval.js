/**
 * Quick Evaluate — the audio-first scratchpad. Type an expression, hear
 * the result, iterate; the dialog keeps a log of this session's tries,
 * and the last expression can be inserted into the notebook as a cell
 * once it's right. Runs in the current kernel session, so notebook
 * variables are available.
 */

import { announce } from './announcer.js';

export function setupQuickEval(api) {
  const dialog = document.getElementById('quick-eval-dialog');
  const input = document.getElementById('quick-eval-input');
  const log = document.getElementById('quick-eval-log');
  let lastExpression = null;
  let busy = false;

  function open() {
    if (!dialog.open) dialog.showModal();
    input.focus();
    input.select();
  }

  async function evaluate() {
    const code = input.value.trim();
    if (code === '' || busy) return;
    busy = true;
    announce('Evaluating');
    const { status, summary } = await api.command('evaluate-snippet', { code });
    busy = false;
    lastExpression = code;
    const item = document.createElement('li');
    item.textContent = `${code} → ${summary}`;
    if (status === 'error') item.className = 'quick-eval-error';
    log.prepend(item);
    while (log.children.length > 20) log.lastChild.remove();
    announce(summary, status === 'error');
    input.select();
  }

  async function insertAsCell() {
    if (!lastExpression) {
      announce('Nothing evaluated yet');
      return;
    }
    dialog.close();
    // The dialog observer reports "modal closed" to main in a microtask;
    // wait a tick so that lands before the (dialog-guarded) insert.
    await new Promise((resolve) => setTimeout(resolve, 0));
    await api.command('insert-cell', { type: 'code', position: 'below', source: lastExpression });
  }

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      evaluate();
    }
  });
  document.getElementById('quick-eval-run').addEventListener('click', evaluate);
  document.getElementById('quick-eval-insert').addEventListener('click', insertAsCell);
  document.getElementById('quick-eval-close').addEventListener('click', () => dialog.close());

  return {
    handleEvent(channel) {
      if (channel === 'show-quick-eval') {
        open();
        return true;
      }
      return false;
    }
  };
}
