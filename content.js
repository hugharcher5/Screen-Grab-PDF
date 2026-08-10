(() => {
  const CONTENT_SCRIPT_VERSION = 4;

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
  globalThis.__scdKeydownGuard = handleAttachShortcutKeydown;
  globalThis.__scdPasteGuard = handleAttachShortcutPaste;

  chrome.runtime.onMessage.addListener(handleMessage);
  document.addEventListener("keydown", handleAttachShortcutKeydown, true);
  document.addEventListener("paste", handleAttachShortcutPaste, true);

  function handleMessage(message, _sender, sendResponse) {
    if (message?.type === "ping") {
      sendResponse({ ok: true, version: CONTENT_SCRIPT_VERSION });
      return false;
    }

    if (message?.type === "attach-pdf") {
      attachPdfToChat(message)
        .then((result) => sendResponse({ ok: true, ...result }))
        .catch((error) => {
          sendResponse({ ok: false, error: error?.message || String(error) });
        });
      return true;
    }

    return false;
  }

  function handleAttachShortcutKeydown(event) {
    if (!isAttachShortcut(event) || !detectPlatform()) {
      return;
    }
    // Stop browser "paste without formatting" / page paste handlers on Ctrl/Cmd+Shift+V.
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }

  function handleAttachShortcutPaste(event) {
    if (!detectPlatform()) {
      return;
    }
    // Only block Shift+paste (Ctrl/Cmd+Shift+V). Normal Ctrl/Cmd+V must still work.
    if (!event.shiftKey) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }

  function isAttachShortcut(event) {
    const key = event.key || "";
    const code = event.code || "";
    const isV = key === "v" || key === "V" || code === "KeyV";
    return Boolean(isV && event.shiftKey && (event.ctrlKey || event.metaKey));
  }

  async function attachPdfToChat({ base64, arrayBuffer, filename }) {
    const platform = detectPlatform();
    if (!platform) {
      throw new Error("Unsupported page. Use ChatGPT, Claude, or Gemini.");
    }

    const pdfName = filename || "ai_screen_capture.pdf";
    const buffer = resolveArrayBuffer(arrayBuffer, base64);
    if (!buffer) {
      throw new Error("Missing PDF data.");
    }

    const file = new File([buffer], pdfName, {
      type: "application/pdf",
      lastModified: Date.now()
    });

    // 1) Click the site's attachment / upload control first.
    const attachButton = findAttachmentButton(platform);
    if (attachButton) {
      attachButton.click();
    }

    // 2) Locate the file input tied to that control (wait briefly if the menu mounts it).
    const fileInput = await waitForRelatedFileInput(platform, attachButton, 1200);
    if (!fileInput) {
      throw new Error("Could not find a file upload control on this chat page.");
    }

    // 3) Programmatic assign via DataTransfer.
    const attached = assignFileToInput(fileInput, file);
    focusChatComposer(platform);

    if (attached) {
      showToast("PDF Successfully Attached!");
      return { fallback: false };
    }

    // 4) Fallback: open the native file dialog for one-click selection (no clipboard paste).
    try {
      fileInput.click();
    } catch (_error) {
      // If click is blocked, the earlier button click may already have opened a picker.
    }

    showToast("Choose ai_screen_capture.pdf in the file dialog…");
    return { fallback: true };
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

  function resolveArrayBuffer(arrayBuffer, base64) {
    if (arrayBuffer instanceof ArrayBuffer) {
      return arrayBuffer;
    }
    if (arrayBuffer?.buffer instanceof ArrayBuffer) {
      return arrayBuffer.buffer;
    }
    if (Array.isArray(arrayBuffer)) {
      return Uint8Array.from(arrayBuffer).buffer;
    }
    if (typeof base64 === "string" && base64) {
      return base64ToArrayBuffer(base64);
    }
    return null;
  }

  function base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  function findAttachmentButton(platform) {
    const selectorsByPlatform = {
      gemini: [
        'button[aria-label*="Upload files" i]',
        'button[aria-label*="Upload file" i]',
        'button[aria-label*="Upload" i]',
        'button[aria-label*="Add files" i]',
        'button[aria-label*="Add" i]',
        "uploader-file-picker button",
        "uploader-file-picker",
        "uploader-file-upload button",
        'button[aria-label*="Open upload file picker" i]',
        'button[aria-label*="Insert" i]'
      ],
      chatgpt: [
        'button[aria-label*="Attach" i]',
        'button[aria-label*="Upload" i]',
        'button[aria-label*="Add photos & files" i]',
        'button[aria-label*="Add files" i]',
        'button[data-testid="composer-plus-btn"]'
      ],
      claude: [
        'button[aria-label*="Attach" i]',
        'button[aria-label*="Upload" i]',
        'button[aria-label*="Add files" i]'
      ]
    };

    for (const selector of selectorsByPlatform[platform] || []) {
      const el = document.querySelector(selector);
      if (!el || !isLikelyUploadControl(el)) {
        continue;
      }
      // Prefer a clickable child button when the match is a custom element wrapper.
      if (el.tagName && el.tagName.includes("-") && !/BUTTON|SUMMARY/i.test(el.tagName)) {
        const nestedButton = el.querySelector("button, [role='button']");
        if (nestedButton && isLikelyUploadControl(nestedButton)) {
          return nestedButton;
        }
      }
      return el;
    }

    return findGenericUploadButton();
  }

  function findGenericUploadButton() {
    const candidates = Array.from(
      document.querySelectorAll("button, div[role='button'], [role='button']")
    );
    return (
      candidates.find((el) => {
        const label = getControlLabel(el);
        return (
          (label.includes("upload") ||
            label.includes("attach") ||
            label.includes("add files") ||
            label.includes("add photos & files")) &&
          isLikelyUploadControl(el)
        );
      }) || null
    );
  }

  function isLikelyUploadControl(el) {
    const label = getControlLabel(el);
    if (!label) {
      return true;
    }
    return !(
      label.includes("preview") ||
      label.includes("gallery") ||
      label.includes("view image") ||
      label.includes("previous") ||
      label.includes("next image") ||
      label.includes("open image")
    );
  }

  function getControlLabel(el) {
    return [
      el.getAttribute("aria-label") || "",
      el.getAttribute("title") || "",
      el.getAttribute("data-tooltip") || "",
      el.textContent || ""
    ]
      .join(" ")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  async function waitForRelatedFileInput(platform, attachButton, timeoutMs) {
    const existing = findRelatedFileInput(platform, attachButton);
    if (existing) {
      return existing;
    }

    return new Promise((resolve) => {
      const observer = new MutationObserver(() => {
        const input = findRelatedFileInput(platform, attachButton);
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
        resolve(findRelatedFileInput(platform, attachButton));
      }, timeoutMs);
    });
  }

  function findRelatedFileInput(platform, attachButton) {
    const scopes = [];

    if (attachButton) {
      scopes.push(
        attachButton.closest("uploader-file-picker"),
        attachButton.closest("uploader-file-upload"),
        attachButton.closest("label"),
        attachButton.closest("form"),
        attachButton.parentElement,
        attachButton
      );
    }

    if (platform === "gemini") {
      scopes.push(
        document.querySelector("uploader-file-picker"),
        document.querySelector("uploader-file-upload")
      );
    }

    scopes.push(
      document.querySelector("form[data-type='unified-composer']"),
      document.querySelector('[data-testid="composer"]'),
      document.querySelector("main form"),
      document.body
    );

    for (const scope of scopes.filter(Boolean)) {
      const input =
        scope.matches?.('input[type="file"]')
          ? scope
          : scope.querySelector?.('input[type="file"]');
      if (input && !isImageOnlyInput(input)) {
        return input;
      }
    }

    // Gemini: direct known picker input.
    if (platform === "gemini") {
      const geminiInput =
        document.querySelector("uploader-file-picker input[type='file']") ||
        document.querySelector("uploader-file-upload input[type='file']") ||
        document.querySelector('input[type="file"]');
      if (geminiInput && !isImageOnlyInput(geminiInput)) {
        return geminiInput;
      }
    }

    return (
      Array.from(document.querySelectorAll('input[type="file"]')).find(
        (input) => !isImageOnlyInput(input)
      ) || null
    );
  }

  function isImageOnlyInput(input) {
    const accept = (input.getAttribute("accept") || "").toLowerCase().trim();
    if (!accept) {
      return false;
    }
    const hasPdf = accept.includes("pdf") || accept.includes(".pdf") || accept.includes("*/*");
    const hasImage = accept.includes("image") || accept.includes(".png") || accept.includes(".jpg");
    return hasImage && !hasPdf;
  }

  function assignFileToInput(fileInput, file) {
    try {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      fileInput.files = dataTransfer.files;

      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
      fileInput.dispatchEvent(new Event("input", { bubbles: true }));

      return Boolean(
        fileInput.files &&
          fileInput.files.length > 0 &&
          fileInput.files[0].name === file.name
      );
    } catch (error) {
      console.warn("Programmatic file attach failed:", error);
      return false;
    }
  }

  function focusChatComposer(platform) {
    const selectors = {
      chatgpt: [
        "#prompt-textarea",
        'div[contenteditable="true"]#prompt-textarea',
        'div[contenteditable="true"]',
        "textarea"
      ],
      claude: [
        'div[contenteditable="true"].ProseMirror',
        'div[contenteditable="true"]',
        "textarea"
      ],
      gemini: [
        'rich-textarea div[contenteditable="true"]',
        'div[contenteditable="true"][aria-label*="prompt" i]',
        'div[contenteditable="true"]',
        "textarea"
      ]
    };

    for (const selector of selectors[platform] || []) {
      const el = document.querySelector(selector);
      if (!el) {
        continue;
      }
      try {
        el.focus({ preventScroll: true });
        return;
      } catch (_error) {
        try {
          el.focus();
          return;
        } catch (_innerError) {
          // Try next selector.
        }
      }
    }
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
