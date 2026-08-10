(() => {
  const CONTENT_SCRIPT_VERSION = 6;

  if (globalThis.__scdContentVersion === CONTENT_SCRIPT_VERSION) {
    return;
  }

  if (globalThis.__scdOnMessage) {
    chrome.runtime.onMessage.removeListener(globalThis.__scdOnMessage);
  }
  if (globalThis.__scdKeydownGuard) {
    document.removeEventListener("keydown", globalThis.__scdKeydownGuard, true);
  }
  if (globalThis.__scdPasteGuard) {
    document.removeEventListener("paste", globalThis.__scdPasteGuard, true);
  }

  globalThis.__scdContentVersion = CONTENT_SCRIPT_VERSION;
  globalThis.__scdOnMessage = handleMessage;
  globalThis.__scdKeydownGuard = null;
  globalThis.__scdPasteGuard = null;

  chrome.runtime.onMessage.addListener(handleMessage);

  function handleMessage(message, _sender, sendResponse) {
    if (message?.type === "ping") {
      sendResponse({ ok: true, version: CONTENT_SCRIPT_VERSION });
      return false;
    }

    if (message?.type === "open-file-picker") {
      openNativeFilePicker()
        .then((result) => sendResponse({ ok: true, ...result }))
        .catch((error) => {
          sendResponse({ ok: false, error: error?.message || String(error) });
        });
      return true;
    }

    return false;
  }

  async function openNativeFilePicker() {
    const platform = detectPlatform();
    if (!platform) {
      throw new Error("Unsupported page. Use ChatGPT, Claude, or Gemini.");
    }

    const opened = await triggerSiteFilePicker(platform);
    if (!opened) {
      throw new Error("Could not open the file picker on this chat page.");
    }

    showToast("Select ai_screen_capture.pdf and press Enter");
    return { opened: true };
  }

  function detectPlatform() {
    const host = location.hostname;
    if (host === "chatgpt.com" || host.endsWith(".chatgpt.com")) {
      return "chatgpt";
    }
    if (host === "claude.ai" || host.endsWith(".claude.ai")) {
      return "claude";
    }
    if (host === "gemini.google.com" || host.endsWith(".gemini.google.com")) {
      return "gemini";
    }
    return null;
  }

  async function triggerSiteFilePicker(platform) {
    if (platform === "gemini") {
      return triggerGeminiPicker();
    }
    if (platform === "chatgpt") {
      return triggerChatGptPicker();
    }
    if (platform === "claude") {
      return triggerClaudePicker();
    }
    return false;
  }

  async function triggerGeminiPicker() {
    // Click the hidden file input directly — do not click parent button wrappers
    // (those open image/menu UI instead of the OS file dialog).
    const input = findGeminiFileInput();
    if (!input) {
      return false;
    }

    input.click();
    return true;
  }

  function findGeminiFileInput() {
    const preferred =
      document.querySelector("uploader-file-picker input[type='file']") ||
      document.querySelector("uploader-file-upload input[type='file']") ||
      queryFileInputInShadowHosts([
        "uploader-file-picker",
        "uploader-file-upload",
        "file-upload",
        "input-container"
      ]);

    if (preferred) {
      return preferred;
    }

    const single = document.querySelector('input[type="file"]');
    if (single) {
      return single;
    }

    const all = document.querySelectorAll('input[type="file"]');
    if (all.length > 0) {
      return all[0];
    }

    return queryDeepFileInput(document);
  }

  function queryFileInputInShadowHosts(selectors) {
    for (const selector of selectors) {
      for (const host of document.querySelectorAll(selector)) {
        const input =
          host.querySelector?.('input[type="file"]') ||
          host.shadowRoot?.querySelector('input[type="file"]') ||
          queryDeepFileInput(host.shadowRoot || host);
        if (input) {
          return input;
        }
      }
    }
    return null;
  }

  function queryDeepFileInput(root) {
    if (!root) {
      return null;
    }

    const direct = root.querySelector?.('input[type="file"]');
    if (direct) {
      return direct;
    }

    const allElements = root.querySelectorAll?.("*") || [];
    for (const el of allElements) {
      if (el.shadowRoot) {
        const nested = queryDeepFileInput(el.shadowRoot);
        if (nested) {
          return nested;
        }
      }
    }
    return null;
  }

  async function triggerChatGptPicker() {
    const existingInput = document.querySelector('form input[type="file"], input[type="file"]');
    if (existingInput) {
      existingInput.click();
      return true;
    }

    const button = queryFirst([
      'button[aria-label*="Attach" i]',
      'button[aria-label*="Upload" i]',
      'button[aria-label*="Add photos & files" i]',
      'button[aria-label*="Add files" i]',
      'button[data-testid="composer-plus-btn"]'
    ]);

    if (!button) {
      return false;
    }

    button.click();

    const input = await waitForFileInput(800, () =>
      document.querySelector('form input[type="file"], input[type="file"]')
    );

    if (input) {
      input.click();
      return true;
    }

    // Menu opened; try a nested "Upload"/"Attach from computer" item.
    const menuItem = queryFirst([
      '[role="menuitem"] button[aria-label*="Upload" i]',
      '[role="menuitem"][aria-label*="Upload" i]',
      '[role="menuitem"][aria-label*="Attach" i]',
      'button[aria-label*="Upload from computer" i]',
      'div[role="menuitem"]'
    ]);
    if (menuItem && /upload|attach|file|computer/i.test(menuItem.textContent || menuItem.getAttribute("aria-label") || "")) {
      menuItem.click();
      const nestedInput = await waitForFileInput(800, () => document.querySelector('input[type="file"]'));
      if (nestedInput) {
        nestedInput.click();
      }
      return true;
    }

    return true;
  }

  async function triggerClaudePicker() {
    const button = queryFirst([
      'button[aria-label*="Attach" i]',
      'button[aria-label*="Upload" i]',
      'button[aria-label*="Add files" i]'
    ]);

    if (button) {
      button.click();
    }

    const input = await waitForFileInput(800, () => document.querySelector('input[type="file"]'));
    if (input) {
      input.click();
      return true;
    }

    return Boolean(button);
  }

  function queryFirst(selectors) {
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el) {
        return el;
      }
    }
    return null;
  }

  function waitForFileInput(timeoutMs, finder) {
    const existing = finder();
    if (existing) {
      return Promise.resolve(existing);
    }

    return new Promise((resolve) => {
      const observer = new MutationObserver(() => {
        const input = finder();
        if (input) {
          observer.disconnect();
          clearTimeout(timer);
          resolve(input);
        }
      });

      observer.observe(document.documentElement, {
        childList: true,
        subtree: true
      });

      const timer = setTimeout(() => {
        observer.disconnect();
        resolve(finder());
      }, timeoutMs);
    });
  }

  function showToast(message) {
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
})();
