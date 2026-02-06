let STRONG_FP = null;
let SOFT_FP = null;

document.addEventListener("DOMContentLoaded", () => {
  boot();
});

async function boot() {
  if (typeof FingerprintJS === "undefined") {
    setStatusBox("FingerprintJS failed to load. Check script order.", true);
    return;
  }

  // Fingerprints
  try {
    const agent = await FingerprintJS.load();
    const res = await agent.get();
    STRONG_FP = res.visitorId;
    SOFT_FP = buildSoftId();
    setDebugStatus(`strong: ${STRONG_FP.slice(0, 8)}... | soft: ${hashLite(SOFT_FP).slice(0, 8)}...`);
  } catch (e) {
    console.error(e);
    setStatusBox("Fingerprint generation failed.", true);
    return;
  }

  wireSaveButton();
  wireForgetButton();

  // If user already saved in NORMAL mode, show thank-you (never recognized here)
  const savedNormal = localStorage.getItem("sp_saved") === "1";
  const savedName = localStorage.getItem("sp_saved_name") || "";

  if (savedNormal && savedName) {
    showThankYouUI(savedName);
    showForgetButton();
    return;
  }

  // Otherwise try lookup → recognized (incognito/private only)
  try {
    const lookup = await apiLookup(STRONG_FP, SOFT_FP);
    if (lookup && lookup.name) {
      await showRecognizedCapture(lookup.name, lookup.match);
      showForgetButton();
      return;
    }
  } catch (e) {
    console.error("lookup failed", e);
  }

  // Fresh user → show name entry
  showNameEntryUI();
  hideForgetButton();
  setStatusBox("Type your name, hit “Remember me!”, then open this site in Incognito/Private mode.", false);
}

/* ---------- Soft fingerprint ---------- */

function buildSoftId() {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  const lang = navigator.language || "";
  const plat = navigator.platform || "";
  const ua = navigator.userAgent || "";
  const scr = `${screen.width}x${screen.height}x${screen.colorDepth}`;
  return `${ua}|${plat}|${lang}|${tz}|${scr}`;
}

function hashLite(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

/* ---------- UI states ---------- */

function showNameEntryUI() {
  document.body.className = "bg-white text-gray-900 min-h-screen font-sans";

  const nameEntry = document.getElementById("name-entry");
  const infoPanel = document.getElementById("info-panel");
  if (nameEntry) nameEntry.classList.remove("hidden");
  if (infoPanel) infoPanel.classList.add("hidden");

  const hero = document.getElementById("hero-text");
  if (hero) {
    hero.innerHTML = `
      <h1 class="text-3xl md:text-4xl font-bold mb-4">
        Can you hide from the <span class="font-black">Penguin</span>?
      </h1>
      <p class="text-base md:text-lg mb-2">
        Think switching to your browser’s <span class="font-semibold">private</span> or <span class="font-semibold">incognito</span>
        mode makes you invisible?
      </p>
      <p class="text-base md:text-lg mb-6">
        <span class="font-semibold">Bad news:</span> the web can still recognize you from your device and browser details.
        <span class="font-semibold">Test it</span> by typing your name below.
      </p>
    `;
  }

  const input = document.getElementById("name-input");
  if (input) input.value = "";

  clearInfoBlocks();
}

function showThankYouUI(name) {
  document.body.className = "bg-white text-gray-900 min-h-screen font-sans";

  // Hide name entry completely
  const nameEntry = document.getElementById("name-entry");
  const infoPanel = document.getElementById("info-panel");
  if (nameEntry) nameEntry.classList.add("hidden");
  if (infoPanel) infoPanel.classList.add("hidden");

  const hero = document.getElementById("hero-text");
  if (hero) {
    hero.innerHTML = `
      <h1 class="text-3xl md:text-4xl font-bold mb-4">
        Thank you, <span class="font-black">${escapeHtml(name)}</span>.
      </h1>
      <p class="text-base md:text-lg mb-2">
        The penguin has remembered you. Now try to hide in <span class="font-semibold">Private / Incognito</span>.
      </p>
      <p class="text-base md:text-lg mb-4">
        Open an Incognito/Private window and visit this site again to see if it still finds you.
      </p>
    `;
  }

  setStatusBox(`Saved “${name}”. Now open an Incognito/Private window and visit this site again.`, false);
  clearInfoBlocks();
}

function clearInfoBlocks() {
  const trackingInfo = document.getElementById("tracking-info");
  const riskScoreEl = document.getElementById("risk-score");
  const mitigationsEl = document.getElementById("mitigations");
  if (trackingInfo) trackingInfo.innerHTML = "";
  if (riskScoreEl) riskScoreEl.innerHTML = "";
  if (mitigationsEl) mitigationsEl.innerHTML = "";
}

/* ---------- Buttons ---------- */

function wireSaveButton() {
  const btn = document.getElementById("save-name");
  const input = document.getElementById("name-input");
  if (!btn || !input) return;

  btn.onclick = async () => {
    const name = (input.value || "").trim();

    if (!name || name.length < 2) {
      setStatusBox("Enter a valid name (at least 2 characters).", true);
      return;
    }
    if (!STRONG_FP || !SOFT_FP) {
      setStatusBox("Fingerprint not ready yet. Refresh once.", true);
      return;
    }

    const ok = await apiStoreName(STRONG_FP, SOFT_FP, name);
    if (!ok) {
      setStatusBox("Saving failed. Check backend.", true);
      return;
    }

    // Mark NORMAL mode as saved
    localStorage.setItem("sp_saved", "1");
    localStorage.setItem("sp_saved_name", name);

    // Hide name entry completely, show thank-you
    showThankYouUI(name);
    showForgetButton();
  };
}

function wireForgetButton() {
  const forgetBtn = document.getElementById("reset-name");
  if (!forgetBtn) return;

  forgetBtn.onclick = async () => {
    if (!STRONG_FP || !SOFT_FP) {
      setStatusBox("Fingerprint not ready; cannot forget.", true);
      return;
    }

    const ok = await apiDeleteName(STRONG_FP, SOFT_FP);
    if (!ok) {
      setStatusBox("Forget failed.", true);
      return;
    }

    localStorage.removeItem("sp_saved");
    localStorage.removeItem("sp_saved_name");

    hideForgetButton();
    showNameEntryUI();
    setStatusBox("Forgot you. Enter a new name to try again.", false);
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

/* ---------- Recognized (incognito/private) ---------- */

async function showRecognizedCapture(name, matchType) {
  document.body.className = "bg-white text-gray-900 min-h-screen font-sans";

  const nameEntry = document.getElementById("name-entry");
  const infoPanel = document.getElementById("info-panel");
  if (nameEntry) nameEntry.classList.add("hidden");
  if (infoPanel) infoPanel.classList.remove("hidden");

  const hero = document.getElementById("hero-text");
  if (hero) {
    hero.innerHTML = `
      <h1 class="text-3xl md:text-4xl font-bold mb-4">
        I found you. You are <span class="font-black text-red-600">${escapeHtml(name)}!</span>
      </h1>
      <p class="text-base md:text-lg mb-2">
        Private mode didn’t stop identification based on device/browser traits.
      </p>
      <p class="text-base md:text-lg mb-4">
        Here is what was captured instantly.
      </p>
    `;
  }

  let serverData = null;
  try {
    serverData = await fetch("/api/fingerprint").then((r) => r.json());
  } catch (e) {
    console.error(e);
    setStatusBox("Failed to load tracking info from server.", true);
    return;
  }

  const ip = serverData.ip || "Unknown";
  const location = serverData.location || "Unknown";
  const isp = serverData.isp || "Unknown";
  const platform = (serverData.platform || "Unknown").replaceAll('"', "");

  const trackingInfo = document.getElementById("tracking-info");
  if (trackingInfo) {
    trackingInfo.innerHTML = `
      <div class="w-full bg-white rounded-2xl border border-gray-200 shadow-sm px-6 py-6">
        <h2 class="text-xl md:text-2xl font-bold mb-4">
          What we captured (match: ${escapeHtml(matchType || "soft")})
        </h2>

        <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
          <div class="p-4 rounded-xl border border-gray-200 bg-gray-50 text-center">
            <div class="text-xl font-mono font-semibold break-words">${escapeHtml(ip)}</div>
            <div class="text-xs mt-1 uppercase tracking-wide text-gray-500">IP</div>
          </div>

          <div class="p-4 rounded-xl border border-gray-200 bg-gray-50 text-center">
            <div class="text-base font-semibold break-words">${escapeHtml(location)}</div>
            <div class="text-xs mt-1 uppercase tracking-wide text-gray-500">Place</div>
          </div>

          <div class="p-4 rounded-xl border border-gray-200 bg-gray-50 text-center">
            <div class="text-xs font-mono break-words">${escapeHtml(isp)}</div>
            <div class="text-xs mt-1 uppercase tracking-wide text-gray-500">ISP/Org</div>
          </div>

          <div class="p-4 rounded-xl border border-gray-200 bg-gray-50 text-center">
            <div class="text-sm break-words">${escapeHtml(platform)}</div>
            <div class="text-xs mt-1 uppercase tracking-wide text-gray-500">Platform</div>
          </div>
        </div>

        <div class="mt-3 text-xs text-gray-500 space-y-1">
          <div><span class="font-semibold">Strong FP:</span> ${escapeHtml(STRONG_FP.slice(0, 24))}...</div>
          <div><span class="font-semibold">Soft FP:</span> ${escapeHtml(hashLite(SOFT_FP))}</div>
        </div>
      </div>
    `;
  }

  const riskScoreEl = document.getElementById("risk-score");
  if (riskScoreEl) {
    riskScoreEl.innerHTML = `
      <div class="text-sm text-gray-700">
        <p class="mb-1 font-semibold">Why this worked:</p>
        <ul class="list-disc list-inside space-y-1">
          <li>We stored your name against a fingerprint in a normal window.</li>
          <li>This window matched the fingerprint (strong or soft fallback).</li>
          <li>Incognito mode doesn’t erase device/browser traits.</li>
        </ul>
      </div>
    `;
  }

  const mitigationsEl = document.getElementById("mitigations");
  if (mitigationsEl) {
    mitigationsEl.innerHTML = `
      <div class="text-sm text-gray-700">
        <p class="mb-1 font-semibold">Mitigations:</p>
        <ul class="list-disc list-inside space-y-1">
          <li>Use a VPN to hide IP/location.</li>
          <li>Block trackers (uBlock Origin).</li>
          <li>Use browsers with anti-fingerprinting protections.</li>
        </ul>
      </div>
    `;
  }

  setStatusBox("", false);
}

/* ---------- API ---------- */

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

/* ---------- Status helpers ---------- */

function setStatusBox(text, isError) {
  const box = document.getElementById("status-box");
  if (!box) return;

  if (!text) {
    box.classList.add("hidden");
    box.textContent = "";
    return;
  }

  box.classList.remove("hidden");
  box.textContent = text;

  if (isError) {
    box.className = "max-w-md mx-auto p-3 rounded-xl border border-red-500 bg-red-50 text-red-800 text-base";
  } else {
    box.className = "max-w-md mx-auto p-3 rounded-xl border border-blue-500 bg-blue-50 text-blue-800 text-base";
  }
}

function setDebugStatus(text) {
  const el = document.getElementById("status");
  if (el) el.textContent = text;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
