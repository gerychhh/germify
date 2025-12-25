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
        const list = document.querySelector("#messagesList");
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
        const selectedWrap = document.getElementById("messages-selected-files");
        const progWrap = document.getElementById("message-upload-progress");
        const progBar = document.getElementById("message-upload-progress-bar");
        const submitBtn = form.querySelector("button[type='submit']");

        const voiceBtn = document.getElementById("chat-voice-record-btn");
        const voiceStatus = document.getElementById("chat-voice-record-status");
        const voicePreview = document.getElementById("chat-voice-preview");

        const sendUrl = form.dataset.sendUrl || null;

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
        const MAX_FILE_COUNT = parseInt(document.body?.dataset?.attachMax || "10", 10);

        function bytesToHuman(bytes) {
            const b = Number(bytes || 0);
            if (!b) return "0 B";
            const k = 1024;
            const sizes = ["B", "KB", "MB", "GB"];
            const i = Math.min(sizes.length - 1, Math.floor(Math.log(b) / Math.log(k)));
            return `${(b / Math.pow(k, i)).toFixed(i === 0 ? 0 : 1)} ${sizes[i]}`;
        }

        function getExt(name) {
            const n = String(name || "");
            const idx = n.lastIndexOf(".");
            return idx >= 0 ? n.slice(idx + 1).toLowerCase() : "";
        }

        function iconForFile(name) {
            const ext = getExt(name);
            if (ext === "pdf") return "📄";
            if (ext === "zip" || ext === "rar" || ext === "7z") return "🗜️";
            if (ext === "doc" || ext === "docx") return "📝";
            if (ext === "xls" || ext === "xlsx") return "📊";
            if (ext === "mp3" || ext === "wav" || ext === "ogg" || ext === "webm") return "🎵";
            if (ext === "mp4" || ext === "mov") return "🎬";
            return "📁";
        }

        function renderSelectedFiles() {
            if (!selectedWrap) return;
            selectedWrap.innerHTML = "";
            if (!selectedFiles.length) return;

            selectedFiles.forEach((file, idx) => {
                const item = document.createElement("div");
                item.className = "post-edit-attachment-item";

                let left;
                if (file.type && file.type.startsWith("image/")) {
                    left = document.createElement("img");
                    left.className = "post-edit-att-thumb";
                    left.alt = file.name;
                    left.src = URL.createObjectURL(file);
                } else {
                    left = document.createElement("div");
                    left.className = "post-edit-att-icon";
                    left.textContent = iconForFile(file.name);
                }

                const name = document.createElement("div");
                name.className = "post-edit-att-name";
                name.textContent = `${file.name} (${bytesToHuman(file.size)})`;

                const rm = document.createElement("button");
                rm.type = "button";
                rm.className = "btn btn-sm btn-light border";
                rm.style.padding = "2px 8px";
                rm.style.borderRadius = "999px";
                rm.textContent = "✖";
                rm.title = "Удалить";
                rm.addEventListener("click", () => {
                    if (left && left.tagName === "IMG") {
                        try { URL.revokeObjectURL(left.src); } catch (e) {}
                    }
                    selectedFiles.splice(idx, 1);
                    if (file && file.name === "voice.webm") {
                        if (voicePreview) {
                            voicePreview.classList.add("hidden");
                            voicePreview.src = "";
                        }
                    }
                    renderSelectedFiles();
                });

                item.appendChild(left);
                item.appendChild(name);
                item.appendChild(rm);
                selectedWrap.appendChild(item);
            });
        }

        function addFiles(filesList) {
            if (!filesList || !filesList.length) return;

            const arr = Array.from(filesList);
            if (selectedFiles.length + arr.length > MAX_FILE_COUNT) {
                alert("Максимум файлов в одном сообщении: " + MAX_FILE_COUNT);
                return;
            }

            selectedFiles = selectedFiles.concat(arr);
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
                        voicePreview.src = URL.createObjectURL(blob);
                        voicePreview.classList.remove("hidden");
                    }

                    renderSelectedFiles();

                    if (typeof stopPromiseResolve === "function") {
                        stopPromiseResolve();
                        stopPromiseResolve = null;
                    }
                };

                recorder.start();
                recording = true;

                if (voiceStatus) voiceStatus.textContent = "Запись… нажмите ещё раз чтобы остановить";
                if (voiceBtn) voiceBtn.classList.add("btn-outline-danger");
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
            if (voiceBtn) voiceBtn.classList.remove("btn-outline-danger");
        }

        if (voiceBtn) {
            voiceBtn.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (recording) stopRecording();
                else startRecording();
            });
        }

        // ------------------------------
        // Media init for messages
        // ------------------------------
        function _imgShape(img) {
            const w = img.naturalWidth || 0;
            const h = img.naturalHeight || 0;
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
                const imgs = Array.from(gallery.querySelectorAll(".gallery-img"));
                if (!imgs.length) {
                    gallery.dataset.count = "0";
                    gallery.dataset.layout = "one";
                    return;
                }

                const maxVisible = 6;
                imgs.forEach((img, idx) => {
                    const item = img.closest(".gallery-item");
                    if (!item) return;
                    if (idx >= maxVisible) item.classList.add("gallery-hidden");
                    else item.classList.remove("gallery-hidden");
                });

                gallery.querySelectorAll(".gallery-more-badge").forEach((n) => n.remove());
                if (imgs.length > maxVisible) {
                    const lastVisibleImg = imgs[maxVisible - 1];
                    const lastItem = lastVisibleImg?.closest(".gallery-item");
                    if (lastItem) {
                        const badge = document.createElement("div");
                        badge.className = "gallery-more-badge";
                        badge.textContent = "+" + (imgs.length - maxVisible);
                        lastItem.appendChild(badge);
                    }
                }

                const visibleCount = Math.min(imgs.length, maxVisible);
                gallery.dataset.count = String(visibleCount);

                const applyLayout = () => {
                    const shapes = imgs.slice(0, visibleCount).map(_imgShape);
                    const firstShape = shapes[0] || "land";
                    gallery.dataset.layout = _chooseGalleryLayout(visibleCount, firstShape, shapes);
                };

                applyLayout();
                imgs.slice(0, visibleCount).forEach((img) => {
                    if (img && !(img.complete && img.naturalWidth)) {
                        img.addEventListener("load", applyLayout, { once: true });
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

                playBtn.addEventListener("click", () => {
                    if (video.paused) { video.play(); playBtn.textContent = "⏸"; }
                    else { video.pause(); playBtn.textContent = "▶"; }
                });

                video.addEventListener("click", () => playBtn.click());

                if (muteBtn) {
                    muteBtn.addEventListener("click", () => {
                        video.muted = !video.muted;
                        muteBtn.textContent = video.muted ? "🔇" : "🔊";
                    });
                }

                video.addEventListener("timeupdate", () => {
                    if (!video.duration || isNaN(video.duration)) return;
                    const percent = (video.currentTime / video.duration) * 100;
                    progressEl.style.width = percent + "%";
                    currentEl.textContent = vFormat(video.currentTime);
                });

                video.addEventListener("ended", () => {
                    playBtn.textContent = "▶";
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

                playButton.addEventListener("click", () => {
                    if (audio.paused) { audio.play(); playButton.textContent = "⏸"; }
                    else { audio.pause(); playButton.textContent = "▶"; }
                });

                audio.addEventListener("timeupdate", () => {
                    if (!audio.duration || isNaN(audio.duration)) return;
                    const percent = (audio.currentTime / audio.duration) * 100;
                    progressEl.style.width = percent + "%";
                    slider.value = String(percent);
                    currentEl.textContent = aFormat(audio.currentTime);
                });

                audio.addEventListener("ended", () => {
                    playButton.textContent = "▶";
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

        initMessageMedia(document);

        // ------------------------------
        // Read receipts updates (chat_read)
        // ------------------------------
        function updateReceipts(uptoId) {
            const n = Number(uptoId) || 0;
            if (!n) return;
            if (chatKind !== "dm") return;

            list.querySelectorAll(".message-item.me").forEach((it) => {
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
        document.addEventListener("germify:chat_read", readHandler);

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
                        const already = list.querySelector(`.message-item[data-id="${data.id}"]`);
                        if (!already) list.insertAdjacentHTML("beforeend", data.html);

                        const newEl = list.querySelector(`.message-item[data-id="${data.id}"]`);
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
        });

        if (input) {
            input.addEventListener("keydown", (e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
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
                const existing = list.querySelector(`.message-item[data-id="${detail.message_id}"]`);
                if (existing) return;
            }

            const wasAtBottom = recalcIsAtBottom();
            list.insertAdjacentHTML("beforeend", detail.html);

            if (detail.message_id) list.dataset.lastId = String(detail.message_id);

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
        document.addEventListener("germify:message_new", handler);

        const chatHandler = (ev) => handleChatEvent(ev.detail);
        document.addEventListener("germify:chat_event", chatHandler);

        window.addEventListener("beforeunload", () => {
            document.removeEventListener("germify:message_new", handler);
            document.removeEventListener("germify:chat_event", chatHandler);
            document.removeEventListener("germify:chat_read", readHandler);
        });
    }

    window.germifyInitThread = initThread;

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initThread);
    } else {
        initThread();
    }
})();
