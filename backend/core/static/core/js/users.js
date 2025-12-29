(function () {
  const input = document.getElementById("usersSearchInput");
  const list = document.getElementById("usersList");
  const sentinel = document.getElementById("usersSentinel");
  const loading = document.getElementById("usersLoading");

  if (!input || !list || !sentinel) return;

  const pollUrl = sentinel.dataset.pollUrl;
  const limit = parseInt(sentinel.dataset.limit || "20", 10);

  let q = (input.value || "").trim();
  let offset = parseInt(sentinel.dataset.nextOffset || "0", 10);
  let hasMore = (sentinel.dataset.hasMore || "0") === "1";
  let inFlight = false;
  let controller = null;

  function setLoading(on) {
    if (!loading) return;
    loading.hidden = !on;
  }

  function updateUrlQuery() {
    try {
      const url = new URL(window.location.href);
      if (q) url.searchParams.set("q", q);
      else url.searchParams.delete("q");
      history.replaceState(null, "", url.toString());
    } catch (e) {}
  }

  async function fetchChunk({ reset = false } = {}) {
    if (inFlight) return;
    if (!hasMore && !reset) return;

    inFlight = true;
    setLoading(true);

    if (controller) controller.abort();
    controller = new AbortController();

    const params = new URLSearchParams();
    if (q) params.set("q", q);
    params.set("offset", reset ? "0" : String(offset));
    params.set("limit", String(limit));

    try {
      const resp = await fetch(`${pollUrl}?${params.toString()}`, {
        headers: { "X-Requested-With": "XMLHttpRequest" },
        signal: controller.signal,
      });

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const data = await resp.json();
      const html = data.html || "";

      if (reset) {
        list.innerHTML = html;
        offset = parseInt(data.next_offset || "0", 10);
      } else {
        list.insertAdjacentHTML("beforeend", html);
        offset = parseInt(data.next_offset || String(offset), 10);
      }

      hasMore = !!data.has_more;
      sentinel.dataset.nextOffset = String(offset);
      sentinel.dataset.hasMore = hasMore ? "1" : "0";
    } catch (e) {
      // ignore aborts
      if (e && e.name !== "AbortError") {
        console.error(e);
      }
    } finally {
      setLoading(false);
      inFlight = false;
    }
  }

  // Infinite scroll
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) fetchChunk({ reset: false });
      }
    },
    { root: null, rootMargin: "600px 0px", threshold: 0.01 }
  );
  io.observe(sentinel);

  // Debounced realtime search
  let t = null;
  input.addEventListener("input", () => {
    const next = (input.value || "").trim();
    if (next === q) return;

    q = next;
    hasMore = true;
    offset = 0;
    sentinel.dataset.nextOffset = "0";
    sentinel.dataset.hasMore = "1";
    updateUrlQuery();

    if (t) clearTimeout(t);
    t = setTimeout(() => fetchChunk({ reset: true }), 250);
  });

  // -------------------------------------------------------------------
  // Follow / unfollow (AJAX, no page reload)
  // -------------------------------------------------------------------
  function getCookie(name) {
    const m = document.cookie.match(new RegExp("(?:^|; )" + name.replace(/([.$?*|{}()\[\]\\\/\+^])/g, "\\$1") + "=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : "";
  }

  function csrfToken() {
    return getCookie("csrftoken");
  }

  function setFollowUI(form, isFollowing) {
    const btn = form.querySelector(".follow-btn");
    if (!btn) return;

    const followUrl = form.dataset.followUrl;
    const unfollowUrl = form.dataset.unfollowUrl;

    if (isFollowing) {
      form.action = unfollowUrl || form.action;
      form.dataset.following = "1";
      btn.textContent = "Отписаться";
      btn.classList.remove("btn-primary");
      btn.classList.add("btn-outline-secondary");
    } else {
      form.action = followUrl || form.action;
      form.dataset.following = "0";
      btn.textContent = "Подписаться";
      btn.classList.remove("btn-outline-secondary");
      btn.classList.add("btn-primary");
    }
  }

  // Event delegation: works for newly appended cards too.
  document.addEventListener(
    "submit",
    async (e) => {
      const form = e.target && e.target.closest ? e.target.closest(".follow-form") : null;
      if (!form) return;

      e.preventDefault();

      const btn = form.querySelector(".follow-btn");
      if (btn) btn.disabled = true;

      try {
        const resp = await fetch(form.action, {
          method: "POST",
          headers: {
            "X-Requested-With": "XMLHttpRequest",
            "X-CSRFToken": csrfToken(),
            Accept: "application/json",
          },
          body: new FormData(form),
        });

        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

        const data = await resp.json();
        setFollowUI(form, !!data.following);
      } catch (err) {
        console.error(err);
      } finally {
        if (btn) btn.disabled = false;
      }
    },
    true
  );
})();
