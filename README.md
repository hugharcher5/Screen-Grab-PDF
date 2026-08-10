# Screen Capture to Downloads

Lightweight Manifest V3 Chrome extension that saves the **active browser tab** as a PDF (`ai_screen_capture.pdf`) directly to your **Downloads** folder — no print preview, no extra windows.

Default shortcut:

- **Windows / Linux:** `Ctrl+Shift+C`
- **macOS:** `Cmd+Shift+C`

## Load the extension in Chrome

1. Open Chrome and go to `chrome://extensions`.
2. Turn on **Developer mode** (top-right toggle).
3. Click **Load unpacked**.
4. Select this project folder (the one that contains `manifest.json`).
5. Confirm **Screen Capture to Downloads** appears in your extensions list.

## How to use

1. Open a normal website tab (`http://` or `https://`).
2. Press `Ctrl+Shift+C` (or `Cmd+Shift+C` on Mac), **or** click the extension icon and press **Capture Page as PDF Now**.
3. Chrome may briefly show a “debugging this browser” banner — that is expected while the PDF is generated via the Chrome DevTools Protocol.
4. A toast (**PDF Saved to Downloads!**) appears briefly in the top-right of the page.
5. Check your Downloads folder for `ai_screen_capture.pdf`.

Each capture **overwrites** the previous `ai_screen_capture.pdf` so Downloads does not fill with duplicates.

## Change the shortcut

1. Open the extension popup, or go to `chrome://extensions/shortcuts`.
2. Find **Screen Capture to Downloads**.
3. Rebind **Save active tab as PDF directly to Downloads**.

## How it works

1. The keyboard command (or popup button) asks the background service worker to capture the active tab.
2. The service worker attaches `chrome.debugger` to that tab.
3. It calls CDP `Page.printToPDF` with `printBackground: true` and `preferCSSPageSize: true`.
4. The returned base64 PDF is downloaded with `chrome.downloads.download` as `ai_screen_capture.pdf` (`conflictAction: "overwrite"`).
5. The debugger is detached, and a short toast is injected into the page.

## Project files

| File | Purpose |
| --- | --- |
| `manifest.json` | MV3 extension config, permissions, command shortcut |
| `background.js` | Capture pipeline (debugger → PDF → Downloads → toast) |
| `popup.html` / `popup.js` / `popup.css` | Status UI, shortcut help, manual capture button |

## Notes

- Chrome pages such as `chrome://…`, the Chrome Web Store, and some other restricted URLs cannot be captured.
- The `debugger` permission is required for silent `Page.printToPDF` without opening a print dialog.
