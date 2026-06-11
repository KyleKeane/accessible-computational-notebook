/**
 * Kernel intelligence UI: variable inspector, completion picker, and
 * symbol documentation. The completion picker is a native <select> — the
 * most reliable keyboard/screen-reader list widget there is.
 */

import { announce } from './announcer.js';

export function setupIntelligence(api, view) {
  const variablesDialog = document.getElementById('variables-dialog');
  const variablesBody = document.getElementById('variables-body');
  const completionDialog = document.getElementById('completion-dialog');
  const completionList = document.getElementById('completion-list');
  const docsDialog = document.getElementById('docs-dialog');
  const docsTitle = document.getElementById('docs-symbol');
  const docsText = document.getElementById('docs-text');

  /* ---------- variable inspector ---------- */

  function showVariables(variables) {
    variablesBody.textContent = '';
    for (const variable of variables) {
      const row = document.createElement('tr');
      for (const text of [variable.name, variable.type, variable.preview]) {
        const cell = document.createElement('td');
        cell.textContent = text;
        row.appendChild(cell);
      }
      variablesBody.appendChild(row);
    }
    variablesDialog.showModal();
    document.getElementById('variables-close').focus();
  }

  document.getElementById('variables-close').addEventListener('click', () => {
    variablesDialog.close();
  });

  /* ---------- completion ---------- */

  // Set while the picker is open: where the completion will be written.
  let target = null;

  function activeEditor() {
    const section = view.activeCellElement();
    const editor = section?.querySelector('.editor');
    return editor && !editor.hidden && document.activeElement === editor ? editor : null;
  }

  function insertCompletion(editor, match, replaceFrom, replaceTo) {
    editor.setRangeText(match, replaceFrom, replaceTo, 'end');
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    editor.focus();
  }

  async function completeAtCursor() {
    const editor = activeEditor();
    if (!editor) {
      announce('Completion works inside a cell editor');
      return;
    }
    const cursor = editor.selectionStart;
    const snapshot = editor.value;
    const reply = await api.command('complete', { code: snapshot, cursor });
    // The kernel may answer seconds later (e.g. while a cell is running);
    // if the text or caret moved meanwhile, the offsets are stale and
    // inserting would corrupt the cell.
    if (editor.value !== snapshot || editor.selectionStart !== cursor || !editor.isConnected) {
      announce('Text changed; completion canceled');
      return;
    }
    if (reply.error) {
      announce(reply.error, true);
      return;
    }
    const matches = reply.matches ?? [];
    if (matches.length === 0) {
      announce('No completions');
      return;
    }
    if (matches.length === 1) {
      insertCompletion(editor, matches[0], reply.replaceFrom, cursor);
      announce(matches[0]);
      return;
    }
    target = { editor, replaceFrom: reply.replaceFrom, replaceTo: cursor };
    completionList.textContent = '';
    for (const match of matches) {
      const option = document.createElement('option');
      option.value = match;
      option.textContent = match;
      completionList.appendChild(option);
    }
    completionList.selectedIndex = 0;
    completionDialog.showModal();
    completionList.focus();
    announce(`${matches.length} completions`);
  }

  function acceptCompletion() {
    const choice = completionList.value;
    completionDialog.close();
    if (choice && target && target.editor.isConnected) {
      insertCompletion(target.editor, choice, target.replaceFrom, target.replaceTo);
    }
    target = null;
  }

  completionList.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault();
      acceptCompletion();
    }
  });
  completionList.addEventListener('dblclick', acceptCompletion);
  completionDialog.addEventListener('close', () => {
    if (target) {
      target.editor.focus();
      target = null;
    }
  });

  /* ---------- symbol documentation ---------- */

  async function describeSymbol() {
    const editor = activeEditor();
    if (!editor) {
      announce('Describe symbol works inside a cell editor');
      return;
    }
    const reply = await api.command('symbol-docs', {
      code: editor.value,
      cursor: editor.selectionStart
    });
    if (reply.error) {
      announce(reply.error, true);
      return;
    }
    const text = reply.text ?? 'No documentation';
    // Short answers are spoken in place; long docstrings open a reader.
    if (text.length <= 200 && !text.includes('\n\n')) {
      announce(text);
      return;
    }
    docsTitle.textContent = reply.symbol || 'Documentation';
    docsText.textContent = text;
    docsDialog.showModal();
    docsText.focus();
    announce(`Documentation for ${reply.symbol}`);
  }

  document.getElementById('docs-close').addEventListener('click', () => {
    docsDialog.close();
  });

  return {
    handleEvent(channel, payload) {
      switch (channel) {
        case 'show-variables':
          showVariables(payload.variables);
          return true;
        case 'complete-at-cursor':
          completeAtCursor();
          return true;
        case 'describe-symbol':
          describeSymbol();
          return true;
        default:
          return false;
      }
    }
  };
}
