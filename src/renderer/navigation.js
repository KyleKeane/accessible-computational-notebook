/**
 * Document-level navigation: the "Go to Section" outline (markdown
 * headings across the notebook) and the announcement history review.
 */

import { extractOutline, sectionRange } from '../core/outline.js';
import { cellsToNarrative } from '../core/narrative.js';
import { announce, announcementHistory } from './announcer.js';

export function setupNavigation(api, view) {
  const outlineDialog = document.getElementById('outline-dialog');
  const outlineList = document.getElementById('outline-list');
  const historyDialog = document.getElementById('history-dialog');
  const historyList = document.getElementById('history-list');

  /* ---------- go to section ---------- */

  async function showOutline() {
    const state = await api.getState();
    const entries = extractOutline(state.cells);
    if (entries.length === 0) {
      announce('No sections. Add markdown cells with headings to structure the notebook.');
      return;
    }
    outlineList.textContent = '';
    entries.forEach((entry, index) => {
      const option = document.createElement('option');
      option.value = String(index);
      // Indentation conveys nesting visually; the level is spelled out too.
      option.textContent = `${'   '.repeat(entry.level - 1)}${entry.title} (level ${entry.level}, cell ${entry.cellIndex + 1})`;
      outlineList.appendChild(option);
    });
    outlineList.dataset.entries = JSON.stringify(entries.map((e) => e.cellId));
    outlineList.selectedIndex = 0;
    outlineDialog.showModal();
    outlineList.focus();
    announce(`${entries.length} sections`);
  }

  async function goToSection() {
    const ids = JSON.parse(outlineList.dataset.entries ?? '[]');
    const id = ids[Number(outlineList.value)];
    outlineDialog.close();
    if (!id) return;
    // Jumping into a collapsed section expands every section covering it.
    const state = await api.getState();
    const targetIndex = state.cells.findIndex((cell) => cell.id === id);
    for (const heading of state.cells.filter((cell) => cell.nbMetadata?.heading_collapsed)) {
      const range = sectionRange(state.cells, heading.id);
      if (range && targetIndex >= range.startIndex && targetIndex < range.endIndex) {
        await api.command('set-collapsed', { id: heading.id, collapsed: false });
      }
    }
    // The collapse events that unhide the target arrive asynchronously;
    // unhide it locally so focus succeeds right now.
    const section = view.cellElement(id);
    if (section) section.hidden = false;
    view.focusCell(id);
  }

  outlineList.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      goToSection();
    }
  });
  outlineList.addEventListener('dblclick', goToSection);

  /* ---------- notebook narrative ---------- */

  async function showNarrative() {
    const state = await api.getState();
    const items = cellsToNarrative(state.cells);
    const body = document.getElementById('narrative-body');
    body.textContent = '';
    if (items.length === 0) {
      const p = document.createElement('p');
      p.textContent = 'The notebook is empty.';
      body.appendChild(p);
    }
    for (const item of items) {
      let element;
      switch (item.kind) {
        case 'heading':
          // The dialog title is the h1; notebook level 1 starts at h2.
          element = document.createElement(`h${Math.min(item.level + 1, 6)}`);
          element.textContent = item.text;
          break;
        case 'code':
          element = document.createElement('pre');
          element.className = 'narrative-code';
          element.setAttribute(
            'aria-label',
            `Step ${item.index}, ${item.lineCount} line${item.lineCount === 1 ? '' : 's'} of code`
          );
          element.textContent = item.text;
          break;
        case 'output':
          element = document.createElement('p');
          element.className = 'narrative-output';
          element.textContent = item.text;
          break;
        default:
          element = document.createElement('p');
          element.textContent = item.text;
      }
      body.appendChild(element);
    }
    document.getElementById('narrative-dialog').showModal();
    body.focus();
    announce(`Narrative, ${items.length} parts`);
  }

  document.getElementById('narrative-close').addEventListener('click', () => {
    document.getElementById('narrative-dialog').close();
  });

  /* ---------- announcement history ---------- */

  function showHistory() {
    const entries = announcementHistory();
    historyList.textContent = '';
    if (entries.length === 0) {
      const item = document.createElement('li');
      item.textContent = 'Nothing announced yet';
      historyList.appendChild(item);
    }
    for (const entry of entries) {
      const item = document.createElement('li');
      const time = entry.time.toTimeString().slice(0, 8);
      item.textContent = `${time} — ${entry.text}${entry.assertive ? ' (error)' : ''}`;
      historyList.appendChild(item);
    }
    historyDialog.showModal();
    document.getElementById('history-close').focus();
  }

  document.getElementById('history-close').addEventListener('click', () => {
    historyDialog.close();
  });

  return {
    handleEvent(channel) {
      switch (channel) {
        case 'show-outline':
          showOutline();
          return true;
        case 'show-narrative':
          showNarrative();
          return true;
        case 'show-history':
          showHistory();
          return true;
        default:
          return false;
      }
    }
  };
}
