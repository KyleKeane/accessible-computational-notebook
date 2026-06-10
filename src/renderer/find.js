/**
 * Find and replace across cells. The dialog is non-modal so "Find next" can
 * move focus into the matching editor (with the match selected) while the
 * dialog stays open; every action announces its result.
 */

import { findMatches, replaceAllInSource } from '../core/search.js';
import { announce } from './announcer.js';

export function setupFind(api, view) {
  const dialog = document.getElementById('find-dialog');
  const findInput = document.getElementById('find-input');
  const replaceInput = document.getElementById('replace-input');
  const caseCheckbox = document.getElementById('find-case');

  // The match the user is currently on: { cellId, start, end }.
  let current = null;

  const options = () => ({ caseSensitive: caseCheckbox.checked });

  function open() {
    if (!dialog.open) dialog.show();
    findInput.focus();
    findInput.select();
  }

  function close() {
    current = null;
    dialog.close();
    const active = view.activeCellElement();
    if (active) view.focusCell(active.dataset.id);
  }

  async function findNext() {
    const query = findInput.value;
    if (!query) {
      announce('Type something to find');
      findInput.focus();
      return;
    }
    const state = await api.getState();
    const matches = findMatches(state.cells, query, options());
    if (matches.length === 0) {
      current = null;
      announce(`No matches for ${query}`);
      return;
    }
    // First match after the current one, in document order; wrap around.
    let nextIndex = 0;
    if (current) {
      const cellOrder = new Map(state.cells.map((cell, i) => [cell.id, i]));
      nextIndex = matches.findIndex((m) => {
        const mCell = cellOrder.get(m.cellId);
        const cCell = cellOrder.get(current.cellId) ?? -1;
        return mCell > cCell || (mCell === cCell && m.start > current.start);
      });
      if (nextIndex === -1) nextIndex = 0; // wrapped
    }
    const match = matches[nextIndex];
    current = { cellId: match.cellId, start: match.start, end: match.end };

    const section = view.cellElement(match.cellId);
    const editor = section?.querySelector('.editor');
    if (editor) {
      editor.hidden = false; // a rendered markdown cell goes back to source
      section.querySelector('.rendered-markdown').hidden = true;
      editor.focus();
      editor.setSelectionRange(match.start, match.end);
    }
    announce(`Match ${nextIndex + 1} of ${matches.length}: cell ${match.cellIndex + 1}, line ${match.line}`);
  }

  async function replaceCurrent() {
    if (!current) {
      await findNext();
      return;
    }
    const state = await api.getState();
    const cell = state.cells.find((c) => c.id === current.cellId);
    if (!cell) {
      current = null;
      announce('Match is gone; find again');
      return;
    }
    const replacement = replaceInput.value;
    const source = cell.source.slice(0, current.start) + replacement + cell.source.slice(current.end);
    await api.command('update-source', { id: cell.id, source });
    const editor = view.cellElement(cell.id)?.querySelector('.editor');
    if (editor) {
      editor.value = source;
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    }
    announce('Replaced');
    // Position the cursor so findNext picks the first match at or after the
    // end of the inserted replacement (findNext requires start > current.start).
    current = { cellId: cell.id, start: current.start + replacement.length - 1, end: 0 };
    await findNext();
  }

  async function replaceEverywhere() {
    const query = findInput.value;
    if (!query) {
      announce('Type something to find');
      findInput.focus();
      return;
    }
    const state = await api.getState();
    const replacement = replaceInput.value;
    let total = 0;
    let cellsChanged = 0;
    for (const cell of state.cells) {
      const { text, count } = replaceAllInSource(cell.source, query, replacement, options());
      if (count > 0) {
        total += count;
        cellsChanged += 1;
        await api.command('update-source', { id: cell.id, source: text });
        const editor = view.cellElement(cell.id)?.querySelector('.editor');
        if (editor) editor.value = text;
      }
    }
    current = null;
    announce(
      total === 0
        ? `No matches for ${query}`
        : `Replaced ${total} occurrence${total === 1 ? '' : 's'} in ${cellsChanged} cell${cellsChanged === 1 ? '' : 's'}`
    );
  }

  document.getElementById('find-next').addEventListener('click', findNext);
  document.getElementById('find-replace').addEventListener('click', replaceCurrent);
  document.getElementById('find-replace-all').addEventListener('click', replaceEverywhere);
  document.getElementById('find-close').addEventListener('click', close);

  findInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      findNext();
    }
  });
  replaceInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      replaceCurrent();
    }
  });
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  });

  // New search text invalidates the current match position.
  findInput.addEventListener('input', () => {
    current = null;
  });

  return { open };
}
