(() => {
  const CONTENT_SCRIPT_VERSION = 3;

  if (globalThis.__scdContentVersion === CONTENT_SCRIPT_VERSION) {
    return;
  }

  if (globalThis.__scdOnMessage) {
    chrome.runtime.onMessage.removeListener(globalThis.__scdOnMessage);
  }

  globalThis.__scdContentVersion = CONTENT_SCRIPT_VERSION;
  globalThis.__scdOnMessage = handleMessage;
  chrome.runtime.onMessage.addListener(handleMessage);

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

  async function attachPdfToChat({ base64, filename }) {
    if (!base64) {
      throw new Error("Missing PDF data.");
    }

    const platform = detectPlatform();
    if (!platform) {
      throw new Error("Unsupported page. Use ChatGPT, Claude, or Gemini.");
    }

    // Close stray media/preview overlays so hotkeys don't re-open them.
    dismissPreviewOverlays();

    const pdfName = filename || "ai_screen_capture.pdf";
    const blobData = base64ToBlob(base64, "application/pdf");
    const file = new File([blobData], pdfName, {
      type: "application/pdf",
      lastModified: Date.now()
    });

    const fileInput = findFileInput(platform);
    let attached = false;

    if (fileInput) {
      attached = assignFileToInput(fileInput, file);
    }

    if (!attached) {
      const openedNativeDialog = openNativeUploadFallback(platform, fileInput);
      focusChatComposer(platform);

      if (!openedNativeDialog) {
        throw new Error(
          "Could not attach the PDF automatically. Click Upload/Add and choose ai_screen_capture.pdf from Downloads."
        );
      }

      showToast("Choose ai_screen_capture.pdf in the file dialog…");
      return { fallback: true };
    }

    focusChatComposer(platform);
    showToast("PDF Successfully Attached!");
    return { fallback: false };
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

  function base64ToBlob(base64, mimeType) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mimeType });
  }

  function findFileInput(platform) {
    if (platform === "gemini") {
      const geminiInput =
        document.querySelector("uploader-file-picker input[type='file']") ||
        document.querySelector("uploader-file-upload input[type='file']") ||
        document.querySelector("uploader-file-picker")?.querySelector?.("input[type='file']") ||
        queryComposerFileInputs().find((input) => !isImageOnlyInput(input)) ||
        document.querySelector('input[type="file"]:not([accept*="image" i])') ||
        document.querySelector('input[type="file"]');

      if (geminiInput && !isImageOnlyInput(geminiInput)) {
        return geminiInput;
      }
    }

    if (platform === "chatgpt") {
      const chatgptInput =
        queryComposerFileInputs().find((input) => acceptsPdf(input)) ||
        document.querySelector('input[type="file"][accept*="pdf" i]') ||
        document.querySelector('form input[type="file"]') ||
        queryComposerFileInputs().find((input) => !isImageOnlyInput(input));

      if (chatgptInput && !isImageOnlyInput(chatgptInput)) {
        return chatgptInput;
      }
    }

    const ranked = Array.from(document.querySelectorAll('input[type="file"]'))
      .filter((input) => !isImageOnlyInput(input))
      .map((input, index) => ({ input, index, score: scoreFileInput(input, platform) }))
      .sort((a, b) => b.score - a.score || b.index - a.index);

    return ranked[0]?.input || null;
  }

  function queryComposerFileInputs() {
    const roots = [
      document.querySelector("uploader-file-picker"),
      document.querySelector("form[data-type='unified-composer']"),
      document.querySelector('[data-testid="composer"]'),
      document.querySelector("form.stretch"),
      document.querySelector("main form"),
      document.querySelector("main"),
      document.body
    ].filter(Boolean);

    const seen = new Set();
    const inputs = [];
    for (const root of roots) {
      for (const input of root.querySelectorAll('input[type="file"]')) {
        if (!seen.has(input)) {
          seen.add(input);
          inputs.push(input);
        }
      }
    }
    return inputs;
  }

  function acceptsPdf(input) {
    const accept = (input.getAttribute("accept") || "").toLowerCase();
    return !accept || accept.includes("pdf") || accept.includes(".pdf") || accept.includes("*/*");
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

  function scoreFileInput(input, platform) {
    const accept = (input.getAttribute("accept") || "").toLowerCase();
    let score = 0;

    if (acceptsPdf(input)) {
      score += 6;
    }
    if (isImageOnlyInput(input)) {
      score -= 20;
    }
    if (!input.disabled) {
      score += 2;
    }
    if (platform === "gemini" && input.closest("uploader-file-picker, uploader-file-upload")) {
      score += 10;
    }
    if (platform === "chatgpt" && input.closest("form")) {
      score += 4;
    }
    return score;
  }

  function assignFileToInput(fileInput, file) {
    try {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      fileInput.files = dataTransfer.files;

      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
      fileInput.dispatchEvent(new Event("input", { bubbles: true }));

      const assigned = fileInput.files && fileInput.files.length > 0;
      const matchesName = assigned && fileInput.files[0].name === file.name;
      const matchesType =
        assigned &&
        (fileInput.files[0].type === "application/pdf" || fileInput.files[0].name.endsWith(".pdf"));

      return Boolean(assigned && matchesName && matchesType);
    } catch (error) {
      console.warn("Programmatic file attach failed:", error);
      return false;
    }
  }

  function openNativeUploadFallback(platform, fileInput) {
    // Prefer a real upload/add control — avoid preview / gallery buttons.
    const uploadButton = findUploadFallbackButton(platform);
    if (uploadButton) {
      uploadButton.click();
      return true;
    }

    // Last resort: click the file input itself to open the native picker.
    if (fileInput) {
      try {
        fileInput.click();
        return true;
      } catch (_error) {
        return false;
      }
    }

    return false;
  }

  function findUploadFallbackButton(platform) {
    const selectorsByPlatform = {
      chatgpt: [
        'button[aria-label*="Upload" i]',
        'button[aria-label*="Add photos & files" i]',
        'button[aria-label*="Add files" i]',
        'button[aria-label*="Attach" i]',
        'button[data-testid="composer-plus-btn"]'
      ],
      claude: [
        'button[aria-label*="Upload" i]',
        'button[aria-label*="Add" i]',
        'button[aria-label*="Attach" i]'
      ],
      gemini: [
        'button[aria-label*="Upload" i]',
        'button[aria-label*="Add" i]',
        'button[aria-label*="Open upload file" i]',
        'button[aria-label*="Insert" i]',
        "uploader-file-picker button",
        "uploader-file-upload button"
      ]
    };

    for (const selector of selectorsByPlatform[platform] || []) {
      const el = document.querySelector(selector);
      if (el && isLikelyUploadControl(el)) {
        return el;
      }
    }

    const candidates = Array.from(
      document.querySelectorAll("button, div[role='button'], [role='button']")
    );
    return (
      candidates.find((el) => {
        const label = getControlLabel(el);
        return (
          (label.includes("upload") ||
            label.includes("add files") ||
            label.includes("add photos & files") ||
            label.includes("attach")) &&
          !label.includes("preview") &&
          !label.includes("gallery") &&
          !label.includes("view image")
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
      label.includes("previous")
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

  function focusChatComposer(platform) {
    const selectors = {
      chatgpt: [
        "#prompt-textarea",
        'div[contenteditable="true"]#prompt-textarea',
        'div[contenteditable="true"][data-placeholder]',
        'textarea[name="prompt-textarea"]',
        'div[contenteditable="true"]'
      ],
      claude: [
        'div[contenteditable="true"].ProseMirror',
        'div[contenteditable="true"]',
        "fieldset textarea",
        "textarea"
      ],
      gemini: [
        'div[contenteditable="true"][aria-label*="prompt" i]',
        'div[contenteditable="true"][aria-label*="Enter" i]',
        'rich-textarea div[contenteditable="true"]',
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

  function dismissPreviewOverlays() {
    const escapeEvent = new KeyboardEvent("keydown", {
      key: "Escape",
      code: "Escape",
      keyCode: 27,
      which: 27,
      bubbles: true,
      cancelable: true
    });
    document.activeElement?.dispatchEvent?.(escapeEvent);
    document.dispatchEvent(escapeEvent);

    const closeButtons = Array.from(
      document.querySelectorAll(
        'button[aria-label*="Close" i], button[aria-label*="Dismiss" i], [data-testid="close-button"]'
      )
    ).slice(0, 3);

    for (const button of closeButtons) {
      const label = getControlLabel(button);
      if (label.includes("close") || label.includes("dismiss")) {
        // Avoid closing the whole chat — only click obvious lightbox/modal closers.
        if (button.closest('[role="dialog"], [aria-modal="true"], lightbox, .modal')) {
          button.click();
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
