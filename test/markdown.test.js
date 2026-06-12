import test from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown } from '../src/core/markdown.js';

test('headings', () => {
  assert.equal(renderMarkdown('# Title'), '<h1>Title</h1>');
  assert.equal(renderMarkdown('### Sub'), '<h3>Sub</h3>');
});

test('paragraphs join wrapped lines and split on blank lines', () => {
  assert.equal(
    renderMarkdown('one\ntwo\n\nthree'),
    '<p>one two</p>\n<p>three</p>'
  );
});

test('lists', () => {
  assert.equal(
    renderMarkdown('- a\n- b'),
    '<ul><li>a</li><li>b</li></ul>'
  );
  assert.equal(
    renderMarkdown('1. a\n2. b'),
    '<ol><li>a</li><li>b</li></ol>'
  );
});

test('fenced code blocks are verbatim and escaped', () => {
  assert.equal(
    renderMarkdown('```\nif x < 1:\n    pass\n```'),
    '<pre><code>if x &lt; 1:\n    pass</code></pre>'
  );
});

test('unterminated code block still renders', () => {
  assert.equal(renderMarkdown('```\ncode'), '<pre><code>code</code></pre>');
});

test('inline markup', () => {
  assert.equal(renderMarkdown('a `b` **c** *d*'), '<p>a <code>b</code> <strong>c</strong> <em>d</em></p>');
  assert.equal(
    renderMarkdown('[site](https://example.com)'),
    '<p><a href="https://example.com">site</a></p>'
  );
});

test('javascript: links are not rendered as links', () => {
  assert.equal(renderMarkdown('[x](javascript:alert(1))'), '<p>[x](javascript:alert(1))</p>');
});

test('blockquotes', () => {
  assert.equal(renderMarkdown('> quoted\n> text'), '<blockquote><p>quoted text</p></blockquote>');
});

test('HTML in source is always escaped', () => {
  assert.equal(
    renderMarkdown('<script>alert(1)</script>'),
    '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>'
  );
  assert.equal(
    renderMarkdown('# <img src=x onerror=alert(1)>'),
    '<h1>&lt;img src=x onerror=alert(1)&gt;</h1>'
  );
  assert.equal(
    renderMarkdown('- <b>x</b>'),
    '<ul><li>&lt;b&gt;x&lt;/b&gt;</li></ul>'
  );
});

test('inline code contents are exempt from other inline rules', () => {
  assert.equal(renderMarkdown('`**not bold**`'), '<p><code>**not bold**</code></p>');
});
