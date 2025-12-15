// static/core/js/messages_thread.js

(function () {
    let pollTimer = null;

    function initThread() {
        // останавливаем старый пуллер, если был
        if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
        }

        const list = document.querySelector("#messages-list");
        if (!list) return;

        const container = list.closest(".thread-messages") || list;

        const form = document.querySelector("#message-form");
        const scrollBtn = document.getElementById("scroll-bottom-btn");
        const scrollUnreadBadge = scrollBtn
            ? scrollBtn.querySelector(".scroll-bottom-unread")
            : null;

        if (!form) return;

        const input = form.querySelector("textarea[name='text']");
        const sendUrl = form.dataset.sendUrl;
        const pollUrl = list.dataset.pollUrl;

        let lastId = parseInt(list.dataset.lastId || "0");
        let unreadInView = 0;
        let isAtBottom = true;

        function recalcIsAtBottom() {
            const threshold = 4;
            const distance =
                container.scrollHeight - (container.scrollTop + container.clientHeight);
            return distance <= threshold;
        }

        function scrollToBottom(options = { smooth: false }) {
            const behavior = options.smooth ? "smooth" : "auto";
            container.scrollTo({ top: container.scrollHeight, behavior });
        }

        function updateScrollButton() {
            if (!scrollBtn) return;

            if (isAtBottom) {
                scrollBtn.style.display = "none";
                unreadInView = 0;
                if (scrollUnreadBadge) scrollUnreadBadge.style.display = "none";
                return;
            }

            scrollBtn.style.display = "inline-flex";

            if (scrollUnreadBadge) {
                if (unreadInView > 0) {
                    scrollUnreadBadge.style.display = "inline-flex";
                    scrollUnreadBadge.textContent =
                        unreadInView > 99 ? "99+" : unreadInView.toString();
                } else {
                    scrollUnreadBadge.style.display = "none";
                }
            }
        }

        function triggerGlobalUnreadUpdate() {
            if (typeof window.germifyUpdateUnread === "function") {
                window.germifyUpdateUnread();
            }
        }

        // --- Инициализация скролла ---
        scrollToBottom({ smooth: false });
        isAtBottom = true;
        updateScrollButton();

        container.addEventListener("scroll", () => {
            const nowAtBottom = recalcIsAtBottom();

            if (nowAtBottom && !isAtBottom) {
                unreadInView = 0;
            }

            isAtBottom = nowAtBottom;
            updateScrollButton();
        });

        if (scrollBtn) {
            scrollBtn.addEventListener("click", () => {
                scrollToBottom({ smooth: true });
                unreadInView = 0;
                isAtBottom = true;
                updateScrollButton();
            });
        }

        // --- Отправка сообщения ---
        form.addEventListener("submit", async (e) => {
            e.preventDefault();
            if (!input) return;

            const text = input.value.trim();
            if (!text) return;

            let resp;
            try {
                resp = await fetch(sendUrl, {
                    method: "POST",
                    headers: { "X-Requested-With": "XMLHttpRequest" },
                    body: new FormData(form)
                });
            } catch (err) {
                console.error("Ошибка при отправке сообщения:", err);
                return;
            }

            if (!resp.ok) {
                console.warn("messages_send bad status:", resp.status);
                return;
            }

            const data = await resp.json();
            if (data.html) {
                list.insertAdjacentHTML("beforeend", data.html);
                lastId = data.id;
                input.value = "";

                scrollToBottom({ smooth: true });
                isAtBottom = true;
                unreadInView = 0;
                updateScrollButton();

                triggerGlobalUnreadUpdate();
            }
        });

        // Enter = отправить, Shift+Enter = перенос
        if (input) {
            input.addEventListener("keydown", (e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    form.dispatchEvent(new Event("submit", { cancelable: true }));
                }
            });
        }

        // --- Пул новых сообщений ---
        async function poll() {
            if (!pollUrl) return;

            let resp;
            try {
                resp = await fetch(`${pollUrl}?after=${lastId}`, {
                    headers: { "X-Requested-With": "XMLHttpRequest" }
                });
            } catch (err) {
                console.error("Ошибка при пулле новых сообщений:", err);
                return;
            }

            if (!resp.ok) {
                console.warn("messages_poll bad status:", resp.status);
                return;
            }

            const data = await resp.json();
            if (!data.html) return;

            const wasAtBottom = isAtBottom;

            list.insertAdjacentHTML("beforeend", data.html);

            const items = list.querySelectorAll(".message-item");
            if (items.length > 0) {
                lastId = parseInt(items[items.length - 1].dataset.id);
            }

            if (wasAtBottom) {
                scrollToBottom({ smooth: true });
                isAtBottom = true;
                unreadInView = 0;
            } else {
                const delta =
                    typeof data.count === "number" && data.count > 0
                        ? data.count
                        : 1;
                unreadInView += delta;
            }

            updateScrollButton();
            triggerGlobalUnreadUpdate();
        }

        pollTimer = setInterval(poll, 2500);
    }

    // экспортируем и запускаем при первой загрузке
    window.germifyInitThread = initThread;
    document.addEventListener("DOMContentLoaded", initThread);
})();
