// Mock Apps Script + Docs, then run formatSelection() for real.
const fs = require('fs');
const vm = require('vm');

let violations = [];

class MockText {
  constructor(s) { this.setText(s); }
  setText(s) {
    this.s = s;
    this.attrs = Array.from(s, () => ({}));
    return this;
  }
  getText() { return this.s; }
  _range(start, endIncl, key, val, caller) {
    if (!Number.isInteger(start) || !Number.isInteger(endIncl)) {
      violations.push(`${caller}: non-integer offsets ${start},${endIncl}`); return;
    }
    if (start < 0 || endIncl < start || endIncl >= this.s.length) {
      violations.push(
        `${caller}: out of range start=${start} endIncl=${endIncl} len=${this.s.length} text="${this.s}"`);
      return;
    }
    for (let i = start; i <= endIncl; i++) this.attrs[i][key] = val;
  }
  setFontFamily(a, b, v)      { this._range(a, b, 'font', v, 'setFontFamily'); return this; }
  setFontSize(a, b, v)        { this._range(a, b, 'size', v, 'setFontSize'); return this; }
  setForegroundColor(a, b, v) { this._range(a, b, 'fg', v, 'setForegroundColor'); return this; }
  setBackgroundColor(a, b, v) { this._range(a, b, 'bg', v, 'setBackgroundColor'); return this; }
  setBold(a, b, v)            { this._range(a, b, 'bold', v, 'setBold'); return this; }
  setItalic(a, b, v)          { this._range(a, b, 'italic', v, 'setItalic'); return this; }
  setUnderline(a, b, v)       { this._range(a, b, 'underline', v, 'setUnderline'); return this; }
}

class MockParagraph {
  constructor(s, body, idx) {
    this.text = new MockText(s);
    this.body = body;
    this.idx = idx;
    this.layout = {};
  }
  getType() { return 'PARAGRAPH'; }
  getText() { return this.text.getText(); }
  editAsText() { return this.text; }
  getParent() { return this.body; }
  setLineSpacing(v)     { this.layout.lineSpacing = v; return this; }
  setSpacingBefore(v)   { this.layout.before = v; return this; }
  setSpacingAfter(v)    { this.layout.after = v; return this; }
  setAlignment(v)       { this.layout.align = v; return this; }
  setHeading(v)         { this.layout.heading = v; return this; }
  setIndentStart(v)     { this.layout.indentStart = v; return this; }
  setIndentFirstLine(v) { this.layout.indentFirst = v; return this; }
  setIndentEnd(v)       { this.layout.indentEnd = v; return this; }
}

class MockBody {
  constructor(lines) {
    this.paras = lines.map((l, i) => new MockParagraph(l, this, i));
  }
  getType() { return 'BODY_SECTION'; }
  getParent() { return null; }
  getChildIndex(child) { return child.idx; }
}

function buildSandbox(lines, { duplicateRuns = false } = {}) {
  const body = new MockBody(lines);

  // Simulate getRangeElements(): one entry per paragraph, optionally duplicated
  // to mimic a paragraph split into several styled text runs.
  const rangeElements = [];
  for (const p of body.paras) {
    rangeElements.push({ getElement: () => p });
    if (duplicateRuns) rangeElements.push({ getElement: () => p });
  }

  const sandbox = {
    body,
    DocumentApp: {
      ElementType: { PARAGRAPH: 'PARAGRAPH', LIST_ITEM: 'LIST_ITEM',
                     BODY_SECTION: 'BODY_SECTION', DOCUMENT: 'DOCUMENT' },
      HorizontalAlignment: { LEFT: 'LEFT' },
      ParagraphHeading: { NORMAL: 'NORMAL' },
      getActiveDocument: () => ({
        getSelection: () => ({ getRangeElements: () => rangeElements }),
      }),
      getUi: () => ({ alert: () => {}, ButtonSet: { OK: 'OK' } }),
    },
    PropertiesService: {
      getUserProperties: () => ({ getProperty: () => null, setProperty: () => {} }),
    },
    HtmlService: { createHtmlOutputFromFile: () => ({ setTitle: () => ({}) }) },
    Logger: { log: () => {} },
    console,
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(__dirname + '/../Python.gs', 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync(__dirname + '/../Code.gs', 'utf8'), sandbox);
  return { sandbox, body };
}

const SRC = [
  'def is_expired(entry, now):',
  '    """Return True if the cache entry is stale."""',
  '    if entry.stored_at is None:',
  '        return True  # never written',
  '    gap = now - entry.stored_at',
  '    return gap.seconds >= 0x1C20',
];

let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; return; }
  fail++; console.log(`FAIL ${label}${detail ? '\n  ' + detail : ''}`);
}

// ---- 1. plain format ------------------------------------------------------
violations = [];
let { sandbox, body } = buildSandbox(SRC);
let res = sandbox.formatSelection({ theme: 'light', font: 'Courier New', fontSize: 10,
  indentPt: 18, background: true, lineNumbers: false, padLines: false });

check('returns ok', res.ok, JSON.stringify(res));
check('no offset violations', violations.length === 0, violations.join('\n  '));
check('text preserved', body.paras.map(p => p.getText()).join('\n') === SRC.join('\n'),
  JSON.stringify(body.paras.map(p => p.getText())));
check('every char has mono font',
  body.paras.every(p => p.text.attrs.every(a => a.font === 'Courier New')));
check('every char has bg',
  body.paras.every(p => p.text.attrs.every(a => a.bg === '#F6F8FA')));
check('line spacing set', body.paras.every(p => p.layout.lineSpacing === 1.0));
check('indent set', body.paras.every(p => p.layout.indentStart === 18 && p.layout.indentFirst === 18));

// keyword 'def' coloured red, docstring blue, comment grey+italic
const T = sandbox.THEMES.light;
check('def is keyword colour', body.paras[0].text.attrs[0].fg === T.keyword,
  body.paras[0].text.attrs[0].fg);
check('defname coloured', body.paras[0].text.attrs[4].fg === T.defname,
  body.paras[0].text.attrs[4].fg);
check('docstring is string colour', body.paras[1].text.attrs[4].fg === T.string,
  body.paras[1].text.attrs[4].fg);
const l3 = body.paras[3];
const hashAt = l3.getText().indexOf('#');
check('comment coloured', l3.text.attrs[hashAt].fg === T.comment, l3.text.attrs[hashAt].fg);
check('comment italic', l3.text.attrs[hashAt].italic === true);
check('comment italic to end of line',
  l3.text.attrs[l3.getText().length - 1].italic === true);
check('code before comment not italic', l3.text.attrs[0].italic === false);
const hexLine = body.paras[5];
check('hex literal coloured',
  hexLine.text.attrs[hexLine.getText().indexOf('0x1C20')].fg === T.number);

// ---- 2. duplicate runs must not double-process ----------------------------
violations = [];
({ sandbox, body } = buildSandbox(SRC, { duplicateRuns: true }));
res = sandbox.formatSelection({ theme: 'light', font: 'Courier New', fontSize: 10,
  indentPt: 18, background: true, lineNumbers: true, padLines: false });
check('dedupes duplicate runs', /\b6 lines\b/.test(res.message), res.message);
check('dedupe: no violations', violations.length === 0, violations.join('\n  '));
check('line numbers applied once',
  body.paras[0].getText().startsWith('1 │ def'), body.paras[0].getText());

// ---- 3. line numbers are idempotent --------------------------------------
violations = [];
res = sandbox.formatSelection({ theme: 'light', font: 'Courier New', fontSize: 10,
  indentPt: 18, background: true, lineNumbers: true, padLines: false });
check('reformat is idempotent',
  body.paras[0].getText() === '1 │ def is_expired(entry, now):',
  body.paras[0].getText());
check('idempotent: no violations', violations.length === 0, violations.join('\n  '));

// ---- 4. padding makes a rectangle ----------------------------------------
violations = [];
({ sandbox, body } = buildSandbox(SRC));
sandbox.formatSelection({ theme: 'dark', font: 'Roboto Mono', fontSize: 9,
  indentPt: 0, background: true, lineNumbers: false, padLines: true });
const widths = body.paras.map(p => p.getText().length);
check('all lines padded equal', new Set(widths).size === 1, JSON.stringify(widths));
check('pad: no violations', violations.length === 0, violations.join('\n  '));

// ---- 5. empty + whitespace-only lines ------------------------------------
violations = [];
({ sandbox, body } = buildSandbox(['x = 1', '', '   ', 'y = 2']));
res = sandbox.formatSelection({ theme: 'light', font: 'Courier New', fontSize: 10,
  indentPt: 18, background: true, lineNumbers: false, padLines: false });
check('blank lines ok', res.ok, JSON.stringify(res));
check('blank lines: no violations', violations.length === 0, violations.join('\n  '));

// ---- 6. no selection -----------------------------------------------------
({ sandbox } = buildSandbox(SRC));
sandbox.DocumentApp.getActiveDocument = () => ({ getSelection: () => null });
res = sandbox.formatSelection({ theme: 'light', font: 'Courier New', fontSize: 10,
  indentPt: 18, background: true, lineNumbers: false, padLines: false });
check('no selection reports clearly', !res.ok && /Select the code/.test(res.message), res.message);

// ---- 7. smart quotes get repaired ----------------------------------------
violations = [];
({ sandbox, body } = buildSandbox(['name = “widget”  # it’s mangled']));
sandbox.formatSelection({ theme: 'light', font: 'Courier New', fontSize: 10,
  indentPt: 18, background: true, lineNumbers: false, padLines: false });
check('smart quotes repaired in doc',
  body.paras[0].getText() === 'name = "widget"  # it\'s mangled', body.paras[0].getText());

// ---- 8. clearCodeFormatting ----------------------------------------------
violations = [];
({ sandbox, body } = buildSandbox(SRC));
sandbox.formatSelection({ theme: 'light', font: 'Courier New', fontSize: 10,
  indentPt: 18, background: true, lineNumbers: true, padLines: false });
res = sandbox.clearCodeFormatting();
check('clear returns ok', res.ok, JSON.stringify(res));
check('clear strips line numbers',
  body.paras[0].getText() === 'def is_expired(entry, now):', body.paras[0].getText());
check('clear resets font', body.paras[0].text.attrs.every(a => a.font === 'Arial'));
check('clear resets italic', body.paras[0].text.attrs.every(a => a.italic === false));
check('clear: no violations', violations.length === 0, violations.join('\n  '));

// ---- visual render -------------------------------------------------------
({ sandbox, body } = buildSandbox(SRC));
sandbox.formatSelection({ theme: 'light', font: 'Courier New', fontSize: 10,
  indentPt: 18, background: true, lineNumbers: true, padLines: true });
const ANSI = { '#D73A49': 31, '#032F62': 34, '#005CC5': 36, '#6F42C1': 35,
               '#6A737D': 90, '#E36209': 33, '#24292E': 37, '#BABEC4': 90 };
console.log('\n--- how the block will look (approximated in the terminal) ---');
for (const p of body.paras) {
  let out = '';
  p.text.attrs.forEach((a, i) => {
    out += `\x1b[${ANSI[a.fg] || 37}m${p.getText()[i]}\x1b[0m`;
  });
  console.log('  ' + out);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
