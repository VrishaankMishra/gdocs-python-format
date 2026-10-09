// Exercises format.js + python.js in Node, with no DOM.
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const sandbox = { module: { exports: {} }, console };
sandbox.module = undefined;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'python.js'), 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'format.js'), 'utf8'), sandbox);

const { cleanCode, segmentsForLine, highlight, toHtml, toPlain,
        escapeHtmlPreservingSpaces, lineNumberPrefixes, THEMES } = sandbox;

let pass = 0, fail = 0;
const check = (label, cond, detail) => {
  if (cond) { pass++; return; }
  fail++; console.log(`FAIL ${label}${detail ? '\n  ' + detail : ''}`);
};

const SRC = [
  'def is_expired(entry, now):',
  '    """Return True if the cache entry is stale."""',
  '    if entry.stored_at is None:',
  '        return True  # never written',
  '',
  '    return (now - entry.stored_at).seconds >= 0x1C20',
].join('\n');

// --- segments must losslessly reconstruct every line ------------------------
{
  const state = { inTriple: null, pendingDefName: false };
  const lines = cleanCode(SRC, {});
  let lossless = true, detail = '';
  for (const line of lines) {
    const rebuilt = segmentsForLine(line, state).map(s => s.text).join('');
    if (rebuilt !== line) { lossless = false; detail = `"${line}" -> "${rebuilt}"`; break; }
  }
  check('segments reconstruct the line exactly', lossless, detail);
}

// --- cleanCode --------------------------------------------------------------
check('dedent removes common indent',
  cleanCode('    a = 1\n    b = 2', { dedent: true }).join('|') === 'a = 1|b = 2',
  JSON.stringify(cleanCode('    a = 1\n    b = 2', { dedent: true })));

check('dedent preserves relative indent',
  cleanCode('    if x:\n        y()', { dedent: true }).join('|') === 'if x:|    y()',
  JSON.stringify(cleanCode('    if x:\n        y()', { dedent: true })));

check('dedent off keeps indent',
  cleanCode('    a = 1', { dedent: false })[0] === '    a = 1');

check('blank interior lines kept',
  cleanCode('a = 1\n\nb = 2', {}).length === 3);

check('leading/trailing blanks dropped',
  cleanCode('\n\na = 1\n\n\n', {}).join('|') === 'a = 1',
  JSON.stringify(cleanCode('\n\na = 1\n\n\n', {})));

check('trailing whitespace stripped',
  cleanCode('a = 1   ', {})[0] === 'a = 1');

check('smart quotes repaired',
  cleanCode('x = \u201Chi\u201D', {})[0] === 'x = "hi"',
  cleanCode('x = \u201Chi\u201D', {})[0]);

check('tabs become 4 spaces',
  cleanCode('if x:\n\ty()', { dedent: false })[1] === '    y()',
  JSON.stringify(cleanCode('if x:\n\ty()', { dedent: false })));

check('dedent ignores blank lines',
  cleanCode('    a = 1\n\n    b = 2', { dedent: true }).join('|') === 'a = 1||b = 2',
  JSON.stringify(cleanCode('    a = 1\n\n    b = 2', { dedent: true })));

// --- line numbers -----------------------------------------------------------
{
  const p = lineNumberPrefixes(10, true);
  check('line numbers right-aligned', p[0] === ' 1 \u2502 ' && p[9] === '10 \u2502 ',
    JSON.stringify([p[0], p[9]]));
  check('line numbers off returns null', lineNumberPrefixes(10, false) === null);
}

// --- plain output is runnable Python ---------------------------------------
{
  const lines = cleanCode(SRC, { dedent: true });
  const plain = toPlain(lines);
  check('plain has no line numbers', !plain.includes('\u2502'), plain);
  check('plain has no nbsp', !/\u00A0/.test(plain));
  check('plain round-trips', plain === lines.join('\n'));
}

// --- HTML output ------------------------------------------------------------
{
  const lines = cleanCode(SRC, { dedent: true });
  const html = toHtml(lines, { theme: 'light', font: 'Courier New', fontSize: 10,
                               background: true, lineNumbers: false, padLines: false });

  check('html has one div per line',
    (html.match(/<div style="margin:0/g) || []).length === lines.length,
    String((html.match(/<div style="margin:0/g) || []).length));
  check('html indents with nbsp', html.includes('&nbsp;'));
  check('html carries keyword colour', html.includes(THEMES.light.keyword));
  check('html carries string colour', html.includes(THEMES.light.string));
  check('html sets background', html.includes(THEMES.light.bg));
  check('html comment is italic', html.includes('font-style:italic'));
  check('tags are balanced',
    (html.match(/<div/g) || []).length === (html.match(/<\/div>/g) || []).length &&
    (html.match(/<span/g) || []).length === (html.match(/<\/span>/g) || []).length);
  check('empty line does not collapse', html.includes('<span>&nbsp;</span>'));

  const dark = toHtml(lines, { theme: 'dark', background: true });
  check('dark theme applies', dark.includes(THEMES.dark.bg) && dark.includes(THEMES.dark.keyword));

  const numbered = toHtml(lines, { theme: 'light', lineNumbers: true });
  check('html line numbers use theme colour', numbered.includes(THEMES.light.lineno));

  const padded = toHtml(['a', 'bbbb'], { theme: 'light', padLines: true });
  check('padding emits filler', padded.includes('&nbsp;'.repeat(3)), 'no 3x nbsp run');
}

// --- HTML escaping ----------------------------------------------------------
{
  const html = toHtml(cleanCode('if a < b and c > d:  # <tag> & "x"', {}), { theme: 'light' });
  check('escapes <', !/<span[^>]*>[^<]*<(?!\/?span|\/?div)/.test(html));
  check('escapes ampersand', html.includes('&amp;'));
  check('escapes lt/gt', html.includes('&lt;') && html.includes('&gt;'));
  check('no raw tag injected', !html.includes('<tag>'));
}

// --- injection safety -------------------------------------------------------
{
  const evil = 'x = 1  # <script>alert(1)</script>';
  const html = toHtml(cleanCode(evil, {}), { theme: 'light' });
  check('script tag neutralised',
    !html.includes('<script>') && html.includes('&lt;script&gt;'), html.slice(0, 200));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
