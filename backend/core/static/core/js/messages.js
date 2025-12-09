// static/core/js/messages.js

document.addEventListener("DOMContentLoaded", function () {
    const dialogsWrapper = document.querySelector("#dialogs-wrapper[data-poll-url]");
    if (!dialogsWrapper) {
        return;
    }

    const pollUrl = dialogsWrapper.dataset.pollUrl;

    function getUnreadMap(root) {
        const map = {};
        root.querySelectorAll(".dialog-item[data-username]").forEach(item => {
            const username = item.dataset.username;
            const unread = parseInt(item.dataset.unread || "0");
            map[username] = unread;
        });
        return map;
    }

    async function updateDialogs() {
        const oldMap = getUnreadMap(document);

        let response;
        try {
            response = await fetch(pollUrl, {
                headers: {
                    "X-Requested-With": "XMLHttpRequest"
                },
                cache: "no-store"
            });
        } catch (err) {
            console.error("Ошибка при обновлении списка диалогов:", err);
            return;
        }

        if (!response.ok) {
            console.warn("messages_inbox_poll bad status:", response.status);
            return;
        }

        const data = await response.json();
        if (!data.html) return;

        const temp = document.createElement("div");
        temp.innerHTML = data.html.trim();

        // Заменяем содержимое
        dialogsWrapper.innerHTML = "";
        while (temp.firstChild) {
            dialogsWrapper.appendChild(temp.firstChild);
        }

        // После вставки — считаем новые значения и ставим анимацию, где нужно
        const newItems = dialogsWrapper.querySelectorAll(".dialog-item[data-username]");
        newItems.forEach(item => {
            const username = item.dataset.username;
            const newUnread = parseInt(item.dataset.unread || "0");
            const oldUnread = oldMap[username] || 0;

            if (newUnread > oldUnread && newUnread > 0) {
                const badge = item.querySelector(".dialog-unread-badge");
                if (badge) {
                    badge.classList.add("dialog-unread-badge--pulse");
                    setTimeout(() => {
                        badge.classList.remove("dialog-unread-badge--pulse");
                    }, 1000);
                }
            }
        });
    }

    setTimeout(updateDialogs, 500);
    setInterval(updateDialogs, 2000);
});
