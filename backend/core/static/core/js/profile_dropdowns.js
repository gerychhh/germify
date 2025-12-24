(function () {
  function qs(el, s) { return el ? el.querySelector(s) : null; }
  function qsa(el, s) { return el ? Array.from(el.querySelectorAll(s)) : []; }

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

  function buildAvatar(item) {
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
    a.className = "profile-dd-item";
    a.href = item.url || "#";

    a.appendChild(buildAvatar(item));

    const meta = document.createElement("div");
    meta.className = "profile-dd-meta";

    const title = document.createElement("div");
    title.className = "profile-dd-title";
    title.textContent = item.title || "";

    meta.appendChild(title);

    if (item.subtitle) {
      const sub = document.createElement("div");
      sub.className = "profile-dd-subtitle";
      sub.textContent = item.subtitle || "";
      meta.appendChild(sub);
    }

    a.appendChild(meta);
    return a;
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

  function initOne(drop) {
    const btn = qs(drop, ".profile-dd-toggle");
    const menu = qs(drop, ".profile-dd-menu");
    if (!btn || !menu) return;

    const list = qs(menu, ".profile-dd-list");
    const empty = qs(menu, ".profile-dd-empty");
    const search = qs(menu, ".profile-dd-search");
    const titleEl = qs(menu, ".profile-dd-caption");

    let abortCtrl = null;
    let loadedOnce = false;
    let lastQuery = "";

    function setLoading(on) {
      menu.classList.toggle("is-loading", !!on);
    }

    function renderItems(items) {
      if (!list) return;
      list.innerHTML = "";

      const arr = Array.isArray(items) ? items : [];
      if (!arr.length) {
        if (empty) empty.classList.remove("d-none");
        return;
      }
      if (empty) empty.classList.add("d-none");
      arr.forEach(it => list.appendChild(buildItem(it)));
    }

    async function load(q) {
      const baseUrl = btn.dataset.url;
      if (!baseUrl) return;

      const url = new URL(baseUrl, window.location.origin);
      if (q) url.searchParams.set("q", q);

      if (abortCtrl) abortCtrl.abort();
      abortCtrl = new AbortController();

      setLoading(true);
      const data = await fetchJson(url.toString(), abortCtrl.signal);
      setLoading(false);

      if (!isSuccess(data)) {
        renderItems([]);
        return;
      }
      renderItems(data.items);
    }

    btn.addEventListener("shown.bs.dropdown", () => {
      if (!loadedOnce) {
        loadedOnce = true;
        lastQuery = "";
        if (search) search.value = "";
        load("");
      }
      if (search) setTimeout(() => search.focus(), 50);
    });

    if (search) {
      search.addEventListener("input", debounce(() => {
        const q = (search.value || "").trim();
        if (q === lastQuery && loadedOnce) return;
        lastQuery = q;
        load(q);
      }, 220));
    }

    if (titleEl && btn.dataset.caption) {
      titleEl.textContent = btn.dataset.caption;
    }
  }

  async function initCounts() {
    const root = document.querySelector("[data-profile-username]");
    if (!root) return;

    const username = root.dataset.profileUsername;
    if (!username) return;

    const url = new URL(`/u/${username}/stats.json`, window.location.origin);
    const data = await fetchJson(url.toString());
    if (!isSuccess(data)) return;

    const setNum = (key, value) => {
      const el = document.querySelector(`[data-profile-count='${key}']`);
      if (!el) return;
      el.textContent = `${value ?? 0}`;
    };

    setNum("followers", data.followers);
    setNum("following", data.following);
    setNum("communities_admin", data.communities_admin);
    setNum("communities_joined", data.communities_joined);
  }

  document.addEventListener("DOMContentLoaded", () => {
    qsa(document, ".profile-dd.dropdown").forEach(initOne);
    initCounts();
  });
})();
