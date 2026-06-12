/**
 * Renderer-local keyboard handling. Global shortcuts live in the native
 * menu (see src/main/menu.js); this module only implements focus movement
 * that depends on what currently has focus:
 *
 *   - Up/Down on a focused cell: previous/next cell
 *   - Enter on a focused cell: into the editor (or rendered markdown)
 *   - Escape in an editor: back to the cell
 *   - Tab/Shift+Tab in an editor: indent/unindent
 *   - F6: cycle toolbar / cells / status bar
 */

import { announce } from './announcer.js';

export function setupKeyboard(view) {
  document.addEventListener('keydown', (event) => {
    const target = event.target;

    if (event.key === 'F6') {
      // Inside a modal dialog the rest of the page is inert; cycling would
      // announce a focus move that cannot happen.
      if (document.querySelector('dialog:modal')) return;
      event.preventDefault();
      cycleRegions(view, event.shiftKey);
      return;
    }

    const cellSection = target.closest?.('.cell');

    // Keys on the cell container (navigation mode).
    if (cellSection && target === cellSection) {
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault();
        const cells = view.cellElements();
        const index = cells.indexOf(cellSection);
        const direction = event.key === 'ArrowUp' ? -1 : 1;
        // Skip cells hidden inside collapsed sections.
        let next = index + direction;
        while (next >= 0 && next < cells.length && cells[next].hidden) next += direction;
        if (next < 0) {
          announce('First cell');
        } else if (next >= cells.length) {
          announce('Last cell');
        } else {
          view.focusCell(cells[next].dataset.id);
        }
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        view.focusCell(cellSection.dataset.id, true);
        return;
      }
    }

    // Keys inside the editor.
    if (target.classList?.contains('editor')) {
      if (event.key === 'Escape') {
        event.preventDefault();
        view.focusCell(cellSection.dataset.id);
        announce('Cell selected. Use arrow keys to move between cells.');
        return;
      }
      if (event.key === 'Tab') {
        event.preventDefault();
        if (event.shiftKey) unindent(target);
        else indent(target);
        return;
      }
    }

    // Enter on a rendered markdown view goes back to editing.
    if (target.classList?.contains('rendered-markdown') && event.key === 'Enter') {
      event.preventDefault();
      const editor = cellSection.querySelector('.editor');
      editor.hidden = false;
      target.hidden = true;
      editor.focus();
      announce('Editing markdown source');
    }
  });
}

function cycleRegions(view, backwards) {
  const regions = ['toolbar', 'cells', 'status'];
  const current = document.activeElement?.closest('header') ? 0
    : document.activeElement?.closest('footer') ? 2 : 1;
  const next = regions[(current + (backwards ? regions.length - 1 : 1)) % regions.length];
  if (next === 'toolbar') {
    document.querySelector('#toolbar button').focus();
    announce('Toolbar');
  } else if (next === 'status') {
    const footer = document.querySelector('footer');
    footer.tabIndex = -1;
    footer.focus();
    announce(footer.textContent.trim() || 'Status bar');
  } else {
    const active = view.activeCellElement() ?? view.cellElements()[0];
    if (active) view.focusCell(active.dataset.id);
    announce('Cells');
  }
}

function indent(editor) {
  const { selectionStart, selectionEnd, value } = editor;
  editor.setRangeText('  ', selectionStart, selectionStart, 'end');
  if (selectionEnd !== selectionStart) {
    editor.selectionEnd = selectionEnd + 2;
  }
  editor.dispatchEvent(new Event('input', { bubbles: true }));
}

function unindent(editor) {
  const { selectionStart, value } = editor;
  const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
  if (value.startsWith('  ', lineStart)) {
    editor.setRangeText('', lineStart, lineStart + 2, 'preserve');
    editor.dispatchEvent(new Event('input', { bubbles: true }));
  }
}
