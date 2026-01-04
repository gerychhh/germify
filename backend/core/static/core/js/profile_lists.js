(function () {
  function qs(root, sel) { return root ? root.querySelector(sel) : null; }
  function qsa(root, sel) { return root ? Array.from(root.querySelectorAll(sel)) : []; }

  function debounce(fn, ms) {
    let t = null;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  function isSuccess(data) {
    return !!(data && (data.success === true || data.ok === true));
  }

  async function fetchJson(url, signal) {
    const resp = await fetch(url, {
      headers: { "X-Requested-With": "XMLHttpRequest" },
      cache: "no-store",
      signal
    });
    if (!resp.ok) return null;
    return await resp.json().catch(() => null);
  }

  function buildAvatar(item) {
    if (item.avatar_html) {
      const tmp = document.createElement("div");
      tmp.innerHTML = item.avatar_html;
      const avatarEl = tmp.firstElementChild;
      if (avatarEl) return avatarEl;
    }

    const wrap = document.createElement("div");
    wrap.className = "avatar avatar--sm";

    const imgUrl = item.avatar_url || item.avatar || null;
    if (imgUrl) {
      const img = document.createElement("img");
      img.src = imgUrl;
      img.alt = item.title || "";
      img.loading = "lazy";
      wrap.appendChild(img);
      return wrap;
    }

    const initial = document.createElement("span");
    initial.className = "avatar-initial";
    const fb = (item.fallback || item.title || "?").toString().trim();
    initial.textContent = (fb.slice(0, 1) || "?").toUpperCase();
    wrap.appendChild(initial);
    return wrap;
  }

  function buildItem(item) {
    const a = document.createElement("a");
    a.className = "profile-list-item";
    a.href = item.url || "#";

    a.appendChild(buildAvatar(item));

    const meta = document.createElement("div");
    meta.className = "profile-list-meta";

    const title = document.createElement("div");
    title.className = "profile-list-title";
    title.textContent = item.title || "";
    meta.appendChild(title);

    if (item.subtitle) {
      const sub = document.createElement("div");
      sub.className = "profile-list-subtitle";
      sub.textContent = item.subtitle || "";
      meta.appendChild(sub);
    }

    a.appendChild(meta);
    return a;
  }

  function initModal() {
    const modalEl = document.getElementById("profileListModal");
    if (!modalEl || typeof bootstrap === "undefined") return null;
    return new bootstrap.Modal(modalEl);
  }

  function initCounts() {
    const root = document.querySelector("[data-profile-username]");
    if (!root) return;

    const username = root.dataset.profileUsername;
    if (!username) return;

    fetchJson(`/u/${username}/stats.json`).then(data => {
      if (!isSuccess(data)) return;
      const setNum = (key, value) => {
        const el = document.querySelector(`[data-profile-count='${key}']`);
        if (!el) return;
        el.textContent = `${value ?? 0}`;
      };

      setNum("followers", data.followers);
      setNum("following", data.following);
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    const modal = initModal();
    const modalEl = document.getElementById("profileListModal");
    const titleEl = document.getElementById("profileListTitle");
    const countEl = document.getElementById("profileListCount");
    const itemsEl = document.getElementById("profileListItems");
    const loadingEl = document.getElementById("profileListLoading");
    const sentinelEl = document.getElementById("profileListSentinel");
    const emptyEl = document.getElementById("profileListEmpty");
    const searchEl = document.getElementById("profileListSearch");
    const searchForm = document.querySelector(".profile-list-search");

    if (!modal || !modalEl || !itemsEl || !sentinelEl) return;

    let abortCtrl = null;
    let activeBtn = null;
    let lastQuery = "";
    let offset = 0;
    let hasMore = true;
    let inFlight = false;

    function setEmptyVisible(show) {
      if (!emptyEl) return;
      emptyEl.classList.toggle("d-none", !show);
    }

    function setLoading(show) {
      if (!loadingEl) return;
      loadingEl.classList.toggle("d-none", !show);
    }

    function renderItems(items, { reset = false } = {}) {
      if (reset) {
        itemsEl.innerHTML = "";
      }

      const arr = Array.isArray(items) ? items : [];
      if (reset && !arr.length) {
        setEmptyVisible(true);
      } else {
        setEmptyVisible(false);
      }

      arr.forEach(it => itemsEl.appendChild(buildItem(it)));
    }

    function setCountFromButton(btn) {
      if (!countEl || !btn) return;
      const strong = qs(btn, "[data-profile-count]");
      const value = strong ? strong.textContent.trim() : "";
      const caption = btn.dataset.caption || "";
      countEl.textContent = value ? `${caption}: ${value}` : caption;
    }

    async function loadList(query, { reset = false } = {}) {
      if (!activeBtn) return;
      if (inFlight) return;
      if (!hasMore && !reset) return;

      const baseUrl = activeBtn.dataset.url;
      if (!baseUrl) return;

      const url = new URL(baseUrl, window.location.origin);
      if (query) url.searchParams.set("q", query);
      url.searchParams.set("offset", reset ? "0" : String(offset));
      url.searchParams.set("limit", "20");

      if (abortCtrl) abortCtrl.abort();
      abortCtrl = new AbortController();

      try {
        inFlight = true;
        setLoading(true);

        const data = await fetchJson(url.toString(), abortCtrl.signal);
        if (!isSuccess(data)) {
          if (reset) renderItems([], { reset: true });
          return;
        }

        const items = Array.isArray(data.items) ? data.items : [];

        if (reset) offset = 0;
        renderItems(items, { reset });

        offset = data.next_offset ?? offset + items.length;
        hasMore = !!data.has_more;

        if (!itemsEl.children.length) {
          setEmptyVisible(true);
        }
      } catch (e) {
        if (e?.name === "AbortError") return;
        if (reset) renderItems([], { reset: true });
      } finally {
        setLoading(false);
        inFlight = false;
      }
    }

    const debouncedLoad = debounce(() => {
      const q = (searchEl && searchEl.value || "").trim();
      if (q === lastQuery) return;
      lastQuery = q;
      hasMore = true;
      offset = 0;
      loadList(q, { reset: true });
    }, 220);

    if (searchEl) {
      searchEl.addEventListener("input", debouncedLoad);
    }

    if (searchForm) {
      searchForm.addEventListener("submit", (e) => {
        e.preventDefault();
      });
    }

    qsa(document, ".profile-list-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        activeBtn = btn;
        lastQuery = "";
        if (titleEl) titleEl.textContent = btn.dataset.caption || "";
        setCountFromButton(btn);
        if (searchEl) searchEl.value = "";
        renderItems([], { reset: true });
        modal.show();
        offset = 0;
        hasMore = true;
        loadList("", { reset: true });
      });
    });

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            loadList((searchEl && searchEl.value) || "");
          }
        });
      },
      { root: modalEl.querySelector(".modal-body"), rootMargin: "400px 0px", threshold: 0.01 }
    );

    io.observe(sentinelEl);

    modalEl.addEventListener("shown.bs.modal", () => {
      if (searchEl) searchEl.focus();
    });

    modalEl.addEventListener("hidden.bs.modal", () => {
      if (abortCtrl) abortCtrl.abort();
      activeBtn = null;
      lastQuery = "";
      offset = 0;
      hasMore = true;
    });

    initCounts();
  });
})();
