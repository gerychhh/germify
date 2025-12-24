// static/core/js/code_copy.js
(function () {
  function getCodeText(codehilite) {
    // Pygments with line numbers: .codehilite table td.code pre
    const preInTd = codehilite.querySelector("td.code pre");
    if (preInTd) return preInTd.innerText || preInTd.textContent || "";

    // Simple: .codehilite pre
    const pre = codehilite.querySelector("pre");
    if (pre) return pre.innerText || pre.textContent || "";

    return "";
  }

  async function copyToClipboard(text) {
    if (!text) return false;

    // modern
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (e) {}
    }

    // fallback
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "readonly");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch (e) {
      return false;
    }
  }

  function ensureButton(codehilite) {
    if (!codehilite || codehilite.dataset.copyInited === "1") return;

    const text = getCodeText(codehilite).trim();
    if (!text) return;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "code-copy-btn";
    btn.textContent = "Copy";

    btn.addEventListener("click", async () => {
      const ok = await copyToClipboard(getCodeText(codehilite));
      const old = btn.textContent;
      btn.textContent = ok ? "Скопировано" : "Ошибка";
      setTimeout(() => (btn.textContent = old), 1400);
    });

    codehilite.appendChild(btn);
    codehilite.dataset.copyInited = "1";
  }

  function init(root) {
    const scope = root || document;
    const blocks = scope.querySelectorAll ? scope.querySelectorAll(".codehilite") : [];
    blocks.forEach(ensureButton);
  }

  // init on load
  document.addEventListener("DOMContentLoaded", () => {
    init(document);

    // auto-init on AJAX inserts
    const obs = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (!node || node.nodeType !== 1) continue; // only elements
          if (node.matches && node.matches(".codehilite")) ensureButton(node);
          init(node);
        }
      }
    });

    obs.observe(document.body, { childList: true, subtree: true });
  });

  // optional manual hook
  window.initCodeCopyButtons = init;
})();
