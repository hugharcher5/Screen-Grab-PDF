(() => {
  const CONTENT_SCRIPT_VERSION = 8;

  if (globalThis.__scdContentVersion === CONTENT_SCRIPT_VERSION) {
    return;
  }

  if (globalThis.__scdOnMessage) {
    chrome.runtime.onMessage.removeListener(globalThis.__scdOnMessage);
  }
  if (globalThis.__scdKeydownGuard) {
    document.removeEventListener("keydown", globalThis.__scdKeydownGuard, true);
  }

  globalThis.__scdContentVersion = CONTENT_SCRIPT_VERSION;
  globalThis.__scdOnMessage = handleMessage;
  globalThis.__scdKeydownGuard = handleAttachHotkey;

  chrome.runtime.onMessage.addListener(handleMessage);
  // Must handle the hotkey in-page so Chrome treats it as a real user gesture.
  // chrome.commands steals the key and breaks input[type=file].click().
  document.addEventListener("keydown", handleAttachHotkey, true);

  function handleMessage(message, _sender, sendResponse) {
    if (message?.type === "ping") {
      sendResponse({ ok: true, version: CONTENT_SCRIPT_VERSION });
      return false;
    }

    if (message?.type === "open-file-picker") {
      openNativeFilePicker({ fromUserGesture: false })
        .then((result) => sendResponse({ ok: true, ...result }))
        .catch((error) => {
          sendResponse({ ok: false, error: error?.message || String(error) });
        });
      return true;
    }

    return false;
  }

  function handleAttachHotkey(event) {
    if (!isAttachHotkey(event) || !detectPlatform()) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    openNativeFilePicker({ fromUserGesture: true }).catch((error) => {
      console.error("File picker open failed:", error);
      showToast(error?.message || "Could not open the file picker.");
    });
  }

  function isAttachHotkey(event) {
    const key = event.key || "";
    const code = event.code || "";
    const isA = key === "a" || key === "A" || code === "KeyA";
    return Boolean(isA && event.shiftKey && (event.ctrlKey || event.metaKey));
  }

  async function openNativeFilePicker({ fromUserGesture }) {
    const platform = detectPlatform();
    if (!platform) {
      throw new Error("Unsupported page. Use ChatGPT, Claude, or Gemini.");
    }

    const opened = await triggerSiteFilePicker(platform, fromUserGesture);
    if (!opened) {
      throw new Error(
        "Could not open the file picker. Click the + / Upload button once, then try Ctrl+Shift+A again."
      );
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

  async function triggerSiteFilePicker(platform, fromUserGesture) {
    if (platform === "gemini") {
      return triggerGeminiPicker(fromUserGesture);
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
   * Gemini: file input is created only after Upload & tools → Files.
   * The first clicks must happen inside a user-gesture turn (keydown).
   */
  async function triggerGeminiPicker(fromUserGesture) {
    const existingInput = findFileInput();
    if (existingInput) {
      existingInput.click();
      return true;
    }

    const menuButton = findGeminiUploadMenuButton();
    if (!menuButton) {
      console.warn("[SCD] Gemini upload menu button not found");
      return false;
    }

    // Synchronous click while user activation is alive.
    menuButton.click();

    const uploadItem = await waitForElement(findGeminiUploadMenuItem, fromUserGesture ? 1500 : 2500);
    if (uploadItem) {
      uploadItem.click();
      return true;
    }

    const inputAfterMenu = await waitForElement(findFileInput, 800);
    if (inputAfterMenu) {
      inputAfterMenu.click();
      return true;
    }

    console.warn("[SCD] Gemini upload menu opened but Files item not found");
    // Menu is open — still useful; user can click Files manually.
    showToast("Click “Files” / “Upload from computer” in the menu");
    return true;
  }

  function findGeminiUploadMenuButton() {
    const selectors = [
      'button[aria-label="Upload & tools"]',
      '[aria-label="Upload & tools"]',
      'gem-icon-button[aria-label="Upload & tools"]',
      'gem-icon-button[arialabel="Upload & tools"]',
      'button[aria-label="Open upload file menu"]',
      '[aria-label="Open upload file menu"]',
      'button[aria-label*="Upload & tools" i]',
      'button[aria-label*="upload file menu" i]',
      'button[aria-label*="Upload files" i]',
      'button[aria-label*="Open upload" i]',
      'button[aria-label="+"]',
      'button[aria-label="Plus"]',
      '[data-test-id="upload-menu-button"]',
      '[data-test-id="uploader-button"]'
    ];

    for (const selector of selectors) {
      try {
        const el = document.querySelector(selector);
        if (el) {
          return clickableHost(el);
        }
      } catch (_error) {
        // Invalid selector in older engines — ignore.
      }
    }

    return (
      findClickableByLabel([
        /upload\s*&\s*tools/i,
        /open upload file menu/i,
        /^upload files$/i,
        /^upload$/i
      ]) || findPlusLikeComposerButton()
    );
  }

  function findPlusLikeComposerButton() {
    const composer =
      document.querySelector("input-container, .input-area, rich-textarea, .text-input-field") ||
      document.querySelector("main") ||
      document.body;

    const buttons = composer.querySelectorAll("button, [role='button'], gem-icon-button");
    for (const el of buttons) {
      const label = getLabel(el);
      if (/upload|attach|add file|tools|\+/i.test(label)) {
        return clickableHost(el);
      }
    }
    return null;
  }

  function findGeminiUploadMenuItem() {
    for (const el of document.querySelectorAll(
      'button, [role="menuitem"], [role="button"], div[role="menuitem"], span[role="menuitem"]'
    )) {
      const label = getLabel(el);
      if (
        /upload from computer/i.test(label) ||
        /upload files/i.test(label) ||
        /^files$/i.test(label) ||
        /^file$/i.test(label)
      ) {
        return clickableHost(el);
      }
    }
    return null;
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

    const button =
      queryFirst([
        'button[aria-label*="Attach" i]',
        'button[aria-label*="Upload" i]',
        'button[aria-label*="Add photos & files" i]',
        'button[aria-label*="Add files" i]',
        'button[data-testid="composer-plus-btn"]'
      ]) || findClickableByLabel([/attach/i, /upload/i, /add photos & files/i]);

    if (!button) {
      return false;
    }

    button.click();

    const input = await waitForElement(findFileInput, 800);
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
      const nestedInput = await waitForElement(findFileInput, 800);
      if (nestedInput) {
        nestedInput.click();
      }
      return true;
    }

    return true;
  }

  async function triggerClaudePicker() {
    const button =
      queryFirst([
        'button[aria-label*="Attach" i]',
        'button[aria-label*="Upload" i]',
        'button[aria-label*="Add files" i]'
      ]) || findClickableByLabel([/attach/i, /upload/i]);

    if (button) {
      button.click();
    }

    const input = await waitForElement(findFileInput, 800);
    if (input) {
      input.click();
      return true;
    }

    return Boolean(button);
  }

  function queryFirst(selectors) {
    for (const selector of selectors) {
      try {
        const el = document.querySelector(selector);
        if (el) {
          return clickableHost(el);
        }
      } catch (_error) {
        // Ignore unsupported selector syntax.
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
      if (!label) {
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
      return el.querySelector("button, [role='button']") || el;
    }
    return el;
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
    }, 2500);
  }
})();
