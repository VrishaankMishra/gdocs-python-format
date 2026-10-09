# Google Docs Python formatting

Two tools for getting Python into a Google Doc as a readable code block —
monospace, preserved indentation, syntax highlighting, shaded background —
instead of Arial 11 with the indentation collapsed and the quotes curled.

## Which one

| | `apps-script-addon/` | `chrome-extension/` |
| --- | --- | --- |
| Formats **in place** in the doc | **yes** | no — clipboard only |
| Steps | select → menu click | copy → paste → copy → paste |
| Install | paste 3 files into Apps Script (~5 min) | Load unpacked (~2 min) |
| Works on Python outside Docs | no | yes |
| Plain-text / `.py` export | no | yes |

Use the **add-on** for everyday writing in Docs. Use the **extension** when you
want a cleaned, runnable copy of a snippet, or when you are working outside
Docs. Each directory has its own README with install steps.

## Why the extension cannot write into the doc

Google Docs renders document text onto a `<canvas>`. There is no DOM holding
the text, so an extension cannot read the selection reliably and cannot write
formatting back at all. Apps Script runs inside Docs and has the real document
model, which is why in-place formatting lives there.

The extension puts styled rich text on the clipboard instead, so a single paste
over the selection achieves the same result with one extra keystroke.

## What both tools repair

Docs autocorrect silently breaks code. Every run fixes curly quotes → straight,
en/em dashes → hyphens, non-breaking and zero-width spaces → plain spaces,
`…` → `...`, tabs → 4 spaces, and strips trailing whitespace. The extension also
reports what it found.

Turn off **Tools › Preferences › Use smart quotes** in the doc, or Docs will
re-break the quotes as soon as you type in the block again.

## Shared tokenizer

`apps-script-addon/Python.gs` and `chrome-extension/python.js` hold the same
lexer, themes and text normalization. Apps Script has no module system, so the
file is shared **by copy**: `python.js` is `Python.gs` verbatim plus an export
footer. `chrome-extension/tests/test_integrity.js` fails if they drift.

After editing the tokenizer:

```sh
cp apps-script-addon/Python.gs chrome-extension/python.js
# re-append the export footer (see the end of python.js in git history)
./run-tests.sh
```

Highlighting is a single-pass lexer, not a parser. It handles comments, strings
(escapes and triple quotes spanning lines), numbers, keywords, builtins,
decorators, `self`/`cls` and `def`/`class` names. It does not resolve scope, so
a variable named `list` is coloured as the builtin.

## Tests

```sh
./run-tests.sh
```

139 checks, Node only — no browser, no network, no Google account.

| Suite | Covers |
| --- | --- |
| `apps-script-addon/tests/test_tokenizer.js` | token offsets, normalization, theme completeness |
| `apps-script-addon/tests/test_docs.js` | the full Docs mutation path against a mocked `DocumentApp` |
| `chrome-extension/tests/test_format.js` | cleaning, highlighting, clipboard HTML, escaping |
| `chrome-extension/tests/test_integrity.js` | manifest, asset references, CSP, icons, tokenizer drift |

Two assertions carry most of the weight:

- `test_docs.js` checks every text-range write is in bounds, which catches Apps
  Script's *inclusive* end-offset convention
  (`setForegroundColor(start, endInclusive, colour)`).
- `test_format.js` checks highlight segments reconstruct each line exactly, so
  highlighting can never drop or duplicate characters, and that `<`, `>` and `&`
  in code are escaped rather than injected into the clipboard HTML.
