# Python Format — Google Docs add-on

Select text in a Google Doc and restyle it in place as a Python code block:
monospace font, preserved indentation, syntax highlighting, shaded background,
optional line numbers.

## Why this is not a Chrome extension

Google Docs renders document text onto a `<canvas>`, not as DOM nodes. A Chrome
extension cannot read the selection reliably and **cannot write formatting back
into the document at all**. Apps Script runs inside Docs and has the real
document model, so that is what this uses.

## Install (5 minutes, no publishing needed)

1. Open the Google Doc you want this in.
2. **Extensions › Apps Script.** A new editor tab opens.
3. Delete the stub `Code.gs` contents.
4. Create and paste these files (the ⊕ next to *Files*):
   - `Code.gs` — paste `Code.gs`
   - `Python.gs` — **Script** file, paste `Python.gs`
   - `Sidebar.html` — **HTML** file, paste `Sidebar.html`
5. Optional: ⚙ **Project Settings › Show "appsscript.json"**, then paste
   `appsscript.json` over it. Skip this and Apps Script infers the scopes.
6. **Save** (💾), then **Run › onOpen** once and accept the authorization prompt.
   It will warn the app is unverified — that is expected for your own script;
   choose *Advanced › Go to <project> (unsafe)*.
7. Reload the Google Doc. A **Python Format** menu appears in the menu bar.

This is a *container-bound* script: it lives in that one document. To use it
across all your docs, create a standalone Apps Script project instead and use
**Deploy › Test deployments › Install** as an editor add-on. For a published
add-on, swap `createMenu('Python Format')` for `createAddonMenu()` in `onOpen`.

### Using `clasp` instead

```bash
npm i -g @google/clasp
clasp login
clasp create --type docs --title "Python Format"
clasp push
```

## Use

1. Select your code in the doc.
2. **Python Format › Format selection as Python**, or open the sidebar for options.

Sidebar options, remembered per user:

| Option | Default | Notes |
| --- | --- | --- |
| Theme | Light (GitHub) | also Dark, and Monochrome for printing |
| Font | Courier New | Courier New is always available; Roboto Mono needs adding to the doc's font list |
| Size | 10 pt | |
| Indent | 18 pt | left indent for the whole block |
| Shaded background | on | character highlight behind the code |
| Line numbers | off | prefixes `1 │ `; stripped and rewritten on reformat |
| Pad lines to equal width | off | trailing spaces so the shading forms a clean rectangle |

**Python Format › Clear code formatting** reverts a selection to Arial 11,
black, no highlight, and removes line-number prefixes.

## Behaviour worth knowing

- **Formatting is per paragraph.** Code is line-oriented, so selecting part of a
  line still formats the whole line.
- **Autocorrect damage is repaired** on every run: curly quotes → straight
  quotes, en/em dashes → hyphens, non-breaking and zero-width spaces → plain
  spaces, `…` → `...`, tabs → 4 spaces.
- **Turn off Tools › Preferences › Use smart quotes**, or Docs will re-mangle
  quotes the next time you type in the block.
- **Re-running is safe.** Line numbers are stripped before being reapplied, so
  formatting twice gives the same result as formatting once.
- **Multi-line strings are tracked.** A `"""docstring"""` spanning several
  paragraphs stays string-coloured throughout.
- **`editAsText().setText()` replaces a paragraph's content**, so any inline
  image, link or footnote inside a formatted paragraph is lost. Don't run it
  over prose that contains them.
- **Limits:** 500 lines per run, and a 6000-write highlighting budget, both to
  stay inside the 6-minute Apps Script execution cap. Larger blocks report how
  far they got — run again on the rest.
- Highlighting is a single-pass lexer, not a parser. It handles comments,
  strings (including escapes and triple quotes), numbers, keywords, builtins,
  decorators, `self`/`cls` and `def`/`class` names. It does not resolve scope,
  so a variable named `list` is coloured as the builtin.

## Tests

The logic is tested outside Apps Script with a mocked `DocumentApp`. The mock
asserts every text-range write is in bounds, which is what catches Apps
Script's *inclusive* end-offset convention (`setForegroundColor(start,
endInclusive, colour)`).

```bash
cd tests
node test_tokenizer.js   # 54 checks: tokenizer offsets, normalization, themes
node test_docs.js        # 31 checks: the full mutation path
```

`test_docs.js` also prints an ANSI approximation of the formatted block.

## Files

| File | |
| --- | --- |
| `Code.gs` | menu, sidebar wiring, selection handling, the Docs mutation |
| `Python.gs` | tokenizer, themes, text normalization — no `DocumentApp` calls |
| `Sidebar.html` | options panel |
| `appsscript.json` | manifest; `documents.currentonly` scope |
| `tests/` | Node test harnesses with a mocked Apps Script runtime |
