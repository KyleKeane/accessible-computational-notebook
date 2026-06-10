/**
 * Jupyter nbformat 4 serialization.
 *
 * Reads/writes the subset this app produces (code/markdown/raw cells with
 * stream / execute_result / error outputs) and passes every other output type
 * through losslessly so that opening and re-saving a notebook made elsewhere
 * does not destroy data.
 */

const KERNELSPECS = {
  python: { name: 'python3', display_name: 'Python 3', language: 'python' },
  javascript: { name: 'javascript', display_name: 'JavaScript (Node.js)', language: 'javascript' }
};

/** nbformat stores text as either a string or a list of lines. */
function joinText(text) {
  if (Array.isArray(text)) return text.join('');
  return text ?? '';
}

/** Split into nbformat's conventional line list (each line keeps its \n). */
function splitText(text) {
  if (text === '') return [];
  const lines = text.split('\n');
  return lines.map((line, i) => (i < lines.length - 1 ? line + '\n' : line)).filter(
    (line, i, arr) => !(i === arr.length - 1 && line === '')
  );
}

function outputFromNbformat(raw) {
  switch (raw.output_type) {
    case 'stream':
      return { type: 'stream', name: raw.name === 'stderr' ? 'stderr' : 'stdout', text: joinText(raw.text) };
    case 'execute_result':
      return { type: 'execute_result', text: joinText(raw.data?.['text/plain']) };
    case 'error':
      return {
        type: 'error',
        ename: raw.ename ?? 'Error',
        evalue: raw.evalue ?? '',
        traceback: Array.isArray(raw.traceback) ? raw.traceback.join('\n') : joinText(raw.traceback)
      };
    default:
      return { type: 'passthrough', raw };
  }
}

function outputToNbformat(output, executionCount) {
  switch (output.type) {
    case 'stream':
      return { output_type: 'stream', name: output.name, text: splitText(output.text) };
    case 'execute_result':
      return {
        output_type: 'execute_result',
        execution_count: executionCount,
        data: { 'text/plain': splitText(output.text) },
        metadata: {}
      };
    case 'error':
      return {
        output_type: 'error',
        ename: output.ename,
        evalue: output.evalue,
        traceback: output.traceback.split('\n')
      };
    case 'passthrough':
      return output.raw;
    default:
      throw new Error(`Unknown output type: ${output.type}`);
  }
}

/**
 * Parse an .ipynb JSON string into { cells, metadata } for NotebookStore.load.
 * Throws with a readable message on malformed input.
 */
export function parseIpynb(json) {
  let doc;
  try {
    doc = JSON.parse(json);
  } catch (error) {
    throw new Error(`Not valid JSON: ${error.message}`);
  }
  if (!doc || !Array.isArray(doc.cells)) {
    throw new Error('Not a Jupyter notebook: missing "cells" array');
  }
  if (doc.nbformat !== undefined && doc.nbformat !== 4) {
    throw new Error(`Unsupported nbformat version: ${doc.nbformat} (only 4 is supported)`);
  }

  const cells = doc.cells.map((cell) => ({
    id: typeof cell.id === 'string' ? cell.id : undefined,
    type: ['code', 'markdown', 'raw'].includes(cell.cell_type) ? cell.cell_type : 'raw',
    source: joinText(cell.source),
    outputs: cell.cell_type === 'code' && Array.isArray(cell.outputs)
      ? cell.outputs.map(outputFromNbformat)
      : [],
    executionCount: cell.execution_count ?? null
  }));

  const language = doc.metadata?.kernelspec?.language ?? doc.metadata?.language_info?.name;
  const kernelName = language === 'javascript' ? 'javascript' : 'python';

  return { cells, metadata: { kernelName } };
}

/** Serialize a NotebookStore state snapshot to an .ipynb JSON string. */
export function serializeIpynb(state) {
  const kernelName = state.metadata.kernelName in KERNELSPECS ? state.metadata.kernelName : 'python';
  const doc = {
    cells: state.cells.map((cell) => {
      const out = {
        id: cell.id,
        cell_type: cell.type,
        metadata: {},
        source: splitText(cell.source)
      };
      if (cell.type === 'code') {
        out.execution_count = cell.executionCount;
        out.outputs = cell.outputs.map((o) => outputToNbformat(o, cell.executionCount));
      }
      return out;
    }),
    metadata: {
      kernelspec: KERNELSPECS[kernelName],
      language_info: { name: KERNELSPECS[kernelName].language }
    },
    nbformat: 4,
    nbformat_minor: 5
  };
  return JSON.stringify(doc, null, 1) + '\n';
}
