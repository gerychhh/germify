// static/core/js/messages.js

(function () {
    // Инициализация (всё в одной функции)
    function initMessages() {
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

                el.classList.remove("messages-unread-badge--pulse");
                void el.offsetWidth;
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
                    credentials: "same-origin",
                    cache: "no-store"
                });
                if (!resp.ok) return;

                const data = await resp.json();
                const count = Number(data.count) || 0;

                const increased =
                    lastGlobalCount !== null && count > lastGlobalCount;
                lastGlobalCount = count;

                setBadge(badgeDesktop, count);
                setBadge(badgeMobile, count);

                if (!increased) {
                    if (badgeDesktop)
                        badgeDesktop.classList.remove(
                            "messages-unread-badge--pulse"
                        );
                    if (badgeMobile)
                        badgeMobile.classList.remove(
                            "messages-unread-badge--pulse"
                        );
                }
            } catch (e) {
                console.error(
                    "Ошибка при запросе непрочитанных сообщений:",
                    e
                );
            }
        }

        if (unreadUrl && (badgeDesktop || badgeMobile)) {
            setTimeout(pollGlobalUnread, 500);
            setInterval(pollGlobalUnread, 2000);
        }

        // =========================================================
        // 2. Пуллинг списка диалогов + поиск
        // =========================================================
        const dialogsWrapper = document.querySelector(
            "#dialogs-wrapper[data-poll-url]"
        );
        const dialogsSearchInput = document.getElementById("dialogs-search");
        let lastDialogsHtml = null;

        function applyDialogSearchFilter() {
            if (!dialogsWrapper || !dialogsSearchInput) return;
            const q = dialogsSearchInput.value.trim().toLowerCase();

            dialogsWrapper.querySelectorAll(".dialog-item").forEach((item) => {
                const haystack = (item.dataset.search || "").toLowerCase();
                if (!q || haystack.includes(q)) {
                    item.style.display = "";
                } else {
                    item.style.display = "none";
                }
            });
        }

        async function pollInbox() {
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

                    // после перерисовки — применяем фильтр
                    applyDialogSearchFilter();
                }
            } catch (e) {
                console.error(
                    "Ошибка при обновлении списка диалогов:",
                    e
                );
            }
        }

        if (dialogsWrapper) {
            setTimeout(pollInbox, 500);
            setInterval(pollInbox, 1000);
        }

        if (dialogsSearchInput) {
            dialogsSearchInput.addEventListener("input", applyDialogSearchFilter);
        }

        // =========================================================
        // 3. Меню по трём точкам + удаление чата (делегирование)
        // =========================================================

        // В некоторых браузерах (чаще Safari) event.target может быть
        // TextNode. Тогда у него нет .closest(), и делегирование кликов
        // ломается полностью. Нормализуем target до Element.
        function getEventTargetElement(event) {
            const t = event.target;
            if (!t) return null;
            if (t instanceof Element) return t;
            // TextNode / CommentNode и т.п.
            return t.parentElement || null;
        }

        function closeAllDialogMenus() {
            document
                .querySelectorAll(".dialog-menu.dialog-menu--open")
                .forEach((menu) =>
                    menu.classList.remove("dialog-menu--open")
                );
        }

        function getCookie(name) {
            let cookieValue = null;
            if (document.cookie && document.cookie !== "") {
                const cookies = document.cookie.split(";");
                for (let i = 0; i < cookies.length; i++) {
                    const cookie = cookies[i].trim();
                    if (
                        cookie.substring(0, name.length + 1) ===
                        name + "="
                    ) {
                        cookieValue = decodeURIComponent(
                            cookie.substring(name.length + 1)
                        );
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

            if (!dialogItem || !deleteUrl) return;

            if (!window.confirm("Удалить чат полностью?")) {
                closeAllDialogMenus();
                // Если меню — bootstrap dropdown, аккуратно закрываем
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
                    console.warn(
                        "messages_delete_thread bad status:",
                        resp.status
                    );
                } else {
                    dialogItem.remove();

                    if (
                        username &&
                        window.location.pathname.includes("/messages/") &&
                        window.location.pathname.includes(username)
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

        // Делегирование кликов — один обработчик на весь документ
        document.addEventListener("click", (event) => {
            const targetEl = getEventTargetElement(event);
            if (!targetEl) return;

            // клик по трём точкам
            const toggle = targetEl.closest(".dialog-menu-toggle");
            if (toggle) {
                // Если это Bootstrap dropdown toggle — не мешаем Bootstrap управлять меню
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
                if (!isOpen) {
                    menu.classList.add("dialog-menu--open");
                }
                return;
            }

            // клик по "Удалить чат"
            const deleteBtn =
                targetEl.closest(".dialog-menu-item--delete");
            if (deleteBtn) {
                event.preventDefault();
                event.stopPropagation();
                handleDeleteChat(deleteBtn);
                return;
            }

            // клик мимо меню — закрываем все
            if (
                !targetEl.closest(".dialog-menu") &&
                !targetEl.closest(".dialog-menu-toggle")
            ) {
                closeAllDialogMenus();
            }
        });
    }

    // Запуск: если DOM уже готов — сразу, иначе ждём
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initMessages);
    } else {
        initMessages();
    }
})();
