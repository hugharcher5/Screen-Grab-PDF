const captureBtn = document.getElementById("capture-btn");
const attachBtn = document.getElementById("attach-btn");
const statusEl = document.getElementById("status");
const hotkeyCaptureEl = document.getElementById("hotkey-capture");
const hotkeyAttachEl = document.getElementById("hotkey-attach");
const versionEl = document.getElementById("version");
const shortcutsLink = document.getElementById("shortcuts-link");

const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
hotkeyCaptureEl.textContent = isMac ? "Cmd+Shift+C" : "Ctrl+Shift+C";
hotkeyAttachEl.textContent = isMac ? "Cmd+Shift+V" : "Ctrl+Shift+V";

const manifest = chrome.runtime.getManifest();
versionEl.textContent = manifest.version;

shortcutsLink.addEventListener("click", (event) => {
  event.preventDefault();
  chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
});

captureBtn.addEventListener("click", async () => {
  await runAction(captureBtn, "Capturing…", "capture-pdf-now", "PDF saved to Downloads.");
});

attachBtn.addEventListener("click", async () => {
  await runAction(
    attachBtn,
    "Attaching…",
    "attach-pdf-now",
    "PDF attached to active chat."
  );
});

async function runAction(button, pendingText, messageType, successText) {
  setStatus(pendingText);
  captureBtn.disabled = true;
  attachBtn.disabled = true;

  try {
    const response = await chrome.runtime.sendMessage({ type: messageType });
    if (!response?.ok) {
      throw new Error(response?.error || "Action failed.");
    }
    setStatus(successText, "ok");
  } catch (error) {
    setStatus(error?.message || String(error), "err");
  } finally {
    captureBtn.disabled = false;
    attachBtn.disabled = false;
    void button;
  }
}

function setStatus(text, kind) {
  statusEl.textContent = text;
  statusEl.classList.remove("ok", "err");
  if (kind) {
    statusEl.classList.add(kind);
  }
}
