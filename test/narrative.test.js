import test from 'node:test';
import assert from 'node:assert/strict';
import { cellsToNarrative, narrativeToText } from '../src/core/narrative.js';

const cells = [
  { id: 'm1', type: 'markdown', source: '# Sales report\n\nWe **compute** the *total*.', outputs: [] },
  {
    id: 'c1', type: 'code', source: 'total = 10 + 4\ntotal',
    outputs: [{ type: 'execute_result', text: '14' }]
  },
  {
    id: 'c2', type: 'code', source: 'print("done")',
    outputs: [
      { type: 'stream', name: 'stdout', text: 'done\n' },
      { type: 'error', ename: 'ValueError', evalue: 'oops', traceback: '...' }
    ]
  },
  { id: 'c3', type: 'code', source: '', outputs: [] }, // empty: skipped
  {
    id: 'c4', type: 'code', source: 'plot()',
    outputs: [{
      type: 'passthrough',
      raw: { output_type: 'display_data', data: { 'image/png': 'aWc=' }, metadata: { alt: 'A bar chart' } }
    }]
  }
];

test('narrative interleaves prose, code, and results in reading order', () => {
  const items = cellsToNarrative(cells);
  assert.deepEqual(items.map((i) => i.kind), [
    'heading', 'text', 'code', 'output', 'code', 'output', 'output', 'code', 'output'
  ]);
  assert.deepEqual(items[0], { kind: 'heading', level: 1, text: 'Sales report' });
  assert.equal(items[1].text, 'We compute the total.'); // inline markup stripped
  assert.equal(items[2].lineCount, 2);
  assert.equal(items[3].text, 'Result: 14');
  assert.equal(items[5].text, 'Printed: done');
  assert.equal(items[6].text, 'Error: ValueError: oops');
  assert.equal(items[8].text, 'Image: A bar chart');
});

test('empty code cells are omitted; fenced markdown code is kept as text', () => {
  const items = cellsToNarrative([
    { id: 'a', type: 'markdown', source: 'before\n```\nx < 1\n```\nafter', outputs: [] },
    { id: 'b', type: 'code', source: '   ', outputs: [] }
  ]);
  assert.equal(items.length, 1);
  assert.match(items[0].text, /before x < 1 after/);
});

test('narrativeToText renders a readable plain-text record', () => {
  const text = narrativeToText(cellsToNarrative(cells), 'Sales');
  assert.match(text, /^Sales\n=====\n/);
  assert.match(text, /# Sales report/);
  assert.match(text, /Step 2 \(2 lines of code\):\n    total = 10 \+ 4\n    total/);
  assert.match(text, /Result: 14/);
  assert.match(text, /Image: A bar chart/);
});
