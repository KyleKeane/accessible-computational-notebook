import test from 'node:test';
import assert from 'node:assert/strict';
import { findMatches, replaceAllInSource } from '../src/core/search.js';

const cells = [
  { id: 'a', source: 'alpha\nbeta Alpha' },
  { id: 'b', source: '' },
  { id: 'c', source: 'alphabet' }
];

test('findMatches is case-insensitive by default, in document order', () => {
  const matches = findMatches(cells, 'alpha');
  assert.equal(matches.length, 3);
  assert.deepEqual(matches.map((m) => m.cellId), ['a', 'a', 'c']);
  assert.deepEqual(matches.map((m) => [m.line, m.column]), [[1, 1], [2, 6], [1, 1]]);
});

test('findMatches respects case sensitivity', () => {
  const matches = findMatches(cells, 'Alpha', { caseSensitive: true });
  assert.equal(matches.length, 1);
  assert.equal(matches[0].line, 2);
});

test('findMatches with an empty query returns nothing', () => {
  assert.deepEqual(findMatches(cells, ''), []);
});

test('match offsets address the original source', () => {
  const [first] = findMatches(cells, 'beta');
  assert.equal(cells[0].source.slice(first.start, first.end), 'beta');
});

test('replaceAllInSource counts and preserves case option', () => {
  assert.deepEqual(replaceAllInSource('aAa', 'a', 'b'), { text: 'bbb', count: 3 });
  assert.deepEqual(replaceAllInSource('aAa', 'a', 'b', { caseSensitive: true }), { text: 'bAb', count: 2 });
  assert.deepEqual(replaceAllInSource('xyz', 'q', 'b'), { text: 'xyz', count: 0 });
});

test('replaceAllInSource handles replacement containing the query', () => {
  assert.deepEqual(replaceAllInSource('x x', 'x', 'xx'), { text: 'xx xx', count: 2 });
});
