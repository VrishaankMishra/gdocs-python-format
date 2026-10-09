/**
 * format.js — turns pasted text into cleaned lines, highlighted segments,
 * rich HTML for the clipboard, and plain text.
 *
 * No DOM and no Chrome APIs, so tests/ can exercise it directly in Node.
 */

/** Collapse Docs damage, normalize indentation, optionally dedent. */
function cleanCode(raw, opts) {
  opts = opts || {};

  var lines = normalizeCodeText(String(raw))
    .split('\n')
    .map(stripLineNumber)
    .map(function (line) { return line.replace(/\s+$/, ''); });

  // Drop leading and trailing blank lines; keep interior ones.
  while (lines.length && lines[0] === '') lines.shift();
  while (lines.length && lines[lines.length - 1] === '') lines.pop();

  if (opts.dedent !== false) {
    var common = null;
    lines.forEach(function (line) {
      if (line === '') return;
      var indent = line.match(/^ */)[0].length;
      common = (common === null) ? indent : Math.min(common, indent);
    });
    if (common) {
      lines = lines.map(function (line) {
        return line === '' ? '' : line.substring(common);
      });
    }
  }

  return lines;
}

/**
 * Contiguous segments covering a whole line: [{text, type}].
 * Gaps between tokens become type 'fg' so callers can colour everything.
 */
function segmentsForLine(line, state) {
  var tokens = tokenizeLine(line, state);
  var segments = [];
  var at = 0;

  tokens.forEach(function (tok) {
    if (tok.start > at) {
      segments.push({ text: line.substring(at, tok.start), type: 'fg' });
    }
    if (tok.end > tok.start) {
      segments.push({ text: line.substring(tok.start, tok.end), type: tok.type });
    }
    at = Math.max(at, tok.end);
  });

  if (at < line.length) {
    segments.push({ text: line.substring(at), type: 'fg' });
  }
  return segments;
}

/** Segments for every line, with triple-quote state carried across them. */
function highlight(lines) {
  var state = { inTriple: null, pendingDefName: false };
  return lines.map(function (line) { return segmentsForLine(line, state); });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Spaces must become &nbsp; or Google Docs collapses the indentation. */
function escapeHtmlPreservingSpaces(s) {
  return escapeHtml(s).replace(/ /g, '&nbsp;');
}

function lineNumberPrefixes(count, enabled) {
  if (!enabled) return null;
  var width = String(count).length;
  var out = [];
  for (var i = 1; i <= count; i++) {
    var n = String(i);
    while (n.length < width) n = ' ' + n;
    out.push(n + LINENO_SEP);
  }
  return out;
}

/**
 * Rich HTML for the clipboard, aimed squarely at what Google Docs keeps on
 * paste: one <div> per line, inline styles only, no <pre> (Docs mangles it),
 * non-breaking spaces for indentation.
 */
function toHtml(lines, opts) {
  opts = opts || {};
  var theme = THEMES[opts.theme] || THEMES.light;
  var font = opts.font || 'Courier New';
  var size = opts.fontSize || 10;
  var prefixes = lineNumberPrefixes(lines.length, opts.lineNumbers);
  var rows = highlight(lines);

  var widest = 0;
  if (opts.padLines) {
    lines.forEach(function (line, i) {
      widest = Math.max(widest, line.length + (prefixes ? prefixes[i].length : 0));
    });
  }

  var lineStyle =
    'margin:0;padding:0;' +
    'font-family:\'' + font + '\',\'Courier New\',monospace;' +
    'font-size:' + size + 'pt;' +
    'line-height:1.25;' +
    'color:' + theme.fg + ';' +
    (opts.background ? 'background-color:' + theme.bg + ';' : '');

  var body = rows.map(function (segments, i) {
    var html = '';

    if (prefixes) {
      html += '<span style="color:' + theme.lineno + '">' +
              escapeHtmlPreservingSpaces(prefixes[i]) + '</span>';
    }

    segments.forEach(function (seg) {
      var color = theme[seg.type] || theme.fg;
      var style = 'color:' + color;
      if (seg.type === 'comment') style += ';font-style:italic';
      html += '<span style="' + style + '">' +
              escapeHtmlPreservingSpaces(seg.text) + '</span>';
    });

    if (opts.padLines) {
      var used = lines[i].length + (prefixes ? prefixes[i].length : 0);
      if (used < widest) {
        html += '<span>' + '&nbsp;'.repeat(widest - used) + '</span>';
      }
    }

    // A fully empty line would collapse to nothing in Docs.
    if (html === '') html = '<span>&nbsp;</span>';

    return '<div style="' + lineStyle + '">' + html + '</div>';
  }).join('');

  return '<div style="' + (opts.background ? 'background-color:' + theme.bg + ';' : '') +
         'padding:6pt 8pt;">' + body + '</div>';
}

/**
 * Plain text for the clipboard: runnable Python. Line numbers and padding are
 * deliberately excluded so the result pastes into an editor and executes.
 */
function toPlain(lines) {
  return lines.join('\n');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    cleanCode, segmentsForLine, highlight, toHtml, toPlain,
    escapeHtml, escapeHtmlPreservingSpaces, lineNumberPrefixes
  };
}
