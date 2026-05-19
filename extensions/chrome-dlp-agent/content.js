// content.js — ShieldAI Corporate DLP Agent v2.0
// Inline redaction: SSN/PII spans replaced with [REDACTED]; only hard-blocks for BLOCK action.

console.log("🛡️ ShieldAI DLP Agent v2.0 injected.");

const PROXY_URL = "http://localhost:8000";
let isAnalyzing = false;

// ─── Banner UI ──────────────────────────────────────────────────────────────

function showBanner(message, type = "warn") {
  const existing = document.getElementById("shieldai-banner");
  if (existing) existing.remove();

  const banner = document.createElement("div");
  banner.id = "shieldai-banner";
  banner.style.cssText = `
    position: fixed; top: 12px; left: 50%; transform: translateX(-50%);
    z-index: 999999; padding: 10px 20px; border-radius: 10px;
    font-family: -apple-system, sans-serif; font-size: 13px; font-weight: 600;
    display: flex; align-items: center; gap: 10px; max-width: 560px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.35);
    ${type === "block"
      ? "background:#1a1a2e; border:1.5px solid #ef4444; color:#fca5a5;"
      : "background:#1a2035; border:1.5px solid #f59e0b; color:#fde68a;"}
  `;
  banner.innerHTML = `<span style="font-size:18px">${type === "block" ? "🚨" : "🛡️"}</span> ${message}`;
  document.body.appendChild(banner);
  setTimeout(() => banner.remove(), type === "block" ? 6000 : 4000);
}

// ─── Inline Redaction ──────────────────────────────────────────────────────

function applyRedaction(text, spans) {
  if (!spans || spans.length === 0) return text;
  // Sort descending by start so replacements don't shift offsets
  const sorted = [...spans].sort((a, b) => b.start - a.start);
  let result = text;
  for (const span of sorted) {
    if (typeof span.start === "number" && typeof span.end === "number" && span.end > span.start) {
      const tag = `[${span.category || "REDACTED"}]`;
      result = result.slice(0, span.start) + tag + result.slice(span.end);
    }
  }
  return result;
}

// ─── Core Scan ─────────────────────────────────────────────────────────────

async function scanAndProcess(text, inputBox, sendCallback) {
  if (!text || text.trim().length < 5) {
    sendCallback();
    return;
  }

  try {
    const response = await fetch(`${PROXY_URL}/api/v1/inspect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, user_id: "endpoint-dlp", department: "Endpoint Security" }),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = await response.json();

    const action = result.action || "ALLOW";
    const categories = (result.categories || []).join(", ") || "sensitive data";
    const spans = result.detected_spans || [];

    if (action === "BLOCK") {
      // Hard block — do not send at all
      setInputText(inputBox, "[BLOCKED BY SHIELDAI DLP]");
      inputBox.style.color = "red";
      showBanner(
        `<b>Blocked:</b> ${categories} · Risk Score: ${result.risk_score}/100 — Message not sent.`,
        "block"
      );
      console.warn("🛡️ DLP BLOCKED:", categories, result);

    } else if (spans.length > 0 && action === "WARN") {
      // Inline redaction — replace only the sensitive spans
      const redacted = applyRedaction(text, spans);
      setInputText(inputBox, redacted);
      inputBox.style.color = "";
      showBanner(
        `<b>Auto-redacted:</b> ${categories} replaced with [CATEGORY] tags. Review before sending.`,
        "warn"
      );
      console.info("🛡️ DLP REDACTED:", categories, "→", redacted);
      // Don't auto-send after redaction — let the user review & resend

    } else {
      // Clean — restore and send
      inputBox.style.color = "";
      setInputText(inputBox, text);
      sendCallback();
    }

  } catch (err) {
    console.error("🛡️ ShieldAI DLP error:", err);
    // Fail open: restore text and send
    inputBox.style.color = "";
    setInputText(inputBox, text);
    sendCallback();
  }

  isAnalyzing = false;
}

// ─── Input Helpers ─────────────────────────────────────────────────────────

function getInputBox() {
  return (
    document.querySelector("#prompt-textarea") ||       // ChatGPT
    document.querySelector('div[contenteditable="true"]') || // Claude / Gemini
    document.activeElement
  );
}

function getInputText(box) {
  return box.value !== undefined ? box.value : (box.innerText || box.textContent || "");
}

function setInputText(box, text) {
  if (box.value !== undefined) {
    box.value = text;
  } else {
    box.innerText = text;
  }
  box.dispatchEvent(new Event("input", { bubbles: true }));
  box.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
}

function getSendButton() {
  return (
    document.querySelector('button[data-testid="send-button"]') ||
    document.querySelector('button[aria-label="Send message"]') ||
    document.querySelector('button[aria-label="Send prompt"]') ||
    document.querySelector('button[type="submit"]')
  );
}

// ─── Intercept Helpers ─────────────────────────────────────────────────────

function interceptSubmit(e, sendCallback) {
  const inputBox = getInputBox();
  if (!inputBox) return;
  const text = getInputText(inputBox);
  if (!text || text.trim().length < 5) return;

  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();

  if (isAnalyzing) return;
  isAnalyzing = true;

  setInputText(inputBox, "🛡️ ShieldAI scanning…");
  inputBox.style.color = "orange";

  scanAndProcess(text, inputBox, sendCallback);
}

// ─── Event Listeners ───────────────────────────────────────────────────────

// Enter key
window.addEventListener("keydown", async (e) => {
  if (e.key !== "Enter" || e.shiftKey || isAnalyzing) return;
  interceptSubmit(e, () => {
    const btn = getSendButton();
    if (btn) setTimeout(() => btn.click(), 80);
  });
}, true);

// Send button click
window.addEventListener("click", async (e) => {
  const btn =
    e.target.closest('button[data-testid="send-button"]') ||
    e.target.closest('button[aria-label="Send message"]') ||
    e.target.closest('button[aria-label="Send prompt"]');

  if (!btn || !e.isTrusted || isAnalyzing) return;
  interceptSubmit(e, () => setTimeout(() => btn.click(), 80));
}, true);
