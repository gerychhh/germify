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

// ========================
// SMART IMAGE GALLERIES (1–10)
// ========================
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
        // если первая вертикальная — VK-раскладка, иначе «широкая сверху»
        return firstShape === "port" ? "three-vk" : "three-top";
    }

    if (count === 4) return "four";

    if (count === 5) {
        return firstShape === "port" ? "five-left" : "five-top";
    }

    // 6–10
    return "grid-3";
}

function initSmartGalleries(root) {
    const scope = root || document;
    const galleries = scope.querySelectorAll?.(".attachment-gallery") || [];
    galleries.forEach((gallery) => {
        const imgs = Array.from(gallery.querySelectorAll(".gallery-img"));
        if (!imgs.length) {
            gallery.dataset.count = "0";
            gallery.dataset.layout = "one";
            return;
        }

        // Ограничение отображения (на всякий случай, если в старых постах больше 10)
        const maxVisible = 6;
        imgs.forEach((img, idx) => {
            const item = img.closest(".gallery-item");
            if (!item) return;
            if (idx >= maxVisible) item.classList.add("gallery-hidden");
            else item.classList.remove("gallery-hidden");
        });

        // бейдж +N
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
            // по умолчанию считаем первую "не вертикальной", чтобы не раздувать пост до загрузки картинки
            const shapes = imgs.slice(0, visibleCount).map(_imgShape);
            const firstShape = shapes[0] || "land";
            gallery.dataset.layout = _chooseGalleryLayout(visibleCount, firstShape, shapes);
        };

        // Применяем сразу и ещё раз после загрузки первой картинки (для корректного определения пропорций)
        applyLayout();
        imgs.slice(0, visibleCount).forEach((img) => {
            if (img && !(img.complete && img.naturalWidth)) {
                img.addEventListener("load", applyLayout, { once: true });
            }
        });
    });
}

document.addEventListener("DOMContentLoaded", function () {

    // ===== Пошаговое раскрытие длинного текста =====
    // посты: свёртка крупнее (моб/десктоп)
    const IS_MOBILE = window.matchMedia && window.matchMedia("(max-width: 576px)").matches;
    const MAX_POST_TEXT_HEIGHT = IS_MOBILE ? 320 : 420;
    const POST_TEXT_STEP = IS_MOBILE ? 240 : 320;

    // описание сообщества + комментарии/ответы: 120px, затем +140px за клик
    const SOFT_TEXT_INITIAL = 120;
    const SOFT_TEXT_STEP = 140;

    // ===== Пакетный показ комментариев/ответов =====
    const COMMENTS_BATCH_SIZE = 3;
    const REPLIES_BATCH_SIZE = 3;

    // ==========================================================
    //           ПОДДЕРЖКА ВЛОЖЕНИЙ ДЛЯ НОВОГО ПОСТА
    // ==========================================================

    const MAX_FILE_SIZE = 25 * 1024 * 1024;      // 25 MB на файл
    const MAX_TOTAL_SIZE = 250 * 1024 * 1024;    // 250 MB суммарно
    const MAX_FILE_COUNT = parseInt(document.body?.dataset?.attachMax || "10", 10); // максимум файлов

    const fileInput = document.querySelector(".new-post-form input[name='attachments']");
    const previewBox = document.getElementById("file-preview");
    const dropZone = document.getElementById("drop-zone");
    const fileCountEl = document.getElementById("file-count");
    const fileSizeEl = document.getElementById("file-size");
    const uploadProgress = document.getElementById("upload-progress");
    const uploadProgressBar = document.getElementById("upload-progress-bar");

    let selectedFiles = [];

    // ==========================================================
    //          ОГРАНИЧЕНИЕ СИМВОЛОВ В ПОСТЕ (UI)
    // ==========================================================
    const MAX_POST_CHARS = parseInt(document.body?.dataset?.postMax || "2000", 10);

    function bindTextCounter(textarea, counterEl, max) {
        if (!textarea || !counterEl || !max) return;

        const render = () => {
            const len = (textarea.value || "").length;
            counterEl.textContent = `${len} / ${max}`;
        };

        textarea.setAttribute("maxlength", String(max));
        textarea.addEventListener("input", render);
        render();
    }

    const newPostText = document.getElementById("new-post-text");
    const newPostCounter = document.querySelector(".post-text-counter[data-for='new-post-text']");
    bindTextCounter(newPostText, newPostCounter, MAX_POST_CHARS);

// ===== РЕДАКТИРОВАНИЕ ПОСТА: выбранные новые файлы + лимит =====
document.addEventListener("change", function (e) {
    const input = e.target;
    if (!input || !input.classList || !input.classList.contains("post-edit-file-input")) return;

    const form = input.closest(".post-edit-form");
    if (!form) return;

    const out = form.querySelector(".post-edit-new-files");
    const files = Array.from(input.files || []);
    if (!out) return;

    // Проверяем лимит: существующие (за вычетом помеченных) + новые
    const existingCount = form.querySelectorAll(".post-edit-attachment-item").length;
    const toDelete = form.querySelectorAll(".post-edit-att-check:checked").length;
    const willRemain = Math.max(0, existingCount - toDelete) + files.length;

    if (willRemain > MAX_FILE_COUNT) {
        alert("Максимум файлов в одном посте: " + MAX_FILE_COUNT);
        input.value = "";
        out.textContent = "";
        return;
    }

    if (!files.length) {
        out.textContent = "";
        return;
    }

    out.textContent = "Добавится: " + files.map(f => f.name).join(", ");
});


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

    // делаем превью сеткой (чтобы картинки не растягивались на весь экран)
    previewBox.classList.add("file-preview");

    selectedFiles.forEach((file, index) => {
        const wrapper = document.createElement("div");
        const isImage = (file.type || "").startsWith("image/");
        wrapper.className = "preview-item " + (isImage ? "preview-item--image" : "preview-item--file");

        if (isImage) {
            const img = document.createElement("img");
            img.className = "preview-img";
            const url = URL.createObjectURL(file);
            img.src = url;
            img.alt = file.name || "image";
            img.onload = () => URL.revokeObjectURL(url);
            wrapper.appendChild(img);
        } else {
            const row = document.createElement("div");
            row.className = "file-preview-item";

            const icon = document.createElement("span");
            icon.className = "file-preview-icon";
            icon.textContent = "📎";

            const name = document.createElement("span");
            name.className = "file-preview-name";
            name.textContent = file.name || "file";

            row.appendChild(icon);
            row.appendChild(name);
            wrapper.appendChild(row);
        }

        const del = document.createElement("button");
        del.type = "button";
        del.className = "remove-file-btn";
        del.setAttribute("aria-label", "Удалить файл");
        del.innerHTML = "&times;";
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
                alert("Максимум файлов в одном посте: " + MAX_FILE_COUNT);
                break;
            }

            if (file.size > MAX_FILE_SIZE) {
                alert(`Файл "${file.name}" превышает 25MB`);
                continue;
            }

            if (totalSize + file.size > MAX_TOTAL_SIZE) {
                alert("Превышен общий лимит размера файлов (250MB)");
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

    // ---------- СВЁРНУТЫЙ ТЕКСТ + МЕДИА (посты/описание сообщества/комментарии) ----------
    function getTextCollapseConfig(block) {
        if (block && (block.classList.contains("comment-text-block") || block.classList.contains("community-desc-block"))) {
            return { initial: SOFT_TEXT_INITIAL, step: SOFT_TEXT_STEP };
        }
        return { initial: MAX_POST_TEXT_HEIGHT, step: POST_TEXT_STEP };
    }

    function initPostTextCollapsing(root = document) {
        if (!root.querySelectorAll) return;

        const blocks = root.querySelectorAll(".post-text-block");

        blocks.forEach(block => {
            const wrapper = block.querySelector(".post-text-wrapper");
            const toggle = block.querySelector(".post-text-toggle");
            if (!wrapper || !toggle) return;

            const cfg = getTextCollapseConfig(block);
            const fullHeight = wrapper.scrollHeight;

            // Контент низкий — не сворачиваем
            if (fullHeight <= cfg.initial + 10) {
                wrapper.style.maxHeight = "";
                wrapper.classList.remove("is-collapsed");
                toggle.classList.add("hidden");
                toggle.dataset.state = "";
                return;
            }

            toggle.classList.remove("hidden");

            // Если ранее уже был полностью развернут — удерживаем состояние
            if (toggle.dataset.state === "expanded") {
                wrapper.style.maxHeight = fullHeight + "px";
                wrapper.classList.remove("is-collapsed");
                toggle.textContent = "Свернуть";
            } else {
                wrapper.style.maxHeight = cfg.initial + "px";
                wrapper.classList.add("is-collapsed");
                toggle.textContent = "Показать ещё";
                toggle.dataset.state = "collapsed";
            }
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

                // mark video orientation for styling (doesn't affect player behavior)
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

    // ==========================================================
    //         ПАКЕТНЫЙ ПОКАЗ КОММЕНТАРИЕВ / ОТВЕТОВ
    //         (кнопка "Показать ещё" внизу, порядок: новые сверху)
    // ==========================================================
    function directChildren(container, selector) {
        if (!container) return [];
        // :scope поддерживается в современных браузерах; fallback — через children
        try {
            return Array.from(container.querySelectorAll(":scope > " + selector));
        } catch (e) {
            return Array.from(container.children).filter(el => el.matches && el.matches(selector));
        }
    }

    function placeCommentsMoreButton(body, btn) {
        if (!body || !btn) return;
        const addToggle = body.querySelector(":scope > .comment-add-toggle") || body.querySelector(".comment-add-toggle");
        const form = body.querySelector(":scope > .comment-form") || body.querySelector(".comment-form");
        if (addToggle) body.insertBefore(btn, addToggle);
        else if (form) body.insertBefore(btn, form);
        else body.appendChild(btn);
    }

    function placeRepliesMoreButton(block, btn) {
        if (!block || !btn) return;
        // строго внизу ответов
        block.appendChild(btn);
    }

    function ensureNewestFirstComments(body) {
        if (!body) return;
        if (body.dataset.orderInited === "1") return;

        // убираем кнопку, если она уже существует (на всякий случай)
        const oldBtn = body.querySelector(":scope > .comments-more-btn") || body.querySelector(".comments-more-btn");
        if (oldBtn) oldBtn.remove();

        // временно убираем элементы управления, чтобы они остались внизу
        const addToggle = body.querySelector(":scope > .comment-add-toggle") || body.querySelector(".comment-add-toggle");
        const form = body.querySelector(":scope > .comment-form") || body.querySelector(".comment-form");
        const keep = [];
        if (addToggle && addToggle.parentElement === body) keep.push(addToggle);
        if (form && form.parentElement === body) keep.push(form);
        keep.forEach(el => body.removeChild(el));

        // разворачиваем порядок: новые сверху
        const items = directChildren(body, ".comment-item");
        const frag = document.createDocumentFragment();
        for (let i = items.length - 1; i >= 0; i--) {
            frag.appendChild(items[i]);
        }
        body.appendChild(frag);

        // возвращаем управление
        keep.forEach(el => body.appendChild(el));

        body.dataset.orderInited = "1";
    }

    function ensureNewestFirstReplies(block) {
        if (!block) return;
        if (block.dataset.orderInited === "1") return;

        const oldBtn = block.querySelector(":scope > .replies-more-btn") || block.querySelector(".replies-more-btn");
        if (oldBtn) oldBtn.remove();

        const items = directChildren(block, ".comment-item");
        const frag = document.createDocumentFragment();
        for (let i = items.length - 1; i >= 0; i--) {
            frag.appendChild(items[i]);
        }
        block.appendChild(frag);

        block.dataset.orderInited = "1";
    }

    function updateCommentsMoreButton(body) {
        if (!body) return;
        const items = directChildren(body, ".comment-item");
        const btn = body.querySelector(":scope > .comments-more-btn") || body.querySelector(".comments-more-btn");
        if (!btn) return;

        const hiddenCount = items.filter(el => el.classList.contains("batch-hidden")).length;
        if (hiddenCount <= 0) {
            btn.remove();
        } else {
            btn.textContent = "Показать ещё (" + hiddenCount + ")";
            placeCommentsMoreButton(body, btn);
        }
    }

    function updateRepliesMoreButton(block) {
        if (!block) return;
        const items = directChildren(block, ".comment-item");
        const btn = block.querySelector(":scope > .replies-more-btn") || block.querySelector(".replies-more-btn");
        if (!btn) return;

        const hiddenCount = items.filter(el => el.classList.contains("batch-hidden")).length;
        if (hiddenCount <= 0) {
            btn.remove();
        } else {
            btn.textContent = "Показать ещё (" + hiddenCount + ")";
            placeRepliesMoreButton(block, btn);
        }
    }

    function initCommentsBatchingForBody(body) {
        if (!body) return;

        // порядок: новые сверху
        ensureNewestFirstComments(body);

        if (body.dataset.batchInited === "1") {
            updateCommentsMoreButton(body);
            return;
        }

        const items = directChildren(body, ".comment-item");
        if (items.length <= COMMENTS_BATCH_SIZE) {
            body.dataset.batchInited = "1";
            return;
        }

        // показываем первые N (самые новые), остальные прячем
        for (let i = 0; i < items.length; i++) {
            if (i >= COMMENTS_BATCH_SIZE) items[i].classList.add("batch-hidden");
        }

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "comments-more-btn";
        btn.textContent = "Показать ещё (" + (items.length - COMMENTS_BATCH_SIZE) + ")";

        placeCommentsMoreButton(body, btn);
        body.dataset.batchInited = "1";
    }

    function initRepliesBatchingForBlock(block) {
        if (!block) return;

        // порядок: новые сверху
        ensureNewestFirstReplies(block);

        if (block.dataset.batchInited === "1") {
            updateRepliesMoreButton(block);
            return;
        }

        const items = directChildren(block, ".comment-item");
        if (items.length <= REPLIES_BATCH_SIZE) {
            block.dataset.batchInited = "1";
            return;
        }

        for (let i = 0; i < items.length; i++) {
            if (i >= REPLIES_BATCH_SIZE) items[i].classList.add("batch-hidden");
        }

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "replies-more-btn";
        btn.textContent = "Показать ещё (" + (items.length - REPLIES_BATCH_SIZE) + ")";

        placeRepliesMoreButton(block, btn);
        block.dataset.batchInited = "1";
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

            // Учитываем будущие вложения (файлы + голосовое) и проверяем лимит
            const voiceWillBeAdded = Boolean(form._voiceBlob && !form._voiceBlobUsed);
            const totalFilesToSend = selectedFiles.length + (voiceWillBeAdded ? 1 : 0);
            if (totalFilesToSend > MAX_FILE_COUNT) {
                alert("Максимум файлов в одном посте: " + MAX_FILE_COUNT);
                return;
            }

            // обычные файлы из предпросмотра
            selectedFiles.forEach(f => fd.append("attachments", f));

            // голосовое сообщение, если записано (Blob из voice_recorder.js)
            if (form._voiceBlob && !form._voiceBlobUsed) {
                const blob = form._voiceBlob;
                const name = form._voiceFilename || "voice-message.webm";
                const type = form._voiceMime || blob.type || "audio/webm";

                const voiceFile = (blob instanceof File)
                    ? blob
                    : new File([blob], name, { type });

                fd.append("attachments", voiceFile);
                form._voiceBlobUsed = true; // чтобы не дублировать
            }

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
                        initSmartGalleries(newPostEl);

                        form.reset();
                        clearFilePreview();
                        if (dropZone) dropZone.classList.add("hidden");

                    } else {
                        // если пришёл не JSON (например, редирект на логин) — просто перезагружаем
                        window.location.reload();
                    }
                } else {
                    // постараемся показать серверную ошибку (например, лимит файлов/символов)
                    const ctErr = xhr.getResponseHeader("content-type") || "";
                    if (ctErr.indexOf("application/json") !== -1) {
                        try {
                            const d = JSON.parse(xhr.responseText);
                            if (d && (d.error || d.errors)) {
                                const errText = d.error || JSON.stringify(d.errors);
                                alert(errText);
                                return;
                            }
                        } catch (e) {}
                    }

                    let msg = "Ошибка при отправке поста";
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

                    // Новый комментарий — самый новый: добавляем В НАЧАЛО списка.
                    // Кнопка "Показать ещё" при этом остаётся внизу.
                    ensureNewestFirstComments(body);
                    const firstItem = body.querySelector(":scope > .comment-item") || body.querySelector(".comment-item");
                    const addBtn = body.querySelector(":scope > .comment-add-toggle") || body.querySelector(".comment-add-toggle");
                    if (firstItem) {
                        firstItem.insertAdjacentHTML("beforebegin", data.html);
                    } else if (addBtn) {
                        addBtn.insertAdjacentHTML("beforebegin", data.html);
                    } else {
                        body.insertAdjacentHTML("afterbegin", data.html);
                    }

                    // Инициализируем пошаговую свёртку для нового комментария
                    initPostTextCollapsing(body);

                    // Если батчинг уже включен — пересчитаем кнопку
                    if (body.dataset.batchInited === "1") {
                        updateCommentsMoreButton(body);
                    }

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
                    if (repliesBlock) {
                        // Новый ответ — самый новый: добавляем В НАЧАЛО ответов.
                        // Кнопка "Показать ещё" остаётся внизу.
                        ensureNewestFirstReplies(repliesBlock);
                        const firstReply = repliesBlock.querySelector(":scope > .comment-item") || repliesBlock.querySelector(".comment-item");
                        if (firstReply) {
                            firstReply.insertAdjacentHTML("beforebegin", data.html);
                        } else {
                            const moreBtn = repliesBlock.querySelector(":scope > .replies-more-btn") || repliesBlock.querySelector(".replies-more-btn");
                            if (moreBtn) moreBtn.insertAdjacentHTML("beforebegin", data.html);
                            else repliesBlock.insertAdjacentHTML("afterbegin", data.html);
                        }

                        // Инициализируем свёртку текста в новых ответах
                        initPostTextCollapsing(repliesBlock);

                        // Если батчинг уже включен — пересчитаем кнопку
                        if (repliesBlock.dataset.batchInited === "1") {
                            updateRepliesMoreButton(repliesBlock);
                        }
                    } else {
                        parentEl.insertAdjacentHTML("beforeend", data.html);
                        initPostTextCollapsing(parentEl);
                    }

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
                    const repliesContainer = el ? el.closest('.replies-block') : null;
                    if (el) el.remove();

                    // Пересчёт "Показать ещё" после удаления
                    const body = document.querySelector('.comments-body[data-post-id="' + postId + '"]');
                    if (body && body.dataset.batchInited === "1") updateCommentsMoreButton(body);
                    if (repliesContainer && repliesContainer.dataset.batchInited === "1") updateRepliesMoreButton(repliesContainer);

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
        

// ---------- РЕДАКТИРОВАНИЕ ПОСТА (AJAX) ----------
if (form.classList.contains("post-edit-form")) {
    e.preventDefault();

    const postCard = form.closest(".post-card");
    if (!postCard) return;

    // Лимит файлов: существующие (за вычетом помеченных на удаление) + новые <= MAX_FILE_COUNT
    const existingItems = form.querySelectorAll(".post-edit-attachment-item");
    let existingCount = existingItems.length;

    const toDelete = form.querySelectorAll(".post-edit-att-check:checked").length;
    const newCount = (form.querySelector(".post-edit-file-input")?.files?.length) || 0;

    const willRemain = Math.max(0, existingCount - toDelete) + newCount;
    if (willRemain > MAX_FILE_COUNT) {
        alert("Максимум файлов в одном посте: " + MAX_FILE_COUNT);
        return;
    }

    ajaxPost(form.action, form)
        .then(async (resp) => {
            const data = await resp.json().catch(() => ({}));
            if (!resp.ok || !data.success) {
                const msg = data.error || "Не удалось сохранить изменения.";
                alert(msg);
                return;
            }

            if (!data.html) return;

            // Заменяем карточку поста целиком на обновлённую
            const tmp = document.createElement("div");
            tmp.innerHTML = data.html.trim();
            const newEl = tmp.firstElementChild;
            if (!newEl) return;

            postCard.replaceWith(newEl);

            // Переинициализация поведения для нового DOM-узла
            initPostTextCollapsing(newEl);
            initSmartGalleries(newEl);
            initVideoPlayers(newEl);
            initAudioPlayers(newEl);
        })
        .catch((err) => {
            console.error("edit post error:", err);
            alert("Не удалось сохранить изменения.");
        });

    return;
}

// ---------- УДАЛЕНИЕ ПОСТА ----------
        if (form.classList.contains("post-delete-form")) {
            e.preventDefault();

            const postCard = form.closest(".post-card");

            ajaxPost(form.action, form)
                .then((response) => {
                    if (!response.ok) {
                        // Сервер вернул ошибку (403, 500 и т.п.)
                        if (response.status === 403) {
                            alert("Вы не можете удалить этот пост");
                        } else {
                            alert("Ошибка при удалении поста (HTTP " + response.status + ")");
                        }
                        return;
                    }

                    // Всё ок — удаляем карточку из DOM
                    if (postCard) postCard.remove();
                })
                .catch(err => {
                    console.error("delete post error:", err);
                    alert("Ошибка сети при удалении поста");
                });

            return;
        }

    });

    // ==========================
    // ОБРАБОТЧИК ВСЕХ КЛИКОВ
    // ==========================
    document.addEventListener("click", function (e) {

// ----- ОТКРЫТЬ/ЗАКРЫТЬ РЕДАКТИРОВАНИЕ ПОСТА -----
const editToggle = e.target.closest(".post-edit-toggle");
if (editToggle) {
    const postId = editToggle.dataset.postId;
    const postCard = document.getElementById("post-" + postId);
    if (!postCard) return;

    const viewBlock = postCard.querySelector(".post-view-block");
    const editBlock = postCard.querySelector(".post-edit-block");
    if (!editBlock) return;

    // закрываем меню, если открыто
    const menu = postCard.querySelector(".post-menu");
    if (menu) menu.classList.add("hidden");

    if (viewBlock) viewBlock.classList.toggle("hidden");
    editBlock.classList.toggle("hidden");

    // инициализируем счётчик символов для textarea редактирования
    const ta = editBlock.querySelector(".post-edit-textarea");
    const counter = editBlock.querySelector(".post-edit-counter");
    if (ta && counter) {
        bindTextCounter(ta, counter, MAX_POST_CHARS);
        // фикс: при первом открытии показываем актуальную длину
        const len = (ta.value || "").length;
        counter.textContent = `${len} / ${MAX_POST_CHARS}`;
    }

    return;
}

// ----- ОТМЕНА РЕДАКТИРОВАНИЯ -----
const editCancel = e.target.closest(".post-edit-cancel");
if (editCancel) {
    const postCard = editCancel.closest(".post-card");
    if (!postCard) return;

    const viewBlock = postCard.querySelector(".post-view-block");
    const editBlock = postCard.querySelector(".post-edit-block");
    if (viewBlock) viewBlock.classList.remove("hidden");
    if (editBlock) editBlock.classList.add("hidden");

    // откат текста
    const ta = postCard.querySelector(".post-edit-textarea");
    if (ta) {
        const orig = ta.getAttribute("data-original") || "";
        ta.value = orig;
    }

    // снять отметки удаления
    postCard.querySelectorAll(".post-edit-att-check").forEach(ch => { ch.checked = false; });
    postCard.querySelectorAll(".post-edit-attachment-item").forEach(it => { it.classList.remove("is-removed"); });

    // очистить новые файлы
    const inp = postCard.querySelector(".post-edit-file-input");
    if (inp) inp.value = "";
    const box = postCard.querySelector(".post-edit-new-files");
    if (box) box.textContent = "";

    return;
}

// ----- УБРАТЬ/ВЕРНУТЬ СУЩЕСТВУЮЩЕЕ ВЛОЖЕНИЕ -----
const attToggle = e.target.closest(".post-edit-att-toggle");
if (attToggle) {
    const item = attToggle.closest(".post-edit-attachment-item");
    if (!item) return;

    const check = item.querySelector(".post-edit-att-check");
    if (!check) return;

    check.checked = !check.checked;
    item.classList.toggle("is-removed", check.checked);
    attToggle.textContent = check.checked ? "↩" : "✕";
    return;
}


        // ----- РАЗВОРОТ/СВОРАЧИВАНИЕ ДЛИННОГО ПОСТА (ТЕКСТ + МЕДИА) -----
        const textToggle = e.target.closest(".post-text-toggle");
        if (textToggle) {
            const block   = textToggle.closest(".post-text-block");
            if (!block) return;

            const wrapper = block.querySelector(".post-text-wrapper");
            if (!wrapper) return;

            const cfg = getTextCollapseConfig(block);
            const fullHeight = wrapper.scrollHeight;
            const isExpanded = (!wrapper.classList.contains("is-collapsed")) || (textToggle.dataset.state === "expanded");

            if (isExpanded) {
                // Свернуть обратно в стартовое состояние
                wrapper.style.maxHeight = cfg.initial + "px";
                wrapper.classList.add("is-collapsed");
                textToggle.textContent = "Показать ещё";
                textToggle.dataset.state = "collapsed";
                return;
            }

            // Пошаговое раскрытие
            let current = parseInt(wrapper.style.maxHeight || "0", 10);
            if (!current || current < cfg.initial) current = cfg.initial;

            const next = current + cfg.step;
            if (next >= fullHeight - 5) {
                wrapper.style.maxHeight = fullHeight + "px";
                wrapper.classList.remove("is-collapsed");
                textToggle.textContent = "Свернуть";
                textToggle.dataset.state = "expanded";
            } else {
                wrapper.style.maxHeight = next + "px";
                wrapper.classList.add("is-collapsed");
                textToggle.textContent = "Показать ещё";
                textToggle.dataset.state = "partial";
            }
            return;
        }

        // ----- "ПОКАЗАТЬ ЕЩЁ" ДЛЯ КОММЕНТАРИЕВ (кнопка внизу) -----
        const commentsMoreBtn = e.target.closest(".comments-more-btn");
        if (commentsMoreBtn) {
            const body = commentsMoreBtn.closest(".comments-body");
            if (!body) return;

            const items = directChildren(body, ".comment-item");
            const hidden = items.filter(el => el.classList.contains("batch-hidden"));
            const toShow = hidden.slice(0, COMMENTS_BATCH_SIZE);
            toShow.forEach(el => el.classList.remove("batch-hidden"));
            updateCommentsMoreButton(body);
            return;
        }

        // ----- "ПОКАЗАТЬ ЕЩЁ" ДЛЯ ОТВЕТОВ (кнопка внизу) -----
        const repliesMoreBtn = e.target.closest(".replies-more-btn");
        if (repliesMoreBtn) {
            const block = repliesMoreBtn.closest(".replies-block");
            if (!block) return;

            const items = directChildren(block, ".comment-item");
            const hidden = items.filter(el => el.classList.contains("batch-hidden"));
            const toShow = hidden.slice(0, REPLIES_BATCH_SIZE);
            toShow.forEach(el => el.classList.remove("batch-hidden"));
            updateRepliesMoreButton(block);
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

                    // Инициализируем свёртку текста и батчинг ТОЛЬКО после открытия комментариев
                    initPostTextCollapsing(body);
                    initCommentsBatchingForBody(body);
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
                const isHidden = block.classList.contains("hidden");
                if (!isHidden) {
                    // Инициализируем свёртку текста + батчинг только после открытия ответов
                    initPostTextCollapsing(block);
                    initRepliesBatchingForBlock(block);
                }
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

        // ----- ПОДПИСКА (.follow-btn) -----
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

    // ================================
    // Бесконечная подгрузка постов
    // ================================
    (function initInfiniteScroll() {
        const container = document.getElementById("posts-list");
        if (!container) return;

        let isLoading = false;
        let hasNext = container.dataset.hasNext === "1";
        let nextPage = parseInt(container.dataset.nextPage || "0", 10) || 0;

        const loader = document.getElementById("feed-loading");

        async function loadMore() {
            if (isLoading || !hasNext || !nextPage) return;

            isLoading = true;
            if (loader) loader.style.display = "block";

            try {
                const url = new URL(window.location.href);
                url.searchParams.set("page", String(nextPage));

                const response = await fetch(url.toString(), {
                    headers: {
                        "X-Requested-With": "XMLHttpRequest",
                    },
                });

                if (!response.ok) {
                    return;
                }

                const data = await response.json();
                if (!data || !data.success || !data.html) {
                    return;
                }

                // Добавляем новые посты в конец списка
                container.insertAdjacentHTML("beforeend", data.html);

                // Инициализируем функционал для новых постов
                initPostTextCollapsing(container);
                initVideoPlayers(container);
                initAudioPlayers(container);
                initSmartGalleries(container);

                hasNext = !!data.has_next;
                if (hasNext && data.next_page) {
                    nextPage = data.next_page;
                    container.dataset.nextPage = String(nextPage);
                    container.dataset.hasNext = "1";
                } else {
                    container.dataset.hasNext = "0";
                }
            } catch (e) {
                console.error("Ошибка подгрузки постов:", e);
            } finally {
                isLoading = false;
                if (loader) loader.style.display = "none";
            }
        }

        function onScroll() {
            if (!hasNext || isLoading) return;

            const scrollPosition = window.innerHeight + window.scrollY;
            const threshold = document.body.offsetHeight - 300;

            if (scrollPosition >= threshold) {
                loadMore();
            }
        }

        window.addEventListener("scroll", onScroll);

        // На случай очень коротких страниц
        onScroll();
    })();

    // --------------------------------------------
    // Инициализируем медиа и свёртку текста
    // --------------------------------------------
    initPostTextCollapsing(document);
    initVideoPlayers(document);
    initAudioPlayers(document);
    initSmartGalleries(document);

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
