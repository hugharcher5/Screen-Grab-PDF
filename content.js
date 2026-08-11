(() => {
  const CONTENT_SCRIPT_VERSION = 7;

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

  /**
   * Gemini does not keep a stable light-DOM file input.
   * Flow: open "Upload & tools" menu → click "Files" / "Upload from computer"
   * (that click opens the OS file dialog). Also try a direct input click if one exists.
   */
  async function triggerGeminiPicker() {
    const existingInput = findFileInput();
    if (existingInput) {
      existingInput.click();
      return true;
    }

    const menuButton = findGeminiUploadMenuButton();
    if (!menuButton) {
      return false;
    }

    menuButton.click();

    const menuItem = await waitForElement(findGeminiUploadMenuItem, 2000);
    if (menuItem) {
      menuItem.click();

      // Some builds create the input during the same click that opens the OS dialog.
      const createdInput = await waitForFileInput(600, findFileInput);
      if (createdInput) {
        createdInput.click();
      }
      return true;
    }

    const inputAfterMenu = await waitForFileInput(1000, findFileInput);
    if (inputAfterMenu) {
      inputAfterMenu.click();
      return true;
    }

    return false;
  }

  function findGeminiUploadMenuButton() {
    const selectors = [
      'button[aria-label="Upload & tools"]',
      '[aria-label="Upload & tools"]',
      'gem-icon-button[aria-label="Upload & tools"]',
      'gem-icon-button[arialabel="Upload & tools"]',
      'button[aria-label="Open upload file menu"]',
      '[aria-label="Open upload file menu"]',
      'button[aria-label*="upload file menu" i]',
      'button[aria-label*="Upload & tools" i]',
      'button[aria-label*="Upload files" i]',
      'button[aria-label*="Upload" i]'
    ];

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el && isVisible(el)) {
        return clickableHost(el);
      }
    }

    return findClickableByLabel([
      /^upload\s*&\s*tools$/i,
      /open upload file menu/i,
      /^upload files$/i,
      /^upload$/i
    ]);
  }

  function findGeminiUploadMenuItem() {
    const selectors = [
      'button[aria-label*="Upload from computer" i]',
      '[role="menuitem"][aria-label*="Upload from computer" i]',
      '[role="menuitem"][aria-label*="Files" i]',
      'button[aria-label*="Files" i]',
      '[role="menuitem"]',
      'button'
    ];

    for (const selector of selectors) {
      for (const el of document.querySelectorAll(selector)) {
        const label = getLabel(el);
        if (
          /upload from computer/i.test(label) ||
          /^files$/i.test(label) ||
          /upload files/i.test(label)
        ) {
          if (isVisible(el)) {
            return clickableHost(el);
          }
        }
      }
    }

    return findClickableByLabel([
      /upload from computer/i,
      /^files$/i,
      /^upload files$/i
    ]);
  }

  function findFileInput() {
    const preferred =
      document.querySelector("uploader-file-picker input[type='file']") ||
      document.querySelector("uploader-file-upload input[type='file']") ||
      document.querySelector("images-files-uploader input[type='file']") ||
      document.querySelector('input[type="file"]');

    if (preferred) {
      return preferred;
    }

    const all = document.querySelectorAll('input[type="file"]');
    if (all.length > 0) {
      return all[0];
    }

    return queryDeepFileInput(document);
  }

  function queryDeepFileInput(root) {
    if (!root?.querySelectorAll) {
      return null;
    }

    const direct = root.querySelector('input[type="file"]');
    if (direct) {
      return direct;
    }

    for (const el of root.querySelectorAll("*")) {
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
    const existingInput = findFileInput();
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

    const input = await waitForFileInput(800, findFileInput);
    if (input) {
      input.click();
      return true;
    }

    const menuItem = findClickableByLabel([
      /upload from computer/i,
      /add photos & files/i,
      /upload/i,
      /attach/i
    ]);
    if (menuItem) {
      menuItem.click();
      const nestedInput = await waitForFileInput(800, findFileInput);
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

    const input = await waitForFileInput(800, findFileInput);
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
        return clickableHost(el);
      }
    }
    return null;
  }

  function findClickableByLabel(patterns) {
    const candidates = document.querySelectorAll(
      'button, [role="button"], [role="menuitem"], gem-icon-button, [aria-label], [arialabel]'
    );

    for (const el of candidates) {
      const label = getLabel(el);
      if (!label || !isVisible(el)) {
        continue;
      }
      if (patterns.some((pattern) => pattern.test(label))) {
        return clickableHost(el);
      }
    }
    return null;
  }

  function getLabel(el) {
    return [
      el.getAttribute("aria-label") || "",
      el.getAttribute("arialabel") || "",
      el.getAttribute("title") || "",
      el.textContent || ""
    ]
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function clickableHost(el) {
    if (!el) {
      return null;
    }
    if (el.tagName && el.tagName.includes("-")) {
      const nested = el.querySelector?.("button, [role='button']");
      if (nested) {
        return nested;
      }
    }
    return el;
  }

  function isVisible(el) {
    if (!el) {
      return false;
    }
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") {
      return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0 || rect.height > 0 || el.getAttribute("aria-hidden") === "false";
  }

  function waitForElement(finder, timeoutMs) {
    const existing = finder();
    if (existing) {
      return Promise.resolve(existing);
    }

    return new Promise((resolve) => {
      const observer = new MutationObserver(() => {
        const el = finder();
        if (el) {
          observer.disconnect();
          clearTimeout(timer);
          resolve(el);
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

  function waitForFileInput(timeoutMs, finder) {
    return waitForElement(finder, timeoutMs);
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
