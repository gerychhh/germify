(function () {
  function qs(sel, root) { return (root || document).querySelector(sel); }
  function getJson(url, signal) {
    return fetch(url, {
      headers: { "X-Requested-With": "XMLHttpRequest" },
      credentials: "same-origin",
      cache: "no-store",
      signal,
    }).then(r => {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
  }

  function debounce(fn, ms) {
    let t = null;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  function init() {
    const form = qs("#communities-search-form");
    const input = qs("#communities-q");
    const list = qs("#communities-list");
    const sentinel = qs("#communities-sentinel");
    if (!list || !sentinel) return;

    let loading = false;
    let currentQuery = (sentinel.dataset.q || "").trim();
    let controller = null;

    function setSentinel(hasNext, nextPage, q) {
      sentinel.dataset.hasNext = hasNext ? "1" : "0";
      sentinel.dataset.nextPage = nextPage ? String(nextPage) : "";
      sentinel.dataset.q = q || "";
    }

    function buildUrl(page, q) {
      const u = new URL(window.location.href);
      u.searchParams.set("page", String(page));
      if (q && q.trim()) u.searchParams.set("q", q.trim());
      else u.searchParams.delete("q");
      return u.pathname + u.search;
    }

    async function loadPage({ page, q, replace }) {
      if (loading) return;
      loading = true;

      if (controller) controller.abort();
      controller = new AbortController();

      try {
        const url = buildUrl(page, q);
        const data = await getJson(url, controller.signal);

        if (replace) list.innerHTML = data.html || "";
        else list.insertAdjacentHTML("beforeend", data.html || "");

        setSentinel(!!data.has_next, data.next_page || "", q);

        // обновим URL красиво (чтобы можно было делиться ссылкой)
        const u = new URL(window.location.href);
        if (q && q.trim()) u.searchParams.set("q", q.trim());
        else u.searchParams.delete("q");
        u.searchParams.delete("page");
        window.history.replaceState({}, "", u.pathname + u.search);

      } catch (e) {
        if (e.name !== "AbortError") console.error("communities load error:", e);
      } finally {
        loading = false;
      }
    }

    const realtime = debounce(() => {
      const q = (input ? input.value : "").trim();
      currentQuery = q;
      loadPage({ page: 1, q: currentQuery, replace: true });
    }, 220);

    if (input) input.addEventListener("input", realtime);

    if (form) {
      form.addEventListener("submit", (e) => {
        // оставляем кнопку "Найти", но делаем UX без перезагрузки
        e.preventDefault();
        const q = (input ? input.value : "").trim();
        currentQuery = q;
        loadPage({ page: 1, q: currentQuery, replace: true });
      });
    }

    async function loadNext() {
      const hasNext = sentinel.dataset.hasNext === "1";
      const nextPage = parseInt(sentinel.dataset.nextPage || "", 10);
      if (!hasNext || !nextPage || loading) return;
      await loadPage({ page: nextPage, q: currentQuery, replace: false });
    }

    // IntersectionObserver
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) loadNext();
        });
      }, { root: null, rootMargin: "600px 0px", threshold: 0 });
      io.observe(sentinel);
    }

    // fallback scroll
    window.addEventListener("scroll", debounce(() => {
      const rect = sentinel.getBoundingClientRect();
      if (rect.top < window.innerHeight + 600) loadNext();
    }, 120));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();