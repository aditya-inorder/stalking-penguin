// Stalking Penguin - Option 2 (Strong + Soft fingerprint fallback)

let STRONG_FP = null; // FingerprintJS visitorId
let SOFT_FP = null;   // Built from stable-ish browser fields

document.addEventListener("DOMContentLoaded", () => {
  boot();
});

async function boot() {
  // 0) Check library
  if (typeof FingerprintJS === "undefined") {
    setStatusBox("FingerprintJS failed to load. Check index.html script order.", true);
    return;
  }

  // 1) Compute fingerprints
  try {
    const agent = await FingerprintJS.load();
    const res = await agent.get();
    STRONG_FP = res.visitorId;
    SOFT_FP = buildSoftId();

    setDebugStatus(`strong: ${STRONG_FP?.slice(0, 8)}... | soft: ${hashLite(SOFT_FP).slice(0, 8)}...`);
  } catch (e) {
    console.error(e);
    setStatusBox("Fingerprint generation failed.", true);
    return;
  }

  // 2) Lookup (try strong first on backend, fallback soft)
  try {
    const lookup = await apiLookup(STRONG_FP, SOFT_FP);

    if (lookup && lookup.name) {
      // "Incognito/returning user" path
      setStatusBox(`Welcome back, ${lookup.name} (match: ${lookup.match}).`, false);
      showForgetButton();
      wireForgetButton(); // needs fingerprints ready
      await renderCapturePage(STRONG_FP, lookup.name, lookup.match);
      return;
    }
  } catch (e) {
    console.error("lookup failed", e);
  }

  // 3) New user path: name entry only
  showNameEntryUI();
  wireSaveButton();
  wireForgetButton();      // stays hidden until save
  hideForgetButton();
  setStatusBox("Enter your name → Save → then open Incognito/Private and visit the same URL.", false);
}

/* ----------------- Soft fingerprint ----------------- */

function buildSoftId() {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  const lang = navigator.language || "";
  const plat = navigator.platform || "";
  const ua = navigator.userAgent || "";
  const scr = `${screen.width}x${screen.height}x${screen.colorDepth}`;
  return `${ua}|${plat}|${lang}|${tz}|${scr}`;
}

// tiny deterministic hash for debug display only
function hashLite(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

/* ----------------- UI flow ----------------- */

function showNameEntryUI() {
  const welcomePanel = document.getElementById("welcome-panel");
  const infoPanel = document.getElementById("info-panel");

  if (welcomePanel) welcomePanel.style.display = "block";
  if (infoPanel) infoPanel.classList.add("hidden");

  const input = document.getElementById("name-input");
  if (input) input.value = "";
}

function showThankYouUI(name) {
  setStatusBox(
    `Thank you, ${name}. Now open an Incognito/Private window and visit: http://127.0.0.1:8000/`,
    false
  );
  showForgetButton();
}

/* ----------------- Buttons ----------------- */

function wireSaveButton() {
  const btn = document.getElementById("save-name");
  const input = document.getElementById("name-input");
  if (!btn || !input) return;

  btn.onclick = async () => {
    const name = (input.value || "").trim();

    if (!name || name.length < 2) {
      setStatusBox("Enter a valid name (min 2 chars).", true);
      return;
    }

    if (!STRONG_FP || !SOFT_FP) {
      setStatusBox("Fingerprints not ready yet. Refresh once.", true);
      return;
    }

    const ok = await apiStoreName(STRONG_FP, SOFT_FP, name);
    if (!ok) {
      setStatusBox("Save failed.", true);
      return;
    }

    // Normal mode: stay on page, do NOT show capture page
    showThankYouUI(name);
  };
}

function wireForgetButton() {
  const forgetBtn = document.getElementById("reset-name");
  if (!forgetBtn) return;

  forgetBtn.onclick = async () => {
    if (!STRONG_FP || !SOFT_FP) {
      setStatusBox("Fingerprints not ready; cannot forget.", true);
      return;
    }

    const ok = await apiDeleteName(STRONG_FP, SOFT_FP);
    if (!ok) {
      setStatusBox("Forget failed.", true);
      return;
    }

    // Reset UI to name entry
    hideForgetButton();
    showNameEntryUI();
    setStatusBox("Forgot you. Enter a new name.", false);
  };
}

function showForgetButton() {
  const b = document.getElementById("reset-name");
  if (b) b.classList.remove("hidden");
}

function hideForgetButton() {
  const b = document.getElementById("reset-name");
  if (b) b.classList.add("hidden");
}

/* ----------------- Capture page (incognito/recognized only) ----------------- */

async function renderCapturePage(visitorId, name, matchType) {
  const welcomePanel = document.getElementById("welcome-panel");
  const infoPanel = document.getElementById("info-panel");

  // Hide name screen and show capture UI only for recognized user
  if (welcomePanel) welcomePanel.style.display = "none";
  if (infoPanel) infoPanel.classList.remove("hidden");

  // Load capture info
  let serverData = null;
  try {
    serverData = await fetch("/api/fingerprint").then((r) => r.json());
  } catch (e) {
    console.error(e);
    setStatusBox("Failed to load tracking info from backend.", true);
    return;
  }

  const trackingInfo = document.getElementById("tracking-info");
  if (trackingInfo) {
    trackingInfo.innerHTML = `
      <h3 class="text-2xl font-bold mb-6 pb-4 border-b border-gray-700">
        📡 What we captured (recognized via ${escapeHtml(matchType || "unknown")} match)
      </h3>

      <div class="mb-4 text-lg">
        <span class="text-red-300 font-bold">Welcome back, ${escapeHtml(name)}.</span>
        Private mode did not stop identification.
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div class="text-center p-6 bg-gray-900/50 rounded-2xl border border-gray-700">
          <div class="text-2xl font-mono font-bold text-gray-300 mb-2">${escapeHtml(serverData.ip || "Unknown")}</div>
          <div class="text-sm opacity-75">IP Address</div>
        </div>

        <div class="text-center p-6 bg-gray-900/50 rounded-2xl border border-gray-700">
          <div class="text-xl font-bold">${escapeHtml(serverData.city || "Unknown")}</div>
          <div class="text-sm opacity-75">${escapeHtml(serverData.country || "Unknown")}</div>
        </div>

        <div class="text-center p-6 bg-gray-900/50 rounded-2xl border border-gray-700">
          <div class="text-sm font-mono break-words">${escapeHtml(serverData.isp || "Unknown")}</div>
          <div class="text-xs opacity-75">ISP/Organization</div>
        </div>

        <div class="text-center p-6 bg-gray-900/50 rounded-2xl border border-gray-700">
          <div class="text-sm break-words">${escapeHtml(serverData.platform || "Unknown")}</div>
          <div class="text-xs opacity-75">Platform</div>
        </div>
      </div>

      <div class="text-center text-sm opacity-80 p-4 bg-gray-900/30 rounded-xl border border-gray-600">
        <strong>Strong FP:</strong>
        <code class="font-mono bg-gray-800 px-4 py-2 rounded-lg border border-gray-600">
          ${escapeHtml((visitorId || "").slice(0, 24))}...
        </code>
        <div class="mt-2 opacity-80"><strong>Soft FP:</strong> ${escapeHtml(hashLite(SOFT_FP))}</div>
      </div>
    `;
  }

  const riskScoreEl = document.getElementById("risk-score");
  if (riskScoreEl) {
    const riskScore = computeRiskScore(visitorId, serverData.ip);
    riskScoreEl.innerHTML = `
      <div class="text-center">
        <div class="text-5xl font-black">${riskScore}%</div>
        <div class="text-2xl opacity-90 mb-4">Tracking Risk</div>
        <div class="max-w-md mx-auto text-lg opacity-85">
          Soft matching improves recognition across incognito, but may collide for similar devices.
        </div>
      </div>
    `;
  }

  const mitigationsEl = document.getElementById("mitigations");
  if (mitigationsEl) {
    mitigationsEl.innerHTML = `
      <div class="bg-gray-800/80 backdrop-blur-sm border border-gray-600 rounded-2xl shadow-2xl p-8">
        <h3 class="text-2xl font-bold mb-6">🛡️ Mitigations</h3>
        <div class="grid md:grid-cols-2 gap-4 text-lg leading-relaxed">
          <div class="p-4 bg-gray-900/50 rounded-xl border border-gray-700"><strong>VPN:</strong> hides IP/location.</div>
          <div class="p-4 bg-gray-900/50 rounded-xl border border-gray-700"><strong>uBlock Origin:</strong> blocks many trackers.</div>
          <div class="p-4 bg-gray-900/50 rounded-xl border border-gray-700"><strong>Firefox/Brave:</strong> better privacy defaults.</div>
          <div class="p-4 bg-gray-900/50 rounded-xl border border-gray-700"><strong>Privacy Badger:</strong> reduces third‑party tracking.</div>
        </div>
      </div>
    `;
  }
}

/* ----------------- API calls ----------------- */

async function apiStoreName(strong_fp, soft_fp, name) {
  const formData = new FormData();
  formData.append("strong_fp", strong_fp);
  formData.append("soft_fp", soft_fp);
  formData.append("name", name);

  const res = await fetch("/api/store_name", { method: "POST", body: formData });
  return res.ok;
}

async function apiLookup(strong_fp, soft_fp) {
  const url = `/api/lookup?strong_fp=${encodeURIComponent(strong_fp)}&soft_fp=${encodeURIComponent(soft_fp)}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
}

async function apiDeleteName(strong_fp, soft_fp) {
  const formData = new FormData();
  formData.append("strong_fp", strong_fp);
  formData.append("soft_fp", soft_fp);

  const res = await fetch("/api/delete_name", { method: "POST", body: formData });
  return res.ok;
}

/* ----------------- Status helpers ----------------- */

function setStatusBox(text, isError) {
  const box = document.getElementById("status-box");
  if (!box) return;
  box.classList.remove("hidden");
  box.textContent = text;

  if (isError) {
    box.className = "mt-2 p-4 rounded-xl border border-red-700 bg-red-900/30 text-red-200 text-lg";
  } else {
    box.className = "mt-2 p-4 rounded-xl border border-gray-600 bg-gray-900/40 text-gray-200 text-lg";
  }
}

function setDebugStatus(text) {
  const el = document.getElementById("status");
  if (el) el.textContent = text;
}

function computeRiskScore(visitorId, ip) {
  const s = `${visitorId || ""}|${ip || ""}`;
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  }
  return 60 + (hash % 40);
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
