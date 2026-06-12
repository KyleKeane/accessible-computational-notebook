/**
 * Whitelist HTML sanitizer for rich notebook outputs (pandas tables etc.).
 *
 * The output is rebuilt token by token: only whitelisted elements are
 * emitted, only whitelisted attributes with validated values survive, all
 * other tags are dropped (their text content is kept, except for
 * script/style whose content is dropped too), and `<`/`>` in text are
 * escaped. Nothing from the input is ever copied verbatim into a tag — the
 * output cannot contain markup this module didn't generate.
 *
 * The element set is chosen for screen-reader value: real tables (row and
 * column navigation), headings, lists, and inline emphasis.
 */

const ALLOWED = {
  table: {}, thead: {}, tbody: {}, tfoot: {}, caption: {},
  tr: {}, th: { scope: 'token', colspan: 'number', rowspan: 'number' },
  td: { colspan: 'number', rowspan: 'number' },
  p: {}, div: {}, span: {}, br: { void: true }, hr: { void: true },
  b: {}, strong: {}, i: {}, em: {}, u: {}, s: {}, sub: {}, sup: {},
  code: {}, pre: {}, blockquote: {},
  ul: {}, ol: {}, li: {}, dl: {}, dt: {}, dd: {},
  h1: {}, h2: {}, h3: {}, h4: {}, h5: {}, h6: {},
  a: { href: 'url' }
};

const SCOPE_TOKENS = new Set(['row', 'col', 'rowgroup', 'colgroup']);
const DROP_CONTENT = new Set(['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'template']);

function escapeText(text) {
  // `&` is left alone so entities in the source still render; an ampersand
  // cannot open a tag, so this is inert.
  return text.replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function validAttr(kind, value) {
  switch (kind) {
    case 'number': {
      const n = Number(value);
      return Number.isInteger(n) && n > 0 && n < 1000 ? String(n) : null;
    }
    case 'token':
      return SCOPE_TOKENS.has(value.toLowerCase()) ? value.toLowerCase() : null;
    case 'url':
      return /^https?:\/\//i.test(value) ? value.replaceAll('"', '%22') : null;
    default:
      return null;
  }
}

/** Parse attributes out of a raw tag body like `td colspan="2" onclick=x`. */
function parseAttrs(body) {
  const attrs = {};
  const re = /([a-zA-Z-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    attrs[m[1].toLowerCase()] = m[3] ?? m[4] ?? m[5] ?? '';
  }
  return attrs;
}

export function sanitizeHtml(html) {
  const out = [];
  const openStack = [];
  let dropContentUntil = null;

  // Like browsers, only `<` followed by a letter, `/`, or `!` opens a tag;
  // a bare `<` (as in "1 < 2") is text.
  const tokens = String(html).split(/(<\/?[a-zA-Z][^>]*>|<![^>]*>)/);
  for (const token of tokens) {
    if (token === '') continue;

    if (!token.startsWith('<') || !token.endsWith('>') || token.length < 3) {
      if (dropContentUntil === null) out.push(escapeText(token));
      continue;
    }

    const match = token.match(/^<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9]*)([^>]*)>$/);
    if (!match) {
      // Malformed tag (comments, doctypes, <3 …): treat as dropped markup.
      continue;
    }
    const closing = match[1] === '/';
    const name = match[2].toLowerCase();
    const body = match[3];

    if (dropContentUntil !== null) {
      if (closing && name === dropContentUntil) dropContentUntil = null;
      continue;
    }

    if (DROP_CONTENT.has(name)) {
      if (!closing && !/\/\s*$/.test(body)) dropContentUntil = name;
      continue;
    }

    const spec = ALLOWED[name];
    if (!spec) continue; // unknown element: drop the tag, keep its content

    if (closing) {
      // Emit the close only if it matches something actually open; close
      // intermediates so the output always nests correctly.
      const at = openStack.lastIndexOf(name);
      if (at !== -1) {
        while (openStack.length > at) out.push(`</${openStack.pop()}>`);
      }
      continue;
    }

    const attrs = parseAttrs(body);
    let rendered = `<${name}`;
    for (const [attr, kind] of Object.entries(spec)) {
      if (attr === 'void') continue;
      if (attrs[attr] !== undefined) {
        const value = validAttr(kind, attrs[attr]);
        if (value !== null) rendered += ` ${attr}="${value}"`;
      }
    }
    if (name === 'a') rendered += ' rel="noopener"';
    rendered += '>';
    out.push(rendered);
    if (!spec.void && !/\/\s*$/.test(body)) openStack.push(name);
  }

  while (openStack.length > 0) out.push(`</${openStack.pop()}>`);
  return out.join('');
}
