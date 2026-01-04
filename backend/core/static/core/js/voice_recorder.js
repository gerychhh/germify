// static/core/js/voice_recorder.js

document.addEventListener("DOMContentLoaded", function () {
    console.log("[voice_recorder] DOMContentLoaded");

    const form = document.querySelector(".new-post-form");
    const recordBtn = document.getElementById("voice-record-btn");
    const recordText = recordBtn ? recordBtn.querySelector(".voice-record-btn__text") : null;
    const statusEl = document.getElementById("voice-record-status");
    const audioPreview = document.getElementById("voice-preview");

    if (!form || !recordBtn || !audioPreview) {
        console.warn("[voice_recorder] Не найдено form/btn/audio в DOM");
        return;
    }

    // Проверяем поддержку MediaRecorder
    if (typeof MediaRecorder === "undefined") {
        console.warn("[voice_recorder] MediaRecorder не поддерживается");
        if (statusEl) {
            statusEl.textContent = "Запись голосовых не поддерживается в этом браузере";
        }
        recordBtn.disabled = true;
        return;
    }

    let mediaRecorder = null;
    let chunks = [];
    let recordedBlob = null;
    let stream = null;
    let isRecording = false;

    const setRecordLabel = (text) => {
        if (recordText) {
            recordText.textContent = text;
        } else if (recordBtn) {
            recordBtn.textContent = text;
        }
    };

    function pickMimeType() {
        const candidates = [
            "audio/webm;codecs=opus",
            "audio/webm",
            "audio/ogg;codecs=opus",
            "audio/ogg"
        ];
        for (const t of candidates) {
            if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) {
                return t;
            }
        }
        return "";
    }

    async function startRecording() {
        console.log("[voice_recorder] startRecording");

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            if (statusEl) statusEl.textContent = "Браузер не даёт доступ к микрофону";
            console.warn("[voice_recorder] mediaDevices/getUserMedia недоступны");
            return;
        }

        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (err) {
            console.error("[voice_recorder] Ошибка доступа к микрофону", err);
            if (statusEl) {
                if (location.protocol !== "https:" && location.hostname !== "localhost") {
                    statusEl.textContent = "Для записи нужен HTTPS или localhost";
                } else {
                    statusEl.textContent = "Нет доступа к микрофону";
                }
            }
            return;
        }

        chunks = [];
        const mimeType = pickMimeType();
        console.log("[voice_recorder] mimeType =", mimeType || "(по умолчанию)");

        try {
            mediaRecorder = mimeType
                ? new MediaRecorder(stream, { mimeType })
                : new MediaRecorder(stream);
        } catch (err) {
            console.error("[voice_recorder] Не удалось создать MediaRecorder", err);
            if (statusEl) statusEl.textContent = "Запись голосовых не поддерживается этим браузером";
            stream.getTracks().forEach((t) => t.stop());
            stream = null;
            return;
        }

        mediaRecorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) {
                chunks.push(e.data);
            }
        };

        mediaRecorder.onstop = () => {
            console.log("[voice_recorder] onstop, chunks:", chunks.length);

            if (!chunks.length) {
                if (statusEl) statusEl.textContent = "Ничего не записано";
                return;
            }

            const blobType = mediaRecorder.mimeType || mimeType || "audio/webm";
            recordedBlob = new Blob(chunks, { type: blobType });

            // Сохраняем blob в форме, чтобы posts.js добавил его в FormData
            form._voiceBlob = recordedBlob;
            form._voiceMime = blobType;
            form._voiceFilename = `voice-message.${blobType.includes("ogg") ? "ogg" : "webm"}`;
            form._voiceBlobUsed = false; // пометка, что ещё не добавляли в FormData

            audioPreview.src = URL.createObjectURL(recordedBlob);
            audioPreview.classList.remove("hidden");

            if (statusEl) statusEl.textContent = "Голосовое записано";

            if (stream) {
                stream.getTracks().forEach((t) => t.stop());
                stream = null;
            }
        };

        mediaRecorder.start();
        isRecording = true;
        recordBtn.classList.add("voice-record-btn--active");
        setRecordLabel("Стоп");
        if (statusEl) statusEl.textContent = "Запись…";
    }

    function stopRecording() {
        console.log("[voice_recorder] stopRecording");

        if (mediaRecorder && isRecording) {
            mediaRecorder.stop();
            isRecording = false;
            recordBtn.classList.remove("voice-record-btn--active");
            setRecordLabel("Голос");
        }
    }

    recordBtn.addEventListener("click", function () {
        console.log("[voice_recorder] click, isRecording=", isRecording);
        if (!isRecording) {
            startRecording();
        } else {
            stopRecording();
        }
    });

    // Если вдруг отправляют форму во время записи — стопаем
    form.addEventListener("submit", function (e) {
        if (isRecording) {
            e.preventDefault();
            if (statusEl) statusEl.textContent = "Сначала остановите запись, потом отправляйте пост";
        }
    });

    // Сброс формы после успешной отправки (form.reset() в posts.js)
    form.addEventListener("reset", function () {
        console.log("[voice_recorder] form reset, cleanup voice");

        recordedBlob = null;
        delete form._voiceBlob;
        delete form._voiceMime;
        delete form._voiceFilename;
        delete form._voiceBlobUsed;

        audioPreview.src = "";
        audioPreview.classList.add("hidden");
        if (statusEl) statusEl.textContent = "";

        isRecording = false;
        recordBtn.classList.remove("voice-record-btn--active");
        setRecordLabel("Голос");

        if (stream) {
            stream.getTracks().forEach((t) => t.stop());
            stream = null;
        }
    });
});
