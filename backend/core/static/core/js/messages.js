document.addEventListener("DOMContentLoaded", function () {
    const dialogsWrapper = document.querySelector("#dialogs-wrapper[data-poll-url]");
    if (!dialogsWrapper) {
        return;
    }

    const pollUrl = dialogsWrapper.dataset.pollUrl;

    async function updateDialogs() {
        try {
            const response = await fetch(pollUrl, {
                headers: {
                    "X-Requested-With": "XMLHttpRequest"
                },
                cache: "no-store"
            });

            if (!response.ok) {
                console.warn("messages_inbox_poll bad status:", response.status);
                return;
            }

            const data = await response.json();
            if (data.html) {
                dialogsWrapper.innerHTML = data.html;
            }
        } catch (err) {
            console.error("Ошибка при обновлении списка диалогов:", err);
        }
    }

    setTimeout(updateDialogs, 500);
    setInterval(updateDialogs, 1000);
});
