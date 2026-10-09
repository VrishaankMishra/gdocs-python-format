/**
 * Python.gs — tokenizer, themes and text normalization.
 *
 * Pure logic, no DocumentApp calls, so it can be unit-tested in isolation.
 */

/** Line-number separator. Deliberately exotic so re-running can strip it safely. */
var LINENO_SEP = ' │ ';
var LINENO_RE = /^ *\d+ │ /;

var KEYWORDS = {};
('False None True and as assert async await break class continue def del elif ' +
 'else except finally for from global if import in is lambda nonlocal not or ' +
 'pass raise return try while with yield match case')
  .split(' ').forEach(function (w) { KEYWORDS[w] = true; });

var BUILTINS = {};
('abs aiter all any anext ascii bin bool breakpoint bytearray bytes callable chr ' +
 'classmethod compile complex delattr dict dir divmod enumerate eval exec filter ' +
 'float format frozenset getattr globals hasattr hash help hex id input int ' +
 'isinstance issubclass iter len list locals map max memoryview min next object ' +
 'oct open ord pow print property range repr reversed round set setattr slice ' +
 'sorted staticmethod str sum super tuple type vars zip __import__ ' +
 'Exception BaseException ValueError TypeError KeyError IndexError RuntimeError ' +
 'StopIteration NotImplementedError AttributeError ImportError OSError ' +
 'ZeroDivisionError FileNotFoundError AssertionError')
  .split(' ').forEach(function (w) { BUILTINS[w] = true; });

var THEMES = {
  light: {
    label: 'Light (GitHub)',
    bg: '#F6F8FA',
    fg: '#24292E',
    comment: '#6A737D',
    string: '#032F62',
    number: '#005CC5',
    keyword: '#D73A49',
    builtin: '#005CC5',
    defname: '#6F42C1',
    decorator: '#6F42C1',
    self: '#E36209',
    lineno: '#BABEC4'
  },
  dark: {
    label: 'Dark',
    bg: '#24292E',
    fg: '#E1E4E8',
    comment: '#8B949E',
    string: '#A5D6FF',
    number: '#79C0FF',
    keyword: '#FF7B72',
    builtin: '#79C0FF',
    defname: '#D2A8FF',
    decorator: '#D2A8FF',
    self: '#FFA657',
    lineno: '#6E7681'
  },
  mono: {
    label: 'Monochrome (print-safe)',
    bg: '#F3F3F3',
    fg: '#1A1A1A',
    comment: '#777777',
    string: '#1A1A1A',
    number: '#1A1A1A',
    keyword: '#1A1A1A',
    builtin: '#1A1A1A',
    defname: '#1A1A1A',
    decorator: '#1A1A1A',
    self: '#1A1A1A',
    lineno: '#AAAAAA'
  }
};

/**
 * Undo what Google Docs autocorrect does to code.
 * Smart quotes, dashes, non-breaking spaces and invisibles all break Python.
 */
function normalizeCodeText(s) {
  return String(s)
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐‑‒–—―−]/g, '-')
    .replace(/…/g, '...')
    .replace(/[   -   　]/g, ' ')
    .replace(/[​-‍⁠﻿]/g, '')
    .replace(/\t/g, '    ')
    .replace(/[\u000B\u000C\r]/g, '');
}

/** Strip a previously-applied line-number prefix so formatting is idempotent. */
function stripLineNumber(s) {
  return String(s).replace(LINENO_RE, '');
}

/**
 * Tokenize one physical line of Python.
 *
 * `state` carries triple-quoted-string context across lines and is mutated.
 * Returns [{start, end, type}] with `end` EXCLUSIVE. Untokenized spans use the
 * theme's default foreground.
 */
function tokenizeLine(line, state) {
  var tokens = [];
  var i = 0;
  var n = line.length;
  state.pendingDefName = false;

  if (state.inTriple) {
    var closeIdx = line.indexOf(state.inTriple);
    if (closeIdx === -1) {
      if (n > 0) tokens.push({ start: 0, end: n, type: 'string' });
      return tokens;
    }
    tokens.push({ start: 0, end: closeIdx + 3, type: 'string' });
    i = closeIdx + 3;
    state.inTriple = null;
  }

  while (i < n) {
    var ch = line.charAt(i);

    if (ch === '#') {
      tokens.push({ start: i, end: n, type: 'comment' });
      return tokens;
    }

    var three = line.substr(i, 3);
    if (three === '"""' || three === "'''") {
      var close = line.indexOf(three, i + 3);
      if (close === -1) {
        tokens.push({ start: i, end: n, type: 'string' });
        state.inTriple = three;
        return tokens;
      }
      tokens.push({ start: i, end: close + 3, type: 'string' });
      i = close + 3;
      continue;
    }

    if (ch === '"' || ch === "'") {
      var j = i + 1;
      while (j < n) {
        if (line.charAt(j) === '\\') { j += 2; continue; }
        if (line.charAt(j) === ch) { j++; break; }
        j++;
      }
      j = Math.min(j, n);
      tokens.push({ start: i, end: j, type: 'string' });
      i = j;
      continue;
    }

    if (ch === '@' && /^\s*$/.test(line.substring(0, i))) {
      var k = i + 1;
      while (k < n && /[A-Za-z0-9_.]/.test(line.charAt(k))) k++;
      tokens.push({ start: i, end: k, type: 'decorator' });
      i = k;
      continue;
    }

    if (/[0-9]/.test(ch) && !(i > 0 && /[A-Za-z0-9_]/.test(line.charAt(i - 1)))) {
      var num = /^(?:0[xX][0-9a-fA-F_]+|0[oO][0-7_]+|0[bB][01_]+|\d[\d_]*(?:\.[\d_]*)?(?:[eE][+-]?\d+)?[jJ]?)/
        .exec(line.substring(i));
      if (num) {
        tokens.push({ start: i, end: i + num[0].length, type: 'number' });
        i += num[0].length;
        continue;
      }
    }

    if (/[A-Za-z_]/.test(ch)) {
      var p = i;
      while (p < n && /[A-Za-z0-9_]/.test(line.charAt(p))) p++;
      var word = line.substring(i, p);
      var type = null;

      if (KEYWORDS[word]) {
        type = 'keyword';
        if (word === 'def' || word === 'class') state.pendingDefName = true;
      } else if (word === 'self' || word === 'cls') {
        type = 'self';
      } else if (state.pendingDefName) {
        type = 'defname';
        state.pendingDefName = false;
      } else if (BUILTINS[word]) {
        type = 'builtin';
      }

      if (type) tokens.push({ start: i, end: p, type: type });
      i = p;
      continue;
    }

    i++;
  }

  return tokens;
}
