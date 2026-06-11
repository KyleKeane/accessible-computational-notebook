import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeHtml } from '../src/core/safe-html.js';

test('tables keep structure and accessibility attributes', () => {
  const html = '<table><thead><tr><th scope="col" colspan="2">H</th></tr></thead>' +
    '<tbody><tr><td>1</td><td>2</td></tr></tbody></table>';
  assert.equal(sanitizeHtml(html), html.replace('scope="col" colspan="2"', 'scope="col" colspan="2"'));
});

test('script elements are removed including their content', () => {
  assert.equal(sanitizeHtml('a<script>alert(1)</script>b'), 'ab');
  assert.equal(sanitizeHtml('<style>p{}</style>x'), 'x');
});

test('event handlers and unknown attributes are stripped', () => {
  assert.equal(
    sanitizeHtml('<td onclick="evil()" style="x" colspan="2">x</td>'),
    '<td colspan="2">x</td>'
  );
});

test('unknown elements are dropped but their text is kept', () => {
  assert.equal(sanitizeHtml('<video><span>hi</span></video>'), '<span>hi</span>');
  assert.equal(sanitizeHtml('<img src=x onerror=alert(1)>after'), 'after');
});

test('javascript: URLs are stripped; https links survive with rel', () => {
  assert.equal(sanitizeHtml('<a href="javascript:alert(1)">x</a>'), '<a rel="noopener">x</a>');
  assert.equal(
    sanitizeHtml('<a href="https://example.com">x</a>'),
    '<a href="https://example.com" rel="noopener">x</a>'
  );
});

test('attribute values are validated by type', () => {
  assert.equal(sanitizeHtml('<td colspan="banana">x</td>'), '<td>x</td>');
  assert.equal(sanitizeHtml('<th scope="evil">x</th>'), '<th>x</th>');
  assert.equal(sanitizeHtml('<th scope="ROW">x</th>'), '<th scope="row">x</th>');
});

test('angle brackets in text are escaped', () => {
  assert.equal(sanitizeHtml('1 < 2 and 3 > 2'), '1 &lt; 2 and 3 &gt; 2');
});

test('unclosed and mismatched tags are balanced', () => {
  assert.equal(sanitizeHtml('<b>bold'), '<b>bold</b>');
  assert.equal(sanitizeHtml('<p><b>x</p>'), '<p><b>x</b></p>');
  assert.equal(sanitizeHtml('</td>stray'), 'stray');
});

test('comments and doctypes are dropped', () => {
  assert.equal(sanitizeHtml('<!-- hi -->x<!DOCTYPE html>'), 'x');
});

test('a realistic pandas-style table round-trips', () => {
  const pandas =
    '<div><table border="1" class="dataframe"><thead>' +
    '<tr style="text-align: right;"><th></th><th>a</th></tr></thead>' +
    '<tbody><tr><th>0</th><td>1</td></tr></tbody></table></div>';
  assert.equal(
    sanitizeHtml(pandas),
    '<div><table><thead><tr><th></th><th>a</th></tr></thead>' +
      '<tbody><tr><th>0</th><td>1</td></tr></tbody></table></div>'
  );
});
