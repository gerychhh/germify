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
// MINI TOAST (copy link etc.)
// ========================
function showMiniToast(anchorEl, text) {
    if (!anchorEl) return;
    const el = document.createElement('div');
    el.className = 'mini-toast';
    el.textContent = text;
    document.body.appendChild(el);

    const r = anchorEl.getBoundingClientRect();
    el.style.left = Math.round(r.left + r.width / 2) + 'px';
    el.style.top = Math.round(r.top) + 'px';

    requestAnimationFrame(() => el.classList.add('mini-toast--show'));

    window.setTimeout(() => {
        el.classList.remove('mini-toast--show');
        window.setTimeout(() => el.remove(), 180);
    }, 1200);
}


// ===================== VK-style modal (post left, comments right) =====================
const __vkModalState = {
    openPostId: null,
    // мы НЕ копируем комментарии, а переносим их в модалку, чтобы не было дублей data-post-id
    movedWrapEl: null,
    movedBodyEl: null,
    movedFormEl: null,
    placeholderEl: null,

    autoRevealScrollEl: null,
    autoRevealHandler: null,
};

function getVkPostModal() {
    return document.getElementById('vk-post-modal');
}

function _vkDetachAutoReveal() {
    if (__vkModalState.autoRevealScrollEl && __vkModalState.autoRevealHandler) {
        __vkModalState.autoRevealScrollEl.removeEventListener('scroll', __vkModalState.autoRevealHandler);
    }
    __vkModalState.autoRevealScrollEl = null;
    __vkModalState.autoRevealHandler = null;
}

function _vkAutoGrowTextarea(textarea, maxPx = 140) {
    if (!textarea) return;
    const basePx = 44;
    const resize = () => {
        textarea.style.height = 'auto';
        const next = Math.min(textarea.scrollHeight, maxPx);
        textarea.style.height = next + 'px';
        textarea.classList.toggle('is-expanded', next > basePx + 2);
    };
    resize();
    textarea.addEventListener('input', resize);
}

function _vkAttachAutoReveal(scrollEl) {
    if (!scrollEl) return;

    let ticking = false;
    const handler = () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
            ticking = false;
            // близко к низу — автоматически раскрываем следующий батч
            if (scrollEl.scrollTop + scrollEl.clientHeight < scrollEl.scrollHeight - 180) return;
            const btn = scrollEl.querySelector('.comments-more-btn');
            if (btn) {
                btn.click();
                // если кнопка скрыта (мы её прячем CSS), то при малом числе комментов
                // пользователь не может создать скролл вручную. Дожимаем батчи программно,
                // пока контейнер не станет скроллимым или пока кнопка не исчезнет.
                _vkFillCommentsUntilScrollable(scrollEl);
            }
        });
    };

    scrollEl.addEventListener('scroll', handler);
    __vkModalState.autoRevealScrollEl = scrollEl;
    __vkModalState.autoRevealHandler = handler;

    // один раз сразу — если комментариев мало, ничего не случится
    handler();
}

// Если комментов мало и из-за батчинга показывается только 3 шт.,
// правый блок не становится скроллимым, и автоподгрузка по scroll не срабатывает.
// Поэтому при открытии модалки «дожимаем» кнопку Show more, пока:
//  - scrollHeight > clientHeight (появился скролл)
//  - или кнопка пропала (всё раскрыли)
function _vkFillCommentsUntilScrollable(scrollEl, maxSteps = 24) {
    if (!scrollEl) return;

    // уже есть скролл — ничего делать не надо
    if (scrollEl.scrollHeight > scrollEl.clientHeight + 20) return;

    let steps = 0;
    const step = () => {
        steps++;
        if (steps > maxSteps) return;

        // Если скролл уже появился — стоп.
        if (scrollEl.scrollHeight > scrollEl.clientHeight + 20) return;

        const btn = scrollEl.querySelector('.comments-more-btn');
        if (!btn) return;

        btn.click();

        // DOM обновится синхронно, но на всякий случай — следующий тик.
        requestAnimationFrame(step);
    };

    requestAnimationFrame(step);
}

// После удаления комментария список может стать «короче», но scroll-событие не произойдёт,
// из-за чего автоподгрузка (раскрытие батчей) не сработает. Добиваем контент вручную.
function _vkRevealMoreIfNearBottom(scrollEl, maxSteps = 8) {
    if (!scrollEl) return;
    let steps = 0;
    const step = () => {
        steps++;
        if (steps > maxSteps) return;
        const btn = scrollEl.querySelector('.comments-more-btn');
        if (!btn) return;

        const dist = scrollEl.scrollHeight - (scrollEl.scrollTop + scrollEl.clientHeight);
        // если до низа далеко — значит пользователь не у конца списка, не трогаем
        if (dist > 260) return;

        btn.click();
        requestAnimationFrame(step);
    };

    requestAnimationFrame(step);
}

function _vkRefillCommentsAfterMutation(postId) {
    const modal = getVkPostModal();
    if (!modal || modal.classList.contains('hidden')) return;
    if (String(__vkModalState.openPostId || '') !== String(postId || '')) return;

    const scrollEl = modal.querySelector('.vk-modal-scroll');
    if (!scrollEl) return;

    // если пользователь у низа — попробуем раскрыть следующий батч
    _vkRevealMoreIfNearBottom(scrollEl);

    // если скролла нет (или его стало мало) — дожимаем до появления скролла
    _vkFillCommentsUntilScrollable(scrollEl);

    // ещё один тик — на случай перерасчёта высот
    requestAnimationFrame(() => _vkFillCommentsUntilScrollable(scrollEl));
}



// ===== VK modal: reply banner (single composer) =====
function _vkEnsureReplyBanner(form) {
    if (!form) return null;

    if (!form.dataset.defaultAction) {
        form.dataset.defaultAction = form.getAttribute('action') || '';
    }

    const ta = form.querySelector('textarea');
    if (ta && !form.dataset.defaultPlaceholder) {
        form.dataset.defaultPlaceholder = ta.getAttribute('placeholder') || '';
    }

    let banner = form.querySelector('.vk-reply-banner');
    if (banner) return banner;

    banner = document.createElement('div');
    banner.className = 'vk-reply-banner hidden';
    banner.innerHTML = `
        <div class="vk-reply-banner__text"></div>
        <button type="button" class="vk-reply-banner__close" aria-label="Отменить ответ">×</button>
    `;

    // ВАЖНО: баннер должен быть НАД полем ввода (и над кнопкой отправки).
    // Если есть обёртка строки ввода (.vk-compose-row) — вставляем перед ней.
    // Иначе вставляем перед textarea / в начало формы.
    const beforeEl = form.querySelector('.vk-compose-row') || form.querySelector('textarea') || form.firstElementChild;
    form.insertBefore(banner, beforeEl);

    banner.querySelector('.vk-reply-banner__close')?.addEventListener('click', () => {
        _vkClearReplyTarget(form);
    });

    return banner;
}

function _vkClearReplyTarget(form) {
    if (!form) return;

    const def = form.dataset.defaultAction;
    if (def) form.setAttribute('action', def);

    delete form.dataset.replyTo;

    const ta = form.querySelector('textarea');
    if (ta && form.dataset.defaultPlaceholder) {
        ta.setAttribute('placeholder', form.dataset.defaultPlaceholder);
    }

    const banner = form.querySelector('.vk-reply-banner');
    if (banner) banner.classList.add('hidden');
}

function _vkSetReplyTargetFromToggle(toggleEl) {
    const modal = getVkPostModal();
    if (!modal) return;

    const form = modal.querySelector('.vk-modal-composer .comment-form');
    if (!form) return;

    const item = toggleEl.closest('.comment-item');
    if (!item) return;

    const commentId = item.dataset.commentId;

    // URL для ответа (заранее проставляем на элемент, или берём из скрытой формы)
    let replyUrl = item.dataset.replyUrl;
    if (!replyUrl) {
        const rf = item.querySelector('form.reply-form');
        if (rf && rf.action) replyUrl = rf.action;
    }
    if (!replyUrl) return;

    const banner = _vkEnsureReplyBanner(form);

    const unameEl = item.querySelector('.comment-username');
    const uname = unameEl ? unameEl.textContent.replace('@', '').trim() : '';

    const snippetEl = item.querySelector('.comment-text');
    const snippet = snippetEl ? (snippetEl.textContent || '').trim().slice(0, 80) : '';

    form.dataset.replyTo = String(commentId || '');
    form.setAttribute('action', replyUrl);

    const ta = form.querySelector('textarea');
    if (ta) {
        ta.setAttribute('placeholder', uname ? ('Ответить @' + uname + '…') : 'Ответить…');
        ta.focus();
    }

    if (banner) {
        const txt = banner.querySelector('.vk-reply-banner__text');
        if (txt) {
            txt.textContent = uname
                ? `Ответ на @${uname}${snippet ? ': ' + '“' + snippet + '”' : ''}`
                : `Ответ${snippet ? ': ' + '“' + snippet + '”' : ''}`;
        }
        banner.classList.remove('hidden');
    }
}

// ===== VK modal: flat comments (no nested cards), keep reply URL on each comment =====
function _vkStripCommentDepthClasses(el) {
    if (!el) return;
    el.classList.remove('reply-item');
    el.className = el.className.replace(/\bcomment-depth-\d+\b/g, '').replace(/\s{2,}/g, ' ').trim();
}

function _vkPrepareFlatCommentItem(item) {
    if (!item) return;
    if (item.dataset && item.dataset.vkPrepared === '1') return;

    // сохранить URL ответа
    const rf = item.querySelector(':scope > form.reply-form');
    if (rf && rf.action) item.dataset.replyUrl = rf.action;
    rf?.remove();

    // убрать кнопку "Ответы" и вложенный блок
    item.querySelectorAll('.replies-toggle').forEach(btn => btn.remove());
    const rb = item.querySelector(':scope > .replies-block');
    if (rb) rb.remove();

    _vkStripCommentDepthClasses(item);

    if (item.dataset) item.dataset.vkPrepared = '1';
}

function _vkFlattenCommentsBody(body) {
    if (!body) return;
    if (body.dataset.vkFlat === '1') return;

    const top = Array.from(body.children).filter(el => el.classList && el.classList.contains('comment-item'));
    const flat = [];

    const collect = (item) => {
        if (!item || !(item.classList && item.classList.contains('comment-item'))) return;

        // сначала вытащим детей-ответы (если есть)
        const rb = item.querySelector(':scope > .replies-block');
        let children = [];
        if (rb) {
            rb.classList.remove('hidden');
            children = Array.from(rb.children).filter(el => el.classList && el.classList.contains('comment-item'));
            rb.remove();
        }

        // подготовим элемент как плоский
        _vkPrepareFlatCommentItem(item);

        flat.push(item);
        children.forEach(collect);
    };

    top.forEach(collect);

    body.innerHTML = '';
    for (const el of flat) body.appendChild(el);

    body.dataset.vkFlat = '1';

    try {
        delete body.dataset.orderInited;
        delete body.dataset.batchInited;
    } catch (e) {}
}

function closeVkPostModal() {
    const modal = getVkPostModal();
    if (!modal) return;

    _vkDetachAutoReveal();

    const left = modal.querySelector('.vk-modal-left');
    const commentsList = modal.querySelector('.vk-modal-comments-list');
    const composer = modal.querySelector('.vk-modal-composer');
    const scrollHost = modal.querySelector('.vk-modal-scroll');
    

    // вернуть комментарии назад в пост
    if (__vkModalState.movedWrapEl && __vkModalState.placeholderEl) {
        const wrap = __vkModalState.movedWrapEl;
        const body = __vkModalState.movedBodyEl;
        const form = __vkModalState.movedFormEl;

        // собрать обратно структуру как в шаблоне: form -> body
        if (form && !wrap.contains(form)) wrap.appendChild(form);
        if (body && !wrap.contains(body)) wrap.appendChild(body);

        wrap.classList.add('hidden');
        if (form) form.classList.add('hidden');

        __vkModalState.placeholderEl.replaceWith(wrap);
    }

    if (left) left.innerHTML = '';
    if (commentsList) commentsList.innerHTML = '';
    if (composer) composer.innerHTML = '';

    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    document.documentElement.classList.remove('vk-modal-open');
    document.body.classList.remove('vk-modal-open');

    // Вернуть overflow для html/body (если меняли при открытии)
    if (typeof __vkModalState._prevHtmlOverflow === 'string') {
        document.documentElement.style.overflow = __vkModalState._prevHtmlOverflow;
    } else {
        document.documentElement.style.overflow = '';
    }
    if (typeof __vkModalState._prevBodyOverflow === 'string') {
        document.body.style.overflow = __vkModalState._prevBodyOverflow;
    } else {
        document.body.style.overflow = '';
    }

    // Вернуть прокрутку страницы
    const y = __vkModalState._lockY || 0;
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.left = '';
    document.body.style.right = '';
    document.body.style.width = '';
    window.scrollTo(0, y);
    __vkModalState._lockY = 0;

    __vkModalState._prevHtmlOverflow = null;
    __vkModalState._prevBodyOverflow = null;

    __vkModalState.openPostId = null;
    __vkModalState.movedWrapEl = null;
    __vkModalState.movedBodyEl = null;
    __vkModalState.movedFormEl = null;
    __vkModalState.placeholderEl = null;
}

function openVkPostModal(postId, focusForm = false) {
    const modal = getVkPostModal();
    if (!modal) return;

    // если уже открыто — закроем, потом откроем заново
    if (__vkModalState.openPostId && __vkModalState.openPostId !== postId) {
        closeVkPostModal();
    }

    const postEl = document.getElementById('post-' + postId);
    if (!postEl) return;

    // сохраняем позицию ленты ДО любых изменений DOM / focus (иначе некоторые браузеры
    // могут временно обнулять scrollY и "откидывать" к началу ленты)
    const currentY = window.scrollY || window.pageYOffset || 0;

    const left = modal.querySelector('.vk-modal-left');
    const commentsList = modal.querySelector('.vk-modal-comments-list');
    const composer = modal.querySelector('.vk-modal-composer');
    const scrollHost = modal.querySelector('.vk-modal-scroll');
    
    if (!left || !commentsList || !composer || !scrollHost) return;

    left.innerHTML = '';
    commentsList.innerHTML = '';
    composer.innerHTML = '';

    // Клонируем пост в левую колонку
    const postClone = postEl.cloneNode(true);
    postClone.removeAttribute('id');
    postClone.classList.add('vk-modal-post');
    postClone.style.maxWidth = 'none';
    postClone.style.width = '100%';

    // в модалке нам не нужна кнопка “комментарии” в баре поста
    postClone.querySelectorAll('.post-action-comment').forEach(el => el.remove());

    // в клоне не нужны “скрытые источники комментариев” и блоки редактирования
    postClone.querySelectorAll('.post-comments-source, .post-edit-block').forEach(el => el.remove());

    // В модалке вместо меню показываем кнопку закрытия
    const menuWrapper = postClone.querySelector('.post-menu-wrapper');
    if (menuWrapper) {
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'btn btn-sm btn-outline-secondary post-modal-close';
        closeBtn.setAttribute('aria-label', 'Закрыть');
        closeBtn.setAttribute('data-vk-modal-close', '');
        closeBtn.innerHTML = '&times;';
        menuWrapper.replaceWith(closeBtn);
    }
    left.appendChild(postClone);

    // Переносим (НЕ копируем) комментарии в правую часть
    const commentsSource = postEl.querySelector('.post-comments-source');
    if (commentsSource) {
        const ph = document.createElement('div');
        ph.className = 'post-comments-placeholder';
        ph.dataset.postId = String(postId);
        commentsSource.replaceWith(ph);

        commentsSource.classList.remove('hidden');

        const body = commentsSource.querySelector('.comments-body');
        const form = commentsSource.querySelector('.comment-form');

        // тело комментариев — в скролл-зону
        if (body) {
            commentsList.appendChild(body);

            // делаем комментарии плоскими (без вложенных карточек)
            _vkFlattenCommentsBody(body);

            // безопасно: функции могут быть экспортированы из DOMContentLoaded
            if (typeof window.initPostTextCollapsing === 'function') window.initPostTextCollapsing(body);
            if (typeof window.initCommentsBatchingForBody === 'function') window.initCommentsBatchingForBody(body);
        }

        // форма — в нижний композер (не скроллится)
        if (form) {
            form.classList.remove('hidden');
            form.classList.remove('mt-2');
            composer.appendChild(form);
            _vkAutoGrowTextarea(form.querySelector('textarea'));
        } else {
            composer.innerHTML = '<div class="small text-muted">Войдите, чтобы комментировать.</div>';
        }

        _vkAttachAutoReveal(scrollHost);
        // если батчинг показал слишком мало элементов и скролл не появился —
        // добиваем батчи сразу при открытии
        _vkFillCommentsUntilScrollable(scrollHost);

        __vkModalState.movedWrapEl = commentsSource;
        __vkModalState.movedBodyEl = body;
        __vkModalState.movedFormEl = form;
        __vkModalState.placeholderEl = ph;
    }

    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.documentElement.classList.add('vk-modal-open');
    document.body.classList.add('vk-modal-open');

    // Надёжно блокируем скролл фона: ставим overflow:hidden на html/body.
    // (На некоторых браузерах position:fixed на body не всегда полностью блокирует wheel.)
    if (__vkModalState._prevHtmlOverflow == null) {
        __vkModalState._prevHtmlOverflow = document.documentElement.style.overflow || '';
    }
    if (__vkModalState._prevBodyOverflow == null) {
        __vkModalState._prevBodyOverflow = document.body.style.overflow || '';
    }
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';

    // Надёжная блокировка скролла фона (особенно iOS): фиксируем body на текущем scrollY
    __vkModalState._lockY = currentY;
    document.body.style.position = 'fixed';
    document.body.style.top = '-' + __vkModalState._lockY + 'px';
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';

    __vkModalState.openPostId = postId;

    if (focusForm) {
        const ta = modal.querySelector('.vk-modal-composer textarea');
        if (ta) {
            try { ta.focus({ preventScroll: true }); } catch (e) { ta.focus(); }
        }
    }
}

// Глобальные обработчики закрытия модалки
document.addEventListener('click', function (e) {
    const closeBtn = e.target.closest('[data-vk-modal-close]');
    if (closeBtn) {
        closeVkPostModal();
    }
});

document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
        const modal = getVkPostModal();
        if (modal && !modal.classList.contains('hidden')) {
            closeVkPostModal();
        }
    }
});

// UX: when user starts typing a comment in the modal, nudge the modal scroll a bit down
// (helps keep the input comfortably visible, especially on mobile keyboards)
document.addEventListener('focusin', function (e) {
    const modal = getVkPostModal();
    if (!modal || modal.classList.contains('hidden')) return;

    const target = e.target;
    if (!(target instanceof HTMLElement)) return;

    // Only for the main comment textarea in the modal composer
    const inComposer = target.closest?.('.vk-modal-composer');
    if (!inComposer) return;
    if (target.tagName !== 'TEXTAREA') return;

    const scrollHost = modal.querySelector('.vk-modal-scroll');
    if (!scrollHost) return;
    // small smooth scroll
    scrollHost.scrollBy({ top: 90, left: 0, behavior: 'smooth' });
});

// ========================
// SMART IMAGE GALLERIES (1–10)
// ========================
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
        const mediaItems = Array.from(gallery.querySelectorAll(".gallery-media"));
        if (!mediaItems.length) {
            gallery.dataset.count = "0";
            gallery.dataset.layout = "one";
            gallery.dataset.firstShape = "land";
            return;
        }

        // Ограничение отображения
        const maxVisible = 6;

        mediaItems.forEach((media, idx) => {
            const item = media.closest(".gallery-item");
            if (!item) return;
            if (idx >= maxVisible) item.classList.add("gallery-hidden");
            else item.classList.remove("gallery-hidden");
        });

        // бейдж +N
        gallery.querySelectorAll(".gallery-more-badge").forEach((n) => n.remove());
        if (mediaItems.length > maxVisible) {
            const lastVisibleMedia = mediaItems[maxVisible - 1];
            const lastItem = lastVisibleMedia?.closest(".gallery-item");
            if (lastItem) {
                const badge = document.createElement("div");
                badge.className = "gallery-more-badge";
                badge.textContent = "+" + (mediaItems.length - maxVisible);

                // ✅ кликабельный бейдж: открывает просмотрщик как клик по фото
                badge.addEventListener("click", (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const imageItems = Array.from(
                        gallery.querySelectorAll(".gallery-media[data-media='image']")
                    );
                    const fallbackTarget = imageItems[0] || lastVisibleMedia;
                    if (fallbackTarget) fallbackTarget.click();
                });

                lastItem.appendChild(badge);
            }
        }

        const visibleCount = Math.min(mediaItems.length, maxVisible);
        gallery.dataset.count = String(visibleCount);

        const applyLayout = () => {
            const shapes = mediaItems.slice(0, visibleCount).map(_mediaShape);
            const firstShape = shapes[0] || "land";

            gallery.dataset.firstShape = firstShape; // ✅ нужно для CSS (портрет по центру)
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
// ========================
// Markdown code blocks: wrap + Copy (stable button)
// ========================
function initMarkdownCodeBlocks(root = document) {
  const scope = root || document;

  // собираем “контейнеры кода” (чтобы не оборачивать внутрянку 10 раз)
  const candidates = scope.querySelectorAll(
    ".post-text pre, .post-text .highlighttable, .post-text .codehilite, .post-text .highlight"
  );

  const blocks = new Set();

  candidates.forEach((el) => {
    let block = el;

    const ht = el.closest?.(".highlighttable");
    if (ht) block = ht;
    else if (el.classList?.contains("highlighttable")) block = el;
    else {
      const outer = el.closest?.(".codehilite, .highlight");
      if (outer) block = outer;
    }

    if (block) blocks.add(block);
  });

  function extractCodeText(block) {
    // 1) Pygments table: берём ТОЛЬКО код без номеров строк
    const pyg = block.querySelector?.("td.code pre");
    if (pyg) return (pyg.innerText || "").replace(/\n$/, "");

    // 2) обычный pre > code
    const code = block.querySelector?.("pre code");
    if (code) return (code.innerText || "").replace(/\n$/, "");

    // 3) fallback
    const pre = block.matches?.("pre") ? block : block.querySelector?.("pre");
    if (pre) return (pre.innerText || "").replace(/\n$/, "");

    return (block.innerText || "").replace(/\n$/, "");
  }

  blocks.forEach((block) => {
    if (!block) return;
    if (block.closest(".md-code")) return; // уже обёрнуто

    // если у тебя уже были старые кнопки Copy — уберём, чтобы не плодились
    block.querySelectorAll?.(".code-copy-btn, .copy-code-btn, .md-code__copy").forEach((b) => b.remove());

    const wrapper = document.createElement("div");
    wrapper.className = "md-code";

    const scroll = document.createElement("div");
    scroll.className = "md-code__scroll";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "md-code__copy";
    btn.textContent = "Copy";

    const parent = block.parentNode;
    parent.insertBefore(wrapper, block);
    wrapper.appendChild(btn);
    wrapper.appendChild(scroll);
    scroll.appendChild(block);

    // фиксим частый косяк: первая пустая строка в fenced-code
    const codeEl = block.querySelector?.("pre > code");
    if (codeEl && codeEl.firstChild && codeEl.firstChild.nodeType === Node.TEXT_NODE) {
      codeEl.firstChild.textContent = codeEl.firstChild.textContent.replace(/^\n+/, "");
    }

    btn.addEventListener("click", async () => {
      const text = extractCodeText(block);
      try {
        await navigator.clipboard.writeText(text);
        btn.textContent = "Скопировано";
        btn.classList.add("is-copied");
        setTimeout(() => {
          btn.textContent = "Copy";
          btn.classList.remove("is-copied");
        }, 1200);
      } catch (e) {
        // fallback
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand("copy"); } catch (_) {}
        document.body.removeChild(ta);

        btn.textContent = "Скопировано";
        setTimeout(() => (btn.textContent = "Copy"), 1200);
      }
    });
  });
}

document.addEventListener("DOMContentLoaded", function () {

    // ===== Пошаговое раскрытие длинного текста (ПО СТРОКАМ) =====
    const COLLAPSE_LINES = {
        post: { desktop: 30, mobile: 20, stepDesktop: 100, stepMobile: 70 },
        soft: { desktop: 30, mobile: 20, stepDesktop: 100, stepMobile: 70 },
        mediaPenalty: 3, // если есть медиа — показываем меньше строк текста по умолчанию
        minLines: 6
    };

    // ===== Пакетный показ комментариев/ответов =====
    const COMMENTS_BATCH_SIZE = 3;
    const REPLIES_BATCH_SIZE = 3;

    // ==========================================================
    //           COMPOSER ATTACHMENTS (FEED + COMMUNITY)
    // ==========================================================

    const MAX_FILE_SIZE = 25 * 1024 * 1024;      // 25 MB на файл
    const MAX_TOTAL_SIZE = 250 * 1024 * 1024;    // 250 MB суммарно
    const MAX_FILE_COUNT = parseInt(document.body?.dataset?.attachMax || "10", 10); // максимум файлов

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

    function initComposer(form) {
        const fileInput = form.querySelector('input[name="attachments"]');
        const attachButtons = form.querySelectorAll("[data-composer-attach]");
        const attachments = form.querySelector("[data-composer-attachments]");
        const mediaGrid = attachments?.querySelector("[data-composer-media]");
        const fileList = attachments?.querySelector("[data-composer-files]");
        const textarea = form.querySelector('textarea[name="text"]');

        if (textarea) {
            textarea.classList.add("composer__textarea");
            textarea.setAttribute("rows", "1");
            textarea.removeAttribute("required");
            textarea.required = false;
        }

        let files = [];
        let objectUrls = [];

        function resetObjectUrls() {
            objectUrls.forEach((url) => URL.revokeObjectURL(url));
            objectUrls = [];
        }

        function updateInputFiles() {
            if (!fileInput) return;
            const dt = new DataTransfer();
            files.forEach((file) => dt.items.add(file));
            fileInput.files = dt.files;
        }

        function updateTextareaSize() {
            if (!textarea) return;
            const baseHeight = 44;
            textarea.style.height = "auto";
            const scrollHeight = textarea.scrollHeight;
            textarea.style.height = `${scrollHeight}px`;
            const isExpanded = scrollHeight > baseHeight + 2;
            textarea.classList.toggle("is-expanded", isExpanded);
            textarea.classList.remove("is-scrollable");
        }

        function renderAttachments() {
            if (!attachments || !mediaGrid || !fileList) return;
            resetObjectUrls();
            attachments.classList.toggle("hidden", files.length === 0);
            mediaGrid.innerHTML = "";
            fileList.innerHTML = "";

            const media = [];
            const others = [];

            files.forEach((file, index) => {
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
        }

        function addFiles(list) {
            if (!list?.length) return;
            let totalSize = files.reduce((sum, f) => sum + (f.size || 0), 0);

            list.forEach((file) => {
                if (files.length >= MAX_FILE_COUNT) {
                    alert("Максимум файлов в одном посте: " + MAX_FILE_COUNT);
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
                files.push(file);
                totalSize += file.size;
            });

            updateInputFiles();
            renderAttachments();
        }

        if (fileInput) {
            fileInput.addEventListener("change", () => {
                addFiles(Array.from(fileInput.files || []));
            });
        }

        attachButtons.forEach((btn) => {
            btn.addEventListener("click", () => {
                if (!fileInput) return;
                const accept = btn.getAttribute("data-accept") || "";
                fileInput.value = "";
                fileInput.setAttribute("accept", accept);
                fileInput.click();
            });
        });

        attachments?.addEventListener("click", (event) => {
            const target = event.target;
            const btn = target?.closest?.("[data-remove-index]");
            if (!btn) return;
            const index = Number(btn.dataset.removeIndex);
            files = files.filter((_, idx) => idx !== index);
            updateInputFiles();
            renderAttachments();
        });

        if (textarea) {
            textarea.addEventListener("input", updateTextareaSize);
            window.addEventListener("load", updateTextareaSize);
            updateTextareaSize();
        }

        form.addEventListener("submit", (event) => {
            const textValue = (textarea?.value || "").trim();
            const hasText = textValue.length > 0;
            const hasFiles = (fileInput?.files?.length || 0) > 0;
            if (!hasText && !hasFiles) {
                event.preventDefault();
                alert("Добавьте текст или вложение перед публикацией.");
            }
        });
    }

    function isMobile() {
        return window.matchMedia("(max-width: 576px)").matches;
    }

    function getLineHeightPx(el) {
        const cs = window.getComputedStyle(el);
        const lh = cs.lineHeight;

        if (lh && lh.endsWith("px")) return parseFloat(lh);

        const fs = parseFloat(cs.fontSize) || 16;
        const unitless = parseFloat(lh);

        if (!Number.isNaN(unitless)) return unitless * fs; // если line-height без px
        return fs * 1.4;
    }

    function pxFromLines(textEl, lines) {
        return Math.round(getLineHeightPx(textEl) * lines);
    }

    document.querySelectorAll(".new-post-form, .community-post-form").forEach(initComposer);

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

    // (у тебя textarea без id="new-post-text", поэтому делаем fallback)
    const newPostText =
        document.getElementById("new-post-text") ||
        document.querySelector(".new-post-form textarea[name='text']");

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

    // На старте прячем все формы комментариев и ответов
    document.querySelectorAll(".comment-form, .reply-form").forEach(function (f) {
        f.classList.add("hidden");
    });

    // ----------------------------------------------------------
    //  СВЁРТКА ТЕКСТА (ПО СТРОКАМ) — ВАЖНО: без бага высоты
    // ----------------------------------------------------------
    function computeCollapsePx(block) {
        const textEl =
            block.querySelector(".post-text") ||
            block.querySelector(".comment-text") ||
            block.querySelector(".reply-text");

        if (!textEl) return { initial: 0, step: 0, isSoft: false, label: "Показать ещё" };

        const isSoft =
            block.classList.contains("comment-text-block") ||
            !!block.closest(".comment-item");

        const hasMedia = !!block.querySelector(".attachments");

        const mobile = isMobile();
        let lines = isSoft
            ? (mobile ? COLLAPSE_LINES.soft.mobile : COLLAPSE_LINES.soft.desktop)
            : (mobile ? COLLAPSE_LINES.post.mobile : COLLAPSE_LINES.post.desktop);

        const stepLines = isSoft
            ? (mobile ? COLLAPSE_LINES.soft.stepMobile : COLLAPSE_LINES.soft.stepDesktop)
            : (mobile ? COLLAPSE_LINES.post.stepMobile : COLLAPSE_LINES.post.stepDesktop);

        if (hasMedia && !isSoft) {
            lines = Math.max(COLLAPSE_LINES.minLines, lines - COLLAPSE_LINES.mediaPenalty);
        }

        const initialPx = pxFromLines(textEl, lines);
        const stepPx = pxFromLines(textEl, stepLines);

        return {
            initial: initialPx,
            step: stepPx,
            isSoft,
            label: isSoft ? "Показать ещё" : "Показать полностью"
        };
    }

    function getTextCollapseConfig(block) {
        const wrapper = block?.querySelector(".post-text-wrapper");
        const initialStored = parseInt(wrapper?.dataset?.initialPx || "0", 10);
        const stepStored = parseInt(wrapper?.dataset?.stepPx || "0", 10);

        if (initialStored > 0 && stepStored > 0) {
            return { initial: initialStored, step: stepStored };
        }

        const calc = computeCollapsePx(block);
        return { initial: calc.initial, step: calc.step };
    }

    // ✅ теперь поддерживает root (document / newPostEl / commentsBody)
    // ✅ и пропускает скрытые комментарии (чтобы “Показать ещё” появлялась только после открытия)
    function initPostTextCollapsing(root = document) {
        const scope = root || document;

        scope.querySelectorAll(".post-text-block").forEach((block) => {
            // пропускаем комменты/ответы если они в скрытых контейнерах
            if (block.closest(".comments-body.hidden") || block.closest(".replies-block.hidden")) return;

            const wrapper = block.querySelector(".post-text-wrapper");
            const btn = block.querySelector(".post-text-toggle");
            if (!wrapper || !btn) return;

            const calc = computeCollapsePx(block);
            if (!calc.initial || !calc.step) return;

            wrapper.dataset.initialPx = String(calc.initial);
            wrapper.dataset.stepPx = String(calc.step);
            wrapper.dataset.collapsedLabel = calc.label;
            wrapper.dataset.state = "collapsed";

            // измеряем высоту контента
            const fullHeight = wrapper.scrollHeight;

            // если коротко — кнопка не нужна
            if (fullHeight <= calc.initial + 8) {
                btn.classList.add("hidden");
                wrapper.classList.remove("is-collapsed");
                wrapper.style.maxHeight = "none";
                wrapper.dataset.state = "expanded";
                return;
            }

            // сворачиваем
            wrapper.classList.add("is-collapsed");
            wrapper.style.maxHeight = `${calc.initial}px`;
            btn.classList.remove("hidden");
            btn.textContent = calc.label;
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
            const overlayBtn  = wrapper.querySelector(".video-overlay-play");
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
                // не мешаем кликам по прогрессу/кнопкам
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

            // init state
            syncPlayUi();
            syncMuteUi();
        });
    }

    // ---------- АУДИО ----------
    let currentAudio = null;
    let currentAudioBtn = null;

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

            function setAudioBtnIcon(btn, isPlaying) {
                if (!btn) return;
                const playIcon = btn.dataset.iconPlay;
                const pauseIcon = btn.dataset.iconPause;
                const img = btn.querySelector("img");
                if (!img) return;
                img.src = isPlaying ? (pauseIcon || img.src) : (playIcon || img.src);
            }

            playButton.addEventListener("click", () => {
                if (currentAudio && currentAudio !== audio) {
                    try { currentAudio.pause(); } catch (e) {}
                    setAudioBtnIcon(currentAudioBtn, false);
                }

                if (audio.paused) {
                    const p = audio.play();
                    if (p && typeof p.catch === "function") p.catch(() => {});
                    setAudioBtnIcon(playButton, true);
                    currentAudio = audio;
                    currentAudioBtn = playButton;
                } else {
                    audio.pause();
                    setAudioBtnIcon(playButton, false);
                }
            });

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

            slider.addEventListener("input", () => {
                if (!audio.duration || isNaN(audio.duration)) return;
                if (isSeeking) return;

                const percent = parseFloat(slider.value) || 0;
                const newTime = (percent / 100) * audio.duration;
                audio.currentTime = newTime;
                progressBar.style.width = percent + "%";
                currentTimeEl.textContent = aFormat(newTime);
            });

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
                setAudioBtnIcon(playButton, false);
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
        block.appendChild(btn);
    }

    function ensureNewestFirstComments(body) {
        if (!body) return;
        if (body.dataset.orderInited === "1") return;

        const oldBtn = body.querySelector(":scope > .comments-more-btn") || body.querySelector(".comments-more-btn");
        if (oldBtn) oldBtn.remove();

        const addToggle = body.querySelector(":scope > .comment-add-toggle") || body.querySelector(".comment-add-toggle");
        const form = body.querySelector(":scope > .comment-form") || body.querySelector(".comment-form");
        const keep = [];
        if (addToggle && addToggle.parentElement === body) keep.push(addToggle);
        if (form && form.parentElement === body) keep.push(form);
        keep.forEach(el => body.removeChild(el));

        const items = directChildren(body, ".comment-item");
        const frag = document.createDocumentFragment();
        for (let i = items.length - 1; i >= 0; i--) frag.appendChild(items[i]);
        body.appendChild(frag);

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
        for (let i = items.length - 1; i >= 0; i--) frag.appendChild(items[i]);
        block.appendChild(frag);

        block.dataset.orderInited = "1";
    }

    function updateCommentsMoreButton(body) {
        if (!body) return;
        const items = directChildren(body, ".comment-item");
        const btn = body.querySelector(":scope > .comments-more-btn") || body.querySelector(".comments-more-btn");
        if (!btn) return;

        const hiddenCount = items.filter(el => el.classList.contains("batch-hidden")).length;
        if (hiddenCount <= 0) btn.remove();
        else {
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
        if (hiddenCount <= 0) btn.remove();
        else {
            btn.textContent = "Показать ещё (" + hiddenCount + ")";
            placeRepliesMoreButton(block, btn);
        }
    }

    function initCommentsBatchingForBody(body) {
        if (!body) return;

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
            if (form.querySelector("[data-composer-attachments]")) {
                return;
            }
            e.preventDefault();

            const fd = new FormData(form);

            const voiceWillBeAdded = Boolean(form._voiceBlob && !form._voiceBlobUsed);
            const totalFilesToSend = selectedFiles.length + (voiceWillBeAdded ? 1 : 0);
            if (totalFilesToSend > MAX_FILE_COUNT) {
                alert("Максимум файлов в одном посте: " + MAX_FILE_COUNT);
                return;
            }

            selectedFiles.forEach(f => fd.append("attachments", f));

            if (form._voiceBlob && !form._voiceBlobUsed) {
                const blob = form._voiceBlob;
                const name = form._voiceFilename || "voice-message.webm";
                const type = form._voiceMime || blob.type || "audio/webm";

                const voiceFile = (blob instanceof File)
                    ? blob
                    : new File([blob], name, { type });

                fd.append("attachments", voiceFile);
                form._voiceBlobUsed = true;
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

                        initPostTextCollapsing(newPostEl);
                        initVideoPlayers(newPostEl);
                        initAudioPlayers(newPostEl);
                        initSmartGalleries(newPostEl);
                        initMarkdownCodeBlocks(newPostEl);

                        form.reset();
                        clearFilePreview();
                        if (dropZone) dropZone.classList.add("hidden");

                    } else {
                        window.location.reload();
                    }
                } else {
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
                    const liked = !!(data.liked ?? data.is_liked);
                    const likesCount = (typeof data.likes_count !== "undefined") ? data.likes_count : null;

                    // Обновляем ВСЕ кнопки лайка для этого postId (лента + модалка)
                    document
                        .querySelectorAll('.like-form[data-post-id="' + postId + '"] .like-button')
                        .forEach(btn => {
                            const icon = btn.querySelector("img");
                            if (icon) {
                                icon.src = liked
                                    ? "/static/core/icons/post-like-filled.svg"
                                    : "/static/core/icons/post-like.svg";
                            }

                            btn.dataset.liked = liked ? "true" : "false";
                            btn.classList.toggle("is-liked", liked);

                            btn.classList.remove("like-animate");
                            void btn.offsetWidth;
                            btn.classList.add("like-animate");
                        });

                    if (likesCount !== null) {
                        document
                            .querySelectorAll('.like-count[data-post-id="' + postId + '"]')
                            .forEach(cnt => {
                                cnt.textContent = likesCount;
                                cnt.classList.remove("like-count-bump");
                                void cnt.offsetWidth;
                                cnt.classList.add("like-count-bump");
                            });
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
                    const img = btn ? btn.querySelector("img") : null;
                    const cnts = document.querySelectorAll(
                        '.comment-like-count[data-comment-id="' + commentId + '"], ' +
                        '.reply-like-count[data-comment-id="' + commentId + '"]'
                    );

                    if (img) {
                        const likedSrc = img.getAttribute('data-src-liked') || (img.dataset ? img.dataset.srcLiked : "");
                        const unlikedSrc = img.getAttribute('data-src-unliked') || (img.dataset ? img.dataset.srcUnliked : "");
                        img.src = data.liked ? (likedSrc || img.src) : (unlikedSrc || img.src);
                    }
                    if (btn) btn.dataset.liked = data.liked ? "true" : "false";
                    cnts.forEach(el => { el.textContent = String(data.likes_count); });
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

                    ensureNewestFirstComments(body);

                    const firstItem = body.querySelector(":scope > .comment-item") || body.querySelector(".comment-item");
                    const addBtn = body.querySelector(":scope > .comment-add-toggle") || body.querySelector(".comment-add-toggle");

                    if (firstItem) firstItem.insertAdjacentHTML("beforebegin", data.html);
                    else if (addBtn) addBtn.insertAdjacentHTML("beforebegin", data.html);
                    else body.insertAdjacentHTML("afterbegin", data.html);

                    if (body.closest('#vk-post-modal')) {
                        body.querySelectorAll(':scope > .comment-item').forEach(_vkPrepareFlatCommentItem);
                    }

                    initPostTextCollapsing(body);

                    if (body.dataset.batchInited === "1") updateCommentsMoreButton(body);

                    const badge = document.querySelector(
                        '.post-comments-count[data-post-id="' + pid + '"]'
                    );

                    if (badge && typeof data.comments_count !== "undefined") {
                        badge.textContent = data.comments_count;
                    }

                    textArea.value = "";

                    // если это был ответ (в модалке) — сбрасываем режим ответа
                    if (form.closest('#vk-post-modal') && form.dataset.replyTo) {
                        _vkClearReplyTarget(form);
                    }

                    if (!form.closest('#vk-post-modal')) {
                        form.classList.add("hidden");
                    }
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
                        ensureNewestFirstReplies(repliesBlock);

                        const firstReply = repliesBlock.querySelector(":scope > .comment-item") || repliesBlock.querySelector(".comment-item");
                        if (firstReply) {
                            firstReply.insertAdjacentHTML("beforebegin", data.html);
                        } else {
                            const moreBtn = repliesBlock.querySelector(":scope > .replies-more-btn") || repliesBlock.querySelector(".replies-more-btn");
                            if (moreBtn) moreBtn.insertAdjacentHTML("beforebegin", data.html);
                            else repliesBlock.insertAdjacentHTML("afterbegin", data.html);
                        }

                        initPostTextCollapsing(repliesBlock);

                        if (repliesBlock.dataset.batchInited === "1") {
                            updateRepliesMoreButton(repliesBlock);
                        }
                    } else {
                        parentEl.insertAdjacentHTML("beforeend", data.html);
                        initPostTextCollapsing(parentEl);
                    }

                    const badge = document.querySelector(
                        '.post-comments-count[data-post-id="' + pid + '"]'
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

                    const body = document.querySelector('.comments-body[data-post-id="' + postId + '"]');
                    if (body && body.dataset.batchInited === "1") updateCommentsMoreButton(body);
                    if (repliesContainer && repliesContainer.dataset.batchInited === "1") updateRepliesMoreButton(repliesContainer);

                    const badge = document.querySelector(
                        '.post-comments-count[data-post-id="' + postId + '"]'
                    );

                    if (badge) {
                        const n = parseInt(badge.textContent) || 0;
                        badge.textContent = n > 0 ? n - 1 : 0;
                    }

                    // Если удаляли в VK-модалке — добьём батчи, чтобы снизу не оставалась пустота
                    _vkRefillCommentsAfterMutation(postId);
                })
                .catch(err => console.error("delete comment error:", err));

            return;
        }

        // ---------- РЕДАКТИРОВАНИЕ ПОСТА (AJAX) ----------
        if (form.classList.contains("post-edit-form")) {
            e.preventDefault();

            const postCard = form.closest(".post-card");
            if (!postCard) return;

            const existingItems = form.querySelectorAll(".post-edit-attachment-item");
            const existingCount = existingItems.length;

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

                    const tmp = document.createElement("div");
                    tmp.innerHTML = data.html.trim();
                    const newEl = tmp.firstElementChild;
                    if (!newEl) return;

                    postCard.replaceWith(newEl);

                    initPostTextCollapsing(newEl);
                    initSmartGalleries(newEl);
                    initVideoPlayers(newEl);
                    initAudioPlayers(newEl);
                    initMarkdownCodeBlocks(newEl);
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
                        if (response.status === 403) {
                            alert("Вы не можете удалить этот пост");
                        } else {
                            alert("Ошибка при удалении поста (HTTP " + response.status + ")");
                        }
                        return;
                    }

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

            const menu = postCard.querySelector(".post-menu");
            if (menu) menu.classList.add("hidden");

            const isOpen = !editBlock.classList.contains("hidden");
            if (viewBlock) viewBlock.classList.remove("hidden");
            editBlock.classList.toggle("hidden", isOpen);
            postCard.classList.toggle("is-editing", !isOpen);

            const ta = editBlock.querySelector(".post-edit-textarea");
            const counter = editBlock.querySelector(".post-edit-counter");
            if (ta && counter) {
                bindTextCounter(ta, counter, MAX_POST_CHARS);
                const len = (ta.value || "").length;
                counter.textContent = `${len} / ${MAX_POST_CHARS}`;
            }

            return;
        }

        // ----- ОТМЕНА РЕДАКТИРОВАНИЯ -----
        const editCancel = e.target.closest(".post-edit-cancel");
        const editClose = e.target.closest(".post-edit-close");
        if (editCancel || editClose) {
            const postCard = (editCancel || editClose).closest(".post-card");
            if (!postCard) return;

            const viewBlock = postCard.querySelector(".post-view-block");
            const editBlock = postCard.querySelector(".post-edit-block");
            if (viewBlock) viewBlock.classList.remove("hidden");
            if (editBlock) editBlock.classList.add("hidden");
            postCard.classList.remove("is-editing");

            const ta = postCard.querySelector(".post-edit-textarea");
            if (ta) {
                const orig = ta.getAttribute("data-original") || "";
                ta.value = orig;
            }

            postCard.querySelectorAll(".post-edit-att-check").forEach(ch => { ch.checked = false; });
            postCard.querySelectorAll(".post-edit-attachment-item").forEach(it => { it.classList.remove("is-removed"); });

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

        // ----- РАЗВОРОТ/СВОРАЧИВАНИЕ ДЛИННОГО ТЕКСТА (FIX высоты) -----
        const textToggle = e.target.closest(".post-text-toggle");
        if (textToggle) {
            const block = textToggle.closest(".post-text-block");
            if (!block) return;

            const wrapper = block.querySelector(".post-text-wrapper");
            if (!wrapper) return;

            const cfg = getTextCollapseConfig(block);
            const collapsedLabel = wrapper.dataset.collapsedLabel || "Показать ещё";
            const state = wrapper.dataset.state || "collapsed";

            // Если полностью развернуто — сворачиваем обратно
            if (state === "expanded") {
                const full = wrapper.scrollHeight;

                wrapper.style.maxHeight = `${full}px`;
                wrapper.classList.add("is-collapsed");

                requestAnimationFrame(() => {
                    wrapper.style.maxHeight = `${cfg.initial}px`;
                });

                wrapper.dataset.state = "collapsed";
                textToggle.textContent = collapsedLabel;
                return;
            }

            // Идём вверх шагами
            let current = parseInt(wrapper.style.maxHeight || "0", 10);
            if (!current || wrapper.style.maxHeight === "none") current = cfg.initial;

            const fullHeight = wrapper.scrollHeight;
            const next = current + cfg.step;

            if (next >= fullHeight - 5) {
                // ✅ полный разворот: потом ставим max-height:none, чтобы карточка точно росла и не было налезаний
                wrapper.style.maxHeight = `${fullHeight}px`;
                wrapper.classList.remove("is-collapsed");
                wrapper.dataset.state = "expanded";
                textToggle.textContent = "Свернуть";

                wrapper.addEventListener("transitionend", (ev) => {
                    if (ev.propertyName !== "max-height") return;
                    wrapper.style.maxHeight = "none";
                }, { once: true });

            } else {
                wrapper.style.maxHeight = `${next}px`;
                wrapper.classList.add("is-collapsed");
                wrapper.dataset.state = "partial";
                textToggle.textContent = "Показать ещё";
            }

            return;
        }

        // ----- "ПОКАЗАТЬ ЕЩЁ" ДЛЯ КОММЕНТАРИЕВ -----
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

        // ----- "ПОКАЗАТЬ ЕЩЁ" ДЛЯ ОТВЕТОВ -----
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
                if (menu.dataset.postId === postId) menu.classList.toggle("hidden");
                else menu.classList.add("hidden");
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
                        showMiniToast(shareBtn, 'Ссылка скопирована');
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

        // ----- КНОПКА "КОММЕНТАРИЙ" (VK bar) -----
        const commentAction = e.target.closest(".post-action-comment");
        if (commentAction) {
            const postId = commentAction.dataset.postId;
            openVkPostModal(postId, false);
            return;
        }

        // ----- ОТКРЫТЬ/ЗАКРЫТЬ КОММЕНТАРИИ -----
        const commentsToggle = e.target.closest(".comments-toggle");
        if (commentsToggle) {
            const postId = commentsToggle.dataset.postId;
            const body = document.querySelector('.comments-body[data-post-id="' + postId + '"]');
            const arrow = commentsToggle.querySelector(".comments-toggle-arrow");

            if (body) {
                body.classList.toggle("hidden");
                const isHidden = body.classList.contains("hidden");

                if (!isHidden) {
                    body.querySelectorAll(".comment-form, .reply-form").forEach(f => f.classList.add("hidden"));
                    body.querySelectorAll(".replies-block").forEach(b => b.classList.add("hidden"));

                    // ✅ именно тут появляются кнопки “Показать ещё” у комментариев
                    if (body.closest('#vk-post-modal')) {
                        body.querySelectorAll(':scope > .comment-item').forEach(_vkPrepareFlatCommentItem);
                    }

                    initPostTextCollapsing(body);
                    initCommentsBatchingForBody(body);
                }

                if (arrow) arrow.textContent = isHidden ? "▾" : "▴";
            }
            return;
        }

        // ----- ОТКРЫТЬ/ЗАКРЫТЬ БЛОК ОТВЕТОВ -----
        const repliesToggle = e.target.closest(".replies-toggle");
        if (repliesToggle) {
            const commentId = repliesToggle.dataset.commentId;
            const block = document.querySelector('.replies-block[data-parent-id="' + commentId + '"]');
            if (block) {
                block.classList.toggle("hidden");
                const isHidden = block.classList.contains("hidden");
                if (!isHidden) {
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
            const form = document.querySelector('.comment-form[data-post-id="' + postId + '"]');
            if (form) form.classList.toggle("hidden");
            return;
        }

        // ----- ОТВЕТ НА КОММЕНТАРИЙ -----
        const replyToggle = e.target.closest(".comment-reply-toggle");
        if (replyToggle) {
            // внутри VK-модалки отвечаем через один композер (снизу)
            if (replyToggle.closest('#vk-post-modal')) {
                _vkSetReplyTargetFromToggle(replyToggle);
                return;
            }

            // вне модалки — старое поведение (показываем форму под комментом)
            const commentId = replyToggle.dataset.commentId;
            const form = document.querySelector('.reply-form[data-parent-id="' + commentId + '"]');
            if (form) form.classList.toggle("hidden");
            return;
        }

        // ----- ПОДПИСКА (.follow-btn) -----
        const followBtn = e.target.closest(".follow-btn");
        if (followBtn) {
            e.preventDefault();

            const isFollowing = followBtn.dataset.following === "1";
            const url = isFollowing ? followBtn.dataset.unfollowUrl : followBtn.dataset.followUrl;
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

                    followBtn.classList.toggle("btn-outline-secondary", following);
                    followBtn.classList.toggle("btn-primary", !following);

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
    // Хэштег → поиск
    // ================================
    (function initHashtagSearch() {
        const searchInput = document.querySelector(".feed-search__input");
        const searchForm = searchInput?.closest("form");
        if (!searchForm) return;

        document.body.addEventListener("click", (event) => {
            const link = event.target.closest(".post-hashtag");
            if (!link) return;

            const rawTag = (link.dataset.hashtag || link.textContent || "").trim();
            const tag = rawTag.replace(/^#/, "");
            if (!tag) return;

            event.preventDefault();
            const query = `#${tag}`;
            searchInput.value = query;

            if (typeof searchForm.requestSubmit === "function") {
                searchForm.requestSubmit();
            } else {
                searchForm.submit();
            }
        });
    })();

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
                    headers: { "X-Requested-With": "XMLHttpRequest" },
                });

                if (!response.ok) return;

                const data = await response.json();
                if (!data || !data.success || !data.html) return;

                container.insertAdjacentHTML("beforeend", data.html);

                initPostTextCollapsing(container);
                initVideoPlayers(container);
                initAudioPlayers(container);
                initSmartGalleries(container);
                initMarkdownCodeBlocks(container);

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

            if (scrollPosition >= threshold) loadMore();
        }

        window.addEventListener("scroll", onScroll);
        onScroll();
    })();

    // --------------------------------------------
    // Экспорт хелперов наружу (нужно для VK-модалки)
    // --------------------------------------------
    window.initPostTextCollapsing = initPostTextCollapsing;
    window.initCommentsBatchingForBody = initCommentsBatchingForBody;

    // --------------------------------------------
    // Инициализация (комменты скрытые — пропускаем)
    // --------------------------------------------
    initPostTextCollapsing(document);
    initVideoPlayers(document);
    initAudioPlayers(document);
    initSmartGalleries(document);
    initMarkdownCodeBlocks(document);

}); // конец DOMContentLoaded


// ================================
// FULLSCREEN MEDIA VIEWER + SLIDES
// ================================
document.addEventListener("click", function (e) {
    const media = e.target.closest(".gallery-media");
    if (!media) return;

    const post = media.closest(".attachments");
    if (!post) return;

    const mediaItems = [...post.querySelectorAll(".gallery-media")];
    const items = mediaItems.map((item) => ({
        type: item.dataset.media || (item.tagName === "VIDEO" ? "video" : "image"),
        url: item.dataset.full || item.currentSrc || item.src,
    }));

    let index = mediaItems.indexOf(media);
    if (index < 0) index = 0;

    openMediaViewer(items, index);
});

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
    });

    overlay.addEventListener("touchend", (ev) => {
        let diff = ev.changedTouches[0].screenX - touchStartX;

        if (Math.abs(diff) > 50) {
            if (diff > 0) btnPrev.click();
            else btnNext.click();
        }
    });

    renderMedia();
}
