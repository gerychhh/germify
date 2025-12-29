// static/core/js/messages.js
//
// Realtime notifications via WebSocket (/ws/notifications/).
// Fallback to rare polling if WS is unavailable.

(function () {
    const WS_PATH = "/ws/notifications/";

    function safeJsonParse(s) {
        try {
            return JSON.parse(s);
        } catch (e) {
            return null;
        }
    }

    function buildWsUrl() {
        const proto = window.location.protocol === "https:" ? "wss" : "ws";
        return `${proto}://${window.location.host}${WS_PATH}`;
    }

    function initMessages() {
        const body = document.body;

        // If user is not authenticated, base.html won't include unreadUrl.
        const unreadUrl = body.dataset.unreadUrl || null;

        const badgeDesktop = document.getElementById("global-unread-desktop");
        const badgeMobile = document.getElementById("global-unread-mobile");

        const dialogsWrapper = document.querySelector("#dialogs-wrapper[data-poll-url]");
        const dialogsSearchInput = document.getElementById("dialogs-search");
        let lastDialogsHtml = null;

        let lastGlobalCount = null;

        // If present, right-side chat pane can be replaced via AJAX (no full page reload)
        const chatPane = document.getElementById("messages-chat-pane");

        function setBadge(el, count) {
            if (!el) return;

            if (count > 0) {
                el.textContent = String(count);
                el.style.display = "inline-flex";

                el.classList.remove("messages-unread-badge--pulse");
                void el.offsetWidth;
                el.classList.add("messages-unread-badge--pulse");
            } else {
                el.textContent = "0";
                el.style.display = "none";
                el.classList.remove("messages-unread-badge--pulse");
            }
        }

        function applyDialogSearchFilter() {
            if (!dialogsWrapper || !dialogsSearchInput) return;
            const q = dialogsSearchInput.value.trim().toLowerCase();

            dialogsWrapper.querySelectorAll(".dialog-item").forEach((item) => {
                const haystack = (item.dataset.search || "").toLowerCase();
                item.style.display = !q || haystack.includes(q) ? "" : "none";
            });
        }

        // -------------------------
        // AJAX chat navigation (no full page reload)
        // -------------------------
        function isModifiedClick(e) {
            return !!(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button === 1);
        }

        function setActiveDialogByUrl(url) {
            if (!dialogsWrapper) return;
            const u = String(url || "");
            dialogsWrapper.querySelectorAll(".dialog-item").forEach((it) => it.classList.remove("is-active"));

            const link = dialogsWrapper.querySelector(`a.dialog-main-link[href="${CSS.escape(u)}"]`);
            const item = link ? link.closest(".dialog-item") : null;
            if (item) item.classList.add("is-active");
        }

        async function loadChatIntoPane(url, { push = true } = {}) {
            if (!chatPane || !url) return;

            try {
                const resp = await fetch(url, {
                    headers: { "X-Requested-With": "XMLHttpRequest" },
                    credentials: "same-origin",
                    cache: "no-store",
                });

                if (resp.status === 403) {
                    // Server returns JSON redirect for revoked access
                    const data403 = await resp.json().catch(() => null);
                    window.location.href = (data403 && data403.redirect) ? data403.redirect : "/messages/";
                    return;
                }

                if (!resp.ok) {
                    // fallback to normal navigation
                    window.location.href = url;
                    return;
                }

                const html = await resp.text();
                // Cleanup previous thread listeners (window events)
                if (typeof window.germifyDestroyThread === "function") {
                    try { window.germifyDestroyThread(); } catch (e) {}
                }
                chatPane.innerHTML = html;

                // init thread logic for newly inserted DOM
                if (typeof window.germifyInitThread === "function") {
                    window.germifyInitThread();
                }

                if (push) {
                    try { window.history.pushState({ germify_chat_url: url }, "", url); } catch (e) {}
                }

                setActiveDialogByUrl(url);
            } catch (e) {
                // If fetch failed, just navigate normally
                window.location.href = url;
            }
        }

        function initAjaxChatNav() {
            if (!dialogsWrapper || !chatPane) return;

            // mark active on first load
            setActiveDialogByUrl(window.location.pathname);

            if (!dialogsWrapper.dataset.ajaxNavBound) {
                dialogsWrapper.dataset.ajaxNavBound = "1";
                dialogsWrapper.addEventListener("click", (e) => {
                    const a = e.target && e.target.closest ? e.target.closest("a.dialog-main-link") : null;
                    if (!a) return;
                    if (isModifiedClick(e)) return;
                    if (a.getAttribute("target") === "_blank") return;

                    // do not intercept clicks from dropdown/menu button
                    if (e.target && e.target.closest && e.target.closest(".dialog-menu-wrapper")) return;

                    e.preventDefault();
                    e.stopPropagation();
                    loadChatIntoPane(a.href, { push: true });
                });
            }

            if (!window.__germifyPopstateBound) {
                window.__germifyPopstateBound = true;
                window.addEventListener("popstate", (ev) => {
                    const st = ev.state || {};
                    const url = st.germify_chat_url || window.location.pathname;
                    // popstate should not push again
                    loadChatIntoPane(url, { push: false });
                });
            }
        }

        // -------------------------
        // Fallback polling (rare)
        // -------------------------
        let fallbackTimers = [];
        function stopFallbackPolling() {
            fallbackTimers.forEach((t) => clearInterval(t));
            fallbackTimers = [];
        }

        async function pollGlobalUnreadOnce() {
            if (!unreadUrl || (!badgeDesktop && !badgeMobile)) return;

            try {
                const resp = await fetch(unreadUrl, {
                    headers: { "X-Requested-With": "XMLHttpRequest" },
                    credentials: "same-origin",
                    cache: "no-store"
                });
                if (!resp.ok) return;

                const data = await resp.json();
                const count = Number(data.count) || 0;

                const increased = lastGlobalCount !== null && count > lastGlobalCount;
                lastGlobalCount = count;

                setBadge(badgeDesktop, count);
                setBadge(badgeMobile, count);

                if (!increased) {
                    badgeDesktop && badgeDesktop.classList.remove("messages-unread-badge--pulse");
                    badgeMobile && badgeMobile.classList.remove("messages-unread-badge--pulse");
                }
            } catch (e) {
                // silent
            }
        }

        async function pollInboxOnce() {
            if (!dialogsWrapper) return;
            const pollUrl = dialogsWrapper.dataset.pollUrl;
            if (!pollUrl) return;

            try {
                const resp = await fetch(pollUrl, {
                    headers: { "X-Requested-With": "XMLHttpRequest" },
                    credentials: "same-origin",
                    cache: "no-store"
                });
                if (!resp.ok) return;

                const data = await resp.json();
                if (data.html && data.html !== lastDialogsHtml) {
                    dialogsWrapper.innerHTML = data.html;
                    lastDialogsHtml = data.html;
                    applyDialogSearchFilter();
                }
            } catch (e) {
                // silent
            }
        }

        function startFallbackPolling() {
            if (fallbackTimers.length) return;

            // Slow fallback intervals (WS is the primary channel).
            if (unreadUrl && (badgeDesktop || badgeMobile)) {
                pollGlobalUnreadOnce();
                fallbackTimers.push(setInterval(pollGlobalUnreadOnce, 15000));
            }
            if (dialogsWrapper) {
                pollInboxOnce();
                fallbackTimers.push(setInterval(pollInboxOnce, 15000));
            }
        }

        if (dialogsSearchInput) {
            dialogsSearchInput.addEventListener("input", applyDialogSearchFilter);
        }

        // Enable SPA-like chat switching when both sidebar and right pane exist
        initAjaxChatNav();

        // -------------------------
        // WebSocket primary channel
        // -------------------------
        let ws = null;
        let reconnectTimer = null;
        let openedOnce = false;

        function wsSend(payload) {
            if (!ws || ws.readyState !== WebSocket.OPEN) return false;
            ws.send(JSON.stringify(payload));
            return true;
        }

        function handlePush(data) {
            if (!data || typeof data !== "object") return;

            // Unread updates
            // NOTE: do NOT return early here — some payloads may also carry inbox_html.
            if (data.type === "unread_total") {
                const count = Number(data.count) || 0;
                lastGlobalCount = count;
                setBadge(badgeDesktop, count);
                setBadge(badgeMobile, count);
            }
            if (typeof data.unread_total === "number") {
                const count = Number(data.unread_total) || 0;
                lastGlobalCount = count;
                setBadge(badgeDesktop, count);
                setBadge(badgeMobile, count);
            }

            // “mark_read” server response: update inbox immediately
            if (data.type === "inbox_update") {
                // handled by blocks above + inbox_html below
            }

            // Inbox re-render
            if (data.inbox_html && dialogsWrapper) {
                dialogsWrapper.innerHTML = data.inbox_html;
                lastDialogsHtml = data.inbox_html;
                applyDialogSearchFilter();
            }

            // Let other scripts (thread page) know about new messages.
            if (data.type === "message_new") {
                window.dispatchEvent(new CustomEvent("germify:message_new", { detail: data }));
                document.dispatchEvent(new CustomEvent("germify:message_new", { detail: data }));
            }

            // Read receipts / read pointers
            if (data.type === "chat_read") {
                window.dispatchEvent(new CustomEvent("germify:chat_read", { detail: data }));
                document.dispatchEvent(new CustomEvent("germify:chat_read", { detail: data }));
            }

            // Group chat meta updates (rename / members / kick)
            if (data.type && (data.type === "chat_access_revoked" || String(data.type).startsWith("chat_"))) {
                window.dispatchEvent(new CustomEvent("germify:chat_event", { detail: data }));
                document.dispatchEvent(new CustomEvent("germify:chat_event", { detail: data }));
            }
        }

        // -------------------------
        // AJAX navigation between chats (no full page reload)
        // -------------------------
        function setActiveDialogByHref(href) {
            if (!dialogsWrapper) return;
            const links = dialogsWrapper.querySelectorAll("a.dialog-main-link");
            links.forEach((a) => {
                const item = a.closest(".dialog-item");
                if (!item) return;
                const same = a.getAttribute("href") === href;
                item.classList.toggle("is-active", same);
            });
        }

        async function loadChatIntoPane(url, { push = true } = {}) {
            if (!chatPane || !url) return;

            // Cleanup previous thread listeners (important: window event listeners)
            try {
                if (typeof window.germifyDestroyThread === "function") {
                    window.germifyDestroyThread();
                }
            } catch (e) {}

            let resp;
            try {
                resp = await fetch(url, {
                    headers: { "X-Requested-With": "XMLHttpRequest" },
                    credentials: "same-origin",
                    cache: "no-store",
                });
            } catch (e) {
                // network error -> fallback to full navigation
                window.location.href = url;
                return;
            }

            if (resp.status === 403) {
                // server may return redirect JSON
                const data403 = await resp.json().catch(() => null);
                window.location.href = (data403 && data403.redirect) ? data403.redirect : "/messages/";
                return;
            }

            if (!resp.ok) {
                window.location.href = url;
                return;
            }

            const html = await resp.text();
            chatPane.innerHTML = html;

            // Mark active item
            setActiveDialogByHref(url);

            // Update browser URL
            if (push && window.history && history.pushState) {
                history.pushState({ germifyChatUrl: url }, "", url);
            }

            // Init thread logic inside injected HTML
            if (typeof window.germifyInitThread === "function") {
                try { window.germifyInitThread(); } catch (e) {}
            }
        }

        function bindAjaxChatNavigation() {
            if (!dialogsWrapper || !chatPane) return;
            if (dialogsWrapper.dataset.ajaxNavBound === "1") return;
            dialogsWrapper.dataset.ajaxNavBound = "1";

            dialogsWrapper.addEventListener("click", (ev) => {
                const a = ev.target && ev.target.closest ? ev.target.closest("a.dialog-main-link") : null;
                if (!a) return;

                // ignore modified clicks
                if (ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;

                const href = a.getAttribute("href");
                if (!href) return;

                ev.preventDefault();
                ev.stopPropagation();
                loadChatIntoPane(href, { push: true });
            });

            // Back/forward support
            window.addEventListener("popstate", (ev) => {
                const st = ev.state;
                const url = (st && st.germifyChatUrl) ? st.germifyChatUrl : window.location.pathname;
                // Only handle when we are on messages pages
                if (!String(url || "").startsWith("/messages")) return;
                loadChatIntoPane(url, { push: false });
            });

            // If we landed on a thread URL, ensure active highlight
            setActiveDialogByHref(window.location.pathname);
        }

        function scheduleReconnect() {
            if (reconnectTimer) return;
            reconnectTimer = setTimeout(() => {
                reconnectTimer = null;
                connectWs();
            }, 4000);
        }

        function connectWs() {
            // If not authenticated (no unread url), skip WS completely.
            if (!unreadUrl) return;

            try {
                ws = new WebSocket(buildWsUrl());
            } catch (e) {
                startFallbackPolling();
                return;
            }

            ws.addEventListener("open", () => {
                openedOnce = true;
                stopFallbackPolling();
            });

            ws.addEventListener("message", (ev) => {
                const data = typeof ev.data === "string" ? safeJsonParse(ev.data) : null;
                handlePush(data);
            });

            ws.addEventListener("close", () => {
                // If WS was never opened, or connection dropped — keep UI alive with fallback.
                startFallbackPolling();
                scheduleReconnect();
            });

            ws.addEventListener("error", () => {
                // Close will follow.
            });
        }

        // Expose minimal API for other scripts
        window.GermifyWS = window.GermifyWS || {};
        window.GermifyWS.send = wsSend;
        window.GermifyWS.isOpen = () => !!ws && ws.readyState === WebSocket.OPEN;

        // Allow thread script to "refresh unread" without HTTP requests.
        window.germifyUpdateUnread = function () {
            if (!wsSend({ type: "get_unread" })) {
                // fallback single request if WS is down
                pollGlobalUnreadOnce();
            }
        };

        // Start WS; if it doesn't open quickly, start fallback.
        connectWs();
        setTimeout(() => {
            if (!openedOnce) startFallbackPolling();
        }, 2500);

        // -------------------------
        // Menus (unchanged)
        // -------------------------
        function getEventTargetElement(event) {
            const t = event.target;
            if (!t) return null;
            if (t instanceof Element) return t;
            return t.parentElement || null;
        }

        function closeAllDialogMenus() {
            document
                .querySelectorAll(".dialog-menu.dialog-menu--open")
                .forEach((menu) => menu.classList.remove("dialog-menu--open"));
        }

        function getCookie(name) {
            let cookieValue = null;
            if (document.cookie && document.cookie !== "") {
                const cookies = document.cookie.split(";");
                for (let i = 0; i < cookies.length; i++) {
                    const cookie = cookies[i].trim();
                    if (cookie.substring(0, name.length + 1) === name + "=") {
                        cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                        break;
                    }
                }
            }
            return cookieValue;
        }

        async function handleDeleteChat(deleteBtn) {
            const dialogItem = deleteBtn.closest(".dialog-item");
            const deleteUrl = deleteBtn.dataset.deleteUrl;
            const username = deleteBtn.dataset.username;
            const chatId = deleteBtn.dataset.chatId;

            if (!dialogItem || !deleteUrl) return;

            if (!window.confirm("Удалить чат полностью?")) {
                closeAllDialogMenus();
                try {
                    const dd = deleteBtn.closest(".dropdown");
                    if (dd) {
                        const t = dd.querySelector('[data-bs-toggle="dropdown"]');
                        if (t && window.bootstrap && bootstrap.Dropdown) {
                            bootstrap.Dropdown.getOrCreateInstance(t).hide();
                        }
                    }
                } catch (e) {}
                return;
            }

            try {
                const resp = await fetch(deleteUrl, {
                    method: "POST",
                    headers: {
                        "X-Requested-With": "XMLHttpRequest",
                        "X-CSRFToken": getCookie("csrftoken")
                    },
                    credentials: "same-origin"
                });

                if (!resp.ok) {
                    console.warn("messages_delete_thread bad status:", resp.status);
                } else {
                    dialogItem.remove();

                    const path = window.location.pathname;
                    if (chatId && path.includes(`/messages/chat/${chatId}/`)) {
                        window.location.href = "/messages/";
                    } else if (
                        username &&
                        path.includes("/messages/") &&
                        path.includes(username)
                    ) {
                        window.location.href = "/messages/";
                    }
                }
            } catch (e) {
                console.error("Ошибка при удалении чата:", e);
            } finally {
                closeAllDialogMenus();
            }
        }

        document.addEventListener("click", (event) => {
            const targetEl = getEventTargetElement(event);
            if (!targetEl) return;

            const toggle = targetEl.closest(".dialog-menu-toggle");
            if (toggle) {
                if (toggle.matches('[data-bs-toggle="dropdown"]')) {
                    return;
                }

                event.preventDefault();
                event.stopPropagation();

                const item = toggle.closest(".dialog-item");
                if (!item) return;

                const menu = item.querySelector(".dialog-menu");
                if (!menu) return;

                const isOpen = menu.classList.contains("dialog-menu--open");
                closeAllDialogMenus();
                if (!isOpen) menu.classList.add("dialog-menu--open");
                return;
            }

            const deleteBtn = targetEl.closest(".dialog-menu-item--delete, .dialog-menu-item--leave");
            if (deleteBtn) {
                event.preventDefault();
                event.stopPropagation();
                handleDeleteChat(deleteBtn);
                return;
            }

            if (!targetEl.closest(".dialog-menu") && !targetEl.closest(".dialog-menu-toggle")) {
                closeAllDialogMenus();
            }
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initMessages);
    } else {
        initMessages();
    }
})();
