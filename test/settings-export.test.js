import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, normalizeSettings } from '../src/core/settings.js';
import { toScript, scriptExtension } from '../src/core/export-script.js';
import { NotebookStore } from '../src/core/notebook-store.js';

test('normalizeSettings fills defaults and clamps ranges', () => {
  assert.deepEqual(normalizeSettings(undefined), DEFAULT_SETTINGS);
  assert.deepEqual(normalizeSettings('garbage'), DEFAULT_SETTINGS);
  assert.equal(normalizeSettings({ executionTimeoutSeconds: -5 }).executionTimeoutSeconds, 0);
  assert.equal(normalizeSettings({ executionTimeoutSeconds: 1e9 }).executionTimeoutSeconds, 86400);
  assert.equal(normalizeSettings({ executionTimeoutSeconds: '30' }).executionTimeoutSeconds, 30);
  assert.equal(normalizeSettings({ maxAnnouncedOutputLength: 'NaN' }).maxAnnouncedOutputLength, 160);
  // Unknown keys are dropped.
  assert.equal('surprise' in normalizeSettings({ surprise: 1 }), false);
});

test('toScript writes percent format with markdown as comments', () => {
  const store = new NotebookStore();
  const first = store.cells[0];
  store.setCellType(first.id, 'markdown');
  store.updateSource(first.id, '# Title\n\ntext');
  const code = store.insertCell({ relativeTo: first.id, position: 'below', source: 'x = 1\nprint(x)' });
  assert.equal(
    toScript(store.getState()),
    '# %% [markdown]\n# # Title\n#\n# text\n\n# %%\nx = 1\nprint(x)\n'
  );
  assert.equal(scriptExtension('python'), '.py');
  void code;
});

test('toScript uses // comments for javascript notebooks', () => {
  const store = new NotebookStore();
  store.setKernelName('javascript');
  store.updateSource(store.cells[0].id, 'console.log(1)');
  assert.equal(toScript(store.getState()), '// %%\nconsole.log(1)\n');
  assert.equal(scriptExtension('javascript'), '.js');
});
