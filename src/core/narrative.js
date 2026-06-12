/**
 * The computational narrative: the whole notebook as one linear, readable
 * document — prose, code, and results interleaved in reading order. This
 * is the audio-first answer to "what story does this notebook tell": a
 * screen reader walks it top to bottom in browse mode (real headings give
 * quick navigation), and the same structure exports as a plain-text
 * record of the computation's flow.
 *
 * Produces structured items:
 *   { kind: 'heading', level, text }
 *   { kind: 'text', text }            prose from markdown cells
 *   { kind: 'code', index, lineCount, text }
 *   { kind: 'output', text }          one per result/stream/error/image
 */

/** Markdown inline syntax reduced to its readable text. */
function plainText(line) {
  return line
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .trim();
}

function markdownItems(source) {
  const items = [];
  let paragraph = [];
  let inFence = false;
  const flush = () => {
    if (paragraph.length > 0) {
      items.push({ kind: 'text', text: paragraph.join(' ') });
      paragraph = [];
    }
  };
  for (const line of source.split('\n')) {
    if (/^```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      paragraph.push(line);
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flush();
      items.push({ kind: 'heading', level: heading[1].length, text: plainText(heading[2]) });
    } else if (line.trim() === '') {
      flush();
    } else {
      paragraph.push(plainText(line));
    }
  }
  flush();
  return items;
}

function outputItems(outputs) {
  const items = [];
  for (const output of outputs) {
    switch (output.type) {
      case 'stream':
        items.push({
          kind: 'output',
          text: (output.name === 'stderr' ? 'Messages: ' : 'Printed: ') + output.text.replace(/\n$/, '')
        });
        break;
      case 'execute_result':
        items.push({ kind: 'output', text: `Result: ${output.text}` });
        break;
      case 'error':
        items.push({ kind: 'output', text: `Error: ${output.ename}: ${output.evalue}` });
        break;
      default: {
        const data = output.raw?.data ?? {};
        if (Object.keys(data).some((m) => m.startsWith('image/'))) {
          items.push({
            kind: 'output',
            text: `Image: ${output.raw?.metadata?.alt ?? 'no description available'}`
          });
        } else if (data['text/plain']) {
          const text = Array.isArray(data['text/plain']) ? data['text/plain'].join('') : data['text/plain'];
          items.push({ kind: 'output', text: `Result: ${text}` });
        }
      }
    }
  }
  return items;
}

export function cellsToNarrative(cells) {
  const items = [];
  cells.forEach((cell, index) => {
    if (cell.type === 'markdown') {
      items.push(...markdownItems(cell.source));
      return;
    }
    if (cell.source.trim() === '' && cell.outputs.length === 0) return;
    const lineCount = cell.source === '' ? 0 : cell.source.split('\n').length;
    items.push({ kind: 'code', index: index + 1, lineCount, text: cell.source });
    if (cell.type === 'code') items.push(...outputItems(cell.outputs));
  });
  return items;
}

/** The narrative as plain text — the exportable record of the flow. */
export function narrativeToText(items, title = 'Notebook') {
  const lines = [title, '='.repeat(title.length), ''];
  for (const item of items) {
    switch (item.kind) {
      case 'heading':
        lines.push(`${'#'.repeat(item.level)} ${item.text}`, '');
        break;
      case 'text':
        lines.push(item.text, '');
        break;
      case 'code':
        lines.push(`Step ${item.index} (${item.lineCount} line${item.lineCount === 1 ? '' : 's'} of code):`);
        lines.push(...item.text.split('\n').map((l) => `    ${l}`));
        break;
      case 'output':
        lines.push(`  ${item.text}`, '');
        break;
    }
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
}
