const COMMAND_ID = "capture-pdf-to-downloads";
const PDF_FILENAME = "ai_screen_capture.pdf";
const DEBUGGER_VERSION = "1.3";

chrome.commands.onCommand.addListener((command) => {
  if (command === COMMAND_ID) {
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
  if (!isHttpUrl(tab.url)) {
    throw new Error("This page cannot be captured. Open a normal website tab first.");
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

    await showSavedToast(tab.id);
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
      // Ignore "not attached" and similar cleanup races.
      void chrome.runtime.lastError;
      resolve();
    });
  });
}

async function showSavedToast(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: injectToast
    });
  } catch (error) {
    console.warn("Could not show toast on page:", error);
  }
}

function injectToast() {
  const existing = document.getElementById("scd-pdf-toast");
  if (existing) {
    existing.remove();
  }

  const toast = document.createElement("div");
  toast.id = "scd-pdf-toast";
  toast.textContent = "PDF Saved to Downloads!";
  Object.assign(toast.style, {
    position: "fixed",
    top: "16px",
    right: "16px",
    zIndex: "2147483647",
    padding: "10px 14px",
    borderRadius: "8px",
    background: "rgba(22, 27, 34, 0.92)",
    color: "#f0f3f6",
    fontFamily: "Segoe UI, system-ui, sans-serif",
    fontSize: "13px",
    fontWeight: "600",
    boxShadow: "0 8px 24px rgba(0, 0, 0, 0.28)",
    opacity: "0",
    transform: "translateY(-6px)",
    transition: "opacity 180ms ease, transform 180ms ease",
    pointerEvents: "none"
  });

  document.documentElement.appendChild(toast);
  requestAnimationFrame(() => {
    toast.style.opacity = "1";
    toast.style.transform = "translateY(0)";
  });

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(-6px)";
    setTimeout(() => toast.remove(), 220);
  }, 2000);
}
