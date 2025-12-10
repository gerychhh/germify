// static/core/js/messages.js

document.addEventListener("DOMContentLoaded", function () {
    // =========================================================
    // 1. Глобовый счётчик непрочитанных в шапке
    // =========================================================
    const body = document.body;
    const unreadUrl = body.dataset.unreadUrl || null;

    const badgeDesktop = document.getElementById("global-unread-desktop");
    const badgeMobile = document.getElementById("global-unread-mobile");

    let lastGlobalCount = null;

    function setBadge(el, count) {
        if (!el) return;

        if (count > 0) {
            el.textContent = String(count);
            el.style.display = "inline-flex";

            // Лёгкий "пульс", если число выросло
            el.classList.remove("messages-unread-badge--pulse");
            void el.offsetWidth; // форсим reflow
            el.classList.add("messages-unread-badge--pulse");
        } else {
            el.textContent = "0";
            el.style.display = "none";
            el.classList.remove("messages-unread-badge--pulse");
        }
    }

    async function pollGlobalUnread() {
        if (!unreadUrl || (!badgeDesktop && !badgeMobile)) return;

        try {
            const resp = await fetch(unreadUrl, {
                headers: { "X-Requested-With": "XMLHttpRequest" },
                cache: "no-store"
            });
            if (!resp.ok) return;

            const data = await resp.json();
            const count = Number(data.count) || 0;

            // пульс только при увеличении
            const increased = lastGlobalCount !== null && count > lastGlobalCount;
            lastGlobalCount = count;

            setBadge(badgeDesktop, count);
            setBadge(badgeMobile, count);

            if (!increased) {
                // если не выросло — убираем анимацию
                if (badgeDesktop) badgeDesktop.classList.remove("messages-unread-badge--pulse");
                if (badgeMobile) badgeMobile.classList.remove("messages-unread-badge--pulse");
            }
        } catch (e) {
            console.error("Ошибка при запросе непрочитанных сообщений:", e);
        }
    }

    if (unreadUrl && (badgeDesktop || badgeMobile)) {
        // первый запрос чуть позже, потом — периодически
        setTimeout(pollGlobalUnread, 500);
        setInterval(pollGlobalUnread, 2000);
    }

    // =========================================================
    // 2. Пуллинг списка диалогов в левой колонке
    // =========================================================
    const dialogsWrapper = document.querySelector("#dialogs-wrapper[data-poll-url]");
    let lastDialogsHtml = null;

    async function pollInbox() {
        if (!dialogsWrapper) return;

        const pollUrl = dialogsWrapper.dataset.pollUrl;
        if (!pollUrl) return;

        try {
            const resp = await fetch(pollUrl, {
                headers: { "X-Requested-With": "XMLHttpRequest" },
                cache: "no-store"
            });
            if (!resp.ok) return;

            const data = await resp.json();
            if (data.html && data.html !== lastDialogsHtml) {
                dialogsWrapper.innerHTML = data.html; // ВАЖНО: innerHTML, не textContent
                lastDialogsHtml = data.html;
            }
        } catch (e) {
            console.error("Ошибка при обновлении списка диалогов:", e);
        }
    }

    if (dialogsWrapper) {
        setTimeout(pollInbox, 500);
        setInterval(pollInbox, 1000);
    }
});
