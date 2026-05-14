// content.js - Runs locally in the browser on ChatGPT/Claude

console.log("🛡️ ShieldAI Corporate DLP Agent injected and monitoring.");

let isAnalyzing = false;

// The core security scan function
async function runSecurityScan(text) {
    if (!text || text.trim().length < 5) return "ALLOW";
    
    try {
        console.log("🛡️ DLP: Running scan on prompt:", text);
        const response = await fetch("http://localhost:8000/api/v1/inspect", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                text: text,
                user_id: "local-endpoint-agent",
                department: "Endpoint Security"
            })
        });

        const result = await response.json();
        
        if (result.action === "BLOCK" || result.action === "REDACT") {
            alert(`🚨 SHIELDAI DLP ALERT 🚨\n\nBlocked: ${result.categories.join(", ")}\nRisk Score: ${result.risk_score}`);
        }
        return result.action;
    } catch (err) {
        console.error("ShieldAI DLP Agent error:", err);
        return "ALLOW"; // Fail open so we don't break the browser if proxy is offline
    }
}

// Helper to get the ChatGPT input box
function getInputBox() {
    return document.querySelector('#prompt-textarea') || document.activeElement;
}

// 1. Intercept the 'Enter' key at the WINDOW level (absolute highest priority)
window.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        if (isAnalyzing) {
            e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
            return false;
        }

        const inputBox = getInputBox();
        if (!inputBox) return;

        const text = inputBox.value || inputBox.innerText || inputBox.textContent;
        if (!text || text.trim().length < 5) return;

        // --- FOOLPROOF BLOCKING MECHANISM ---
        // 1. Stop the event from reaching ChatGPT
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        
        // 2. Synchronously wipe the box so ChatGPT literally reads an empty string if it bypasses our lock!
        isAnalyzing = true;
        inputBox.innerText = "🛡️ ShieldAI is scanning...";
        inputBox.style.color = "orange";
        
        // 3. Wait for the proxy
        const action = await runSecurityScan(text);
        
        if (action === "BLOCK" || action === "REDACT") {
            // Blocked! Leave it redacted.
            inputBox.style.color = "red";
            inputBox.innerText = "[REDACTED BY DLP POLICY]";
            isAnalyzing = false;
        } else {
            // Safe! Restore the text and force the send!
            inputBox.style.color = "";
            if (inputBox.value !== undefined) inputBox.value = text;
            else inputBox.innerText = text;
            
            // Force React to recognize the restored text
            inputBox.dispatchEvent(new Event('input', { bubbles: true }));
            
            isAnalyzing = false;
            
            // Programmatically click the send button
            setTimeout(() => {
                const sendBtn = document.querySelector('button[data-testid="send-button"]') || document.querySelector('button[aria-label="Send message"]');
                if (sendBtn) sendBtn.click();
            }, 100);
        }
    }
}, true); // true = capture phase

// 2. Intercept Mouse Clicks
window.addEventListener('click', async (e) => {
    const target = e.target.closest('button[data-testid="send-button"]') || e.target.closest('button[aria-label="Send message"]');
    
    if (target) {
        if (!e.isTrusted) return; // Allow programmatic clicks to pass
        if (isAnalyzing) {
            e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
            return false;
        }
        
        const inputBox = getInputBox();
        const text = inputBox ? (inputBox.value || inputBox.innerText || inputBox.textContent) : "";
        if (!text || text.trim().length < 5) return;
        
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        
        isAnalyzing = true;
        inputBox.innerText = "🛡️ ShieldAI is scanning...";
        inputBox.style.color = "orange";
        
        const action = await runSecurityScan(text);
        
        if (action === "BLOCK" || action === "REDACT") {
            inputBox.style.color = "red";
            inputBox.innerText = "[REDACTED BY DLP POLICY]";
            isAnalyzing = false;
        } else {
            inputBox.style.color = "";
            if (inputBox.value !== undefined) inputBox.value = text;
            else inputBox.innerText = text;
            
            inputBox.dispatchEvent(new Event('input', { bubbles: true }));
            
            isAnalyzing = false;
            setTimeout(() => target.click(), 100);
        }
    }
}, true);
