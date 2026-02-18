let STRONG_FP = null;
let SOFT_FP = null;
let currentScreen = 'initial';
let savedName = '';
let isIncognitoMode = false;

document.addEventListener("DOMContentLoaded", () => {
  boot();
});

async function boot() {
  // Detect incognito mode
  isIncognitoMode = !localStorage.getItem("sp_normal_mode");

  if (typeof FingerprintJS === "undefined") {
    showStatusBox("FingerprintJS failed to load. Check script order.", true);
    return;
  }

  // Generate fingerprints
  try {
    const agent = await FingerprintJS.load();
    const res = await agent.get();
    STRONG_FP = res.visitorId;
    SOFT_FP = buildSoftId();
  } catch (e) {
    console.error(e);
    showStatusBox("Fingerprint generation failed.", true);
    return;
  }

  // Wire up all buttons and navigation
  wireSaveButton();
  wireForgetButtons();
  wireNavigationLinks();

  // ALWAYS check backend first with retry logic
  let retryCount = 0;
  let lookup = null;

  while (retryCount < 3 && !lookup) {
    try {
      lookup = await apiLookup(STRONG_FP, SOFT_FP);
      if (lookup && lookup.name) {
        // Found in backend - show recognized screen
        savedName = lookup.name;
        await showRecognizedScreen(lookup.name, isIncognitoMode);
        return;
      }
      break; // No match found, exit loop
    } catch (e) {
      console.error(`Lookup attempt ${retryCount + 1} failed:`, e);
      retryCount++;
      if (retryCount < 3) {
        await new Promise(resolve => setTimeout(resolve, 500)); // Wait 500ms before retry
      }
    }
  }

  // No backend match - check localStorage for normal mode
  if (!isIncognitoMode) {
    localStorage.setItem("sp_normal_mode", "1");

    const savedNormal = localStorage.getItem("sp_saved") === "1";
    const savedNameLocal = localStorage.getItem("sp_saved_name") || "";

    if (savedNormal && savedNameLocal) {
      savedName = savedNameLocal;
      document.getElementById('thankyou-name').textContent = savedName;
      showScreen('thankyou');
      return;
    }
  }

  // Fresh user - show initial screen
  showScreen('initial');
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

/* ---------- Screen Management ---------- */
function showScreen(screenName) {
  const screens = ['initial', 'thankyou', 'recognized', 'how-works', 'protect'];
  screens.forEach(s => {
    const el = document.getElementById(`screen-${s}`);
    if (el) {
      if (s === screenName) {
        el.classList.remove('hidden');
        el.classList.add('fade-in');
      } else {
        el.classList.add('hidden');
        el.classList.remove('fade-in', 'slide-left', 'slide-right');
      }
    }
  });
  currentScreen = screenName;

  const leftSection = document.getElementById('left-section');
  if (leftSection) leftSection.scrollTop = 0;
}

function showScreenWithLoader(screenName, loaderDuration = 2000) {
  const loader = document.getElementById('loader-overlay');
  if (loader) {
    loader.classList.add('show');
    setTimeout(() => {
      loader.classList.remove('show');
      showScreen(screenName);
    }, loaderDuration);
  } else {
    showScreen(screenName);
  }
}

/* ---------- Save Button ---------- */
function wireSaveButton() {
  const btn = document.getElementById("save-name");
  const input = document.getElementById("name-input");
  const loader = document.getElementById("loader-overlay");

  if (!btn || !input) return;

  btn.onclick = async () => {
    const name = (input.value || "").trim();

    if (!name || name.length < 2) {
      showStatusBox("Enter a valid name (at least 2 characters).", true);
      return;
    }

    if (!STRONG_FP || !SOFT_FP) {
      showStatusBox("Fingerprint not ready yet. Refresh once.", true);
      return;
    }

    // Show full-screen loader
    if (loader) loader.classList.add("show");
    btn.disabled = true;

    const ok = await apiStoreName(STRONG_FP, SOFT_FP, name);

    if (!ok) {
      if (loader) loader.classList.remove("show");
      btn.disabled = false;
      showStatusBox("Saving failed. Check backend.", true);
      return;
    }

    // Only mark as saved in NORMAL mode
    if (!isIncognitoMode) {
      localStorage.setItem("sp_saved", "1");
      localStorage.setItem("sp_saved_name", name);
    }

    savedName = name;
    document.getElementById('thankyou-name').textContent = name;

    // Hide loader and go to thank you
    if (loader) loader.classList.remove("show");
    btn.disabled = false;
    showScreen('thankyou');
  };
}

/* ---------- Forget Buttons ---------- */
function wireForgetButtons() {
  const forgetBtns = [
    'forget-btn-thankyou',
    'forget-btn-recognized',
    'forget-btn-how-works',
    'forget-btn-protect'
  ];

  forgetBtns.forEach(btnId => {
    const btn = document.getElementById(btnId);
    if (btn) {
      btn.onclick = async () => {
        if (!STRONG_FP || !SOFT_FP) {
          showStatusBox("Fingerprint not ready; cannot forget.", true);
          return;
        }

        const ok = await apiDeleteName(STRONG_FP, SOFT_FP);
        if (!ok) {
          showStatusBox("Forget failed.", true);
          return;
        }

        localStorage.removeItem("sp_saved");
        localStorage.removeItem("sp_saved_name");
        localStorage.removeItem("sp_normal_mode");
        savedName = '';

        const input = document.getElementById("name-input");
        if (input) input.value = "";

        window.location.reload();
      };
    }
  });
}

/* ---------- Navigation Links ---------- */
function wireNavigationLinks() {
  const howWorksLink = document.getElementById('how-works-link');
  if (howWorksLink) {
    howWorksLink.onclick = () => {
      showScreenWithLoader('how-works', 2000);
    };
  }

  const protectLink = document.getElementById('protect-link');
  if (protectLink) {
    protectLink.onclick = () => {
      const howWorksScreen = document.getElementById('screen-how-works');
      const protectScreen = document.getElementById('screen-protect');

      if (howWorksScreen) howWorksScreen.classList.add('hidden');
      if (protectScreen) {
        protectScreen.classList.remove('hidden');
        protectScreen.classList.add('slide-right');
      }
      currentScreen = 'protect';
    };
  }

  const backToWorks = document.getElementById('back-to-works');
  if (backToWorks) {
    backToWorks.onclick = () => {
      const protectScreen = document.getElementById('screen-protect');
      const howWorksScreen = document.getElementById('screen-how-works');

      if (protectScreen) protectScreen.classList.add('hidden');
      if (howWorksScreen) {
        howWorksScreen.classList.remove('hidden');
        howWorksScreen.classList.add('slide-left');
      }
      currentScreen = 'how-works';
    };
  }
}

/* ---------- Recognized Screen ---------- */
async function showRecognizedScreen(name, fromIncognito) {
  const loader = document.getElementById('loader-overlay');
  if (loader) loader.classList.add('show');

  let serverData = null;
  const startTime = Date.now();

  // Fetch with retry logic
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch("/api/fingerprint", { 
        signal: controller.signal,
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        serverData = await response.json();
        break;
      }
    } catch (e) {
      console.error(`Fingerprint API attempt ${attempt + 1} error:`, e);
      if (attempt === 0) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  }

  // Fallback if API failed
  if (!serverData) {
    serverData = {
      ip: "Unknown",
      location: "Unknown",
      isp: "Unknown",
      platform: "Unknown"
    };
  }

  // Wait for minimum 2 seconds
  const elapsed = Date.now() - startTime;
  if (elapsed < 2000) {
    await new Promise(resolve => setTimeout(resolve, 2000 - elapsed));
  }

  if (loader) loader.classList.remove('show');

  // Update heading
  const heading = document.getElementById('recognized-heading');

  if (heading) {
    if (fromIncognito) {
      heading.innerHTML = 'Welcome back, <span class="orange-name">' + name + '!</span>';
    } else {
      heading.innerHTML = 'Penguin still caught you, <span class="orange-name">' + name + '!</span>';
    }
  }

  // Update info fields
  document.getElementById('info-ip').textContent = serverData.ip || "Unknown";
  document.getElementById('info-place').textContent = serverData.location || "Unknown";
  document.getElementById('info-isp').textContent = serverData.isp || "Unknown";
  document.getElementById('info-platform').textContent = (serverData.platform || "Unknown").replaceAll('"', '');

  showScreen('recognized');
}

/* ---------- Status Box ---------- */
function showStatusBox(message, isError) {
  const box = document.getElementById("status-box");
  if (!box) return;

  box.textContent = message;
  box.className = "status-box show";

  if (isError) {
    box.classList.add("error");
  } else {
    box.classList.add("success");
  }

  setTimeout(() => {
    box.classList.remove("show");
  }, 5000);
}

/* ---------- API Calls ---------- */
async function apiStoreName(strongFp, softFp, name) {
  try {
    const formData = new FormData();
    formData.append("strong_fp", strongFp);
    formData.append("soft_fp", softFp);
    formData.append("name", name);

    const res = await fetch("/api/store_name", {
      method: "POST",
      body: formData
    });

    return res.ok;
  } catch (e) {
    console.error(e);
    return false;
  }
}

async function apiDeleteName(strongFp, softFp) {
  try {
    const formData = new FormData();
    formData.append("strong_fp", strongFp);
    formData.append("soft_fp", softFp);

    const res = await fetch("/api/delete_name", {
      method: "POST",
      body: formData
    });

    return res.ok;
  } catch (e) {
    console.error(e);
    return false;
  }
}

async function apiLookup(strongFp, softFp) {
  try {
    const url = `/api/lookup?strong_fp=${encodeURIComponent(strongFp)}&soft_fp=${encodeURIComponent(softFp)}`;
    const res = await fetch(url, {
      headers: {
        'Cache-Control': 'no-cache'
      }
    });

    if (!res.ok) return null;

    const data = await res.json();
    return data.name ? data : null;
  } catch (e) {
    console.error(e);
    throw e; // Re-throw for retry logic
  }
}