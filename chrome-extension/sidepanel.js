/** sidepanel.js — UI wiring. Logic lives in python.js and format.js. */

var FIELDS = ['theme', 'font', 'fontSize', 'background', 'lineNumbers', 'padLines', 'dedent'];

var DEFAULTS = {
  theme: 'light',
  font: 'Courier New',
  fontSize: 10,
  background: true,
  lineNumbers: false,
  padLines: false,
  dedent: true
};

/** Autocorrect damage worth telling the user about. */
var REPAIRS = [
  { re: /[‘’‚‛′]/g, label: 'curly single quotes' },
  { re: /[“”„‟″]/g, label: 'curly double quotes' },
  { re: /[‐-―−]/g,            label: 'dashes' },
  { re: /[  -   　]/g, label: 'non-breaking spaces' },
  { re: /[​-‍⁠﻿]/g,      label: 'invisible characters' },
  { re: /…/g,                           label: 'ellipses' },
  { re: /\t/g,                               label: 'tabs' }
];

function el(id) { return document.getElementById(id); }

function readOpts() {
  return {
    theme: el('theme').value,
    font: el('font').value,
    fontSize: Number(el('fontSize').value) || DEFAULTS.fontSize,
    background: el('background').checked,
    lineNumbers: el('lineNumbers').checked,
    padLines: el('padLines').checked,
    dedent: el('dedent').checked
  };
}

function writeOpts(opts) {
  el('theme').value = opts.theme;
  el('font').value = opts.font;
  el('fontSize').value = opts.fontSize;
  el('background').checked = !!opts.background;
  el('lineNumbers').checked = !!opts.lineNumbers;
  el('padLines').checked = !!opts.padLines;
  el('dedent').checked = !!opts.dedent;
}

function setStatus(message, isError) {
  var box = el('status');
  box.textContent = message;
  box.className = 'status ' + (isError ? 'err' : 'ok');
  if (setStatus.timer) clearTimeout(setStatus.timer);
  setStatus.timer = setTimeout(function () { box.className = 'status'; }, 4000);
}

function describeRepairs(raw) {
  var found = [];
  REPAIRS.forEach(function (r) {
    var hits = raw.match(r.re);
    if (hits) found.push(hits.length + ' ' + r.label);
  });
  return found;
}

/** Rebuild the preview and cache the current lines/opts for the copy buttons. */
var current = { lines: [], opts: DEFAULTS };

function render() {
  var raw = el('input').value;
  var opts = readOpts();
  var theme = THEMES[opts.theme] || THEMES.light;
  var lines = cleanCode(raw, opts);
  current = { lines: lines, opts: opts };

  var preview = el('preview');
  preview.textContent = '';
  preview.style.background = opts.background ? theme.bg : 'transparent';

  if (!lines.length) {
    var empty = document.createElement('div');
    empty.className = 'pf-empty';
    empty.textContent = 'Nothing to format yet.';
    preview.appendChild(empty);
    el('stats').textContent = '';
    el('repairs').className = 'repairs';
    return;
  }

  var prefixes = lineNumberPrefixes(lines.length, opts.lineNumbers);
  var rows = highlight(lines);

  rows.forEach(function (segments, i) {
    var div = document.createElement('div');
    div.className = 'pf-line';
    div.style.fontFamily = "'" + opts.font + "', 'Courier New', monospace";
    div.style.fontSize = opts.fontSize + 'pt';
    div.style.color = theme.fg;

    if (prefixes) {
      var num = document.createElement('span');
      num.style.color = theme.lineno;
      num.textContent = prefixes[i];
      div.appendChild(num);
    }

    segments.forEach(function (seg) {
      var span = document.createElement('span');
      span.style.color = theme[seg.type] || theme.fg;
      if (seg.type === 'comment') span.style.fontStyle = 'italic';
      span.textContent = seg.text;
      div.appendChild(span);
    });

    preview.appendChild(div);
  });

  var chars = lines.join('\n').length;
  el('stats').textContent = lines.length + (lines.length === 1 ? ' line' : ' lines') +
                            ' · ' + chars + ' chars';

  var repairs = describeRepairs(raw);
  var box = el('repairs');
  if (repairs.length) {
    box.textContent = 'Repaired: ' + repairs.join(', ') + '.';
    box.className = 'repairs show';
  } else {
    box.className = 'repairs';
  }
}

/* ------------------------------------------------------------- clipboard --- */

async function copyRich() {
  if (!current.lines.length) return setStatus('Nothing to copy yet.', true);

  var html = toHtml(current.lines, current.opts);
  var plain = toPlain(current.lines);

  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([plain], { type: 'text/plain' })
      })
    ]);
    setStatus('Formatted block copied. Select your code in the doc and paste over it.');
  } catch (err) {
    setStatus('Could not write to the clipboard: ' + err.message, true);
  }
}

async function copyPlain() {
  if (!current.lines.length) return setStatus('Nothing to copy yet.', true);
  try {
    await navigator.clipboard.writeText(toPlain(current.lines));
    setStatus('Plain Python copied — runnable, no line numbers.');
  } catch (err) {
    setStatus('Could not write to the clipboard: ' + err.message, true);
  }
}

async function readClipboard() {
  try {
    var text = await navigator.clipboard.readText();
    if (!text) return setStatus('The clipboard is empty.', true);
    el('input').value = text;
    render();
    setStatus('Pulled ' + text.split('\n').length + ' lines from the clipboard.');
  } catch (err) {
    setStatus('Clipboard read was blocked. Paste into the box instead.', true);
  }
}

function download() {
  if (!current.lines.length) return setStatus('Nothing to download yet.', true);
  var blob = new Blob([toPlain(current.lines) + '\n'], { type: 'text/x-python' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'snippet.py';
  a.click();
  setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  setStatus('Saved snippet.py');
}

/* ------------------------------------------------------------------ init --- */

function persist() {
  try {
    chrome.storage.local.set({ opts: readOpts() });
  } catch (err) { /* storage unavailable; options just won't persist */ }
}

function init() {
  var select = el('theme');
  Object.keys(THEMES).forEach(function (key) {
    var option = document.createElement('option');
    option.value = key;
    option.textContent = THEMES[key].label;
    select.appendChild(option);
  });

  function start(stored) {
    var opts = Object.assign({}, DEFAULTS, stored || {});
    if (!THEMES[opts.theme]) opts.theme = DEFAULTS.theme;
    writeOpts(opts);

    FIELDS.forEach(function (id) {
      el(id).addEventListener('change', function () { persist(); render(); });
    });
    el('input').addEventListener('input', render);
    el('copyRich').addEventListener('click', copyRich);
    el('copyPlain').addEventListener('click', copyPlain);
    el('download').addEventListener('click', download);
    el('readClipboard').addEventListener('click', readClipboard);

    render();
  }

  try {
    chrome.storage.local.get('opts', function (got) { start(got && got.opts); });
  } catch (err) {
    start(null);
  }
}

document.addEventListener('DOMContentLoaded', init);
