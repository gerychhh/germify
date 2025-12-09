document.addEventListener("DOMContentLoaded", () => {
    const chatBox = document.querySelector("#messages-list");
    const form = document.querySelector("#message-form");

    if (!chatBox || !form) return;

    const input = form.querySelector("textarea[name='text']");
    const sendUrl = form.dataset.sendUrl;
    const pollUrl = chatBox.dataset.pollUrl;

    let lastId = parseInt(chatBox.dataset.lastId || "0");

    // =============================
    // SEND MESSAGE
    // =============================
    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const text = input.value.trim();
        if (!text) return;

        const resp = await fetch(sendUrl, {
            method: "POST",
            headers: { "X-Requested-With": "XMLHttpRequest" },
            body: new FormData(form)
        });

        const data = await resp.json();
        if (data.html) {
            chatBox.insertAdjacentHTML("beforeend", data.html);
            lastId = data.id;
            input.value = "";
            chatBox.scrollTop = chatBox.scrollHeight;
        }
    });

    // =============================
    // POLLING NEW MESSAGES
    // =============================
    async function poll() {
        const resp = await fetch(`${pollUrl}?after=${lastId}`, {
            headers: { "X-Requested-With": "XMLHttpRequest" }
        });

        const data = await resp.json();

        if (data.html) {
            chatBox.insertAdjacentHTML("beforeend", data.html);

            const items = chatBox.querySelectorAll(".message-item");
            if (items.length > 0) {
                lastId = parseInt(items[items.length - 1].dataset.id);
            }

            chatBox.scrollTop = chatBox.scrollHeight;
        }
    }

    setInterval(poll, 2500);
});
