# Screen Capture to Downloads

Lightweight Manifest V3 Chrome extension that saves the **active browser tab** as a PDF (`ai_screen_capture.pdf`) directly to your **Downloads** folder — no print preview, no extra windows.

Press **`Ctrl+Shift+C`** on any webpage (or **`Cmd+Shift+C`** on Mac) to instantly convert and save it as a PDF.

## Load the extension in Chrome

1. Open Chrome and go to `chrome://extensions`.
2. Turn on **Developer mode** (top-right toggle).
3. Click **Load unpacked**.
4. Select this project folder (the one that contains `manifest.json`).
5. Confirm **Screen Capture to Downloads** appears in your extensions list.
6. If you already had it loaded, click **Reload** after updates.

## How to use

1. Open a normal website tab (`http://` or `https://`).
2. Press **`Ctrl+Shift+C`** (Windows/Linux) or **`Cmd+Shift+C`** (Mac), **or** open the extension popup and click **Capture Page as PDF Now**.
3. Chrome may briefly show a “debugging this browser” banner — expected while the PDF is generated.
4. A toast appears: **PDF Saved to Downloads!**
5. Check your Downloads folder for `ai_screen_capture.pdf`.

Each capture **overwrites** the previous `ai_screen_capture.pdf` so Downloads does not fill with duplicates.

## Change the shortcut

1. Open the extension popup and click **Change shortcut in Chrome…**, or visit `chrome://extensions/shortcuts`.
2. Rebind **Save active tab as PDF directly to Downloads**.

## How it works

1. The keyboard command (or popup button) asks the background service worker to capture the active tab.
2. Restricted pages (`chrome://`, `edge://`, `about:`, etc.) are blocked with: **Cannot capture internal browser pages.**
3. On a normal webpage, the service worker attaches `chrome.debugger` and calls CDP `Page.printToPDF`.
4. The PDF is downloaded as `ai_screen_capture.pdf` with `conflictAction: "overwrite"`.
5. A short toast is injected into the page.

## Project files

| File | Purpose |
| --- | --- |
| `manifest.json` | MV3 config, permissions, capture shortcut |
| `background.js` | Debugger → PDF → Downloads pipeline |
| `content.js` | Floating toast helper |
| `popup.html` / `popup.js` / `popup.css` | Simple status UI + manual capture button |

## Notes

- Restricted browser pages cannot be captured.
- The `debugger` permission is required for silent PDF generation without a print dialog.
