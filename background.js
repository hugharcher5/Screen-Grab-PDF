const CAPTURE_COMMAND = "capture-pdf-to-downloads";
const ATTACH_COMMAND = "attach-pdf-to-chat";
const PDF_FILENAME = "ai_screen_capture.pdf";
const DEBUGGER_VERSION = "1.3";
const STORAGE_KEY = "lastCapturedPdf";
const AI_HOST_PATTERNS = [
  /^https:\/\/chatgpt\.com\//i,
  /^https:\/\/claude\.ai\//i,
  /^https:\/\/gemini\.google\.com\//i
];

/** In-memory cache for the current service-worker lifetime. */
let lastPdfCache = null;

chrome.commands.onCommand.addListener((command) => {
  if (command === CAPTURE_COMMAND) {
    captureActiveTabAsPdf().catch((error) => {
      console.error("PDF capture failed:", error);
    });
    return;
  }

  if (command === ATTACH_COMMAND) {
    attachPdfToActiveChat().catch((error) => {
      console.error("PDF attach failed:", error);
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

  if (message?.type === "attach-pdf-now") {
    attachPdfToActiveChat()
      .then(() => sendResponse({ ok: true }))
      .catch((error) => {
        console.error("PDF attach failed:", error);
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

    await storeCapturedPdf(result.data, PDF_FILENAME);
    await showToast(tab.id, "PDF Saved to Downloads!");
  } finally {
    if (attached) {
      await detachDebugger(debuggee);
    }
  }
}

async function attachPdfToActiveChat() {
  const tab = await getActiveTab();
  if (!tab?.id) {
    throw new Error("No active tab found.");
  }
  if (!isSupportedAiChatUrl(tab.url)) {
    throw new Error("Open a ChatGPT, Claude, or Gemini chat tab first.");
  }

  const downloadItem = await findLatestPdfDownload();
  const pdf = await resolvePdfBytes(downloadItem);

  if (!pdf?.base64) {
    throw new Error("No captured PDF found. Press Ctrl+Shift+C (Cmd+Shift+C on Mac) first.");
  }

  await ensureContentScript(tab.id);

  const response = await chrome.tabs.sendMessage(tab.id, {
    type: "attach-pdf",
    filename: pdf.filename || PDF_FILENAME,
    base64: pdf.base64
  });

  if (!response?.ok) {
    throw new Error(response?.error || "Could not attach PDF to this chat.");
  }
}

async function findLatestPdfDownload() {
  const named = await chrome.downloads.search({
    filenameRegex: "(^|[/\\\\])ai_screen_capture\\.pdf$",
    state: "complete",
    exists: true,
    orderBy: ["-startTime"],
    limit: 1
  });
  if (named[0]) {
    return named[0];
  }

  const recentPdf = await chrome.downloads.search({
    mime: "application/pdf",
    state: "complete",
    exists: true,
    orderBy: ["-startTime"],
    limit: 1
  });
  return recentPdf[0] || null;
}

/**
 * Chrome extensions cannot read arbitrary files from the Downloads folder path.
 * We resolve the latest download metadata, then load PDF bytes from:
 * 1) in-memory / extension storage cache written during capture
 * 2) the download item's original data: URL, when Chrome still exposes it
 */
async function resolvePdfBytes(downloadItem) {
  const cached = await loadCapturedPdf();
  if (cached?.base64) {
    return {
      base64: cached.base64,
      filename: basename(downloadItem?.filename) || cached.filename || PDF_FILENAME
    };
  }

  const url = downloadItem?.url || "";
  if (url.startsWith("data:application/pdf;base64,")) {
    return {
      base64: url.slice("data:application/pdf;base64,".length),
      filename: basename(downloadItem.filename) || PDF_FILENAME
    };
  }

  return null;
}

async function storeCapturedPdf(base64, filename) {
  lastPdfCache = {
    base64,
    filename,
    savedAt: Date.now()
  };

  try {
    await chrome.storage.session.set({ [STORAGE_KEY]: lastPdfCache });
  } catch (error) {
    console.warn("Could not cache PDF in session storage:", error);
  }

  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: lastPdfCache });
  } catch (error) {
    console.warn("Could not cache PDF in local storage (file may be large):", error);
  }
}

async function loadCapturedPdf() {
  if (lastPdfCache?.base64) {
    return lastPdfCache;
  }

  try {
    const session = await chrome.storage.session.get(STORAGE_KEY);
    if (session[STORAGE_KEY]?.base64) {
      lastPdfCache = session[STORAGE_KEY];
      return lastPdfCache;
    }
  } catch (error) {
    console.warn("Could not read session PDF cache:", error);
  }

  try {
    const local = await chrome.storage.local.get(STORAGE_KEY);
    if (local[STORAGE_KEY]?.base64) {
      lastPdfCache = local[STORAGE_KEY];
      return lastPdfCache;
    }
  } catch (error) {
    console.warn("Could not read local PDF cache:", error);
  }

  return null;
}

async function ensureContentScript(tabId) {
  // Always re-inject so attach-logic updates replace a stale content.js in the tab.
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content.js"]
  });
}

function getActiveTab() {
  return chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => tabs[0]);
}

function isHttpUrl(url) {
  return typeof url === "string" && (url.startsWith("http://") || url.startsWith("https://"));
}

function isSupportedAiChatUrl(url) {
  return typeof url === "string" && AI_HOST_PATTERNS.some((pattern) => pattern.test(url));
}

function basename(path) {
  if (!path || typeof path !== "string") {
    return "";
  }
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] || "";
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
      func: injectToast,
      args: [message]
    });
  } catch (error) {
    console.warn("Could not show toast on page:", error);
  }
}

function injectToast(message) {
  const existing = document.getElementById("scd-pdf-toast");
  if (existing) {
    existing.remove();
  }

  const toast = document.createElement("div");
  toast.id = "scd-pdf-toast";
  toast.textContent = message;
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
