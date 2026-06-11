import test from 'node:test';
import assert from 'node:assert/strict';
import { outputSummary } from '../src/core/output-summary.js';

test('errors announce name and message', () => {
  assert.equal(
    outputSummary('error', [{ type: 'error', ename: 'ZeroDivisionError', evalue: 'division by zero' }]),
    'ZeroDivisionError: division by zero'
  );
  assert.equal(outputSummary('error', []), 'failed');
});

test('empty output says so', () => {
  assert.equal(outputSummary('ok', []), 'no output');
  assert.equal(outputSummary('ok', [{ type: 'stream', name: 'stdout', text: '  \n' }]), 'no output');
});

test('short single-line output is spoken verbatim', () => {
  assert.equal(
    outputSummary('ok', [{ type: 'execute_result', text: '42' }]),
    'output: 42'
  );
  assert.equal(
    outputSummary('ok', [{ type: 'stream', name: 'stdout', text: 'hello\n' }]),
    'output: hello'
  );
});

test('long output is summarized with line count and first line', () => {
  assert.equal(
    outputSummary('ok', [{ type: 'stream', name: 'stdout', text: 'a\nb\nc\n' }]),
    '3 lines of output. First line: a'
  );
  assert.equal(
    outputSummary('ok', [{ type: 'execute_result', text: 'x'.repeat(200) }], 160),
    `long output, 200 characters. Starts with: ${'x'.repeat(160)}`
  );
  // The first line of a multi-line summary is also capped.
  assert.equal(
    outputSummary('ok', [{ type: 'stream', name: 'stdout', text: `${'z'.repeat(200)}\nb` }], 160),
    `2 lines of output. First line: ${'z'.repeat(160)}`
  );
});

test('the verbatim threshold is configurable', () => {
  const long = 'y'.repeat(300);
  assert.equal(outputSummary('ok', [{ type: 'execute_result', text: long }], 500), `output: ${long}`);
});
