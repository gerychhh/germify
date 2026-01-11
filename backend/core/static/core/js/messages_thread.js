// static/core/js/messages_thread.js
//
// Thread page logic:
// - Send message via XHR (no page reload)
// - Attachments picker + preview + remove
// - Voice recorder -> adds voice.webm as attachment
// - Init media widgets in messages (gallery/video/audio)
// - Fullscreen video via Fullscreen API (no layout breaking)
// - Scroll-to-bottom button + unread badge
// - Read receipts updates (chat_read)

(function () {
    "use strict";

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

    function initThread() {
        // If this chat UI was previously initialized (e.g. chat pane swapped via AJAX),
        // remove old global listeners to avoid duplicates.
        if (typeof window.germifyDestroyThread === "function") {
            try { window.germifyDestroyThread(); } catch (e) {}
        }

        const list = document.querySelector("#messagesList");
        const listInner = list?.querySelector(".messages-list-inner") || list;
        if (!list) return;

        const chatCard = document.getElementById("messagesChatCard") || list.closest("#messagesChatCard");
        const chatId = chatCard?.dataset?.chatId ? parseInt(chatCard.dataset.chatId, 10) : null;
        const meId = chatCard?.dataset?.meId ? parseInt(chatCard.dataset.meId, 10) : null;
        const chatKind = chatCard?.dataset?.kind || null;
        const otherUsername = chatCard?.dataset?.username || null;

        const form = document.querySelector("#messageForm");
        if (!form) return;

        const headerEl = document.getElementById("messagesChatHeader");
        const headerUrl = chatCard?.dataset?.headerUrl || null;

        async function refreshHeader() {
            if (!headerEl || !headerUrl) return;
            let resp;
            try {
                resp = await fetch(headerUrl, {
                    headers: { "X-Requested-With": "XMLHttpRequest" },
                    credentials: "same-origin",
                    cache: "no-store",
                });
            } catch (e) { return; }

            if (resp.status === 403) {
                const data = await resp.json().catch(() => null);
                if (data && data.redirect) window.location.href = data.redirect;
                else window.location.href = "/messages/";
                return;
            }
            if (!resp.ok) return;

            const html = await resp.text();
            headerEl.innerHTML = html;
            bindHeaderInteractive();
        }

        function bindHeaderInteractive() {
            document.querySelectorAll("[data-members-filter]").forEach((inp) => {
                if (inp.dataset.bound === "1") return;
                inp.dataset.bound = "1";

                const menu = inp.closest(".dropdown-menu");
                const listWrap = menu ? menu.querySelector("[data-members-filter-list]") : null;
                if (!listWrap) return;

                const options = Array.from(listWrap.querySelectorAll(".members-add-option"));
                inp.addEventListener("input", () => {
                    const q = String(inp.value || "").trim().toLowerCase();
                    options.forEach((opt) => {
                        const hay = String(opt.dataset.membersName || opt.textContent || "").toLowerCase();
                        opt.style.display = !q || hay.includes(q) ? "" : "none";
                    });
                });
            });

            document.querySelectorAll(".messages-delete-thread").forEach((btn) => {
                if (btn.dataset.bound === "1") return;
                btn.dataset.bound = "1";

                btn.addEventListener("click", async () => {
                    const url = btn.dataset.deleteUrl;
                    if (!url) return;

                    const isDanger = btn.classList.contains("btn-outline-danger");
                    const confirmText = isDanger ? "Удалить чат полностью?" : "Выйти из чата?";
                    if (!window.confirm(confirmText)) return;

                    try {
                        const resp2 = await fetch(url, {
                            method: "POST",
                            headers: {
                                "X-Requested-With": "XMLHttpRequest",
                                "X-CSRFToken": getCookie("csrftoken"),
                            },
                            credentials: "same-origin",
                        });
                        if (resp2.ok) window.location.href = "/messages/";
                    } catch (e) {
                        console.error("Ошибка при удалении/выходе:", e);
                    }
                });
            });
        }

        bindHeaderInteractive();

        const input = form.querySelector("textarea[name='text']");
        const attachBtn = document.getElementById("messages-attach-btn");
        const fileInput = document.getElementById("message-attachments-input");
        const attachments = form.querySelector("[data-composer-attachments]");
        const mediaGrid = attachments?.querySelector("[data-composer-media]");
        const fileList = attachments?.querySelector("[data-composer-files]");
        const progWrap = document.getElementById("message-upload-progress");
        const progBar = document.getElementById("message-upload-progress-bar");
        const submitBtn = form.querySelector("button[type='submit']");
        const submitIcon = submitBtn?.querySelector("img");
        const submitIconSend = submitBtn?.dataset?.iconSend || "/static/core/icons/send.svg";
        const submitIconMic = submitBtn?.dataset?.iconMic || "/static/core/icons/mic.svg";

        const voiceBtn = submitBtn;
        const voiceStatus = document.getElementById("chat-voice-record-status");
        const voicePreview = document.getElementById("chat-voice-preview");
        const voicePreviewWrap = document.getElementById("chat-voice-preview-wrap");
        const voicePreviewPlay = voicePreviewWrap?.querySelector(".voice-preview__play");
        const voicePreviewIcon = voicePreviewWrap?.querySelector(".voice-preview__icon");
        const voicePreviewRemove = voicePreviewWrap?.querySelector(".voice-preview__remove");
        const voicePreviewCurrent = document.getElementById("chat-voice-preview-current");
        const voicePreviewDuration = document.getElementById("chat-voice-preview-duration");
        const voicePreviewProgress = document.getElementById("chat-voice-preview-progress");

        const sendUrl = form.dataset.sendUrl || null;

        if (input) {
            input.classList.add("composer__textarea");
            input.setAttribute("rows", "1");
            input.removeAttribute("required");
            input.required = false;
        }

        function updateTextareaSize() {
            if (!input) return;
            const baseHeight = 44;
            input.style.height = "auto";
            const scrollHeight = input.scrollHeight;
            input.style.height = `${scrollHeight}px`;
            const isExpanded = scrollHeight > baseHeight + 2;
            input.classList.toggle("is-expanded", isExpanded);
            input.classList.remove("is-scrollable");
        }

        function updateActionButtonMode() {
            if (!submitBtn) return;
            const hasText = Boolean((input?.value || "").trim());
            const hasAttachments = selectedFiles.length > 0;
            const mode = (hasText || hasAttachments) ? "send" : "mic";
            submitBtn.dataset.mode = mode;
            submitBtn.classList.toggle("composer__send--accent", mode === "send");
            submitBtn.title = mode === "send" ? "Отправить" : "Записать голосовое";
            submitBtn.setAttribute("aria-label", submitBtn.title);
            if (submitIcon) {
                submitIcon.src = mode === "send" ? submitIconSend : submitIconMic;
            }
        }

        // ------------------------------
        // Scroll helpers + button
        // ------------------------------
        function recalcIsAtBottom() {
            const threshold = 6;
            const distance = list.scrollHeight - (list.scrollTop + list.clientHeight);
            return distance <= threshold;
        }

        function scrollToBottom(options = { smooth: false }) {
            const behavior = options.smooth ? "smooth" : "auto";
            list.scrollTo({ top: list.scrollHeight, behavior });
        }

        const scrollBtn = document.getElementById("scroll-bottom-btn");
        const unreadBadge = document.getElementById("scroll-bottom-unread");
        let localNewCount = 0;

        function setLocalNewCount(n) {
            localNewCount = Math.max(0, (n | 0));
            if (!unreadBadge) return;

            if (localNewCount > 0) {
                unreadBadge.textContent = String(localNewCount);
                unreadBadge.classList.remove("hidden");
            } else {
                unreadBadge.textContent = "0";
                unreadBadge.classList.add("hidden");
            }
        }

        function updateScrollBtn() {
            if (!scrollBtn) return;
            if (recalcIsAtBottom()) {
                scrollBtn.classList.add("hidden");
                setLocalNewCount(0);
            } else {
                scrollBtn.classList.remove("hidden");
            }
        }

        if (scrollBtn && !scrollBtn.dataset.bound) {
            scrollBtn.dataset.bound = "1";
            scrollBtn.addEventListener("click", () => {
                scrollToBottom({ smooth: true });
                setLocalNewCount(0);
                updateScrollBtn();
                // при клике вниз — считаем что прочитали всё видимое
                sendMarkReadReliable(getCurrentLastId());
            });
        }

        if (!list.dataset.scrollBound) {
            list.dataset.scrollBound = "1";
            list.addEventListener("scroll", () => {
                if (recalcIsAtBottom()) setLocalNewCount(0);
                updateScrollBtn();

                // если пользователь докрутил вниз — можно безопасно ставить read
                if (recalcIsAtBottom()) {
                    sendMarkReadReliable(getCurrentLastId());
                }
            }, { passive: true });
        }

        function getCurrentLastId() {
            return parseInt(list.dataset.lastId || "0", 10) || 0;
        }

        // ------------------------------
        // WS helpers: reliable mark_read on open
        // ------------------------------
        function wsIsOpen() {
            return typeof window.GermifyWS?.isOpen === "function" && window.GermifyWS.isOpen();
        }

        function wsSend(payload) {
            if (!wsIsOpen()) return false;
            return !!window.GermifyWS.send(payload);
        }

        // КЛЮЧЕВО: когда ты открыл чат, WS мог ещё не успеть подключиться.
        // Поэтому шлём mark_read с ретраями.
        let lastReadSent = 0;

        function sendMarkReadReliable(lastId) {
            if (!chatId) return;
            const lid = parseInt(lastId || 0, 10) || 0;
            if (!lid) return;

            // не спамим одинаковым last_id
            if (lid <= lastReadSent) return;

            // Server-side NotificationsConsumer expects `last_id` (not `message_id`).
            const payload = { type: "mark_read", chat_id: chatId, last_id: lid };

            if (wsSend(payload)) {
                lastReadSent = lid;
                return;
            }

            // ретраи, пока WS не откроется
            let tries = 0;
            const timer = setInterval(() => {
                tries += 1;
                if (wsSend(payload)) {
                    lastReadSent = lid;
                    clearInterval(timer);
                } else if (tries >= 24) { // ~6 секунд
                    clearInterval(timer);
                }
            }, 250);
        }

        function triggerGlobalUnreadUpdate() {
            if (typeof window.germifyUpdateUnread === "function") {
                window.germifyUpdateUnread();
            }
        }

        // init on open
        scrollToBottom({ smooth: false });
        updateScrollBtn();
        setLocalNewCount(0);

        // СРАЗУ ставим прочитано при входе (с ретраями)
        sendMarkReadReliable(getCurrentLastId());

        // ------------------------------
        // Attachments state
        // ------------------------------
        let selectedFiles = []; // Array<File>
        let objectUrls = [];
        const MAX_FILE_SIZE = 25 * 1024 * 1024;
        const MAX_TOTAL_SIZE = 250 * 1024 * 1024;
        const MAX_FILE_COUNT = parseInt(document.body?.dataset?.attachMax || "10", 10);

        updateActionButtonMode();

        function formatSize(bytes) {
            if (bytes < 1024 * 1024) {
                return `${Math.max(1, Math.round(bytes / 1024))} KB`;
            }
            return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
        }

        function formatDuration(seconds) {
            if (!Number.isFinite(seconds)) return "0:00";
            const m = Math.floor(seconds / 60);
            const s = Math.floor(seconds % 60);
            return `${m}:${String(s).padStart(2, "0")}`;
        }

        function isMediaFile(file) {
            return (file.type || "").startsWith("image/") || (file.type || "").startsWith("video/");
        }

        function getFileIcon(file, container) {
            const name = (file.name || "").toLowerCase();
            const ext = name.split(".").pop();
            const isDoc = ["pdf", "doc", "docx", "rtf", "txt"].includes(ext);
            const isZip = ["zip", "rar", "7z"].includes(ext);
            if (isDoc && container?.dataset?.iconDoc) return container.dataset.iconDoc;
            if (isZip && container?.dataset?.iconZip) return container.dataset.iconZip;
            return container?.dataset?.iconGeneric || "";
        }

        function renderSelectedFiles() {
            if (!attachments || !mediaGrid || !fileList) return;
            objectUrls.forEach((url) => URL.revokeObjectURL(url));
            objectUrls = [];
            mediaGrid.innerHTML = "";
            fileList.innerHTML = "";

            const media = [];
            const others = [];

            selectedFiles.forEach((file, index) => {
                if (file.name === "voice.webm") {
                    return;
                }
                if (isMediaFile(file)) {
                    media.push({ file, index });
                } else {
                    others.push({ file, index });
                }
            });

            if (media.length) {
                mediaGrid.dataset.count = String(Math.min(media.length, 4));
            } else {
                mediaGrid.removeAttribute("data-count");
            }

            attachments.classList.toggle("hidden", media.length + others.length === 0);

            const visibleMedia = media.slice(0, 4);
            const overflowCount = Math.max(0, media.length - visibleMedia.length);

            visibleMedia.forEach((item, idx) => {
                const tile = document.createElement("div");
                tile.className = "composer__media-tile";

                const url = URL.createObjectURL(item.file);
                objectUrls.push(url);

                if ((item.file.type || "").startsWith("video/")) {
                    const video = document.createElement("video");
                    video.src = url;
                    video.muted = true;
                    video.playsInline = true;
                    video.preload = "metadata";
                    tile.appendChild(video);

                    const play = document.createElement("div");
                    play.className = "composer__video-play";
                    play.innerHTML = "<span></span>";
                    tile.appendChild(play);

                    const duration = document.createElement("div");
                    duration.className = "composer__video-duration";
                    duration.textContent = "0:00";
                    tile.appendChild(duration);

                    video.addEventListener("loadedmetadata", () => {
                        duration.textContent = formatDuration(video.duration);
                    });
                } else {
                const img = document.createElement("img");
                img.src = url;
                img.alt = item.file.name || "image";
                tile.appendChild(img);
                }

                const remove = document.createElement("button");
                remove.type = "button";
                remove.className = "composer__media-remove";
                remove.dataset.removeIndex = String(item.index);
                remove.innerHTML = "&times;";
                tile.appendChild(remove);

                const progress = document.createElement("div");
                progress.className = "composer__media-progress";
                progress.innerHTML = "<span></span>";
                tile.appendChild(progress);

                if (overflowCount > 0 && idx === visibleMedia.length - 1) {
                    const overlay = document.createElement("div");
                    overlay.className = "composer__media-overflow";
                    overlay.textContent = `+${overflowCount}`;
                    tile.appendChild(overlay);
                }

                mediaGrid.appendChild(tile);
            });

            others.forEach((item) => {
                const row = document.createElement("div");
                row.className = "composer__file-row";

                const icon = document.createElement("img");
                icon.className = "composer__file-icon";
                icon.src = getFileIcon(item.file, attachments);
                icon.alt = "";

                const meta = document.createElement("div");
                meta.className = "composer__file-meta";

                const name = document.createElement("div");
                name.className = "composer__file-name";
                name.textContent = item.file.name || "file";

                const size = document.createElement("div");
                size.className = "composer__file-size";
                size.textContent = formatSize(item.file.size || 0);

                const progress = document.createElement("div");
                progress.className = "composer__file-progress";
                progress.innerHTML = "<span></span>";

                meta.appendChild(name);
                meta.appendChild(size);
                meta.appendChild(progress);

                const remove = document.createElement("button");
                remove.type = "button";
                remove.className = "composer__file-remove";
                remove.dataset.removeIndex = String(item.index);
                remove.innerHTML = "&times;";

                row.appendChild(icon);
                row.appendChild(meta);
                row.appendChild(remove);
                fileList.appendChild(row);
            });

            const hasVoice = selectedFiles.some((file) => file.name === "voice.webm");
            if (!hasVoice && voicePreviewWrap) {
                voicePreviewWrap.classList.add("hidden");
                if (voicePreview) {
                    try { voicePreview.pause(); } catch (e) {}
                    voicePreview.currentTime = 0;
                }
                if (voicePreviewProgress) voicePreviewProgress.style.width = "0%";
                if (voicePreviewCurrent) voicePreviewCurrent.textContent = "0:00";
                if (voicePreviewDuration) voicePreviewDuration.textContent = "0:00";
                if (voicePreviewIcon) {
                    voicePreviewIcon.src = "/static/core/icons/media-play.svg";
                }
            }
            updateActionButtonMode();
        }

        function addFiles(filesList) {
            if (!filesList || !filesList.length) return;

            const arr = Array.from(filesList);
            let totalSize = selectedFiles.reduce((sum, f) => sum + (f.size || 0), 0);

            arr.forEach((file) => {
                if (selectedFiles.length >= MAX_FILE_COUNT) {
                    alert("Максимум файлов в одном сообщении: " + MAX_FILE_COUNT);
                    return;
                }
                if (file.size > MAX_FILE_SIZE) {
                    alert(`Файл "${file.name}" превышает 25MB`);
                    return;
                }
                if (totalSize + file.size > MAX_TOTAL_SIZE) {
                    alert("Превышен общий лимит размера файлов (250MB)");
                    return;
                }
                selectedFiles.push(file);
                totalSize += file.size;
            });

            renderSelectedFiles();
        }

        if (attachBtn && fileInput) {
            attachBtn.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                fileInput.click();
            });

            fileInput.addEventListener("change", () => {
                addFiles(fileInput.files);
                fileInput.value = "";
            });
        }

        if (input) {
            input.addEventListener("input", updateTextareaSize);
            window.addEventListener("load", updateTextareaSize);
            updateTextareaSize();
            input.addEventListener("input", updateActionButtonMode);
        }

        attachments?.addEventListener("click", (event) => {
            const target = event.target;
            const btn = target?.closest?.("[data-remove-index]");
            if (!btn) return;
            const index = Number(btn.dataset.removeIndex);
            const removed = selectedFiles.splice(index, 1)[0];
            if (removed && removed.name === "voice.webm") {
                if (voicePreview) {
                    voicePreview.classList.add("hidden");
                    voicePreview.src = "";
                }
            }
            renderSelectedFiles();
        });

        // ------------------------------
        // Voice recording (chat)
        // ------------------------------
        let recorder = null;
        let recorderStream = null;
        let recorderChunks = [];
        let recording = false;

        let stopPromiseResolve = null;
        function waitRecorderStopOnce() {
            return new Promise((resolve) => { stopPromiseResolve = resolve; });
        }

        async function startRecording() {
            if (recording) return;

            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                alert("Ваш браузер не поддерживает запись аудио.");
                return;
            }

            try {
                recorderStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                recorderChunks = [];

                let opts = {};
                const prefer = "audio/webm;codecs=opus";
                if (window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(prefer)) {
                    opts = { mimeType: prefer };
                } else if (window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported("audio/webm")) {
                    opts = { mimeType: "audio/webm" };
                }

                recorder = new MediaRecorder(recorderStream, opts);

                recorder.ondataavailable = (ev) => {
                    if (ev.data && ev.data.size > 0) recorderChunks.push(ev.data);
                };

                recorder.onstop = () => {
                    const blob = new Blob(recorderChunks, { type: (recorder?.mimeType || "audio/webm") });
                    const file = new File([blob], "voice.webm", { type: "audio/webm" });

                    selectedFiles = selectedFiles.filter((f) => f.name !== "voice.webm");
                    selectedFiles.push(file);

                    if (voicePreview) {
                        voicePreview.src = "";
                        voicePreview.classList.add("hidden");
                        voicePreviewWrap?.classList.add("hidden");
                    }

                    renderSelectedFiles();
                    updateActionButtonMode();

                    if (form) {
                        form.dispatchEvent(new Event("submit", { cancelable: true }));
                    }

                    if (typeof stopPromiseResolve === "function") {
                        stopPromiseResolve();
                        stopPromiseResolve = null;
                    }
                };

                recorder.start();
                recording = true;

                if (voiceStatus) voiceStatus.textContent = "Запись… нажмите ещё раз чтобы остановить";
                if (voiceBtn) voiceBtn.classList.add("is-recording");
            } catch (e) {
                console.error("voice record error", e);
                alert("Не удалось получить доступ к микрофону. (Нужен HTTPS или localhost)");
            }
        }

        function stopRecording() {
            if (!recording) return;

            try { recorder.stop(); } catch (e) {}
            try { recorderStream?.getTracks()?.forEach((t) => t.stop()); } catch (e) {}

            recorder = null;
            recorderStream = null;
            recording = false;

            if (voiceStatus) voiceStatus.textContent = "";
            if (voiceBtn) voiceBtn.classList.remove("is-recording");
        }

        if (voiceBtn) {
            voiceBtn.addEventListener("click", (e) => {
                if (submitBtn?.dataset?.mode !== "mic") return;
                e.preventDefault();
                e.stopPropagation();
                if (recording) stopRecording();
                else startRecording();
            });
        }

        function formatTime(seconds) {
            if (!Number.isFinite(seconds)) return "0:00";
            const m = Math.floor(seconds / 60);
            const s = Math.floor(seconds % 60);
            return `${m}:${String(s).padStart(2, "0")}`;
        }

        function updateVoicePreview() {
            if (!voicePreview || !voicePreviewProgress || !voicePreviewCurrent) return;
            const duration = voicePreview.duration || 0;
            const current = voicePreview.currentTime || 0;
            const percent = duration ? (current / duration) * 100 : 0;
            voicePreviewProgress.style.width = `${percent}%`;
            voicePreviewCurrent.textContent = formatTime(current);
        }

        function syncVoiceIcon() {
            if (!voicePreview || !voicePreviewIcon) return;
            const icon = voicePreview.paused
                ? "/static/core/icons/media-play.svg"
                : "/static/core/icons/media-pause.svg";
            voicePreviewIcon.src = icon;
        }

        if (voicePreview) {
            voicePreview.addEventListener("loadedmetadata", () => {
                if (voicePreviewDuration) {
                    voicePreviewDuration.textContent = formatTime(voicePreview.duration || 0);
                }
                updateVoicePreview();
            });

            voicePreview.addEventListener("timeupdate", updateVoicePreview);
            voicePreview.addEventListener("ended", () => {
                syncVoiceIcon();
                updateVoicePreview();
            });
            voicePreview.addEventListener("pause", syncVoiceIcon);
            voicePreview.addEventListener("play", syncVoiceIcon);
        }

        if (voicePreviewPlay && voicePreview) {
            voicePreviewPlay.addEventListener("click", () => {
                if (voicePreview.paused) {
                    voicePreview.play().catch(() => {});
                } else {
                    voicePreview.pause();
                }
            });
        }

        if (voicePreviewRemove) {
            voicePreviewRemove.addEventListener("click", () => {
                selectedFiles = selectedFiles.filter((file) => file.name !== "voice.webm");
                if (voicePreview) {
                    try { voicePreview.pause(); } catch (e) {}
                    voicePreview.currentTime = 0;
                    voicePreview.src = "";
                }
                renderSelectedFiles();
            });
        }

        // ------------------------------
        // Media init for messages
        // ------------------------------
        function _mediaShape(media) {
            const isVideo = media?.tagName === "VIDEO";
            const w = isVideo ? (media.videoWidth || 0) : (media.naturalWidth || 0);
            const h = isVideo ? (media.videoHeight || 0) : (media.naturalHeight || 0);
            if (!w || !h) return null;
            const r = w / h;
            if (r >= 1.25) return "land";
            if (r <= 0.85) return "port";
            return "square";
        }

        function _chooseGalleryLayout(count, firstShape, allShapes) {
            if (count <= 0) return "one";
            if (count === 1) return "one";
            if (count === 2) {
                const s1 = allShapes[0] || firstShape;
                const s2 = allShapes[1] || firstShape;
                if (s1 === "port" && s2 === "port") return "two-port";
                if (s1 === "land" && s2 === "land") return "two-land";
                return "two-mixed";
            }
            if (count === 3) return firstShape === "port" ? "three-vk" : "three-top";
            if (count === 4) return "four";
            if (count === 5) return firstShape === "port" ? "five-left" : "five-top";
            return "grid-3";
        }

        function initSmartGalleries(root = document) {
            const scope = root || document;
            const galleries = scope.querySelectorAll?.(".attachment-gallery") || [];
            galleries.forEach((gallery) => {
                const mediaItems = Array.from(gallery.querySelectorAll(".gallery-media"));
                if (!mediaItems.length) {
                    gallery.dataset.count = "0";
                    gallery.dataset.layout = "one";
                    return;
                }

                const maxVisible = 6;
                mediaItems.forEach((media, idx) => {
                    const item = media.closest(".gallery-item");
                    if (!item) return;
                    if (idx >= maxVisible) item.classList.add("gallery-hidden");
                    else item.classList.remove("gallery-hidden");
                });

                gallery.querySelectorAll(".gallery-more-badge").forEach((n) => n.remove());
                if (mediaItems.length > maxVisible) {
                    const lastVisibleMedia = mediaItems[maxVisible - 1];
                    const lastItem = lastVisibleMedia?.closest(".gallery-item");
                    if (lastItem) {
                        const badge = document.createElement("div");
                        badge.className = "gallery-more-badge";
                        badge.textContent = "+" + (mediaItems.length - maxVisible);
                        lastItem.appendChild(badge);
                    }
                }

                const visibleCount = Math.min(mediaItems.length, maxVisible);
                gallery.dataset.count = String(visibleCount);

                const applyLayout = () => {
                    const shapes = mediaItems.slice(0, visibleCount).map(_mediaShape);
                    const firstShape = shapes[0] || "land";
                    gallery.dataset.layout = _chooseGalleryLayout(visibleCount, firstShape, shapes);
                };

                applyLayout();
                mediaItems.slice(0, visibleCount).forEach((media) => {
                    if (!media) return;
                    if (media.tagName === "VIDEO") {
                        if (!(media.videoWidth && media.videoHeight)) {
                            media.addEventListener("loadedmetadata", applyLayout, { once: true });
                        }
                        return;
                    }
                    if (!(media.complete && media.naturalWidth)) {
                        media.addEventListener("load", applyLayout, { once: true });
                    }
                });
            });
        }

        function toggleFullscreenFor(wrapper, video) {
            const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
            const isFull = fsEl === wrapper;

            if (!isFull) {
                const req = wrapper.requestFullscreen || wrapper.webkitRequestFullscreen;
                if (req) { try { req.call(wrapper); } catch (e) {} }
                else if (video && video.webkitEnterFullscreen) { try { video.webkitEnterFullscreen(); } catch (e) {} }
            } else {
                const exit = document.exitFullscreen || document.webkitExitFullscreen;
                if (exit) { try { exit.call(document); } catch (e) {} }
            }
        }

        function initVideoPlayers(root = document) {
            if (!root.querySelectorAll) return;
            const wrappers = root.querySelectorAll(".video-wrapper");

            wrappers.forEach((wrapper) => {
                if (wrapper.dataset.inited === "1") return;
                wrapper.dataset.inited = "1";

                const video       = wrapper.querySelector(".video-player");
                const overlayBtn  = wrapper.querySelector(".video-overlay-play");
                const playBtn     = wrapper.querySelector(".video-play");
                const muteBtn     = wrapper.querySelector(".video-mute");
                const fsBtn       = wrapper.querySelector(".video-fullscreen");
                const bar         = wrapper.querySelector(".video-progress-bar");
                const progressEl  = wrapper.querySelector(".video-progress");
                const bufferEl    = wrapper.querySelector(".video-buffer");
                const currentEl   = wrapper.querySelector(".video-current");
                const durationEl  = wrapper.querySelector(".video-duration");

                if (!video || !playBtn || !bar || !progressEl || !bufferEl || !currentEl || !durationEl) return;

                let isScrubbing = false;

                function vFormat(sec) {
                    if (!sec || isNaN(sec)) return "0:00";
                    const m = Math.floor(sec / 60);
                    const s = Math.floor(sec % 60);
                    return m + ":" + String(s).padStart(2, "0");
                }

                function updateBuffer() {
                    if (!video.duration || isNaN(video.duration)) return;
                    let end = 0;
                    try { if (video.buffered.length) end = video.buffered.end(video.buffered.length - 1); } catch (e) {}
                    bufferEl.style.width = ((end / video.duration) * 100) + "%";
                }

                video.addEventListener("loadedmetadata", () => {
                    durationEl.textContent = vFormat(video.duration);
                    updateBuffer();
                });

                video.addEventListener("loadeddata", updateBuffer);
                video.addEventListener("progress", updateBuffer);

                function setBtnImg(btn, src) {
                    if (!btn || !src) return;
                    const img = btn.querySelector("img");
                    if (img) img.src = src;
                }

                function syncPlayUi() {
                    const playing = !video.paused && !video.ended;
                    wrapper.classList.toggle("is-playing", playing);
                    if (playing || video.currentTime > 0) wrapper.classList.add("has-started");

                    const iconPlay = playBtn?.dataset?.iconPlay;
                    const iconPause = playBtn?.dataset?.iconPause;
                    setBtnImg(playBtn, playing ? iconPause : iconPlay);
                }

                function syncMuteUi() {
                    if (!muteBtn) return;
                    const iconOn = muteBtn.dataset.iconOn;
                    const iconOff = muteBtn.dataset.iconOff;
                    setBtnImg(muteBtn, video.muted ? iconOff : iconOn);
                }

                function requestPlay() {
                    wrapper.classList.add("has-started");
                    const p = video.play();
                    if (p && typeof p.catch === "function") p.catch(() => {});
                }

                function togglePlay() {
                    if (video.paused || video.ended) requestPlay();
                    else video.pause();
                }

                if (overlayBtn) {
                    overlayBtn.addEventListener("click", (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        requestPlay();
                    });
                }

                playBtn.addEventListener("click", (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    togglePlay();
                });

                video.addEventListener("click", (e) => {
                    if (e.target && e.target.closest && e.target.closest(".video-controls")) return;
                    togglePlay();
                });

                if (muteBtn) {
                    muteBtn.addEventListener("click", (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        video.muted = !video.muted;
                        syncMuteUi();
                    });
                }

                video.addEventListener("play", syncPlayUi);
                video.addEventListener("pause", syncPlayUi);

                video.addEventListener("timeupdate", () => {
                    if (!video.duration || isNaN(video.duration)) return;
                    const percent = (video.currentTime / video.duration) * 100;
                    progressEl.style.width = percent + "%";
                    currentEl.textContent = vFormat(video.currentTime);
                });

                video.addEventListener("ended", () => {
                    syncPlayUi();
                    progressEl.style.width = "0%";
                    currentEl.textContent = "0:00";
                });

                function seekByClientX(clientX) {
                    if (!video.duration || isNaN(video.duration)) return;
                    const rect = bar.getBoundingClientRect();
                    const x = Math.min(Math.max(clientX - rect.left, 0), rect.width);
                    video.currentTime = (x / rect.width) * video.duration;
                }

                bar.addEventListener("mousedown", (e) => { isScrubbing = true; seekByClientX(e.clientX); });
                document.addEventListener("mousemove", (e) => { if (isScrubbing) seekByClientX(e.clientX); });
                document.addEventListener("mouseup", () => { isScrubbing = false; });

                bar.addEventListener("touchstart", (e) => { isScrubbing = true; seekByClientX(e.touches[0].clientX); });
                bar.addEventListener("touchmove", (e) => { if (isScrubbing) seekByClientX(e.touches[0].clientX); });
                bar.addEventListener("touchend", () => { isScrubbing = false; });

                if (fsBtn) {
                    fsBtn.addEventListener("click", (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        toggleFullscreenFor(wrapper, video);
                    });
                }

                // init state
                syncPlayUi();
                syncMuteUi();
            });
        }

        function initAudioPlayers(root = document) {
            if (!root.querySelectorAll) return;

            const wrappers = root.querySelectorAll(".audio-wrapper");
            wrappers.forEach((wrapper) => {
                if (wrapper.dataset.inited === "1") return;
                wrapper.dataset.inited = "1";

                const audio         = wrapper.querySelector(".audio-player");
                const playButton    = wrapper.querySelector(".audio-play");
                const progressBar   = wrapper.querySelector(".audio-progress-bar");
                const bufferEl      = wrapper.querySelector(".audio-buffer");
                const progressEl    = wrapper.querySelector(".audio-progress");
                const slider        = wrapper.querySelector(".audio-slider");
                const currentEl     = wrapper.querySelector(".audio-current");
                const durationEl    = wrapper.querySelector(".audio-duration");

                if (!audio || !playButton || !progressBar || !bufferEl || !progressEl || !slider || !currentEl || !durationEl) return;

                function aFormat(sec) {
                    if (!sec || isNaN(sec)) return "0:00";
                    const m = Math.floor(sec / 60);
                    const s = Math.floor(sec % 60);
                    return m + ":" + String(s).padStart(2, "0");
                }

                function updateBuffer() {
                    if (!audio.duration || isNaN(audio.duration)) return;
                    let end = 0;
                    try { if (audio.buffered.length) end = audio.buffered.end(audio.buffered.length - 1); } catch (e) {}
                    bufferEl.style.width = ((end / audio.duration) * 100) + "%";
                }

                audio.addEventListener("loadedmetadata", () => {
                    durationEl.textContent = aFormat(audio.duration);
                    updateBuffer();
                });

                audio.addEventListener("progress", updateBuffer);
                audio.addEventListener("loadeddata", updateBuffer);

                function setAudioBtnIcon(btn, isPlaying) {
                    if (!btn) return;
                    const playIcon = btn.dataset.iconPlay;
                    const pauseIcon = btn.dataset.iconPause;
                    const img = btn.querySelector("img");
                    if (!img) return;
                    img.src = isPlaying ? (pauseIcon || img.src) : (playIcon || img.src);
                }

                playButton.addEventListener("click", () => {
                    if (window.__g_currentAudio && window.__g_currentAudio !== audio) {
                        try { window.__g_currentAudio.pause(); } catch (e) {}
                        setAudioBtnIcon(window.__g_currentAudioBtn, false);
                    }

                    if (audio.paused) {
                        const p = audio.play();
                        if (p && typeof p.catch === "function") p.catch(() => {});
                        setAudioBtnIcon(playButton, true);
                        window.__g_currentAudio = audio;
                        window.__g_currentAudioBtn = playButton;
                    } else {
                        audio.pause();
                        setAudioBtnIcon(playButton, false);
                    }
                });

                audio.addEventListener("timeupdate", () => {
                    if (!audio.duration || isNaN(audio.duration)) return;
                    const percent = (audio.currentTime / audio.duration) * 100;
                    progressEl.style.width = percent + "%";
                    slider.value = String(percent);
                    currentEl.textContent = aFormat(audio.currentTime);
                });

                audio.addEventListener("ended", () => {
                    setAudioBtnIcon(playButton, false);
                    progressEl.style.width = "0%";
                    slider.value = "0";
                    currentEl.textContent = "0:00";
                });

                slider.addEventListener("input", () => {
                    if (!audio.duration || isNaN(audio.duration)) return;
                    audio.currentTime = ((parseFloat(slider.value) || 0) / 100) * audio.duration;
                });
            });
        }

        function initMessageMedia(rootEl) {
            initSmartGalleries(rootEl);
            initVideoPlayers(rootEl);
            initAudioPlayers(rootEl);
        }

        function openMediaViewer(items, index) {
            let current = index;
            const prefersTouch = window.matchMedia?.("(pointer: coarse)")?.matches;

            const overlay = document.createElement("div");
            overlay.className = "image-viewer";
            overlay.innerHTML = `
                <div class="viewer-stage"></div>
                <button type="button" class="viewer-arrow prev" aria-label="Назад">
                    <img class="viewer-icon" src="/static/core/icons/arrow-left.svg" alt="">
                </button>
                <button type="button" class="viewer-arrow next" aria-label="Вперёд">
                    <img class="viewer-icon" src="/static/core/icons/arrow-right.svg" alt="">
                </button>
                <button type="button" class="viewer-close" aria-label="Закрыть">
                    <img class="viewer-icon" src="/static/core/icons/close.svg" alt="">
                </button>
                <button type="button" class="viewer-fullscreen" aria-label="На весь экран">
                    <img class="viewer-icon" src="/static/core/icons/media-fullscreen.svg" alt="">
                </button>
            `;

            document.body.appendChild(overlay);

            const stage = overlay.querySelector(".viewer-stage");
            const btnPrev = overlay.querySelector(".prev");
            const btnNext = overlay.querySelector(".next");
            const btnClose = overlay.querySelector(".viewer-close");
            const btnFullscreen = overlay.querySelector(".viewer-fullscreen");
            const chromeButtons = [btnPrev, btnNext, btnClose, btnFullscreen].filter(Boolean);
            let chromeTimer = null;

            function setChromeVisible(isVisible) {
                chromeButtons.forEach((btn) => {
                    btn.style.opacity = isVisible ? "" : "0";
                    btn.style.pointerEvents = isVisible ? "" : "none";
                });
            }

            function bumpChromeVisibility() {
                setChromeVisible(true);
                if (chromeTimer) window.clearTimeout(chromeTimer);
                chromeTimer = window.setTimeout(() => setChromeVisible(false), 1000);
            }

            function renderMedia() {
                const item = items[current];
                if (!item || !stage) return;
                stage.innerHTML = "";

                if (item.type === "video") {
                    if (btnFullscreen) btnFullscreen.style.display = "none";
                    const video = document.createElement("video");
                    video.className = "viewer-video";
                    video.src = item.url;
                    video.controls = true;
                    video.playsInline = true;
                    stage.appendChild(video);

                    if (prefersTouch) {
                        const fs = video.requestFullscreen || video.webkitEnterFullscreen;
                        if (fs) {
                            try { fs.call(video); } catch (err) {}
                        }
                    }
                } else {
                    if (btnFullscreen) btnFullscreen.style.display = "";
                    const img = document.createElement("img");
                    img.className = "viewer-img";
                    img.src = item.url;
                    stage.appendChild(img);
                }
            }

            function show(i) {
                current = i;
                renderMedia();
            }

            btnPrev.onclick = () => {
                if (current === 0) show(items.length - 1);
                else show(current - 1);
            };

            btnNext.onclick = () => {
                if (current === items.length - 1) show(0);
                else show(current + 1);
            };

            btnFullscreen.onclick = () => {
                const media = stage?.querySelector(".viewer-video, .viewer-img");
                if (!media) return;
                const req = media.requestFullscreen || media.webkitEnterFullscreen;
                if (req) {
                    try { req.call(media); } catch (err) {}
                }
            };

            btnClose.onclick = () => overlay.remove();

            overlay.addEventListener("click", (ev) => {
                if (ev.target === overlay) overlay.remove();
            });

            function escHandler(ev) {
                if (ev.key === "Escape") {
                    overlay.remove();
                    document.removeEventListener("keydown", escHandler);
                }
            }
            document.addEventListener("keydown", escHandler);

            let touchStartX = 0;

            overlay.addEventListener("touchstart", (ev) => {
                touchStartX = ev.changedTouches[0].screenX;
                bumpChromeVisibility();
            });

            overlay.addEventListener("touchend", (ev) => {
                let diff = ev.changedTouches[0].screenX - touchStartX;

                if (Math.abs(diff) > 50) {
                    if (diff > 0) btnPrev.click();
                    else btnNext.click();
                }
            });

            overlay.addEventListener("mousemove", bumpChromeVisibility);
            overlay.addEventListener("touchmove", bumpChromeVisibility);

            bumpChromeVisibility();
            renderMedia();
        }

        document.addEventListener("click", function (e) {
            const media = e.target.closest(".gallery-media");
            if (!media) return;

            if (media.closest(".image-viewer")) return;

            const wrap = media.closest(".attachments");
            if (!wrap) return;

            const mediaItems = [...wrap.querySelectorAll(".gallery-media")];
            const items = mediaItems.map((item) => ({
                type: item.dataset.media || (item.tagName === "VIDEO" ? "video" : "image"),
                url: item.dataset.full || item.currentSrc || item.src,
            }));

            let index = mediaItems.indexOf(media);
            if (index < 0) index = 0;

            openMediaViewer(items, index);
        });

        initMessageMedia(document);

        // ------------------------------
        // Read receipts updates (chat_read)
        // ------------------------------
        function updateReceipts(uptoId) {
            const n = Number(uptoId) || 0;
            if (!n) return;
            if (chatKind !== "dm") return;

            listInner?.querySelectorAll(".message-item.me").forEach((it) => {
                const mid = parseInt(it.dataset.id || "0", 10) || 0;
                if (!mid || mid > n) return;

                const r = it.querySelector(".message-receipt[data-receipt='1']");
                if (!r) return;
                r.classList.add("is-read");
                r.textContent = "✓✓";
            });
        }

        function handleChatRead(detail) {
            if (!detail || detail.type !== "chat_read") return;
            if (!chatId || !detail.chat_id || Number(detail.chat_id) !== chatId) return;

            // не реагируем на “прочитал я сам”
            if (meId && detail.reader_id && Number(detail.reader_id) === meId) return;

            updateReceipts(detail.last_read_id);
        }

		const readHandler = (ev) => handleChatRead(ev.detail);
		// `core/static/core/js/messages.js` dispatches CustomEvent on `window`
		window.addEventListener("germify:chat_read", readHandler);

        // ------------------------------
        // Sending (XHR)
        // ------------------------------
        function showUploadProgress(pct) {
            if (!progWrap || !progBar) return;
            progWrap.classList.remove("hidden");
            progBar.style.width = `${Math.max(0, Math.min(100, pct || 0))}%`;
        }

        function hideUploadProgress() {
            if (!progWrap || !progBar) return;
            progWrap.classList.add("hidden");
            progBar.style.width = "0%";
        }

        function sendMessage(text) {
            if (!sendUrl) return Promise.resolve(false);

            const formData = new FormData();
            formData.set("text", text || "");
            formData.append("csrfmiddlewaretoken", getCookie("csrftoken") || "");

            selectedFiles.forEach((f) => formData.append("attachments", f, f.name));

            showUploadProgress(0);

            return new Promise((resolve) => {
                const xhr = new XMLHttpRequest();
                xhr.open("POST", sendUrl, true);
                xhr.setRequestHeader("X-Requested-With", "XMLHttpRequest");

                xhr.upload.onprogress = (evt) => {
                    if (!evt.lengthComputable) return;
                    showUploadProgress((evt.loaded / evt.total) * 100);
                };

                xhr.onreadystatechange = () => {
                    if (xhr.readyState !== 4) return;

                    hideUploadProgress();

                    if (xhr.status === 403) {
                        let data403 = null;
                        try { data403 = JSON.parse(xhr.responseText); } catch (e) {}
                        window.location.href = (data403 && data403.redirect) ? data403.redirect : "/messages/";
                        resolve(false);
                        return;
                    }

                    if (xhr.status < 200 || xhr.status >= 300) {
                        let dataErr = null;
                        try { dataErr = JSON.parse(xhr.responseText); } catch (e) {}
                        const msg = (dataErr && (dataErr.error || dataErr.detail)) ? (dataErr.error || dataErr.detail) : "Не удалось отправить сообщение.";
                        alert(msg);
                        resolve(false);
                        return;
                    }

                    let data = null;
                    try { data = JSON.parse(xhr.responseText); } catch (e) {}

                    if (data && data.html && data.id) {
                        const already = listInner?.querySelector(`.message-item[data-id="${data.id}"]`);
                        if (!already) listInner?.insertAdjacentHTML("beforeend", data.html);

                        const newEl = listInner?.querySelector(`.message-item[data-id="${data.id}"]`);
                        if (newEl) initMessageMedia(newEl);

                        list.dataset.lastId = String(data.id);

                        scrollToBottom({ smooth: true });
                        setLocalNewCount(0);
                        updateScrollBtn();

                        // своё сообщение → мы точно внизу и всё прочитано
                        sendMarkReadReliable(getCurrentLastId());

                        triggerGlobalUnreadUpdate();
                    }

                    resolve(true);
                };

                xhr.send(formData);
            });
        }

        form.addEventListener("submit", async (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (!input) return;

            const text = (input.value || "").trim();
            if (!text && !selectedFiles.length) return;

            // если идёт запись — остановим и дождёмся появления voice.webm
            if (recording) {
                const waitStop = waitRecorderStopOnce();
                stopRecording();
                await waitStop;
            }

            if (submitBtn) submitBtn.disabled = true;
            const ok = await sendMessage(text);
            if (submitBtn) submitBtn.disabled = false;

            if (!ok) return;

            input.value = "";
            selectedFiles = [];
            renderSelectedFiles();
            if (voicePreview) { voicePreview.classList.add("hidden"); voicePreview.src = ""; }
            updateActionButtonMode();
        });

        if (input) {
            input.addEventListener("keydown", (e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    const text = (input.value || "").trim();
                    if (!text && !selectedFiles.length) return;
                    form.dispatchEvent(new Event("submit", { cancelable: true }));
                }
            });
        }

        // WS push: new messages
        function handleMessageNew(detail) {
            if (!detail || detail.type !== "message_new") return;
            if (!detail.html) return;

            const sameChat =
                (chatId && detail.chat_id && Number(detail.chat_id) === chatId) ||
                (!chatId && otherUsername && detail.other_username && detail.other_username === otherUsername);

            if (!sameChat) return;

            if (detail.message_id) {
                const existing = listInner?.querySelector(`.message-item[data-id="${detail.message_id}"]`);
                if (existing) return;
            }

            const wasAtBottom = recalcIsAtBottom();
            listInner?.insertAdjacentHTML("beforeend", detail.html);

            let insertedEl = null;
            if (detail.message_id) {
                list.dataset.lastId = String(detail.message_id);
                insertedEl = listInner?.querySelector(`.message-item[data-id="${detail.message_id}"]`);
            }
            if (!insertedEl) {
                insertedEl = listInner?.lastElementChild || null;
            }
            if (insertedEl) initMessageMedia(insertedEl);

            if (wasAtBottom) {
                scrollToBottom({ smooth: true });
                setLocalNewCount(0);
                updateScrollBtn();

                // если пришло входящее и мы внизу — ставим прочитано (с ретраями)
                if (detail.incoming === true) {
                    sendMarkReadReliable(getCurrentLastId());
                }
            } else {
                // если мы не внизу — показываем кнопку и +1 только для входящих
                if (detail.incoming === true) {
                    setLocalNewCount(localNewCount + 1);
                }
                updateScrollBtn();
            }

            triggerGlobalUnreadUpdate();
        }

        function handleChatEvent(detail) {
            if (!detail || !detail.type) return;
            const sameChat = chatId && detail.chat_id && Number(detail.chat_id) === chatId;
            if (!sameChat) return;

            if (detail.type === "chat_access_revoked") {
                window.location.href = detail.redirect_url || "/messages/";
                return;
            }
            if (detail.type === "chat_renamed") {
                const titleEl = document.getElementById("messagesChatTitle");
                if (titleEl && detail.title) titleEl.textContent = detail.title;
                refreshHeader();
                return;
            }
            if (detail.type === "chat_member_removed" || detail.type === "chat_member_added") {
                refreshHeader();
                return;
            }
            if (detail.refresh_header === true) refreshHeader();
        }

		const handler = (ev) => handleMessageNew(ev.detail);
		window.addEventListener("germify:message_new", handler);

		const chatHandler = (ev) => handleChatEvent(ev.detail);
		window.addEventListener("germify:chat_event", chatHandler);

		// Expose cleanup so inbox/thread pages can swap chat pane without reloading.
		window.germifyDestroyThread = function () {
			try { window.removeEventListener("germify:message_new", handler); } catch (e) {}
			try { window.removeEventListener("germify:chat_event", chatHandler); } catch (e) {}
			try { window.removeEventListener("germify:chat_read", readHandler); } catch (e) {}
			// Stop recorder if still active
			try { if (recording) stopRecording(); } catch (e) {}
		};

		window.addEventListener("beforeunload", () => {
			if (typeof window.germifyDestroyThread === "function") {
				try { window.germifyDestroyThread(); } catch (e) {}
			}
		});
    }

    window.germifyInitThread = initThread;

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initThread);
    } else {
        initThread();
    }
})();
