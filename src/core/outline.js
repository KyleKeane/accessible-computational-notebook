/**
 * Notebook outline: markdown headings across cells, for "Go to Section"
 * navigation. Headings inside fenced code blocks are ignored.
 */

/**
 * The cells covered by the section that starts at a heading cell: every
 * cell after it up to the next heading of the same or higher level.
 * Returns { startIndex, endIndex (exclusive), level, title }, or null if
 * the cell does not start a section.
 */
export function sectionRange(cells, headingCellId) {
  const outline = extractOutline(cells);
  const own = outline.find((entry) => entry.cellId === headingCellId);
  if (!own) return null;
  let endIndex = cells.length;
  for (const entry of outline) {
    if (entry.cellIndex > own.cellIndex && entry.level <= own.level) {
      endIndex = entry.cellIndex;
      break;
    }
  }
  return { startIndex: own.cellIndex + 1, endIndex, level: own.level, title: own.title };
}

/** Ids of all cells hidden by the given collapsed heading cells. */
export function hiddenCellIds(cells, collapsedHeadingIds) {
  const hidden = new Set();
  for (const headingId of collapsedHeadingIds) {
    const range = sectionRange(cells, headingId);
    if (!range) continue;
    for (let i = range.startIndex; i < range.endIndex; i++) {
      hidden.add(cells[i].id);
    }
  }
  return hidden;
}

export function extractOutline(cells) {
  const entries = [];
  cells.forEach((cell, cellIndex) => {
    if (cell.type !== 'markdown') return;
    let inFence = false;
    for (const line of cell.source.split('\n')) {
      if (/^```/.test(line)) {
        inFence = !inFence;
        continue;
      }
      if (inFence) continue;
      const heading = line.match(/^(#{1,6})\s+(.*)$/);
      if (heading) {
        entries.push({
          cellId: cell.id,
          cellIndex,
          level: heading[1].length,
          title: heading[2].trim()
        });
      }
    }
  });
  return entries;
}
