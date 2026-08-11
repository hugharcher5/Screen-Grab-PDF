/**
 * Lightweight toast helper injected on demand by background.js.
 * No attachment, paste, or file-input logic.
 */
(() => {
  globalThis.__scdShowToast = function scdShowToast(message) {
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
  };
})();
