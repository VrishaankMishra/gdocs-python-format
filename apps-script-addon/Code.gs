/**
 * Code.gs — menu, sidebar wiring and the Docs mutation.
 *
 * Styles the selected text in a Google Doc as a Python code block: monospace,
 * preserved indentation, syntax highlighting, shaded background.
 *
 * Scope note: formatting is applied PER PARAGRAPH. Code is line-oriented, so a
 * partial selection inside a line still formats that whole line.
 */

var MAX_PARAGRAPHS = 500;   // guard against the 6-minute execution limit
var MAX_PAINT_OPS = 6000;   // each paint op is a Docs API write

var DEFAULTS = {
  theme: 'light',
  font: 'Courier New',
  fontSize: 10,
  lineNumbers: false,
  background: true,
  padLines: false,
  indentPt: 18
};

function onOpen(e) {
  DocumentApp.getUi()
    .createMenu('Python Format')
    .addItem('Format selection as Python', 'menuFormatSelection')
    .addItem('Clear code formatting', 'menuClearCodeFormatting')
    .addSeparator()
    .addItem('Open settings sidebar', 'showSidebar')
    .addToUi();
}

function onInstall(e) {
  onOpen(e);
}

function showSidebar() {
  var html = HtmlService.createHtmlOutputFromFile('Sidebar')
    .setTitle('Python Format');
  DocumentApp.getUi().showSidebar(html);
}

/* ---------------------------------------------------------------- prefs ---- */

function getPrefs() {
  var stored = {};
  try {
    var raw = PropertiesService.getUserProperties().getProperty('prefs');
    if (raw) stored = JSON.parse(raw);
  } catch (err) {
    stored = {};
  }

  var prefs = {};
  Object.keys(DEFAULTS).forEach(function (k) {
    prefs[k] = (stored[k] === undefined) ? DEFAULTS[k] : stored[k];
  });

  if (!THEMES[prefs.theme]) prefs.theme = DEFAULTS.theme;
  return prefs;
}

function savePrefs(prefs) {
  var clean = getPrefs();
  Object.keys(DEFAULTS).forEach(function (k) {
    if (prefs && prefs[k] !== undefined) clean[k] = prefs[k];
  });
  clean.fontSize = Math.min(24, Math.max(6, Number(clean.fontSize) || DEFAULTS.fontSize));
  clean.indentPt = Math.min(144, Math.max(0, Number(clean.indentPt) || 0));
  if (!THEMES[clean.theme]) clean.theme = DEFAULTS.theme;

  PropertiesService.getUserProperties().setProperty('prefs', JSON.stringify(clean));
  return clean;
}

function getThemeList() {
  return Object.keys(THEMES).map(function (k) {
    return { key: k, label: THEMES[k].label };
  });
}

/* ------------------------------------------------------------ selection ---- */

/**
 * Stable identity for a Docs element: the chain of child indexes from the root.
 * Needed because getRangeElements() can hand back several runs from the same
 * paragraph, and element wrappers do not compare by identity.
 */
function elementKey(el) {
  var parts = [];
  var cur = el;
  var guard = 0;
  while (cur && guard++ < 50) {
    var parent;
    try {
      parent = cur.getParent();
    } catch (err) {
      break;
    }
    if (!parent) break;
    try {
      parts.unshift(parent.getChildIndex(cur));
    } catch (err) {
      break;
    }
    cur = parent;
  }
  return parts.join('/');
}

function containingParagraph(el) {
  var cur = el;
  var guard = 0;
  while (cur && guard++ < 50) {
    var type;
    try {
      type = cur.getType();
    } catch (err) {
      return null;
    }
    if (type === DocumentApp.ElementType.PARAGRAPH ||
        type === DocumentApp.ElementType.LIST_ITEM) {
      return cur;
    }
    if (type === DocumentApp.ElementType.BODY_SECTION ||
        type === DocumentApp.ElementType.DOCUMENT) {
      return null;
    }
    try {
      cur = cur.getParent();
    } catch (err) {
      return null;
    }
  }
  return null;
}

/** Deduplicated, in-order paragraphs touched by the current selection. */
function selectedParagraphs() {
  var doc = DocumentApp.getActiveDocument();
  var selection = doc.getSelection();
  if (!selection) return null;

  var seen = {};
  var out = [];

  selection.getRangeElements().forEach(function (rangeEl) {
    var para = containingParagraph(rangeEl.getElement());
    if (!para) return;
    var key = elementKey(para);
    if (seen[key]) return;
    seen[key] = true;
    out.push(para);
  });

  return out;
}

/* ------------------------------------------------------------ formatting --- */

/** setForegroundColor and friends take an INCLUSIVE end offset. */
function paintColor(text, start, endExclusive, color) {
  if (endExclusive <= start) return 0;
  text.setForegroundColor(start, endExclusive - 1, color);
  return 1;
}

function applyParagraphLayout(para, prefs) {
  para.setLineSpacing(1.0);
  para.setSpacingBefore(0);
  para.setSpacingAfter(0);
  para.setAlignment(DocumentApp.HorizontalAlignment.LEFT);

  if (para.getType() === DocumentApp.ElementType.PARAGRAPH) {
    para.setHeading(DocumentApp.ParagraphHeading.NORMAL);
    para.setIndentStart(prefs.indentPt);
    para.setIndentFirstLine(prefs.indentPt);
    para.setIndentEnd(0);
  }
}

function formatSelection(incomingPrefs) {
  // The sidebar passes its current form values so saving cannot race the read.
  var prefs = incomingPrefs ? savePrefs(incomingPrefs) : getPrefs();
  var paragraphs = selectedParagraphs();

  if (paragraphs === null) {
    return fail('Select the code in your document first, then run this again.');
  }
  if (!paragraphs.length) {
    return fail('That selection has no text paragraphs in it.');
  }
  if (paragraphs.length > MAX_PARAGRAPHS) {
    return fail('That selection is ' + paragraphs.length + ' lines. Please format ' +
                MAX_PARAGRAPHS + ' lines or fewer at a time.');
  }

  var theme = THEMES[prefs.theme];

  // Pass 1: normalize text and work out the final string for each line.
  var lines = paragraphs.map(function (para) {
    return normalizeCodeText(stripLineNumber(para.getText()));
  });

  var widest = 0;
  lines.forEach(function (line) { widest = Math.max(widest, line.length); });

  var numWidth = String(lines.length).length;
  var prefixes = lines.map(function (line, idx) {
    if (!prefs.lineNumbers) return '';
    var n = String(idx + 1);
    while (n.length < numWidth) n = ' ' + n;
    return n + LINENO_SEP;
  });

  var padTo = prefs.padLines ? widest : 0;

  // Pass 2: write and paint.
  var state = { inTriple: null, pendingDefName: false };
  var paintOps = 0;
  var truncated = false;

  for (var i = 0; i < paragraphs.length; i++) {
    var para = paragraphs[i];
    var code = lines[i];
    var prefix = prefixes[i];

    var body = code;
    while (body.length < padTo) body += ' ';

    var full = prefix + body;
    var text = para.editAsText();
    text.setText(full);

    applyParagraphLayout(para, prefs);

    var len = full.length;
    if (len === 0) {
      state.pendingDefName = false;
      continue;
    }

    text.setFontFamily(0, len - 1, prefs.font);
    text.setFontSize(0, len - 1, prefs.fontSize);
    text.setForegroundColor(0, len - 1, theme.fg);
    text.setBold(0, len - 1, false);
    text.setItalic(0, len - 1, false);
    text.setUnderline(0, len - 1, false);
    if (prefs.background) {
      text.setBackgroundColor(0, len - 1, theme.bg);
    }

    if (prefix) {
      paintColor(text, 0, prefix.length, theme.lineno);
    }

    var tokens = tokenizeLine(code, state);

    for (var t = 0; t < tokens.length; t++) {
      if (paintOps >= MAX_PAINT_OPS) { truncated = true; break; }
      var tok = tokens[t];
      var color = theme[tok.type] || theme.fg;
      paintOps += paintColor(text, prefix.length + tok.start, prefix.length + tok.end, color);
      if (tok.type === 'comment') {
        text.setItalic(prefix.length + tok.start, prefix.length + tok.end - 1, true);
      }
    }

    if (truncated) break;
  }

  var msg = 'Formatted ' + paragraphs.length +
            (paragraphs.length === 1 ? ' line' : ' lines') + ' as Python.';
  if (truncated) {
    msg = 'Formatted the first part of the selection, then hit the highlighting ' +
          'budget. Run again on a smaller selection to finish.';
  }
  return ok(msg);
}

function clearCodeFormatting() {
  var paragraphs = selectedParagraphs();

  if (paragraphs === null) {
    return fail('Select the text to reset first, then run this again.');
  }
  if (!paragraphs.length) {
    return fail('That selection has no text paragraphs in it.');
  }

  paragraphs.forEach(function (para) {
    var stripped = stripLineNumber(para.getText());
    var text = para.editAsText();
    text.setText(stripped);

    var len = stripped.length;
    if (len > 0) {
      text.setFontFamily(0, len - 1, 'Arial');
      text.setFontSize(0, len - 1, 11);
      text.setForegroundColor(0, len - 1, '#000000');
      text.setItalic(0, len - 1, false);
      try {
        text.setBackgroundColor(0, len - 1, null);
      } catch (err) {
        text.setBackgroundColor(0, len - 1, '#FFFFFF');
      }
    }

    para.setLineSpacing(1.15);
    if (para.getType() === DocumentApp.ElementType.PARAGRAPH) {
      para.setIndentStart(0);
      para.setIndentFirstLine(0);
    }
  });

  return ok('Cleared formatting on ' + paragraphs.length +
            (paragraphs.length === 1 ? ' line.' : ' lines.'));
}

/* ----------------------------------------------------------------- utils --- */

/**
 * Menu entry points. Docs has no toast API, so a failure gets a modal alert and
 * a success is left to speak for itself (the document visibly changes).
 * The sidebar calls formatSelection/clearCodeFormatting directly and renders
 * the returned message inline instead.
 */
function menuFormatSelection() {
  var result = formatSelection();
  if (!result.ok) alertUser(result.message);
}

function menuClearCodeFormatting() {
  var result = clearCodeFormatting();
  if (!result.ok) alertUser(result.message);
}

function alertUser(message) {
  var ui = DocumentApp.getUi();
  ui.alert('Python Format', message, ui.ButtonSet.OK);
}

function ok(message) {
  return { ok: true, message: message };
}

function fail(message) {
  return { ok: false, message: message };
}
