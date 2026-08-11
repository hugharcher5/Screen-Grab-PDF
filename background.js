const CAPTURE_COMMAND = "capture-pdf-to-downloads";
const ATTACH_COMMAND = "attach-pdf-to-chat";
const PDF_FILENAME = "ai_screen_capture.pdf";
const DEBUGGER_VERSION = "1.3";
const AI_HOST_PATTERNS = [
  /^https:\/\/chatgpt\.com\//i,
  /^https:\/\/claude\.ai\//i,
  /^https:\/\/gemini\.google\.com\//i
];

chrome.commands.onCommand.addListener((command) => {
  if (command === CAPTURE_COMMAND) {
    captureActiveTabAsPdf().catch((error) => {
      console.error("PDF capture failed:", error);
    });
    return;
  }

  if (command === ATTACH_COMMAND) {
    openFilePickerOnActiveChat().catch((error) => {
      console.error("File picker open failed:", error);
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
    openFilePickerOnActiveChat()
      .then(() => sendResponse({ ok: true }))
      .catch((error) => {
        console.error("File picker open failed:", error);
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
    throw new Error(
      "Cannot capture Chrome internal pages. Please switch to a regular website tab (https://) and try again."
    );
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

/**
 * Phase 2: open the site's native OS file dialog so the user can
 * press Enter on ai_screen_capture.pdf. No DOM image/blob scraping.
 */
async function openFilePickerOnActiveChat() {
  const tab = await getActiveTab();
  if (!tab?.id) {
    throw new Error("No active tab found.");
  }
  if (!isSupportedAiChatUrl(tab.url)) {
    throw new Error("Open a ChatGPT, Claude, or Gemini chat tab first.");
  }

  // Gemini uses custom elements; run first in the page MAIN world.
  if (/gemini\.google\.com/i.test(tab.url || "")) {
    const openedInPage = await openGeminiFilePickerInMainWorld(tab.id);
    if (openedInPage) {
      await showToast(tab.id, "Select ai_screen_capture.pdf and press Enter");
      return;
    }
  }

  await ensureContentScript(tab.id);

  const response = await chrome.tabs.sendMessage(tab.id, {
    type: "open-file-picker"
  });

  if (!response?.ok) {
    throw new Error(response?.error || "Could not open the file picker.");
  }
}

async function openGeminiFilePickerInMainWorld(tabId) {
  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: () => {
        const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

        const labelOf = (el) =>
          [
            el.getAttribute("aria-label") || "",
            el.getAttribute("arialabel") || "",
            el.getAttribute("title") || "",
            el.textContent || ""
          ]
            .join(" ")
            .replace(/\s+/g, " ")
            .trim();

        const visible = (el) => {
          if (!el) {
            return false;
          }
          const style = window.getComputedStyle(el);
          if (style.display === "none" || style.visibility === "hidden") {
            return false;
          }
          const rect = el.getBoundingClientRect();
          return rect.width > 0 || rect.height > 0;
        };

        const clickable = (el) => {
          if (!el) {
            return null;
          }
          if (el.tagName && el.tagName.includes("-")) {
            return el.querySelector("button, [role='button']") || el;
          }
          return el;
        };

        const findInput = () => {
          return (
            document.querySelector("uploader-file-picker input[type='file']") ||
            document.querySelector("images-files-uploader input[type='file']") ||
            document.querySelector('input[type="file"]') ||
            document.querySelectorAll('input[type="file"]')[0] ||
            null
          );
        };

        const findMenuButton = () => {
          const selectors = [
            'button[aria-label="Upload & tools"]',
            '[aria-label="Upload & tools"]',
            'gem-icon-button[aria-label="Upload & tools"]',
            'gem-icon-button[arialabel="Upload & tools"]',
            'button[aria-label="Open upload file menu"]',
            '[aria-label="Open upload file menu"]',
            'button[aria-label*="upload file menu" i]',
            'button[aria-label*="Upload & tools" i]'
          ];
          for (const selector of selectors) {
            const el = document.querySelector(selector);
            if (el && visible(el)) {
              return clickable(el);
            }
          }
          for (const el of document.querySelectorAll(
            "button, [role='button'], gem-icon-button, [aria-label], [arialabel]"
          )) {
            const label = labelOf(el);
            if (
              visible(el) &&
              (/upload\s*&\s*tools/i.test(label) || /open upload file menu/i.test(label))
            ) {
              return clickable(el);
            }
          }
          return null;
        };

        const findUploadItem = () => {
          for (const el of document.querySelectorAll(
            'button, [role="menuitem"], [role="button"], div[role="menuitem"]'
          )) {
            const label = labelOf(el);
            if (
              visible(el) &&
              (/upload from computer/i.test(label) ||
                /^files$/i.test(label) ||
                /upload files/i.test(label))
            ) {
              return clickable(el);
            }
          }
          return null;
        };

        return (async () => {
          const existing = findInput();
          if (existing) {
            existing.click();
            return true;
          }

          const menuButton = findMenuButton();
          if (!menuButton) {
            return false;
          }
          menuButton.click();

          let uploadItem = null;
          for (let i = 0; i < 20; i += 1) {
            uploadItem = findUploadItem();
            if (uploadItem) {
              break;
            }
            await sleep(100);
          }

          if (uploadItem) {
            uploadItem.click();
            return true;
          }

          for (let i = 0; i < 10; i += 1) {
            const input = findInput();
            if (input) {
              input.click();
              return true;
            }
            await sleep(100);
          }

          return false;
        })();
      }
    });

    return Boolean(injection?.result);
  } catch (error) {
    console.warn("MAIN-world Gemini picker failed:", error);
    return false;
  }
}

async function ensureContentScript(tabId) {
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

function isSupportedAiChatUrl(url) {
  return typeof url === "string" && AI_HOST_PATTERNS.some((pattern) => pattern.test(url));
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
