// static/core/js/messages_thread.js
//
// Thread page logic (current UI):
// - Send message via POST
// - Receive new messages via WebSocket push (global GermifyWS events from messages.js)
// - No frequent polling (fallback is handled in messages.js)

(function () {
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
            } catch (e) {
                return;
            }

            if (resp.status === 403) {
                const data = await resp.json().catch(() => null);
                if (data && data.redirect) {
                    window.location.href = data.redirect;
                } else {
                    window.location.href = "/messages/";
                }
                return;
            }

            if (!resp.ok) return;

            const html = await resp.text();
            headerEl.innerHTML = html;
            bindHeaderInteractive();
        }

        function bindHeaderInteractive() {
            // Bind members filter input (idempotent)
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
                        const show = !q || hay.includes(q);
                        opt.style.display = show ? "" : "none";
                    });
                });
            });

            // Bind delete/leave buttons (idempotent)
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

                        if (resp2.ok) {
                            window.location.href = "/messages/";
                        } else {
                            console.warn("messages delete/leave bad status:", resp2.status);
                        }
                    } catch (e) {
                        console.error("Ошибка при удалении/выходе из чата:", e);
                    }
                });
            });
        }

        // Initial header bindings
        bindHeaderInteractive();

        const input = form.querySelector("textarea[name='text']");
        const attachBtn = document.getElementById("messages-attach-btn");
        const fileInput = document.getElementById("message-attachments-input");
        const selectedWrap = document.getElementById("messages-selected-files");
        const progWrap = document.getElementById("message-upload-progress");
        const progBar = document.getElementById("message-upload-progress-bar");

        const voiceBtn = document.getElementById("chat-voice-record-btn");
        const voiceStatus = document.getElementById("chat-voice-record-status");
        const voicePreview = document.getElementById("chat-voice-preview");
        const sendUrl = form.dataset.sendUrl || null;

        // ------------------------------
        // Attachments state
        // ------------------------------
        let selectedFiles = []; // Array<File>

        // Лимит файлов берём из body[data-attach-max] (как в постах)
        const MAX_FILE_COUNT = parseInt(document.body?.dataset?.attachMax || '10', 10);

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
                    // Revoke preview URL if used
                    if (left && left.tagName === "IMG") {
                        try { URL.revokeObjectURL(left.src); } catch (e) {}
                    }
                    selectedFiles.splice(idx, 1);
                    // Если это был voice — уберём превью
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
            const current = selectedFiles.length;
            if (current + arr.length > MAX_FILE_COUNT) {
                alert("Максимум файлов в одном сообщении: " + MAX_FILE_COUNT);
                return;
            }

            selectedFiles = selectedFiles.concat(arr);
            renderSelectedFiles();
        }

        if (attachBtn && fileInput) {
            attachBtn.addEventListener("click", () => fileInput.click());
            fileInput.addEventListener("change", () => {
                addFiles(fileInput.files);
                // очищаем input, чтобы повторный выбор того же файла сработал
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

        async function startRecording() {
            if (recording) return;
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                alert("Ваш браузер не поддерживает запись аудио.");
                return;
            }
            try {
                recorderStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                recorderChunks = [];
                recorder = new MediaRecorder(recorderStream, { mimeType: "audio/webm" });
                recorder.ondataavailable = (ev) => {
                    if (ev.data && ev.data.size > 0) recorderChunks.push(ev.data);
                };
                recorder.onstop = () => {
                    const blob = new Blob(recorderChunks, { type: "audio/webm" });
                    const file = new File([blob], "voice.webm", { type: "audio/webm" });

                    // Если раньше уже было voice.webm — заменим
                    selectedFiles = selectedFiles.filter((f) => f.name !== "voice.webm");
                    selectedFiles.push(file);

                    if (voicePreview) {
                        voicePreview.src = URL.createObjectURL(blob);
                        voicePreview.classList.remove("hidden");
                    }
                    renderSelectedFiles();
                };
                recorder.start();
                recording = true;
                if (voiceStatus) voiceStatus.textContent = "Запись… нажмите ещё раз чтобы остановить";
                if (voiceBtn) voiceBtn.classList.add("btn-outline-danger");
            } catch (e) {
                console.error("voice record error", e);
                alert("Не удалось получить доступ к микрофону.");
            }
        }

        function stopRecording() {
            if (!recording) return;
            try {
                recorder.stop();
            } catch (e) {}

            try {
                recorderStream.getTracks().forEach((t) => t.stop());
            } catch (e) {}

            recorder = null;
            recorderStream = null;
            recording = false;
            if (voiceStatus) voiceStatus.textContent = "";
            if (voiceBtn) voiceBtn.classList.remove("btn-outline-danger");
        }

        if (voiceBtn) {
            voiceBtn.addEventListener("click", () => {
                if (recording) stopRecording();
                else startRecording();
            });
        }

        // ------------------------------
        // Media init for dynamic messages
        // ------------------------------

        // --- Smart galleries (copied from posts.js, to keep identical layouts) ---
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
            if (count === 3) {
                return firstShape === "port" ? "three-vk" : "three-top";
            }
            if (count === 4) return "four";
            if (count === 5) {
                return firstShape === "port" ? "five-left" : "five-top";
            }
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

                // +N badge
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

        // --- Video players (copied from posts.js) ---
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

                if (!video || !playBtn || !bar || !progressEl || !bufferEl || !currentEl || !durationEl) {
                    return;
                }

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
                    try {
                        if (video.buffered.length) {
                            end = video.buffered.end(video.buffered.length - 1);
                        }
                    } catch (e) {}
                    const percent = (end / video.duration) * 100;
                    bufferEl.style.width = percent + "%";
                }

                video.addEventListener("loadedmetadata", () => {
                    durationEl.textContent = vFormat(video.duration);
                    updateBuffer();

                    if (video.videoWidth && video.videoHeight) {
                        const r = video.videoWidth / video.videoHeight;
                        let shape = "square";
                        if (r >= 1.25) shape = "land";
                        else if (r <= 0.85) shape = "port";
                        wrapper.dataset.shape = shape;
                    }
                });

                video.addEventListener("loadeddata", updateBuffer);
                video.addEventListener("progress", updateBuffer);

                playBtn.addEventListener("click", () => {
                    if (video.paused) {
                        video.play();
                        playBtn.textContent = "⏸";
                    } else {
                        video.pause();
                        playBtn.textContent = "▶";
                    }
                });

                video.addEventListener("click", () => {
                    playBtn.click();
                });

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
                    const pct = x / rect.width;
                    video.currentTime = pct * video.duration;
                }

                bar.addEventListener("mousedown", (e) => {
                    isScrubbing = true;
                    seekByClientX(e.clientX);
                });

                document.addEventListener("mousemove", (e) => {
                    if (!isScrubbing) return;
                    seekByClientX(e.clientX);
                });

                document.addEventListener("mouseup", () => {
                    isScrubbing = false;
                });

                bar.addEventListener("touchstart", (e) => {
                    isScrubbing = true;
                    seekByClientX(e.touches[0].clientX);
                });

                bar.addEventListener("touchmove", (e) => {
                    if (!isScrubbing) return;
                    seekByClientX(e.touches[0].clientX);
                });

                bar.addEventListener("touchend", () => {
                    isScrubbing = false;
                });

                if (fsBtn) {
                    fsBtn.addEventListener("click", () => {
                        wrapper.classList.toggle("video-fullscreen");
                        if (wrapper.classList.contains("video-fullscreen")) {
                            document.documentElement.style.overflow = "hidden";
                        } else {
                            document.documentElement.style.overflow = "";
                        }
                    });
                }
            });
        }

        // --- Audio players (copied from posts.js) ---
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

                if (!audio || !playButton || !progressBar || !bufferEl || !progressEl || !slider || !currentEl || !durationEl) {
                    return;
                }

                function aFormat(sec) {
                    if (!sec || isNaN(sec)) return "0:00";
                    const m = Math.floor(sec / 60);
                    const s = Math.floor(sec % 60);
                    return m + ":" + String(s).padStart(2, "0");
                }

                function updateBuffer() {
                    if (!audio.duration || isNaN(audio.duration)) return;
                    let end = 0;
                    try {
                        if (audio.buffered.length) {
                            end = audio.buffered.end(audio.buffered.length - 1);
                        }
                    } catch (e) {}
                    const percent = (end / audio.duration) * 100;
                    bufferEl.style.width = percent + "%";
                }

                audio.addEventListener("loadedmetadata", () => {
                    durationEl.textContent = aFormat(audio.duration);
                    updateBuffer();
                });

                audio.addEventListener("progress", updateBuffer);
                audio.addEventListener("loadeddata", updateBuffer);

                playButton.addEventListener("click", () => {
                    if (audio.paused) {
                        audio.play();
                        playButton.textContent = "⏸";
                    } else {
                        audio.pause();
                        playButton.textContent = "▶";
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
                    playButton.textContent = "▶";
                    progressEl.style.width = "0%";
                    slider.value = "0";
                    currentEl.textContent = "0:00";
                });

                slider.addEventListener("input", () => {
                    if (!audio.duration || isNaN(audio.duration)) return;
                    const pct = (parseFloat(slider.value) || 0) / 100;
                    audio.currentTime = pct * audio.duration;
                });
            });
        }

        function initMessageMedia(rootEl) {
            initSmartGalleries(rootEl);
            initVideoPlayers(rootEl);
            initAudioPlayers(rootEl);
        }

        // --- Fullscreen image viewer (same behavior as posts) ---
        // Bind once per page.
        if (!document.body.dataset.msgViewerBound) {
            document.body.dataset.msgViewerBound = "1";

            function openViewer(urls, index) {
                let current = index;
                const overlay = document.createElement("div");
                overlay.className = "image-viewer";
                overlay.innerHTML = `
                    <img class="viewer-img" src="${urls[current]}">
                    <div class="viewer-arrow prev">◀</div>
                    <div class="viewer-arrow next">▶</div>
                    <div class="viewer-close">✖</div>
                `;
                document.body.appendChild(overlay);

                const viewerImg = overlay.querySelector(".viewer-img");
                const btnPrev = overlay.querySelector(".prev");
                const btnNext = overlay.querySelector(".next");
                const btnClose = overlay.querySelector(".viewer-close");

                function show(i) {
                    current = i;
                    viewerImg.src = urls[current];
                }

                btnPrev.onclick = () => {
                    if (current === 0) show(urls.length - 1);
                    else show(current - 1);
                };

                btnNext.onclick = () => {
                    if (current === urls.length - 1) show(0);
                    else show(current + 1);
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
                });
                overlay.addEventListener("touchend", (ev) => {
                    const diff = ev.changedTouches[0].screenX - touchStartX;
                    if (Math.abs(diff) > 50) {
                        if (diff > 0) btnPrev.click();
                        else btnNext.click();
                    }
                });
            }

            document.addEventListener("click", (e) => {
                const img = e.target.closest(".gallery-img");
                if (!img) return;
                const wrap = img.closest(".attachments");
                if (!wrap) return;
                const images = [...wrap.querySelectorAll(".gallery-img")];
                const urls = images.map((i) => i.dataset.full || i.src);
                const index = images.indexOf(img);
                openViewer(urls, Math.max(0, index));
            });
        }

        function recalcIsAtBottom() {
            const threshold = 4;
            const distance = list.scrollHeight - (list.scrollTop + list.clientHeight);
            return distance <= threshold;
        }

        function scrollToBottom(options = { smooth: false }) {
            const behavior = options.smooth ? "smooth" : "auto";
            list.scrollTo({ top: list.scrollHeight, behavior });
        }

        function triggerGlobalUnreadUpdate() {
            if (typeof window.germifyUpdateUnread === "function") {
                window.germifyUpdateUnread();
            }
        }

        // --- Init scroll state ---
        scrollToBottom({ smooth: false });

        // Init media for already rendered messages
        initMessageMedia(document);

        // --- Send message ---
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
            if (!sendUrl) return Promise.resolve();

            const formData = new FormData(form);
            formData.set("text", text || "");

            // Добавляем выбранные файлы вручную (fileInput очищаем при выборе)
            selectedFiles.forEach((f) => {
                formData.append("attachments", f, f.name);
            });

            showUploadProgress(0);

            return new Promise((resolve) => {
                const xhr = new XMLHttpRequest();
                xhr.open("POST", sendUrl, true);
                xhr.setRequestHeader("X-Requested-With", "XMLHttpRequest");

                xhr.upload.onprogress = (evt) => {
                    if (!evt.lengthComputable) return;
                    const pct = (evt.loaded / evt.total) * 100;
                    showUploadProgress(pct);
                };

                xhr.onreadystatechange = () => {
                    if (xhr.readyState !== 4) return;

                    hideUploadProgress();

                    if (xhr.status === 403) {
                        let data403 = null;
                        try { data403 = JSON.parse(xhr.responseText); } catch (e) {}
                        window.location.href = (data403 && data403.redirect) ? data403.redirect : "/messages/";
                        resolve();
                        return;
                    }

                    if (xhr.status < 200 || xhr.status >= 300) {
                        console.warn("messages_send bad status:", xhr.status);
                        resolve();
                        return;
                    }

                    let data = null;
                    try { data = JSON.parse(xhr.responseText); } catch (e) {}
                    if (data && data.html && data.id) {
                        const already = list.querySelector(`.message-item[data-id="${data.id}"]`);
                        if (!already) {
                            list.insertAdjacentHTML("beforeend", data.html);
                        }

                        const newEl = list.querySelector(`.message-item[data-id="${data.id}"]`);
                        if (newEl) initMessageMedia(newEl);

                        list.dataset.lastId = String(data.id);
                        scrollToBottom({ smooth: true });
                        triggerGlobalUnreadUpdate();
                    }

                    resolve();
                };

                xhr.send(formData);
            });
        }

        form.addEventListener("submit", async (e) => {
            e.preventDefault();
            if (!input) return;

            const text = (input.value || "").trim();
            if (!text && !selectedFiles.length) return;

            // Если пользователь ещё пишет голосовое — остановим, чтобы файл появился
            if (recording) stopRecording();

            input.value = "";
            await sendMessage(text);

            // Очистка выбранных файлов/голосового после успешной попытки (даже если сервер
            // вернул ошибку — пользователь может повторить, но чаще нужно очистить)
            selectedFiles.forEach((f) => {
                if (f.type && f.type.startsWith("image/") && selectedWrap) {
                    // objectURL revocation делаем в render remove, тут уже нечего
                }
            });
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

        // --- Mark current chat as read on open (WS side keeps header counters in sync) ---
        const lastId = list.dataset.lastId ? parseInt(list.dataset.lastId, 10) : null;
        if (chatId && lastId && typeof window.GermifyWS?.send === "function") {
            window.GermifyWS.send({ type: "mark_read", chat_id: chatId, last_id: lastId });
        }

        // --- WS push handler ---
        function handleMessageNew(detail) {
            if (!detail || detail.type !== "message_new") return;
            if (!detail.html) return;

            const sameChat =
                (chatId && detail.chat_id && Number(detail.chat_id) === chatId) ||
                (!chatId && otherUsername && detail.other_username && detail.other_username === otherUsername);
            if (!sameChat) return;

            if (detail.message_id) {
                const existing = list.querySelector(`.message-item[data-id="${detail.message_id}"]`);
                if (existing) {
                    triggerGlobalUnreadUpdate();
                    return;
                }
            }

            const wasAtBottom = recalcIsAtBottom();
            list.insertAdjacentHTML("beforeend", detail.html);

            if (detail.message_id) {
                list.dataset.lastId = String(detail.message_id);
            }

            if (wasAtBottom) {
                scrollToBottom({ smooth: true });
            }

            // If this is an incoming message and we are currently viewing this chat, mark it read immediately.
            if (detail.incoming === true && typeof window.GermifyWS?.send === "function") {
                if (chatId && detail.message_id) {
                    window.GermifyWS.send({ type: "mark_read", chat_id: chatId, last_id: detail.message_id });
                } else if (detail.message_id) {
                    window.GermifyWS.send({ type: "mark_read", ids: [detail.message_id] });
                }
            }

            triggerGlobalUnreadUpdate();
        }


        function handleChatEvent(detail) {
            if (!detail || !detail.type) return;
            const sameChat = chatId && detail.chat_id && Number(detail.chat_id) === chatId;
            if (!sameChat) return;

            if (detail.type === "chat_access_revoked") {
                const url = detail.redirect_url || "/messages/";
                window.location.href = url;
                return;
            }

            if (detail.type === "chat_renamed") {
                // Update title quickly, then refresh header for full sync
                const titleEl = document.getElementById("messagesChatTitle");
                if (titleEl && detail.title) titleEl.textContent = detail.title;
                refreshHeader();
                return;
            }

            if (detail.type === "chat_member_removed" || detail.type === "chat_member_added") {
                refreshHeader();
                return;
            }

            if (detail.refresh_header === true) {
                refreshHeader();
            }
        }

        const handler = (ev) => handleMessageNew(ev.detail);
        document.addEventListener("germify:message_new", handler);

        const chatHandler = (ev) => handleChatEvent(ev.detail);
        document.addEventListener("germify:chat_event", chatHandler);

        window.addEventListener("beforeunload", () => {
            document.removeEventListener("germify:message_new", handler);
            document.removeEventListener("germify:chat_event", chatHandler);
        });
    }

    window.germifyInitThread = initThread;

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initThread);
    } else {
        initThread();
    }
})();
