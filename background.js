const CAPTURE_COMMAND = "capture-pdf-to-downloads";
const PDF_FILENAME = "ai_screen_capture.pdf";
const DEBUGGER_VERSION = "1.3";
const INTERNAL_PAGE_MESSAGE = "Cannot capture internal browser pages.";

chrome.commands.onCommand.addListener((command) => {
  if (command === CAPTURE_COMMAND) {
    captureActiveTabAsPdf().catch((error) => {
      console.error("PDF capture failed:", error);
    });
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "capture-pdf-now") {
    captureActiveTabAsPdf()
      .then(() => sendResponse({ ok: true }))
      .catch((error) => {
        console.error("PDF capture failed:", error);
        sendResponse({ ok: false, error: error?.message || String(error) });
      });
    return true;
  }

  return false;
});

async function captureActiveTabAsPdf() {
  const tab = await getActiveTab();
  if (!tab?.id) {
    throw new Error("No active tab found.");
  }

  if (isBlockedCaptureUrl(tab.url) || !isHttpUrl(tab.url)) {
    await showToast(tab.id, INTERNAL_PAGE_MESSAGE);
    throw new Error(INTERNAL_PAGE_MESSAGE);
  }

  const debuggee = { tabId: tab.id };
  let attached = false;

  try {
    await attachDebugger(debuggee);
    attached = true;

    const result = await chrome.debugger.sendCommand(debuggee, "Page.printToPDF", {
      printBackground: true,
      preferCSSPageSize: true
    });

    if (!result?.data) {
      throw new Error("Page.printToPDF returned no data.");
    }

    const dataUrl = `data:application/pdf;base64,${result.data}`;

    await chrome.downloads.download({
      url: dataUrl,
      filename: PDF_FILENAME,
      conflictAction: "overwrite",
      saveAs: false
    });

    await showToast(tab.id, "PDF Saved to Downloads!");
  } finally {
    if (attached) {
      await detachDebugger(debuggee);
    }
  }
}

function getActiveTab() {
  return chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => tabs[0]);
}

function isHttpUrl(url) {
  return typeof url === "string" && (url.startsWith("http://") || url.startsWith("https://"));
}

function isBlockedCaptureUrl(url) {
  if (typeof url !== "string" || !url) {
    return true;
  }

  return (
    url.startsWith("chrome://") ||
    url.startsWith("chrome-extension://") ||
    url.startsWith("edge://") ||
    url.startsWith("about:") ||
    url.startsWith("https://chrome.google.com/webstore")
  );
}

function attachDebugger(debuggee) {
  return new Promise((resolve, reject) => {
    chrome.debugger.attach(debuggee, DEBUGGER_VERSION, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

function detachDebugger(debuggee) {
  return new Promise((resolve) => {
    chrome.debugger.detach(debuggee, () => {
      void chrome.runtime.lastError;
      resolve();
    });
  });
}

async function showToast(tabId, message) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"]
    });
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (text) => {
        if (typeof globalThis.__scdShowToast === "function") {
          globalThis.__scdShowToast(text);
        }
      },
      args: [message]
    });
  } catch (error) {
    // Expected on chrome:// and other restricted pages where scripts cannot be injected.
    console.warn("Could not show toast on page:", error);
  }
}
