/**
 * Notebook outline: markdown headings across cells, for "Go to Section"
 * navigation. Headings inside fenced code blocks are ignored.
 */

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
