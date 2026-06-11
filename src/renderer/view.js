/**
 * View layer: renders notebook state into the DOM and keeps it in sync with
 * granular events from the main process. Holds no model state of its own —
 * the DOM is keyed by cell id and rebuilt from store events.
 */

import { renderMarkdown } from '../core/markdown.js';
import { sanitizeHtml } from '../core/safe-html.js';
import { announce } from './announcer.js';

const IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/gif'];

/** nbformat data values are strings or line lists. */
function joinData(value) {
  return Array.isArray(value) ? value.join('') : value ?? '';
}

const cellsContainer = document.getElementById('cells');

const TYPE_NAMES = { code: 'Code', markdown: 'Markdown', raw: 'Raw' };

export class NotebookView {
  constructor(api) {
    this.api = api; // window.notebook bridge
    this.activeCellId = null;
  }

  /* ---------- DOM lookups ---------- */

  cellElements() {
    return [...cellsContainer.querySelectorAll('.cell')];
  }

  cellElement(id) {
    return cellsContainer.querySelector(`.cell[data-id="${CSS.escape(id)}"]`);
  }

  activeCellElement() {
    return this.activeCellId ? this.cellElement(this.activeCellId) : null;
  }

  /* ---------- full render ---------- */

  renderAll(state) {
    cellsContainer.textContent = '';
    for (const cell of state.cells) {
      cellsContainer.appendChild(this.buildCell(cell));
    }
    this.activeCellId = state.activeCellId;
    this.relabel();
  }

  buildCell(cell) {
    const section = document.createElement('section');
    section.className = 'cell';
    section.dataset.id = cell.id;
    section.dataset.type = cell.type;
    section.setAttribute('role', 'group');
    section.tabIndex = -1;

    const head = document.createElement('div');
    head.className = 'cell-head';
    head.setAttribute('aria-hidden', 'true');
    const badge = document.createElement('span');
    badge.className = 'cell-badge';
    head.appendChild(badge);
    section.appendChild(head);

    const label = document.createElement('label');
    label.className = 'sr-only';
    label.htmlFor = `editor-${cell.id}`;
    section.appendChild(label);

    const editor = document.createElement('textarea');
    editor.className = 'editor';
    editor.id = `editor-${cell.id}`;
    editor.value = cell.source;
    editor.rows = Math.max(2, cell.source.split('\n').length);
    editor.spellcheck = false;
    editor.autocapitalize = 'off';
    editor.setAttribute('autocorrect', 'off');
    section.appendChild(editor);

    const rendered = document.createElement('div');
    rendered.className = 'rendered-markdown';
    rendered.tabIndex = -1;
    rendered.hidden = true;
    section.appendChild(rendered);

    const outputs = document.createElement('div');
    outputs.className = 'outputs';
    outputs.setAttribute('role', 'group');
    outputs.hidden = true;
    section.appendChild(outputs);

    editor.addEventListener('input', () => {
      editor.rows = Math.max(2, editor.value.split('\n').length);
      this.api.command('update-source', { id: cell.id, source: editor.value });
    });
    editor.addEventListener('focus', () => this.setActive(cell.id));
    section.addEventListener('focus', () => this.setActive(cell.id));

    this.renderOutputs(section, cell.outputs ?? []);
    this.renderTypeState(section, cell);
    return section;
  }

  /** Show editor vs rendered view depending on type and content. */
  renderTypeState(section, cell) {
    const renderedView = section.querySelector('.rendered-markdown');
    if (cell.type === 'markdown' && cell.source.trim() !== '') {
      renderedView.innerHTML = renderMarkdown(cell.source);
      renderedView.hidden = false;
      section.querySelector('.editor').hidden = true;
    } else {
      renderedView.hidden = true;
      section.querySelector('.editor').hidden = false;
    }
  }

  /** Update positional labels on every cell (cheap, runs on any reorder). */
  relabel() {
    const elements = this.cellElements();
    elements.forEach((section, index) => {
      const type = TYPE_NAMES[section.dataset.type] ?? section.dataset.type;
      const position = `${index + 1} of ${elements.length}`;
      const editor = section.querySelector('.editor');
      const count = section.dataset.executionCount;
      const countText = count ? `, ran ${count}` : '';
      section.setAttribute('aria-label', `${type} cell ${position}${countText}`);
      section.querySelector('label').textContent = `${type} cell ${position} source`;
      section.querySelector('.outputs').setAttribute('aria-label', `Output of cell ${index + 1}`);
      section.querySelector('.cell-badge').textContent =
        `${type}${count ? ` [${count}]` : ''}`;
      // Only the active cell is in the tab order (roving tabindex).
      section.tabIndex = section.dataset.id === this.activeCellId ? 0 : -1;
      editor.tabIndex = section.dataset.id === this.activeCellId ? 0 : -1;
    });
    const index = elements.findIndex((el) => el.dataset.id === this.activeCellId);
    document.getElementById('status-position').textContent =
      index >= 0 ? `Cell ${index + 1} of ${elements.length}` : '';
  }

  renderOutputs(section, outputs) {
    const container = section.querySelector('.outputs');
    container.textContent = '';
    container.hidden = outputs.length === 0;
    outputs.forEach((output, index) => {
      container.appendChild(this.buildOutput(output, index));
    });
  }

  buildOutput(output, index) {
    const pre = document.createElement('pre');
    switch (output.type) {
      case 'stream':
        pre.className = output.name === 'stderr' ? 'out-stderr' : 'out-stream';
        pre.textContent = output.text;
        return pre;
      case 'execute_result':
        pre.className = 'out-result';
        pre.textContent = output.text;
        return pre;
      case 'error':
        pre.className = 'out-error';
        pre.textContent = output.traceback || `${output.ename}: ${output.evalue}`;
        return pre;
      default:
        return this.buildRichOutput(output, index);
    }
  }

  /** Rich outputs from other tools (display_data etc.): images with the
      alt-description flow, sanitized HTML (tables!), or plain text. */
  buildRichOutput(output, index) {
    const raw = output.raw ?? {};
    const data = raw.data ?? {};

    const imageMime = IMAGE_MIMES.find((mime) => data[mime]);
    if (imageMime) {
      const img = document.createElement('img');
      img.className = 'out-image';
      img.src = `data:${imageMime};base64,${joinData(data[imageMime]).replace(/\n/g, '')}`;
      img.dataset.outputIndex = String(index);
      const alt = raw.metadata?.alt;
      img.dataset.hasAlt = alt ? 'true' : 'false';
      img.alt = alt ||
        'Image without a description. Press Control Shift G to add one.';
      return img;
    }

    if (data['text/html']) {
      const div = document.createElement('div');
      div.className = 'out-html';
      div.innerHTML = sanitizeHtml(joinData(data['text/html']));
      return div;
    }

    if (data['text/plain']) {
      const pre = document.createElement('pre');
      pre.className = 'out-result';
      pre.textContent = joinData(data['text/plain']);
      return pre;
    }

    const fallback = document.createElement('pre');
    fallback.className = 'out-unsupported';
    fallback.textContent = `[unsupported output: ${raw.output_type ?? 'unknown'}]`;
    return fallback;
  }

  setActive(id) {
    if (this.activeCellId === id) return;
    this.activeCellId = id;
    this.api.command('set-active-cell', { id });
    for (const section of this.cellElements()) {
      section.classList.toggle('active', section.dataset.id === id);
    }
    this.relabel();
  }

  focusCell(id, edit = false) {
    const section = this.cellElement(id);
    if (!section) return;
    this.setActive(id);
    if (edit) {
      const editor = section.querySelector('.editor');
      if (!editor.hidden) {
        editor.focus();
        return;
      }
      const renderedView = section.querySelector('.rendered-markdown');
      if (!renderedView.hidden) {
        renderedView.focus();
        return;
      }
    }
    section.focus();
  }

  /* ---------- on-demand speech ---------- */

  describeActiveCell() {
    const section = this.activeCellElement();
    if (!section) return;
    const elements = this.cellElements();
    const index = elements.indexOf(section);
    const type = TYPE_NAMES[section.dataset.type] ?? section.dataset.type;
    const editor = section.querySelector('.editor');
    const lines = editor.value === '' ? 0 : editor.value.split('\n').length;
    const outputs = section.querySelector('.outputs');
    const parts = [`${type} cell ${index + 1} of ${elements.length}`];
    parts.push(lines === 0 ? 'empty' : `${lines} line${lines === 1 ? '' : 's'}`);
    if (section.dataset.executionCount) parts.push(`ran ${section.dataset.executionCount}`);
    parts.push(outputs.hidden ? 'no output' : 'has output');
    announce(parts.join(', '));
  }

  readActiveOutput() {
    const section = this.activeCellElement();
    if (!section) return;
    const outputs = section.querySelector('.outputs');
    if (outputs.hidden || outputs.textContent.trim() === '') {
      announce('No output');
      return;
    }
    announce(outputs.textContent);
  }

  /** Open the description editor for the first image in the active cell. */
  openImageDescription() {
    const section = this.activeCellElement();
    const img = section?.querySelector('img.out-image');
    if (!img) {
      announce('No image output in this cell');
      return;
    }
    const dialog = document.getElementById('image-desc-dialog');
    const textarea = document.getElementById('image-desc-text');
    textarea.value = img.dataset.hasAlt === 'true' ? img.alt : '';
    dialog.dataset.cellId = section.dataset.id;
    dialog.dataset.outputIndex = img.dataset.outputIndex;
    dialog.showModal();
    textarea.focus();
  }

  /* ---------- event handlers from main ---------- */

  handleEvent(channel, payload) {
    switch (channel) {
      case 'cell-inserted': {
        const next = this.cellElements()[payload.index] ?? null;
        cellsContainer.insertBefore(this.buildCell(payload.cell), next);
        this.relabel();
        break;
      }
      case 'cell-deleted': {
        this.cellElement(payload.id)?.remove();
        if (this.activeCellId === payload.id) {
          this.activeCellId = payload.nextActiveId;
        }
        this.relabel();
        break;
      }
      case 'cell-source-changed': {
        const editor = this.cellElement(payload.id)?.querySelector('.editor');
        // Don't clobber the user's in-progress typing with our own echo.
        if (editor && document.activeElement !== editor && editor.value !== payload.source) {
          editor.value = payload.source;
          editor.rows = Math.max(2, payload.source.split('\n').length);
        }
        break;
      }
      case 'cell-type-changed': {
        const section = this.cellElement(payload.id);
        if (section) {
          section.dataset.type = payload.type;
          delete section.dataset.executionCount;
          this.renderOutputs(section, []);
          this.renderTypeState(section, {
            type: payload.type,
            source: section.querySelector('.editor').value
          });
          this.relabel();
        }
        break;
      }
      case 'cell-moved': {
        const section = this.cellElement(payload.id);
        if (section) {
          section.remove();
          const next = this.cellElements()[payload.to] ?? null;
          cellsContainer.insertBefore(section, next);
          this.relabel();
        }
        break;
      }
      case 'cell-outputs-changed': {
        const section = this.cellElement(payload.id);
        if (section) {
          if (payload.executionCount) {
            section.dataset.executionCount = String(payload.executionCount);
          } else {
            delete section.dataset.executionCount;
          }
          this.renderOutputs(section, payload.outputs);
          this.relabel();
        }
        break;
      }
      case 'cell-execution-started': {
        const section = this.cellElement(payload.id);
        section?.setAttribute('aria-busy', 'true');
        section?.classList.add('running');
        break;
      }
      case 'cell-execution-finished': {
        const section = this.cellElement(payload.id);
        section?.removeAttribute('aria-busy');
        section?.classList.remove('running');
        break;
      }
      case 'cell-rendered': {
        const section = this.cellElement(payload.id);
        if (section) {
          this.renderTypeState(section, {
            type: section.dataset.type,
            source: section.querySelector('.editor').value
          });
          if (section.dataset.type === 'markdown') announce('Markdown rendered');
        }
        break;
      }
      case 'active-cell-changed': {
        this.activeCellId = payload.id;
        for (const section of this.cellElements()) {
          section.classList.toggle('active', section.dataset.id === payload.id);
        }
        this.relabel();
        break;
      }
      case 'focus-cell':
        this.focusCell(payload.id, payload.edit);
        break;
      case 'describe-cell':
        this.describeActiveCell();
        break;
      case 'describe-image':
        this.openImageDescription();
        break;
      case 'read-output':
        this.readActiveOutput();
        break;
      case 'focus-first-cell': {
        const first = this.cellElements()[0];
        if (first) this.focusCell(first.dataset.id);
        break;
      }
      case 'focus-last-cell': {
        const elements = this.cellElements();
        const last = elements[elements.length - 1];
        if (last) this.focusCell(last.dataset.id);
        break;
      }
      case 'kernel-status-changed':
        document.getElementById('status-kernel').textContent =
          `Kernel: ${payload.status}`;
        break;
      case 'kernel-name-changed':
        document.getElementById('kernel-select').value = payload.kernelName;
        break;
      case 'dirty-changed':
        document.getElementById('status-dirty').textContent =
          payload === true || payload?.dirty === true ? 'Modified' : '';
        break;
      case 'announce':
        announce(payload.text, payload.assertive);
        break;
      case 'show-help': {
        const dialog = document.getElementById('help-dialog');
        if (!dialog.open) dialog.showModal();
        break;
      }
      // 'notebook-replaced' triggers a full refresh in app.js.
    }
  }
}
