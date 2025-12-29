/* ==========================================================================
   GERMiFY UI settings
   Persists theme/scale/font/accent/glass in localStorage and applies to <html data-*>
   ========================================================================== */
(() => {
  const root = document.documentElement;

  const KEYS = {
    theme: "germify_ui_theme",     // light | dark | system
    scale: "germify_ui_scale",     // sm | md | lg | xl
    font:  "germify_ui_font",      // system | inter | serif
    accent:"germify_ui_accent",    // blue | purple | green | orange | rose
    glass: "germify_ui_glass"      // on | off
  };

  const defaults = {
    theme: "light",
    scale: "md",
    font: "system",
    accent: "blue",
    glass: "on"
  };

  let systemMql = null;
  let systemListenerAttached = false;

  function safeGet(key, fallback) {
    try { return localStorage.getItem(key) || fallback; } catch (e) { return fallback; }
  }

  function safeSet(key, value) {
    try { localStorage.setItem(key, value); } catch (e) {}
  }

  function resolveTheme(prefTheme) {
    if (prefTheme !== "system") return prefTheme;
    const prefersDark = systemMql ? systemMql.matches : (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
    return prefersDark ? "dark" : "light";
  }

  function applyAll(prefs) {
    root.dataset.scale = prefs.scale;
    root.dataset.font = prefs.font;
    root.dataset.accent = prefs.accent;
    root.dataset.glass = prefs.glass;

    root.dataset.themePref = prefs.theme;
    root.dataset.theme = resolveTheme(prefs.theme);
  }

  function loadPrefs() {
    return {
      theme: safeGet(KEYS.theme, defaults.theme),
      scale: safeGet(KEYS.scale, defaults.scale),
      font: safeGet(KEYS.font, defaults.font),
      accent: safeGet(KEYS.accent, defaults.accent),
      glass: safeGet(KEYS.glass, defaults.glass)
    };
  }

  function savePrefs(prefs) {
    safeSet(KEYS.theme, prefs.theme);
    safeSet(KEYS.scale, prefs.scale);
    safeSet(KEYS.font, prefs.font);
    safeSet(KEYS.accent, prefs.accent);
    safeSet(KEYS.glass, prefs.glass);
  }

  function attachSystemThemeListener() {
    if (systemListenerAttached) return;
    if (!window.matchMedia) return;

    systemMql = window.matchMedia("(prefers-color-scheme: dark)");
    systemMql.addEventListener?.("change", () => {
      if (root.dataset.themePref === "system") {
        root.dataset.theme = resolveTheme("system");
      }
    });
    systemListenerAttached = true;
  }

  function syncForm(form, prefs) {
    const themeRadio = form.querySelector(`input[name="theme"][value="${prefs.theme}"]`);
    if (themeRadio) themeRadio.checked = true;

    const scaleSel = form.querySelector(`#uiScale`);
    const fontSel = form.querySelector(`#uiFont`);
    const accentSel = form.querySelector(`#uiAccent`);
    if (scaleSel) scaleSel.value = prefs.scale;
    if (fontSel) fontSel.value = prefs.font;
    if (accentSel) accentSel.value = prefs.accent;

    const glassChk = form.querySelector(`#uiGlass`);
    if (glassChk) glassChk.checked = (prefs.glass === "on");
  }

  function readForm(form) {
    const theme = form.querySelector('input[name="theme"]:checked')?.value || defaults.theme;
    const scale = form.querySelector("#uiScale")?.value || defaults.scale;
    const font = form.querySelector("#uiFont")?.value || defaults.font;
    const accent = form.querySelector("#uiAccent")?.value || defaults.accent;
    const glass = form.querySelector("#uiGlass")?.checked ? "on" : "off";
    return { theme, scale, font, accent, glass };
  }

  function bindUI() {
    const form = document.getElementById("uiSettingsForm");
    if (!form) return;

    attachSystemThemeListener();

    const prefs = loadPrefs();
    applyAll(prefs);
    syncForm(form, prefs);

    form.addEventListener("change", () => {
      const next = readForm(form);
      applyAll(next);
      savePrefs(next);
    });

    const resetBtn = document.getElementById("uiResetBtn");
    resetBtn?.addEventListener("click", () => {
      applyAll(defaults);
      savePrefs(defaults);
      syncForm(form, defaults);
    });

    // Alt+S opens settings
    document.addEventListener("keydown", (e) => {
      if (e.altKey && (e.key === "s" || e.key === "S")) {
        const btn = document.querySelector('[data-bs-target="#uiSettings"]');
        btn?.click();
      }
    });
  }

  document.addEventListener("DOMContentLoaded", bindUI);
})();
