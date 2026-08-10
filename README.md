# Screen Capture to Downloads

Lightweight Manifest V3 Chrome extension that:

1. Saves the **active browser tab** as `ai_screen_capture.pdf` to your **Downloads** folder (no print dialog).
2. Attaches that PDF into an open **ChatGPT**, **Claude**, or **Gemini** chat thread.

## Shortcuts

| Action | Windows / Linux | macOS |
| --- | --- | --- |
| Capture page as PDF | `Ctrl+Shift+C` | `Cmd+Shift+C` |
| Attach PDF to active AI chat | `Ctrl+Shift+V` | `Cmd+Shift+V` |

## Load the extension in Chrome

1. Open Chrome and go to `chrome://extensions`.
2. Turn on **Developer mode** (top-right toggle).
3. Click **Load unpacked**.
4. Select this project folder (the one that contains `manifest.json`).
5. Confirm **Screen Capture to Downloads** appears in your extensions list.
6. If you already had it loaded, click **Reload** after pulling Phase 2 changes.

## Complete workflow

1. Open any normal webpage (`http://` or `https://`).
2. Press **`Ctrl+Shift+C`** (or **`Cmd+Shift+C`** on Mac) to save the page as `ai_screen_capture.pdf` in Downloads.
3. Switch to your **ChatGPT** (`chatgpt.com`), **Claude** (`claude.ai`), or **Gemini** (`gemini.google.com`) tab — stay in the conversation you care about.
4. Press **`Ctrl+Shift+V`** (or **`Cmd+Shift+V`** on Mac) to attach `ai_screen_capture.pdf` to the active prompt composer.
5. Confirm the file chip/preview appears in the chat input, then send your message as usual.

You can also run both actions from the extension popup buttons.

## How to verify

- After capture: check Downloads for `ai_screen_capture.pdf` (each capture overwrites the previous file).
- After attach: the chat composer should show the attached PDF, and a toast should say **PDF Successfully Attached!**

## Change shortcuts

1. Open the extension popup and click **Change shortcuts in Chrome…**, or visit `chrome://extensions/shortcuts`.
2. Rebind:
   - **Save active tab as PDF directly to Downloads**
   - **Attach latest captured PDF to active AI chat window**

## How it works

### Capture (`Ctrl+Shift+C`)

1. Background service worker attaches `chrome.debugger` to the active tab.
2. Calls CDP `Page.printToPDF` (`printBackground`, `preferCSSPageSize`).
3. Downloads the PDF as `ai_screen_capture.pdf` with `conflictAction: "overwrite"`.
4. Caches the PDF bytes in extension storage so attach can reuse them.
5. Shows a short toast: **PDF Saved to Downloads!**

### Attach (`Ctrl+Shift+V`)

1. Background checks the active tab is ChatGPT, Claude, or Gemini.
2. Looks up the latest `ai_screen_capture.pdf` (or newest PDF) via `chrome.downloads.search`.
3. Loads the PDF bytes from the capture cache (Chrome extensions cannot read arbitrary files from the Downloads disk path).
4. Sends the PDF to `content.js`, which finds the page’s `input[type="file"]` (clicking an Attach/Upload control first if needed).
5. Builds a PDF `File` (`type: "application/pdf"`) via `DataTransfer`, assigns it to the composer file input (Gemini: `uploader-file-picker`), and dispatches bubbling `change`/`input` events.
6. Focuses the chat composer so media preview overlays are less likely to steal focus.
7. Shows toast: **PDF Successfully Attached!**
8. If the page blocks programmatic file assignment, falls back to clicking an Upload/Add control (or the file input) so the native file dialog opens.

## Project files

| File | Purpose |
| --- | --- |
| `manifest.json` | MV3 config, permissions, host permissions, commands |
| `background.js` | Capture + attach orchestration |
| `content.js` | ChatGPT / Claude / Gemini DOM file attachment |
| `popup.html` / `popup.js` / `popup.css` | Shortcut help + manual action buttons |

## Notes

- Capture works on normal websites; restricted pages like `chrome://…` cannot be printed this way.
- Attach only runs on `chatgpt.com`, `claude.ai`, and `gemini.google.com`.
- Capture first before attach in a session. If the extension was reloaded and storage was cleared, capture again.
- The `debugger` permission is required for silent PDF generation; Chrome may briefly show a debugging banner during capture.
- AI site DOMs change often; if attach stops working on one site, reload the extension and retry, or tell us which site broke.
