/**
 * Plain-text search across cells. Pure functions, no DOM — the find dialog
 * in the renderer and the tests share this implementation.
 */

/**
 * Find all occurrences of `query` across cells, in document order.
 * Returns [{ cellId, cellIndex, start, end, line, column }] with 1-based
 * line/column for announcements.
 */
export function findMatches(cells, query, { caseSensitive = false } = {}) {
  if (!query) return [];
  const needle = caseSensitive ? query : query.toLowerCase();
  const matches = [];
  cells.forEach((cell, cellIndex) => {
    const haystack = caseSensitive ? cell.source : cell.source.toLowerCase();
    let from = 0;
    while (true) {
      const start = haystack.indexOf(needle, from);
      if (start === -1) break;
      const before = cell.source.slice(0, start);
      const lineStart = before.lastIndexOf('\n') + 1;
      matches.push({
        cellId: cell.id,
        cellIndex,
        start,
        end: start + query.length,
        line: before.split('\n').length,
        column: start - lineStart + 1
      });
      from = start + needle.length;
    }
  });
  return matches;
}

/** Replace every occurrence in one source string. Returns { text, count }. */
export function replaceAllInSource(source, query, replacement, { caseSensitive = false } = {}) {
  if (!query) return { text: source, count: 0 };
  const needle = caseSensitive ? query : query.toLowerCase();
  let text = '';
  let from = 0;
  let count = 0;
  const haystack = caseSensitive ? source : source.toLowerCase();
  while (true) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) break;
    text += source.slice(from, at) + replacement;
    from = at + query.length;
    count += 1;
  }
  text += source.slice(from);
  return { text, count };
}
