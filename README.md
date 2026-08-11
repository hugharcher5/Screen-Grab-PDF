# Screen Capture to Downloads

Lightweight Manifest V3 Chrome extension that:

1. Saves the **active browser tab** as `ai_screen_capture.pdf` to your **Downloads** folder (no print dialog).
2. On ChatGPT / Claude / Gemini, opens the **native OS file picker** so you can quickly select that PDF.

## Shortcuts

| Action | Windows / Linux | macOS |
| --- | --- | --- |
| Capture page as PDF | `Ctrl+Shift+C` | `Cmd+Shift+C` |
| Open AI chat file picker | `Ctrl+Shift+A` | `Cmd+Shift+A` |

## Load the extension in Chrome

1. Open Chrome and go to `chrome://extensions`.
2. Turn on **Developer mode** (top-right toggle).
3. Click **Load unpacked**.
4. Select this project folder (the one that contains `manifest.json`).
5. Confirm **Screen Capture to Downloads** appears in your extensions list.
6. If you already had it loaded, click **Reload** after updates.
7. Hard-refresh any open ChatGPT / Claude / Gemini tabs after reloading the extension.

## Complete workflow

1. Open any normal webpage (`http://` or `https://`).
2. Press **`Ctrl+Shift+C`** (or **`Cmd+Shift+C`** on Mac) to save the page as `ai_screen_capture.pdf` in Downloads.
3. Switch to your **ChatGPT** (`chatgpt.com`), **Claude** (`claude.ai`), or **Gemini** (`gemini.google.com`) tab.
4. Press **`Ctrl+Shift+A`** (or **`Cmd+Shift+A`** on Mac) **while focused on that chat page** to open the native file selection dialog.
5. Choose **`ai_screen_capture.pdf`** (often already focused in Downloads) and press **Enter**.

## How it works

### Capture (`Ctrl+Shift+C`)

1. Background service worker attaches `chrome.debugger` to the active tab.
2. Calls CDP `Page.printToPDF`.
3. Downloads `ai_screen_capture.pdf` with `conflictAction: "overwrite"`.

### Attach / file picker (`Ctrl+Shift+A`)

1. The shortcut is handled **in the page content script** (not via `chrome.commands`), so Chrome still treats it as a real user gesture — required to open `input[type=file]` dialogs.
2. On Gemini it clicks **Upload & tools**, then **Files** / **Upload from computer**.
3. On ChatGPT / Claude it clicks Attach/Upload or the hidden file input.
4. The OS file dialog opens — no DOM image scraping and no clipboard paste.

**Important:** Remove any old **Attach** shortcut at `chrome://extensions/shortcuts` if it still lists `Ctrl+Shift+A` for this extension. That old command binding steals the key and prevents the file dialog from opening.

## Project files

| File | Purpose |
| --- | --- |
| `manifest.json` | MV3 config, permissions, host permissions, commands |
| `background.js` | Capture + file-picker command orchestration |
| `content.js` | Site-specific native file picker trigger |
| `popup.html` / `popup.js` / `popup.css` | Shortcut help + manual action buttons |

## Notes

- Capture works on normal websites; restricted pages like `chrome://…` cannot be printed this way.
- File picker only runs on `chatgpt.com`, `claude.ai`, and `gemini.google.com`.
- The `debugger` permission is required for silent PDF generation; Chrome may briefly show a debugging banner during capture.
