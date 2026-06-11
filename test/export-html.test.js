import test from 'node:test';
import assert from 'node:assert/strict';
import { toHtml } from '../src/core/export-html.js';
import { NotebookStore } from '../src/core/notebook-store.js';

function build() {
  const store = new NotebookStore();
  const first = store.cells[0];
  store.setCellType(first.id, 'markdown');
  store.updateSource(first.id, '# Report\n\nSee *results* below.');
  const code = store.insertCell({ relativeTo: first.id, position: 'below', source: 'print("<hi>")' });
  store.setOutputs(code.id, [
    { type: 'stream', name: 'stdout', text: '<hi>\n' },
    { type: 'execute_result', text: '42' },
    {
      type: 'passthrough',
      raw: {
        output_type: 'display_data',
        data: { 'image/png': 'aWc=' },
        metadata: { alt: 'A described chart' }
      }
    },
    {
      type: 'passthrough',
      raw: {
        output_type: 'display_data',
        data: { 'text/html': '<table><tr><td>1</td></tr></table><script>x()</script>' },
        metadata: {}
      }
    }
  ], 1);
  return store.getState();
}

test('export produces a complete document with semantic structure', () => {
  const html = toHtml(build(), 'My Report');
  assert.match(html, /^<!DOCTYPE html>/);
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<title>My Report<\/title>/);
  assert.match(html, /<h1>Report<\/h1>/);
  assert.match(html, /<em>results<\/em>/);
  assert.match(html, /aria-label="Code cell 2"/);
  assert.match(html, /aria-label="Output of cell 2"/);
});

test('source and stream text are escaped; scripts in rich HTML are stripped', () => {
  const html = toHtml(build());
  assert.match(html, /print\(&quot;&lt;hi&gt;&quot;\)/);
  assert.match(html, /<pre class="stdout">&lt;hi&gt;\n<\/pre>/);
  assert.ok(!html.includes('<script>'));
  assert.match(html, /<table><tr><td>1<\/td><\/tr><\/table>/);
});

test('image descriptions become alt text; undescribed images say so', () => {
  const html = toHtml(build());
  assert.match(html, /alt="A described chart"/);
  const state = build();
  delete state.cells[1].outputs[2].raw.metadata.alt;
  assert.match(toHtml(state), /alt="Image output of cell 2, no description available"/);
});

test('error outputs render with the traceback', () => {
  const store = new NotebookStore();
  store.setOutputs(store.cells[0].id, [
    { type: 'error', ename: 'ValueError', evalue: 'bad', traceback: 'Traceback...\nValueError: bad' }
  ], 1);
  assert.match(toHtml(store.getState()), /<pre class="error">Traceback\.\.\.\nValueError: bad<\/pre>/);
});
