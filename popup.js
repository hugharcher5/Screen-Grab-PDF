const captureBtn = document.getElementById("capture-btn");
const statusEl = document.getElementById("status");
const hotkeyEl = document.getElementById("hotkey");
const versionEl = document.getElementById("version");
const shortcutsLink = document.getElementById("shortcuts-link");

const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
hotkeyEl.textContent = isMac ? "Cmd+Shift+C" : "Ctrl+Shift+C";

const manifest = chrome.runtime.getManifest();
versionEl.textContent = manifest.version;

shortcutsLink.addEventListener("click", (event) => {
  event.preventDefault();
  chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
});

captureBtn.addEventListener("click", async () => {
  setStatus("Capturing…");
  captureBtn.disabled = true;

  try {
    const response = await chrome.runtime.sendMessage({ type: "capture-pdf-now" });
    if (!response?.ok) {
      throw new Error(response?.error || "Capture failed.");
    }
    setStatus("PDF saved to Downloads.", "ok");
  } catch (error) {
    setStatus(error?.message || String(error), "err");
  } finally {
    captureBtn.disabled = false;
  }
});

function setStatus(text, kind) {
  statusEl.textContent = text;
  statusEl.classList.remove("ok", "err");
  if (kind) {
    statusEl.classList.add(kind);
  }
}
