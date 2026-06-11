import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIpynb, serializeIpynb } from '../src/core/ipynb.js';
import { NotebookStore } from '../src/core/notebook-store.js';

/** A realistic nbformat 4 document as Jupyter itself writes it. */
const jupyterSample = JSON.stringify({
  cells: [
    {
      cell_type: 'markdown',
      id: 'intro',
      metadata: {},
      source: ['# Title\n', '\n', 'Some *text*.']
    },
    {
      cell_type: 'code',
      id: 'c1',
      execution_count: 2,
      metadata: {},
      source: ['x = 1\n', 'print(x)\n', 'x + 1'],
      outputs: [
        { output_type: 'stream', name: 'stdout', text: ['1\n'] },
        {
          output_type: 'execute_result',
          execution_count: 2,
          data: { 'text/plain': ['2'] },
          metadata: {}
        }
      ]
    },
    {
      cell_type: 'code',
      id: 'c2',
      execution_count: 3,
      metadata: {},
      source: '1/0',
      outputs: [
        {
          output_type: 'error',
          ename: 'ZeroDivisionError',
          evalue: 'division by zero',
          traceback: ['Traceback...', 'ZeroDivisionError: division by zero']
        }
      ]
    },
    {
      cell_type: 'code',
      id: 'c3',
      execution_count: 4,
      metadata: {},
      source: 'plot()',
      outputs: [
        {
          output_type: 'display_data',
          data: { 'image/png': 'aGVsbG8=' },
          metadata: {}
        }
      ]
    }
  ],
  metadata: {
    kernelspec: { name: 'python3', display_name: 'Python 3', language: 'python' },
    language_info: { name: 'python', version: '3.11.0' }
  },
  nbformat: 4,
  nbformat_minor: 5
});

test('parseIpynb reads a Jupyter-written notebook', () => {
  const { cells, metadata } = parseIpynb(jupyterSample);
  assert.equal(cells.length, 4);
  assert.equal(cells[0].type, 'markdown');
  assert.equal(cells[0].source, '# Title\n\nSome *text*.');
  assert.equal(cells[1].source, 'x = 1\nprint(x)\nx + 1');
  assert.deepEqual(cells[1].outputs[0], { type: 'stream', name: 'stdout', text: '1\n' });
  assert.deepEqual(cells[1].outputs[1], { type: 'execute_result', text: '2' });
  assert.equal(cells[2].outputs[0].ename, 'ZeroDivisionError');
  assert.equal(cells[3].outputs[0].type, 'passthrough');
  assert.equal(metadata.kernelName, 'python');
});

test('open → save round-trip preserves content and unknown outputs', () => {
  const store = new NotebookStore();
  store.load(parseIpynb(jupyterSample));
  const reparsed = parseIpynb(serializeIpynb(store.getState()));
  assert.equal(reparsed.cells.length, 4);
  assert.equal(reparsed.cells[1].source, 'x = 1\nprint(x)\nx + 1');
  assert.deepEqual(reparsed.cells[1].outputs[0], { type: 'stream', name: 'stdout', text: '1\n' });
  // The display_data output survived untouched.
  assert.deepEqual(reparsed.cells[3].outputs[0].raw.data, { 'image/png': 'aGVsbG8=' });
});

test('serializeIpynb writes a valid nbformat 4 document', () => {
  const store = new NotebookStore();
  store.updateSource(store.cells[0].id, 'print("hi")');
  store.setOutputs(store.cells[0].id, [{ type: 'stream', name: 'stdout', text: 'hi\n' }], 1);
  const doc = JSON.parse(serializeIpynb(store.getState()));
  assert.equal(doc.nbformat, 4);
  assert.equal(doc.metadata.kernelspec.language, 'python');
  assert.deepEqual(doc.cells[0].source, ['print("hi")']);
  assert.equal(doc.cells[0].outputs[0].output_type, 'stream');
  assert.equal(doc.cells[0].execution_count, 1);
});

test('parseIpynb rejects garbage with readable errors', () => {
  assert.throws(() => parseIpynb('{not json'), /Not valid JSON/);
  assert.throws(() => parseIpynb('{"foo": 1}'), /missing "cells"/);
  assert.throws(() => parseIpynb('{"cells": [], "nbformat": 3}'), /Unsupported nbformat/);
});

test('javascript kernel metadata round-trips', () => {
  const store = new NotebookStore();
  store.setKernelName('javascript');
  const { metadata } = parseIpynb(serializeIpynb(store.getState()));
  assert.equal(metadata.kernelName, 'javascript');
});

test('multi-line sources round-trip through the line-list encoding', () => {
  const store = new NotebookStore();
  const source = 'def f():\n    return 1\n\n\nf()';
  store.updateSource(store.cells[0].id, source);
  const reparsed = parseIpynb(serializeIpynb(store.getState()));
  assert.equal(reparsed.cells[0].source, source);
});

test('rich execute_result outputs (images) pass through losslessly', () => {
  const doc = JSON.stringify({
    cells: [{
      cell_type: 'code',
      id: 'r1',
      execution_count: 1,
      metadata: {},
      source: 'plot()',
      outputs: [{
        output_type: 'execute_result',
        execution_count: 1,
        data: { 'text/plain': ['<Figure>'], 'image/png': 'aWcgZGF0YQ==' },
        metadata: {}
      }]
    }],
    nbformat: 4,
    nbformat_minor: 5
  });
  const { cells } = parseIpynb(doc);
  assert.equal(cells[0].outputs[0].type, 'passthrough');
  const store = new NotebookStore();
  store.load({ cells, metadata: {} });
  const reparsed = parseIpynb(serializeIpynb(store.getState()));
  assert.equal(reparsed.cells[0].outputs[0].raw.data['image/png'], 'aWcgZGF0YQ==');
});

test('image descriptions persist into the saved .ipynb metadata', () => {
  const store = new NotebookStore();
  store.load(parseIpynb(jupyterSample));
  const imageCell = store.cells[3]; // the display_data cell
  store.setImageDescription(imageCell.id, 0, 'A bar chart of monthly sales');
  const doc = JSON.parse(serializeIpynb(store.getState()));
  assert.equal(doc.cells[3].outputs[0].metadata.alt, 'A bar chart of monthly sales');
  // …and it survives reopening.
  const reparsed = parseIpynb(serializeIpynb(store.getState()));
  assert.equal(reparsed.cells[3].outputs[0].raw.metadata.alt, 'A bar chart of monthly sales');
});

test('trailing newline in source survives a round-trip', () => {
  const store = new NotebookStore();
  store.updateSource(store.cells[0].id, 'x = 1\n');
  const reparsed = parseIpynb(serializeIpynb(store.getState()));
  assert.equal(reparsed.cells[0].source, 'x = 1\n');
});
