# Python Format for Google Docs — Chrome extension

A side panel that cleans up Python, syntax-highlights it, and puts it on your
clipboard as **styled rich text** — so pasting over your selection in Google
Docs replaces it with a formatted code block.

## Install (2 minutes)

Chrome has no store listing for this, so you load it unpacked. That is a
normal, supported Chrome feature — not developer-only.

1. Put the `python-format-extension` folder somewhere permanent.
   **Chrome loads it from this path every launch**, so don't leave it in
   Downloads or a temp folder, and don't delete it after installing.
2. Open **`chrome://extensions`** (type it in the address bar — links to
   `chrome://` URLs don't work).
3. Turn on **Developer mode** — toggle, top right.
4. Click **Load unpacked** — button, top left.
5. Select the `python-format-extension` folder itself (the one containing
   `manifest.json`), not a file inside it, and not a zip.
6. The card appears as *Python Format for Google Docs*. Pin it: click the
   puzzle-piece 🧩 in the toolbar, then the pin next to it.

To use it: click the toolbar icon on any page — the side panel opens on the
right.

### Updating

Edit the files, then hit the ↻ refresh icon on the extension's card at
`chrome://extensions`. Reload any open tabs.

### Removing

**Remove** on the card at `chrome://extensions`.

### Troubleshooting

| What you see | Fix |
| --- | --- |
| "Manifest file is missing or unreadable" | You selected the wrong folder. Pick the one directly containing `manifest.json`. |
| Nothing happens on click | Check the card for a red **Errors** button; open it for the message. |
| Extension vanished after restart | The folder moved or was deleted. Put it back and Load unpacked again. |
| "This extension may have been corrupted" | Re-run Load unpacked from the same folder. |

## Use

1. Select your code in the Google Doc and press <kbd>Ctrl</kbd>+<kbd>C</kbd>.
2. Open the side panel, paste into the box — or click **Read clipboard**.
3. Pick theme, font, size, and the toggles.
4. **Copy formatted (for Google Docs)** → go back to the doc, select the
   original code, and paste. It is replaced by the formatted block.

Other outputs:

- **Copy plain Python** — cleaned and runnable, no line numbers, no padding.
- **Download .py** — the same text as a file.

## What it fixes

Every run repairs what Docs does to code, and tells you what it found:
curly quotes → straight, en/em dashes → hyphens, non-breaking and zero-width
spaces → plain spaces, `…` → `...`, tabs → 4 spaces. It also strips trailing
whitespace, drops surrounding blank lines, and optionally removes the common
leading indent so a pasted fragment starts at column 0.

## Why it can't write into the doc directly

Google Docs renders document text onto a `<canvas>`. There is no DOM to read
the selection from and nothing to write formatting into. Any extension
claiming otherwise is either driving the clipboard (as this one does) or
relying on Docs internals that break without warning.

So the division of labour is:

| | Chrome extension | Apps Script add-on |
| --- | --- | --- |
| Writes into the doc | no — clipboard only | **yes, in place** |
| Steps to format | copy → paste → copy → paste | select → menu click |
| Install | Load unpacked, 2 min | paste 3 files into Apps Script, 5 min |
| Works outside Docs | yes, any Python | no |
| Clean plain-text / `.py` export | yes | no |

They share `python.js` / `Python.gs` byte-for-byte; `tests/test_integrity.js`
fails if they drift.

## Permissions

| Permission | Why |
| --- | --- |
| `sidePanel` | the UI |
| `clipboardRead` | the **Read clipboard** button only |
| `storage` | remembers your theme and toggles |

No `host_permissions`, no content scripts. The extension never reads the pages
you visit — including your documents. Everything runs locally; nothing is sent
anywhere.

## Files

| File | |
| --- | --- |
| `manifest.json` | MV3 manifest |
| `background.js` | service worker; opens the panel on icon click |
| `sidepanel.html/.css/.js` | the panel |
| `python.js` | shared tokenizer, themes, normalization |
| `format.js` | cleaning, highlighting, HTML and plain-text output |
| `icons/` | generated PNGs |
| `tests/` | Node harnesses, no browser needed |

## Tests

```bash
cd tests
node test_format.js      # 31 checks: cleaning, highlighting, HTML, escaping
node test_integrity.js   # 23 checks: manifest, asset refs, CSP, icons, drift
```

`test_format.js` asserts segments reconstruct each line exactly, so
highlighting can never drop or duplicate characters, and checks that `<`, `>`
and `&` in code are escaped rather than injected into the clipboard HTML.
