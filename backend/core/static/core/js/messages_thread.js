// static/core/js/messages_thread.js
//
// Thread page logic:
// - Send message via POST (existing endpoint)
// - Receive new messages via WebSocket push (global GermifyWS events)
// - No frequent polling (fallback is handled in messages.js)

(function () {
    function initThread() {
        const list = document.querySelector("#messages-list");
        if (!list) return;

        const chatCard = list.closest(".messages-chat-card");
        const otherUsername =
            (chatCard && chatCard.dataset && chatCard.dataset.username) || null;

        const container = list.closest(".thread-messages") || list;

        const form = document.querySelector("#message-form");
        const scrollBtn = document.getElementById("scroll-bottom-btn");
        const scrollUnreadBadge = scrollBtn
            ? scrollBtn.querySelector(".scroll-bottom-unread")
            : null;

        if (!form) return;

        const input = form.querySelector("textarea[name='text']");
        const sendUrl = form.dataset.sendUrl;

        let unreadInView = 0;
        let isAtBottom = true;

        function recalcIsAtBottom() {
            const threshold = 4;
            const distance = container.scrollHeight - (container.scrollTop + container.clientHeight);
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
            } else {
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
        }

        function triggerGlobalUnreadUpdate() {
            if (typeof window.germifyUpdateUnread === "function") {
                window.germifyUpdateUnread();
            }
        }

        // --- Init scroll state ---
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

        // --- Send message ---
        async function sendMessage(text) {
            if (!sendUrl) return;

            // IMPORTANT: include CSRF token by sending the actual form.
            // The template contains {% csrf_token %}.
            const formData = new FormData(form);

            // Ensure text is what we are sending (in case the textarea value was cleared).
            formData.set("text", text);

            let resp;
            try {
                resp = await fetch(sendUrl, {
                    method: "POST",
                    body: formData,
                    headers: { "X-Requested-With": "XMLHttpRequest" },
                    credentials: "same-origin"
                });
            } catch (e) {
                console.error("Ошибка при отправке сообщения:", e);
                return;
            }

            if (!resp.ok) {
                // Most common cause: CSRF (403)
                console.warn("messages_send bad status:", resp.status);
                return;
            }

            // Insert immediately as fallback (in case WS is slow/down).
            // WebSocket push will also come; we de-duplicate by message id.
            const data = await resp.json().catch(() => null);
            if (data && data.html && data.id) {
                const already = list.querySelector(`.message-item[data-id="${data.id}"]`);
                if (!already) {
                    list.insertAdjacentHTML("beforeend", data.html);
                }
                scrollToBottom({ smooth: true });
                isAtBottom = true;
                unreadInView = 0;
                updateScrollButton();
                triggerGlobalUnreadUpdate();
            }
        }

        form.addEventListener("submit", async (e) => {
            e.preventDefault();
            if (!input) return;

            const text = (input.value || "").trim();
            if (!text) return;

            // Clear UI immediately.
            input.value = "";
            await sendMessage(text);
        });

        // --- Hotkeys ---
        if (input) {
            input.addEventListener("keydown", (e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    form.dispatchEvent(new Event("submit", { cancelable: true }));
                }
            });
        }

        // --- WS push handler ---
        function handleMessageNew(detail) {
            if (!detail || detail.type !== "message_new") return;
            if (!detail.html) return;

            // De-duplicate: if we already inserted this message (e.g. after POST response), skip.
            if (detail.message_id) {
                const existing = list.querySelector(
                    `.message-item[data-id="${detail.message_id}"]`
                );
                if (existing) {
                    // Still may need unread refresh.
                    triggerGlobalUnreadUpdate();
                    return;
                }
            }

            // If we are on a thread page, only insert messages related to this thread.
            if (otherUsername && detail.other_username && detail.other_username !== otherUsername) {
                return;
            }

            const wasAtBottom = isAtBottom;

            list.insertAdjacentHTML("beforeend", detail.html);

            if (wasAtBottom) {
                scrollToBottom({ smooth: true });
                isAtBottom = true;
                unreadInView = 0;
            } else {
                unreadInView += 1;
            }

            updateScrollButton();

            // If this is an incoming message, mark it read immediately.
            if (detail.incoming === true && typeof window.GermifyWS?.send === "function") {
                window.GermifyWS.send({ type: "mark_read", ids: [detail.message_id] });
            }

            triggerGlobalUnreadUpdate();
        }

        // Subscribe to global events produced by messages.js
        const handler = (ev) => handleMessageNew(ev.detail);
        window.addEventListener("germify:message_new", handler);

        // On page unload, cleanup
        window.addEventListener("beforeunload", () => {
            window.removeEventListener("germify:message_new", handler);
        });
    }

    window.germifyInitThread = initThread;

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initThread);
    } else {
        initThread();
    }
})();
