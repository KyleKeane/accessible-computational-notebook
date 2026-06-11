/**
 * Export a notebook as a standalone, accessible HTML document: semantic
 * headings from markdown, code in labelled <pre><code> blocks, outputs
 * with their image descriptions and real table semantics. Everything the
 * app knows about accessibility travels with the exported file.
 */

import { renderMarkdown, escapeHtml } from './markdown.js';
import { sanitizeHtml } from './safe-html.js';

const IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/gif'];

function joinData(value) {
  return Array.isArray(value) ? value.join('') : value ?? '';
}

function renderOutput(output, cellNumber) {
  switch (output.type) {
    case 'stream':
      return `<pre class="${output.name === 'stderr' ? 'stderr' : 'stdout'}">${escapeHtml(output.text)}</pre>`;
    case 'execute_result':
      return `<pre class="result">${escapeHtml(output.text)}</pre>`;
    case 'error':
      return `<pre class="error">${escapeHtml(output.traceback || `${output.ename}: ${output.evalue}`)}</pre>`;
    default: {
      const raw = output.raw ?? {};
      const data = raw.data ?? {};
      const imageMime = IMAGE_MIMES.find((mime) => data[mime]);
      if (imageMime) {
        const alt = raw.metadata?.alt || `Image output of cell ${cellNumber}, no description available`;
        const src = `data:${imageMime};base64,${joinData(data[imageMime]).replace(/\n/g, '')}`;
        return `<img src="${src}" alt="${escapeHtml(alt)}">`;
      }
      if (data['text/html']) return `<div class="html-output">${sanitizeHtml(joinData(data['text/html']))}</div>`;
      if (data['text/plain']) return `<pre class="result">${escapeHtml(joinData(data['text/plain']))}</pre>`;
      return '';
    }
  }
}

const STYLE = `
  body { font: 16px/1.5 system-ui, sans-serif; max-width: 60rem; margin: 2rem auto; padding: 0 1rem; }
  pre { padding: 0.5rem; overflow-x: auto; }
  pre.source { background: #f6f6f6; border: 1px solid #999; border-radius: 4px; }
  pre.stderr { background: #fff4f4; }
  pre.error { color: #a4262c; }
  pre.result { font-weight: 600; }
  img { max-width: 100%; }
  table { border-collapse: collapse; }
  th, td { border: 1px solid #767676; padding: 0.25rem 0.6rem; text-align: left; }
  @media (prefers-color-scheme: dark) {
    body { background: #1e1e1e; color: #ececec; }
    pre.source { background: #252526; }
    pre.stderr { background: #3a2222; }
    pre.error { color: #ff9b9b; }
  }
`;

export function toHtml(state, title = 'Notebook') {
  const language = state.metadata.kernelName ?? 'python';
  const body = state.cells.map((cell, index) => {
    const number = index + 1;
    if (cell.type === 'markdown') {
      return renderMarkdown(cell.source);
    }
    if (cell.type === 'raw') {
      return `<pre aria-label="Raw cell ${number}">${escapeHtml(cell.source)}</pre>`;
    }
    const outputs = cell.outputs.map((o) => renderOutput(o, number)).filter(Boolean);
    return [
      `<section aria-label="Code cell ${number}">`,
      `<pre class="source"><code class="language-${escapeHtml(language)}">${escapeHtml(cell.source)}</code></pre>`,
      ...(outputs.length > 0
        ? [`<div role="group" aria-label="Output of cell ${number}">`, ...outputs, '</div>']
        : []),
      '</section>'
    ].join('\n');
  }).join('\n\n');

  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(title)}</title>`,
    `<style>${STYLE}</style>`,
    '</head>',
    '<body>',
    `<main aria-label="${escapeHtml(title)}">`,
    body,
    '</main>',
    '</body>',
    '</html>',
    ''
  ].join('\n');
}
