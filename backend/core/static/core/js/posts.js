// static/core/js/posts.js

// ========================
// CSRF
// ========================
function getCsrfToken() {
    const cookie = document.cookie
        .split("; ")
        .find(row => row.startsWith("csrftoken="));
    return cookie ? cookie.split("=")[1] : "";
}

// ========================
// AJAX POST
// ========================
function ajaxPost(url, form) {
    return fetch(url, {
        method: "POST",
        body: new FormData(form),
        headers: {
            "X-Requested-With": "XMLHttpRequest",
        },
    });
}

document.addEventListener("DOMContentLoaded", function () {

    // максимальная высота видимого текста поста до "Показать полностью"
    const MAX_POST_TEXT_HEIGHT = 220; // px, можно подправить

    // ==========================================================
    //           ПОДДЕРЖКА ВЛОЖЕНИЙ ДЛЯ НОВОГО ПОСТА
    // ==========================================================

    const MAX_FILE_SIZE = 25 * 1024 * 1024;      // 25 MB на файл
    const MAX_TOTAL_SIZE = 25 * 1024 * 1024;     // 25 MB суммарно
    const MAX_FILE_COUNT = 25;                   // максимум файлов

    const fileInput = document.querySelector("input[name='attachments']");
    const previewBox = document.getElementById("file-preview");
    const dropZone = document.getElementById("drop-zone");
    const fileCountEl = document.getElementById("file-count");
    const fileSizeEl = document.getElementById("file-size");
    const uploadProgress = document.getElementById("upload-progress");
    const uploadProgressBar = document.getElementById("upload-progress-bar");

    let selectedFiles = [];

    function formatSize(bytes) {
        const mb = bytes / (1024 * 1024);
        return mb.toFixed(1);
    }

    function updateFileInfo() {
        const totalSize = selectedFiles.reduce((sum, f) => sum + f.size, 0);
        if (fileCountEl) fileCountEl.textContent = "Файлы: " + selectedFiles.length;
        if (fileSizeEl) fileSizeEl.textContent = "Размер: " + formatSize(totalSize) + " MB";
    }

    // ----- Отрисовка предпросмотра -----
    function renderPreview() {
        if (!previewBox) return;
        previewBox.innerHTML = "";

        selectedFiles.forEach((file, index) => {
            const wrapper = document.createElement("div");
            wrapper.style.position = "relative";

            if (file.type.startsWith("image/")) {
                const img = document.createElement("img");
                img.src = URL.createObjectURL(file);
                img.className = "preview-img";
                wrapper.appendChild(img);
            } else {
                const div = document.createElement("div");
                div.className = "file-preview-item";
                div.textContent = file.name;
                wrapper.appendChild(div);
            }

            const del = document.createElement("div");
            del.textContent = "✖";
            del.style.position = "absolute";
            del.style.top = "2px";
            del.style.right = "6px";
            del.style.cursor = "pointer";
            del.style.color = "#f87171";
            del.style.fontWeight = "bold";
            del.onclick = () => removeFile(index);

            wrapper.appendChild(del);
            previewBox.appendChild(wrapper);
        });

        updateFileInfo();
    }

    function removeFile(index) {
        selectedFiles.splice(index, 1);
        renderPreview();

        if (selectedFiles.length === 0 && dropZone) {
            dropZone.classList.add("hidden");
        }
    }

    function addFiles(files) {
        let totalSize = selectedFiles.reduce((sum, f) => sum + f.size, 0);

        for (const file of files) {
            if (selectedFiles.length >= MAX_FILE_COUNT) {
                alert("Максимум файлов: " + MAX_FILE_COUNT);
                break;
            }

            if (file.size > MAX_FILE_SIZE) {
                alert(`Файл "${file.name}" превышает 10MB`);
                continue;
            }

            if (totalSize + file.size > MAX_TOTAL_SIZE) {
                alert("Превышен общий лимит размера файлов (50MB)");
                break;
            }

            selectedFiles.push(file);
            totalSize += file.size;
        }

        renderPreview();
    }

    function clearFilePreview() {
        if (previewBox) previewBox.innerHTML = "";
        selectedFiles = [];
        if (fileInput) fileInput.value = "";
        updateFileInfo();
    }

    if (fileInput) {
        fileInput.addEventListener("change", function () {
            if (!fileInput.files.length) return;
            addFiles(fileInput.files);
            fileInput.value = "";
        });
    }

    // ==========================================================
    //       ПОКАЗАТЬ DROP-ZONE ПРИ DRAG'N'DROP
    // ==========================================================

    document.addEventListener("dragenter", function (e) {
        if (!e.dataTransfer || !e.dataTransfer.types.includes("Files")) return;
        if (dropZone) dropZone.classList.remove("hidden");
    });

    document.addEventListener("dragleave", function (e) {
        if (e.clientX === 0 && e.clientY === 0) {
            if (selectedFiles.length === 0 && dropZone) {
                dropZone.classList.add("hidden");
            }
        }
    });

    if (dropZone) {
        dropZone.addEventListener("dragover", (e) => {
            e.preventDefault();
            dropZone.classList.add("dragover");
        });

        dropZone.addEventListener("dragleave", (e) => {
            e.preventDefault();
            dropZone.classList.remove("dragover");

            if (selectedFiles.length === 0) {
                dropZone.classList.add("hidden");
            }
        });

        dropZone.addEventListener("drop", (e) => {
            e.preventDefault();
            dropZone.classList.remove("dragover");

            if (e.dataTransfer.files.length) {
                addFiles(e.dataTransfer.files);
            }

            if (selectedFiles.length === 0) {
                dropZone.classList.add("hidden");
            }
        });
    }

    // На старте прячем все формы комментариев и ответов
    document.querySelectorAll(".comment-form, .reply-form").forEach(function (f) {
        f.classList.add("hidden");
    });

    // ----------------------------------------------------------
    //  ФУНКЦИИ ИНИЦИАЛИЗАЦИИ (ТЕКСТ, ВИДЕО, АУДИО)
    // ----------------------------------------------------------

    // ---------- СВЁРНУТЫЙ ТЕКСТ + МЕДИА ПОСТА ----------
    function initPostTextCollapsing(root = document) {
        if (!root.querySelectorAll) return;

        const blocks = root.querySelectorAll(".post-text-block");

        blocks.forEach(block => {
            if (block.dataset.textInited === "1") return;
            block.dataset.textInited = "1";

            const wrapper = block.querySelector(".post-text-wrapper");
            const toggle  = block.querySelector(".post-text-toggle");

            if (!wrapper || !toggle) return;

            // если контент (текст + вложения) невысокий — не сворачиваем
            if (wrapper.scrollHeight <= MAX_POST_TEXT_HEIGHT + 10) {
                return;
            }

            wrapper.style.maxHeight = MAX_POST_TEXT_HEIGHT + "px";
            wrapper.classList.add("is-collapsed");
            toggle.classList.remove("hidden");
            toggle.dataset.expanded = "0";
        });
    }


    // ---------- ВИДЕО ----------

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
            });

            video.addEventListener("loadeddata", updateBuffer);
            video.addEventListener("progress", updateBuffer);

            // play/pause
            playBtn.addEventListener("click", () => {
                if (video.paused) {
                    video.play();
                    playBtn.textContent = "⏸";
                } else {
                    video.pause();
                    playBtn.textContent = "▶";
                }
            });

            // клик по видео — тоже play/pause
            video.addEventListener("click", () => {
                playBtn.click();
            });

            // mute
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

            // SEEK по прогресс-бару
            function seekByClientX(clientX) {
                if (!video.duration || isNaN(video.duration)) return;
                const rect = bar.getBoundingClientRect();
                let x = clientX - rect.left;
                if (x < 0) x = 0;
                if (x > rect.width) x = rect.width;

                const percent = x / rect.width;
                video.currentTime = percent * video.duration;
            }

            bar.addEventListener("pointerdown", (e) => {
                if (e.pointerType === "mouse" && e.button !== 0) return;
                if (!video.duration || isNaN(video.duration)) return;
                isScrubbing = true;
                bar.setPointerCapture(e.pointerId);
                seekByClientX(e.clientX);
            });

            bar.addEventListener("pointermove", (e) => {
                if (!isScrubbing) return;
                seekByClientX(e.clientX);
            });

            function stopScrub(e) {
                if (!isScrubbing) return;
                isScrubbing = false;
                try {
                    bar.releasePointerCapture(e.pointerId);
                } catch (err) {}
            }

            bar.addEventListener("pointerup", stopScrub);
            bar.addEventListener("pointercancel", stopScrub);
            bar.addEventListener("lostpointercapture", () => {
                isScrubbing = false;
            });

            // FULLSCREEN
            if (fsBtn) {
                fsBtn.addEventListener("click", () => {
                    const isFull = document.fullscreenElement === wrapper;
                    if (!isFull) {
                        if (wrapper.requestFullscreen) {
                            wrapper.requestFullscreen();
                        } else if (wrapper.webkitRequestFullscreen) {
                            wrapper.webkitRequestFullscreen();
                        }
                    } else {
                        if (document.exitFullscreen) {
                            document.exitFullscreen();
                        } else if (document.webkitExitFullscreen) {
                            document.webkitExitFullscreen();
                        }
                    }
                });

                document.addEventListener("fullscreenchange", () => {
                    const isFull = document.fullscreenElement === wrapper;
                    wrapper.classList.toggle("video-fullscreen", isFull);
                });
            }
        });
    }

    // ---------- АУДИО ----------

    let currentAudio = null;

    function initAudioPlayers(root = document) {
        if (!root.querySelectorAll) return;

        const wrappers = root.querySelectorAll(".audio-wrapper");

        wrappers.forEach(wrapper => {
            if (wrapper.dataset.inited === "1") return;
            wrapper.dataset.inited = "1";

            const audio         = wrapper.querySelector(".audio-player");
            const playButton    = wrapper.querySelector(".audio-play");
            const barContainer  = wrapper.querySelector(".audio-progress-bar");
            const progressBar   = wrapper.querySelector(".audio-progress");
            const bufferBar     = wrapper.querySelector(".audio-buffer");
            const slider        = wrapper.querySelector(".audio-slider");
            const currentTimeEl = wrapper.querySelector(".audio-current");
            const durationEl    = wrapper.querySelector(".audio-duration");

            if (!audio || !playButton || !barContainer || !progressBar || !bufferBar || !slider || !currentTimeEl || !durationEl) {
                return;
            }

            let isSeeking = false;
            let lastUiUpdate = 0;

            function aFormat(sec) {
                if (!sec || isNaN(sec)) return "0:00";
                const m = Math.floor(sec / 60);
                const s = Math.floor(sec % 60);
                return m + ":" + String(s).padStart(2, "0");
            }

            function updateAudioBuffer() {
                if (!audio.duration || isNaN(audio.duration)) return;
                let end = 0;
                try {
                    if (audio.buffered.length) {
                        end = audio.buffered.end(audio.buffered.length - 1);
                    }
                } catch (e) {}
                const percent = (end / audio.duration) * 100;
                bufferBar.style.width = percent + "%";
            }

            audio.addEventListener("loadedmetadata", () => {
                durationEl.textContent = aFormat(audio.duration);
                updateAudioBuffer();
            });

            audio.addEventListener("loadeddata", updateAudioBuffer);
            audio.addEventListener("progress", updateAudioBuffer);

            // play / pause
            playButton.addEventListener("click", () => {
                if (currentAudio && currentAudio !== audio) {
                    currentAudio.pause();
                    document
                        .querySelectorAll(".audio-play")
                        .forEach(btn => (btn.textContent = "▶"));
                }

                if (audio.paused) {
                    audio.play();
                    playButton.textContent = "⏸";
                    currentAudio = audio;
                } else {
                    audio.pause();
                    playButton.textContent = "▶";
                }
            });

            // SEEK по клику/перетаскиванию по дорожке
            function seekAudioByClientX(clientX) {
                if (!audio.duration || isNaN(audio.duration)) return;

                const rect = barContainer.getBoundingClientRect();
                let x = clientX - rect.left;
                if (x < 0) x = 0;
                if (x > rect.width) x = rect.width;

                const percent = x / rect.width;
                const newTime = percent * audio.duration;

                audio.currentTime = newTime;
                progressBar.style.width = (percent * 100) + "%";
                slider.value = percent * 100;
                currentTimeEl.textContent = aFormat(newTime);
            }

            barContainer.addEventListener("pointerdown", (e) => {
                if (e.pointerType === "mouse" && e.button !== 0) return;
                if (!audio.duration || isNaN(audio.duration)) return;
                isSeeking = true;
                barContainer.setPointerCapture(e.pointerId);
                seekAudioByClientX(e.clientX);
            });

            barContainer.addEventListener("pointermove", (e) => {
                if (!isSeeking) return;
                seekAudioByClientX(e.clientX);
            });

            function stopAudioSeek(e) {
                if (!isSeeking) return;
                isSeeking = false;
                try {
                    barContainer.releasePointerCapture(e.pointerId);
                } catch (err) {}
            }

            barContainer.addEventListener("pointerup", stopAudioSeek);
            barContainer.addEventListener("pointercancel", stopAudioSeek);
            barContainer.addEventListener("lostpointercapture", () => {
                isSeeking = false;
            });

            // input range — невидимый помощник
            slider.addEventListener("input", () => {
                if (!audio.duration || isNaN(audio.duration)) return;
                if (isSeeking) return;

                const percent = parseFloat(slider.value) || 0;
                const newTime = (percent / 100) * audio.duration;
                audio.currentTime = newTime;
                progressBar.style.width = percent + "%";
                currentTimeEl.textContent = aFormat(newTime);
            });

            // timeupdate: душим частоту
            audio.addEventListener("timeupdate", () => {
                if (!audio.duration || isNaN(audio.duration)) return;
                if (isSeeking) return;

                const now = performance.now ? performance.now() : Date.now();
                if (now - lastUiUpdate < 120) return;
                lastUiUpdate = now;

                const percent = (audio.currentTime / audio.duration) * 100;
                progressBar.style.width = percent + "%";
                slider.value = percent;
                currentTimeEl.textContent = aFormat(audio.currentTime);
            });

            audio.addEventListener("ended", () => {
                audio.currentTime = 0;
                progressBar.style.width = "0%";
                slider.value = 0;
                currentTimeEl.textContent = "0:00";
                playButton.textContent = "▶";
                isSeeking = false;
            });
        });
    }

    // ==========================
    // ОБРАБОТЧИК ВСЕХ SUBMIT'ов
    // ==========================
    document.addEventListener("submit", function (e) {
        const form = e.target;

        // ---------- СОЗДАНИЕ НОВОГО ПОСТА (AJAX) ----------
        if (form.classList.contains("new-post-form")) {
            e.preventDefault();

            const fd = new FormData(form);
            selectedFiles.forEach(f => fd.append("attachments", f));

            if (uploadProgress && uploadProgressBar) {
                uploadProgress.classList.remove("hidden");
                uploadProgressBar.style.width = "0%";
            }

            const xhr = new XMLHttpRequest();
            xhr.open("POST", form.action, true);
            xhr.setRequestHeader("X-Requested-With", "XMLHttpRequest");

            xhr.upload.onprogress = function (event) {
                if (event.lengthComputable && uploadProgressBar) {
                    const percent = (event.loaded / event.total) * 100;
                    uploadProgressBar.style.width = percent.toFixed(1) + "%";
                }
            };

            xhr.onload = function () {
                if (uploadProgress) uploadProgress.classList.add("hidden");

                if (xhr.status >= 200 && xhr.status < 300) {
                    const ct = xhr.getResponseHeader("content-type") || "";
                    if (ct.indexOf("application/json") !== -1) {
                        let data;
                        try {
                            data = JSON.parse(xhr.responseText);
                        } catch (e) {
                            console.error("JSON parse error:", e);
                            return;
                        }

                        if (!data.success || !data.html) return;

                        const list = document.querySelector(".posts-list");
                        if (!list) return;

                        list.insertAdjacentHTML("afterbegin", data.html);
                        const newPostEl = list.firstElementChild;

                        // инициализируем в новом посте текст/видео/аудио
                        initPostTextCollapsing(newPostEl);
                        initVideoPlayers(newPostEl);
                        initAudioPlayers(newPostEl);

                        form.reset();
                        clearFilePreview();
                        if (dropZone) dropZone.classList.add("hidden");

                    } else {
                        window.location.reload();
                    }
                    } else {
                        let msg = "Ошибка при отправке поста";
                        // попробуем подсказать, если это именно лимит размера
                        if (xhr.status === 413) {
                            msg = "Файл слишком большой (ошибка 413 от сервера). Увеличь client_max_body_size в nginx.";
                        } else if (xhr.status === 403) {
                            msg = "Ошибка 403 (возможно, CSRF).";
                        } else if (xhr.status === 500) {
                            msg = "Внутренняя ошибка сервера (500). Проверь логи Django.";
                        } else {
                            msg = "Ошибка при отправке поста (HTTP " + xhr.status + ")";
                        }
                        alert(msg);
                    }
            };

            xhr.onerror = function () {
                if (uploadProgress) uploadProgress.classList.add("hidden");
                alert("Ошибка сети");
            };

            xhr.send(fd);
            return;
        }

        // ---------- ЛАЙК ПОСТА ----------
        if (form.classList.contains("like-form")) {
            e.preventDefault();
            const postId = form.dataset.postId;

            ajaxPost(form.action, form)
                .then(r => r.json())
                .then(data => {
                    const btn = form.querySelector(".like-button");
                    const cnt = document.querySelector('.like-count[data-post-id="' + postId + '"]');
                    if (!btn) return;

                    btn.textContent = data.liked ? "❤️" : "🤍";
                    btn.dataset.liked = data.liked ? "true" : "false";

                    if (data.liked) btn.classList.add("is-liked");
                    else btn.classList.remove("is-liked");

                    btn.classList.remove("like-animate");
                    void btn.offsetWidth;
                    btn.classList.add("like-animate");

                    if (cnt && typeof data.likes_count !== "undefined") {
                        cnt.textContent = data.likes_count + " лайков";
                        cnt.classList.remove("like-count-bump");
                        void cnt.offsetWidth;
                        cnt.classList.add("like-count-bump");
                    }
                })
                .catch(err => console.error("post like error:", err));

            return;
        }

        // ---------- ЛАЙК КОММЕНТАРИЯ ----------
        if (form.classList.contains("comment-like-form")) {
            e.preventDefault();

            const commentId = form.dataset.commentId;

            ajaxPost(form.action, form)
                .then(r => r.json())
                .then(data => {
                    const btn = form.querySelector("button");
                    const cnt = document.querySelector(
                        '.comment-like-count[data-comment-id="' + commentId + '"], ' +
                        '.reply-like-count[data-comment-id="' + commentId + '"]'
                    );
                    btn.textContent = data.liked ? "❤️" : "🤍";
                    if (cnt) cnt.textContent = data.likes_count + " лайков";
                })
                .catch(err => console.error("comment like error:", err));

            return;
        }

        // ---------- ДОБАВЛЕНИЕ КОММЕНТАРИЯ ----------
        if (form.classList.contains("comment-form")) {
            e.preventDefault();

            const postId = form.dataset.postId;
            const textArea = form.querySelector(".comment-input");
            if (!textArea || !textArea.value.trim()) return;

            ajaxPost(form.action, form)
                .then(r => r.json())
                .then(data => {
                    if (!data.html) return;

                    const pid = data.post_id || postId;
                    const body = document.querySelector('.comments-body[data-post-id="' + pid + '"]');
                    if (!body) return;

                    const addBtn = body.querySelector(".comment-add-toggle");
                    if (addBtn) addBtn.insertAdjacentHTML("beforebegin", data.html);
                    else body.insertAdjacentHTML("beforeend", data.html);

                    const badge = document.querySelector(
                        '.comments-toggle[data-post-id="' + pid + '"] .comments-count-badge'
                    );

                    if (badge && typeof data.comments_count !== "undefined") {
                        badge.textContent = data.comments_count;
                    }

                    textArea.value = "";
                    form.classList.add("hidden");
                })
                .catch(err => console.error("add comment error:", err));

            return;
        }

        // ---------- ДОБАВЛЕНИЕ ОТВЕТА ----------
        if (form.classList.contains("reply-form")) {
            e.preventDefault();

            const parentId = form.dataset.parentId;
            const postId = form.dataset.postId;
            const textArea = form.querySelector(".reply-input");
            if (!textArea || !textArea.value.trim()) return;

            ajaxPost(form.action, form)
                .then(r => r.json())
                .then(data => {
                    if (!data.html) return;

                    const pid = data.post_id || postId;
                    const pId = data.parent_id || parentId;

                    const parentEl = document.querySelector(
                        '.comment-item[data-comment-id="' + pId + '"]'
                    );
                    if (!parentEl) return;

                    const repliesBlock = parentEl.querySelector(".replies-block");
                    if (repliesBlock) repliesBlock.insertAdjacentHTML("beforeend", data.html);
                    else parentEl.insertAdjacentHTML("beforeend", data.html);

                    const badge = document.querySelector(
                        '.comments-toggle[data-post-id="' + pid + '"] .comments-count-badge'
                    );

                    if (badge && typeof data.comments_count !== "undefined") {
                        badge.textContent = data.comments_count;
                    }

                    textArea.value = "";
                    form.classList.add("hidden");
                })
                .catch(err => console.error("add reply error:", err));

            return;
        }

        // ---------- УДАЛЕНИЕ КОММЕНТАРИЯ ----------
        if (form.classList.contains("comment-delete-form")) {
            e.preventDefault();

            const commentId = form.dataset.commentId;
            const postId = form.dataset.postId;

            ajaxPost(form.action, form)
                .then(() => {
                    const el = document.querySelector(
                        '.comment-item[data-comment-id="' + commentId + '"]'
                    );
                    if (el) el.remove();

                    const badge = document.querySelector(
                        '.comments-toggle[data-post-id="' + postId + '"] .comments-count-badge'
                    );

                    if (badge) {
                        const n = parseInt(badge.textContent) || 0;
                        badge.textContent = n > 0 ? n - 1 : 0;
                    }
                })
                .catch(err => console.error("delete comment error:", err));

            return;
        }

        // ---------- УДАЛЕНИЕ ПОСТА ----------
        if (form.classList.contains("post-delete-form")) {
            e.preventDefault();

            const postCard = form.closest(".post-card");

            ajaxPost(form.action, form)
                .then(() => {
                    if (postCard) postCard.remove();
                })
                .catch(err => console.error("delete post error:", err));

            return;
        }
    });

    // ==========================
    // ОБРАБОТЧИК ВСЕХ КЛИКОВ
    // ==========================
    document.addEventListener("click", function (e) {

        // ----- РАЗВОРОТ/СВОРАЧИВАНИЕ ДЛИННОГО ПОСТА (ТЕКСТ + МЕДИА) -----
        const textToggle = e.target.closest(".post-text-toggle");
        if (textToggle) {
            const block   = textToggle.closest(".post-text-block");
            if (!block) return;

            const wrapper = block.querySelector(".post-text-wrapper");
            if (!wrapper) return;

            const expanded = textToggle.dataset.expanded === "1";

            if (expanded) {
                // свернуть обратно
                wrapper.style.maxHeight = MAX_POST_TEXT_HEIGHT + "px";
                wrapper.classList.add("is-collapsed");
                textToggle.textContent = "Показать полностью";
                textToggle.dataset.expanded = "0";
            } else {
                // развернуть на всю высоту контента (текст + вложения)
                wrapper.style.maxHeight = wrapper.scrollHeight + "px";
                wrapper.classList.remove("is-collapsed");
                textToggle.textContent = "Свернуть";
                textToggle.dataset.expanded = "1";
            }
            return;
        }


        // ----- МЕНЮ ПОСТА (⋯) -----
        const postMenuToggle = e.target.closest(".post-menu-toggle");
        if (postMenuToggle) {
            const postId = postMenuToggle.dataset.postId;

            document.querySelectorAll(".post-menu").forEach(function (menu) {
                if (menu.dataset.postId === postId) {
                    menu.classList.toggle("hidden");
                } else {
                    menu.classList.add("hidden");
                }
            });

            return;
        }

        // ----- ПОДЕЛИТЬСЯ -----
        const shareBtn = e.target.closest(".post-share-btn");
        if (shareBtn) {
            const postId = shareBtn.dataset.postId;
            const path = shareBtn.dataset.postUrl || ("/post/" + postId + "/");
            const fullUrl = window.location.origin + path;

            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(fullUrl)
                    .then(function () {
                        const oldText = shareBtn.textContent;
                        shareBtn.textContent = "Ссылка скопирована";
                        setTimeout(function () {
                            shareBtn.textContent = oldText;
                        }, 2000);
                    })
                    .catch(function () {
                        alert("Не удалось скопировать ссылку");
                    });
            } else {
                window.prompt("Скопируйте ссылку:", fullUrl);
            }

            document.querySelectorAll(".post-menu").forEach(function (menu) {
                menu.classList.add("hidden");
            });

            return;
        }

        // ----- ОТКРЫТЬ/ЗАКРЫТЬ КОММЕНТАРИИ -----
        const commentsToggle = e.target.closest(".comments-toggle");
        if (commentsToggle) {
            const postId = commentsToggle.dataset.postId;
            const body = document.querySelector(
                '.comments-body[data-post-id="' + postId + '"]'
            );
            const arrow = commentsToggle.querySelector(".comments-toggle-arrow");

            if (body) {
                body.classList.toggle("hidden");
                const isHidden = body.classList.contains("hidden");

                if (!isHidden) {
                    body.querySelectorAll(".comment-form, .reply-form")
                        .forEach(function (f) { f.classList.add("hidden"); });
                    body.querySelectorAll(".replies-block")
                        .forEach(function (b) { b.classList.add("hidden"); });
                }

                if (arrow) {
                    arrow.textContent = isHidden ? "▾" : "▴";
                }
            }
            return;
        }

        // ----- ОТКРЫТЬ/ЗАКРЫТЬ БЛОК ОТВЕТОВ -----
        const repliesToggle = e.target.closest(".replies-toggle");
        if (repliesToggle) {
            const commentId = repliesToggle.dataset.commentId;
            const block = document.querySelector(
                '.replies-block[data-parent-id="' + commentId + '"]'
            );
            if (block) {
                block.classList.toggle("hidden");
            }
            return;
        }

        // ----- ОТКРЫТЬ ФОРМУ КОММЕНТАРИЯ -----
        const addToggle = e.target.closest(".comment-add-toggle");
        if (addToggle) {
            const postId = addToggle.dataset.postId;
            const form = document.querySelector(
                '.comment-form[data-post-id="' + postId + '"]'
            );
            if (form) form.classList.toggle("hidden");
            return;
        }

        // ----- ОТКРЫТЬ ФОРМУ ОТВЕТА -----
        const replyToggle = e.target.closest(".comment-reply-toggle");
        if (replyToggle) {
            const commentId = replyToggle.dataset.commentId;
            const form = document.querySelector(
                '.reply-form[data-parent-id="' + commentId + '"]'
            );
            if (form) form.classList.toggle("hidden");
            return;
        }

        // ----- ПОДПИСКА (старые кнопки .follow-btn) -----
        const followBtn = e.target.closest(".follow-btn");
        if (followBtn) {
            e.preventDefault();

            const isFollowing = followBtn.dataset.following === "1";
            const url = isFollowing
                ? followBtn.dataset.unfollowUrl
                : followBtn.dataset.followUrl;

            if (!url) return;

            fetch(url, {
                method: "POST",
                headers: {
                    "X-Requested-With": "XMLHttpRequest",
                    "X-CSRFToken": getCsrfToken(),
                },
            })
                .then(r => r.json())
                .then(function (data) {
                    if (!data) return;

                    const following = !!data.following;
                    followBtn.dataset.following = following ? "1" : "0";
                    followBtn.textContent = following ? "Вы подписаны" : "Подписаться";

                    if (following) {
                        followBtn.style.background = "#1f2937";
                        followBtn.style.color = "#e5e7eb";
                    } else {
                        followBtn.style.background = "";
                        followBtn.style.color = "";
                    }

                    if (typeof data.followers_count !== "undefined") {
                        const counterEl = document.querySelector(".profile-followers-count");
                        if (counterEl) counterEl.textContent = data.followers_count;
                    }
                })
                .catch(err => console.error("follow error:", err));

            return;
        }

        // ----- КЛИК МИМО МЕНЮ -----
        if (!e.target.closest(".post-menu") && !e.target.closest(".post-menu-toggle")) {
            document.querySelectorAll(".post-menu").forEach(function (menu) {
                menu.classList.add("hidden");
            });
        }
    });

    // --------------------------------------------
    // Инициализируем медиа и свёртку текста
    // --------------------------------------------
    initPostTextCollapsing(document);
    initVideoPlayers(document);
    initAudioPlayers(document);

}); // конец DOMContentLoaded

// ================================
// FULLSCREEN IMAGE VIEWER + SLIDES
// ================================
document.addEventListener("click", function (e) {
    const img = e.target.closest(".gallery-img");
    if (!img) return;

    const post = img.closest(".attachments");
    if (!post) return;

    const images = [...post.querySelectorAll(".gallery-img")];
    const urls = images.map(i => i.dataset.full || i.src);
    let index = images.indexOf(img);

    openViewer(urls, index);
});

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

    // закрытие по клику по фону
    overlay.addEventListener("click", (e) => {
        if (e.target === overlay) overlay.remove();
    });

    // ESC закрыть
    function escHandler(ev) {
        if (ev.key === "Escape") {
            overlay.remove();
            document.removeEventListener("keydown", escHandler);
        }
    }
    document.addEventListener("keydown", escHandler);

    // свайпы для телефонов
    let touchStartX = 0;

    overlay.addEventListener("touchstart", (ev) => {
        touchStartX = ev.changedTouches[0].screenX;
    });

    overlay.addEventListener("touchend", (ev) => {
        let diff = ev.changedTouches[0].screenX - touchStartX;

        if (Math.abs(diff) > 50) {
            if (diff > 0) btnPrev.click();
            else btnNext.click();
        }
    });
}
