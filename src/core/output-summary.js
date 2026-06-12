/**
 * The one-line spoken summary of a cell's result. This text is the app's
 * primary feedback channel for screen-reader users, so it lives in core
 * where it is tested.
 */

export function outputSummary(status, outputs, maxAnnounced = 160) {
  if (status === 'error') {
    const error = outputs.find((o) => o.type === 'error');
    return error ? `${error.ename}: ${error.evalue}` : 'failed';
  }
  const text = outputs
    .filter((o) => o.type === 'stream' || o.type === 'execute_result')
    .map((o) => o.text)
    .join('');
  if (text.trim() === '') return 'no output';
  const trimmed = text.replace(/\n$/, '');
  const lines = trimmed.split('\n');
  // Short outputs are spoken verbatim; long ones are summarized.
  if (lines.length === 1) {
    if (trimmed.length <= maxAnnounced) return `output: ${trimmed}`;
    return `long output, ${trimmed.length} characters. Starts with: ${trimmed.slice(0, maxAnnounced)}`;
  }
  return `${lines.length} lines of output. First line: ${lines[0].slice(0, maxAnnounced)}`;
}
