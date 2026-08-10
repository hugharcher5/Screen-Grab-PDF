(() => {
  if (globalThis.__scdContentLoaded) {
    return;
  }
  globalThis.__scdContentLoaded = true;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "ping") {
      sendResponse({ ok: true });
      return false;
    }

    if (message?.type === "attach-pdf") {
      attachPdfToChat(message)
        .then(() => sendResponse({ ok: true }))
        .catch((error) => {
          sendResponse({ ok: false, error: error?.message || String(error) });
        });
      return true;
    }

    return false;
  });

  async function attachPdfToChat({ base64, filename }) {
    if (!base64) {
      throw new Error("Missing PDF data.");
    }

    const platform = detectPlatform();
    if (!platform) {
      throw new Error("Unsupported page. Use ChatGPT, Claude, or Gemini.");
    }

    const file = base64ToFile(base64, filename || "ai_screen_capture.pdf");
    const input = await ensureFileInput(platform);
    if (!input) {
      throw new Error("Could not find a file upload control on this chat page.");
    }

    assignFileToInput(input, file);
    showToast("PDF Attached to Active Chat!");
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

  function base64ToFile(base64, filename) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new File([bytes], filename, {
      type: "application/pdf",
      lastModified: Date.now()
    });
  }

  async function ensureFileInput(platform) {
    let input = findFileInput();
    if (input) {
      return input;
    }

    const attachButton = findAttachButton(platform);
    if (attachButton) {
      attachButton.click();
      input = await waitForFileInput(1200);
      if (input) {
        return input;
      }
    }

    return findFileInput();
  }

  function findFileInput() {
    const inputs = Array.from(document.querySelectorAll('input[type="file"]'));
    if (!inputs.length) {
      return null;
    }

    const ranked = inputs
      .map((input, index) => ({ input, index, score: scoreFileInput(input) }))
      .sort((a, b) => b.score - a.score || b.index - a.index);

    return ranked[0]?.input || null;
  }

  function scoreFileInput(input) {
    const accept = (input.getAttribute("accept") || "").toLowerCase();
    let score = 0;

    if (!accept || accept.includes("pdf") || accept.includes(".pdf") || accept.includes("*/*")) {
      score += 5;
    }
    if (accept.includes("image") && !accept.includes("pdf")) {
      score -= 2;
    }
    if (!input.disabled) {
      score += 2;
    }
    // Hidden inputs are normal for these chat UIs.
    score += 1;
    return score;
  }

  function findAttachButton(platform) {
    const selectorsByPlatform = {
      chatgpt: [
        'button[aria-label*="Attach" i]',
        'button[aria-label*="Upload" i]',
        'button[data-testid="composer-plus-btn"]',
        'button[aria-label*="add files" i]'
      ],
      claude: [
        'button[aria-label*="Attach" i]',
        'button[aria-label*="Upload" i]',
        'button[aria-label*="file" i]',
        'input[type="file"] + button',
        'button[data-testid="upload-button"]'
      ],
      gemini: [
        'button[aria-label*="Upload" i]',
        'button[aria-label*="Open upload" i]',
        'button[aria-label*="Add files" i]',
        'button[aria-label*="Attach" i]',
        'uploader-file-upload button',
        'button[data-test-id="upload-button"]'
      ]
    };

    for (const selector of selectorsByPlatform[platform] || []) {
      const el = document.querySelector(selector);
      if (el) {
        return el;
      }
    }

    const candidates = Array.from(
      document.querySelectorAll("button, div[role='button'], [role='button']")
    );
    return (
      candidates.find((el) => {
        const label = [
          el.getAttribute("aria-label") || "",
          el.getAttribute("title") || "",
          el.textContent || ""
        ]
          .join(" ")
          .toLowerCase();
        return (
          label.includes("attach") ||
          label.includes("upload") ||
          label.includes("add files") ||
          label.includes("add file")
        );
      }) || null
    );
  }

  function waitForFileInput(timeoutMs) {
    return new Promise((resolve) => {
      const existing = findFileInput();
      if (existing) {
        resolve(existing);
        return;
      }

      const observer = new MutationObserver(() => {
        const input = findFileInput();
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
        resolve(findFileInput());
      }, timeoutMs);
    });
  }

  function assignFileToInput(input, file) {
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;

    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
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
