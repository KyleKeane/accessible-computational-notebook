import test from 'node:test';
import assert from 'node:assert/strict';
import { extractOutline } from '../src/core/outline.js';

test('outline collects headings across markdown cells in order', () => {
  const cells = [
    { id: 'a', type: 'markdown', source: '# Intro\n\ntext\n\n## Setup' },
    { id: 'b', type: 'code', source: '# not a heading, a comment' },
    { id: 'c', type: 'markdown', source: '## Results' }
  ];
  const outline = extractOutline(cells);
  assert.deepEqual(
    outline.map((e) => [e.title, e.level, e.cellIndex]),
    [['Intro', 1, 0], ['Setup', 2, 0], ['Results', 2, 2]]
  );
  assert.equal(outline[2].cellId, 'c');
});

test('headings inside fenced code blocks are ignored', () => {
  const cells = [
    { id: 'a', type: 'markdown', source: '# Real\n```\n# fake comment\n```\n## Also real' }
  ];
  assert.deepEqual(extractOutline(cells).map((e) => e.title), ['Real', 'Also real']);
});

test('empty notebooks yield an empty outline', () => {
  assert.deepEqual(extractOutline([{ id: 'a', type: 'code', source: '' }]), []);
});
