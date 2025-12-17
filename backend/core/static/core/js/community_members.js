(function () {
  function initMembers() {
    const btn = document.getElementById("members-load-more");
    const list = document.getElementById("community-members-list");
    let loading = false;

    async function loadMore() {
      if (!btn || !list || loading) return;
      loading = true;

      const url = btn.dataset.url;
      let offset = parseInt(btn.dataset.offset || "0", 10);
      if (!url) { loading = false; return; }

      try {
        const resp = await fetch(url + "?offset=" + offset, {
          headers: { "X-Requested-With": "XMLHttpRequest" },
          credentials: "same-origin",
          cache: "no-store",
        });
        if (!resp.ok) throw new Error("HTTP " + resp.status);

        const data = await resp.json();
        if (data.html) list.insertAdjacentHTML("beforeend", data.html);

        btn.dataset.offset = String(data.next_offset || (offset + 7));
        if (!data.has_more) btn.remove();
      } catch (e) {
        console.error("members load error:", e);
      } finally {
        loading = false;
      }
    }

    if (btn) btn.addEventListener("click", loadMore);
  }

  function initDescToggles() {
    document.querySelectorAll(".community-desc-toggle").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.target;
        const el = document.getElementById(id);
        if (!el) return;

        const expanded = el.classList.toggle("is-expanded");
        btn.textContent = expanded ? "Свернуть" : "Показать полностью";
      });
    });
  }

  function init() {
    initMembers();
    initDescToggles();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();