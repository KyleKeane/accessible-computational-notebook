import test from 'node:test';
import assert from 'node:assert/strict';
import { extractOutline, sectionRange, hiddenCellIds } from '../src/core/outline.js';

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

const sectioned = [
  { id: 'h1', type: 'markdown', source: '# One' },
  { id: 'c1', type: 'code', source: 'a' },
  { id: 'h2', type: 'markdown', source: '## Sub' },
  { id: 'c2', type: 'code', source: 'b' },
  { id: 'h3', type: 'markdown', source: '# Two' },
  { id: 'c3', type: 'code', source: 'c' }
];

test('sectionRange covers until the next heading of same or higher level', () => {
  assert.deepEqual(sectionRange(sectioned, 'h1'), { startIndex: 1, endIndex: 4, level: 1, title: 'One' });
  assert.deepEqual(sectionRange(sectioned, 'h2'), { startIndex: 3, endIndex: 4, level: 2, title: 'Sub' });
  assert.deepEqual(sectionRange(sectioned, 'h3'), { startIndex: 5, endIndex: 6, level: 1, title: 'Two' });
  assert.equal(sectionRange(sectioned, 'c1'), null);
});

test('hiddenCellIds unions collapsed sections, nested headings included', () => {
  assert.deepEqual([...hiddenCellIds(sectioned, ['h1'])], ['c1', 'h2', 'c2']);
  assert.deepEqual([...hiddenCellIds(sectioned, ['h2', 'h3'])], ['c2', 'c3']);
  assert.deepEqual([...hiddenCellIds(sectioned, [])], []);
});
