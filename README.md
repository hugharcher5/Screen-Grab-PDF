# Screen Capture to Downloads

Lightweight Manifest V3 Chrome extension that saves the **active browser tab** as a PDF (`ai_screen_capture.pdf`) directly to your **Downloads** folder, with no print preview and no extra windows.

Once installed and given a keyboard shortcut (step 3 below), press it on any webpage to instantly save the page as a PDF.

## Install it (about 2 minutes)

You don't need to know how to code, and you only do this once.

### Step 1: Download it

1. On this page, click the green **Code** button near the top, then click **Download ZIP**.
2. Open your **Downloads** folder and find `Screen-Grab-PDF-main.zip`.
3. Unzip it. On Windows, right-click the file and choose **Extract All**, then **Extract**. On a Mac, double-click it. You now have a folder called `Screen-Grab-PDF-main`.
4. Move that folder somewhere you won't delete it by accident, such as **Documents**. Chrome runs the extension from this folder, so if the folder is deleted, the extension stops working.

### Step 2: Add it to Chrome

1. Open Chrome, type `chrome://extensions` into the address bar and press **Enter**.
2. Turn on **Developer mode** using the switch in the top right corner.
3. Click **Load unpacked** in the top left.
4. Select the `Screen-Grab-PDF-main` folder and click **Select Folder**. If you see a second folder with the same name inside it, open that one and select it instead. The right folder contains a file called `manifest.json`.
5. **Screen Capture to Downloads** now appears in your list of extensions. You're done.
6. Optional: click the puzzle piece icon to the right of the address bar and click the pin next to the extension, so its button is always visible.

Chrome may occasionally show a message about extensions in developer mode. That's normal for extensions installed this way, and you can close it.

### Step 3: Set your keyboard shortcut

Chrome often leaves the shortcut switched off after installing, so do this once.

1. Type `chrome://extensions/shortcuts` into the address bar and press **Enter**. (Or click the extension's button and choose **Change shortcut in Chrome**.)
2. Find **Screen Capture to Downloads**.
3. Next to **Save active tab as PDF directly to Downloads**, click the **pencil** icon.
4. Press the keys you want to use, for example **Ctrl+Shift+C** on Windows or **Cmd+Shift+C** on a Mac. The box should now show your shortcut instead of "Not set".
5. Leave **Scope** on **In Chrome**.

If your shortcut doesn't work, Chrome or another extension is probably already using it. Pick a different one, such as **Ctrl+Shift+Y**, and try again. You can ignore the "Activate the extension" row.

### Updating to a newer version

Download the ZIP again, replace your old folder with the new one, then go to `chrome://extensions` and click the circular **Reload** arrow on the extension's card.

## How to use

1. Open a normal website tab (`http://` or `https://`).
2. Press the shortcut you set in step 3, **or** click the extension's button and choose **Capture Page as PDF Now**.
3. Chrome may briefly show a "debugging this browser" banner. That's expected while the PDF is generated.
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
