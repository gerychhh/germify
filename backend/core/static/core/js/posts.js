// static/core/js/posts.js

// Достаём csrftoken из куки (нужно для fetch без формы)
function getCsrfToken() {
    const cookie = document.cookie
        .split("; ")
        .find(row => row.startsWith("csrftoken="));
    return cookie ? cookie.split("=")[1] : "";
}

document.addEventListener("DOMContentLoaded", function () {

    function ajaxPost(url, form) {
        return fetch(url, {
            method: "POST",
            body: new FormData(form),
            headers: {
                "X-Requested-With": "XMLHttpRequest",
            },
        });
    }

    // На старте прячем все формы комментариев и ответов
    document.querySelectorAll(".comment-form, .reply-form").forEach(function (f) {
        f.classList.add("hidden");
    });

    // ==========================
    // ОБРАБОТЧИК ВСЕХ SUBMIT'ов
    // ==========================
    document.addEventListener("submit", function (e) {
        const form = e.target;

        // ---------- СОЗДАНИЕ НОВОГО ПОСТА (лента) ----------
        if (form.classList.contains("new-post-form")) {
            e.preventDefault();

            ajaxPost(form.action, form)
                .then(function (response) {
                    const ct = response.headers.get("content-type") || "";
                    if (ct.indexOf("application/json") !== -1) {
                        return response.json().then(function (data) {
                            return { kind: "json", data: data };
                        });
                    }
                    return response.text().then(function (html) {
                        return { kind: "html", html: html, url: response.url };
                    });
                })
                .then(function (result) {
                    if (result.kind === "json") {
                        const data = result.data;
                        if (!data.success || !data.html) return;

                        const list = document.querySelector(".posts-list");
                        if (!list) return;

                        list.insertAdjacentHTML("afterbegin", data.html);

                        const firstPost = list.querySelector(".post-card");
                        if (firstPost) {
                            firstPost.querySelectorAll(".comment-form, .reply-form")
                                .forEach(function (f) { f.classList.add("hidden"); });
                            firstPost.querySelectorAll(".replies-block")
                                .forEach(function (b) { b.classList.add("hidden"); });
                        }

                        form.reset();
                    } else {
                        window.location.href = result.url;
                    }
                })
                .catch(function (err) {
                    console.error("create post error:", err);
                });

            return;
        }

        // ---------- ЛАЙК ПОСТА ----------
        if (form.classList.contains("like-form")) {
            e.preventDefault();

            const postId = form.dataset.postId;

            ajaxPost(form.action, form)
                .then(function (r) { return r.json(); })
                .then(function (data) {
                    const btn = form.querySelector(".like-button");
                    const cnt = document.querySelector(
                        '.like-count[data-post-id="' + postId + '"]'
                    );

                    if (!btn) return;

                    // текст и data-атрибут
                    btn.textContent = data.liked ? "❤️" : "🤍";
                    btn.dataset.liked = data.liked ? "true" : "false";

                    // состояние liked для подсветки
                    if (data.liked) {
                        btn.classList.add("is-liked");
                    } else {
                        btn.classList.remove("is-liked");
                    }

                    // запускаем анимацию сердечка
                    btn.classList.remove("like-animate");
                    // форсим перерисовку, чтобы анимация перезапустилась каждый раз
                    void btn.offsetWidth;
                    btn.classList.add("like-animate");

                    // обновляем и анимируем счётчик лайков
                    if (cnt && typeof data.likes_count !== "undefined") {
                        cnt.textContent = data.likes_count + " лайков";

                        cnt.classList.remove("like-count-bump");
                        void cnt.offsetWidth;
                        cnt.classList.add("like-count-bump");
                    }
                })
                .catch(function (err) {
                    console.error("post like error:", err);
                });
        }


        // ---------- ЛАЙК КОММЕНТАРИЯ / ОТВЕТА ----------
        if (form.classList.contains("comment-like-form")) {
            e.preventDefault();

            const commentId = form.dataset.commentId;

            ajaxPost(form.action, form)
                .then(r => r.json())
                .then(function (data) {
                    const btn = form.querySelector("button");
                    const cnt = document.querySelector(
                        '.comment-like-count[data-comment-id="' + commentId + '"], ' +
                        '.reply-like-count[data-comment-id="' + commentId + '"]'
                    );

                    btn.textContent = data.liked ? "❤️" : "🤍";
                    if (cnt) {
                        cnt.textContent = data.likes_count + " лайков";
                    }
                })
                .catch(function (err) {
                    console.error("comment like error:", err);
                });

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
                .then(function (data) {
                    if (!data.html) return;

                    const pid = data.post_id || postId;
                    const body = document.querySelector(
                        '.comments-body[data-post-id="' + pid + '"]'
                    );
                    if (!body) return;

                    const addBtn = body.querySelector(".comment-add-toggle");
                    if (addBtn) {
                        addBtn.insertAdjacentHTML("beforebegin", data.html);
                    } else {
                        body.insertAdjacentHTML("beforeend", data.html);
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
                .catch(function (err) {
                    console.error("add comment error:", err);
                });

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
                .then(function (data) {
                    if (!data.html) return;

                    const pid = data.post_id || postId;
                    const pId = data.parent_id || parentId;

                    const parentEl = document.querySelector(
                        '.comment-item[data-comment-id="' + pId + '"]'
                    );
                    if (!parentEl) return;

                    const repliesBlock = parentEl.querySelector(".replies-block");
                    if (repliesBlock) {
                        repliesBlock.insertAdjacentHTML("beforeend", data.html);
                    } else {
                        parentEl.insertAdjacentHTML("beforeend", data.html);
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
                .catch(function (err) {
                    console.error("add reply error:", err);
                });

            return;
        }

        // ---------- УДАЛЕНИЕ КОММЕНТАРИЯ / ОТВЕТА ----------
        if (form.classList.contains("comment-delete-form")) {
            e.preventDefault();

            const commentId = form.dataset.commentId;
            const postId = form.dataset.postId;

            ajaxPost(form.action, form)
                .then(function () {
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
                .catch(function (err) {
                    console.error("delete comment error:", err);
                });

            return;
        }

        // ---------- УДАЛЕНИЕ ПОСТА ----------
        if (form.classList.contains("post-delete-form")) {
            e.preventDefault();

            const postCard = form.closest(".post-card");

            ajaxPost(form.action, form)
                .then(function () {
                    if (postCard) postCard.remove();
                })
                .catch(function (err) {
                    console.error("delete post error:", err);
                });

            return;
        }
    });

    // ==========================
    // ОБРАБОТЧИК ВСЕХ КЛИКОВ
    // ==========================
    document.addEventListener("click", function (e) {

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

        // ----- ПОДЕЛИТЬСЯ (копировать ссылку на пост) -----
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

        // ----- ОТКРЫТЬ/ЗАКРЫТЬ СПИСОК КОММЕНТАРИЕВ -----
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

        // ----- ОТКРЫТЬ/ЗАКРЫТЬ БЛОК "ОТВЕТЫ" -----
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

        // ----- ФОРМА "НАПИСАТЬ КОММЕНТАРИЙ" -----
        const addToggle = e.target.closest(".comment-add-toggle");
        if (addToggle) {
            const postId = addToggle.dataset.postId;
            const form = document.querySelector(
                '.comment-form[data-post-id="' + postId + '"]'
            );
            if (form) {
                form.classList.toggle("hidden");
            }
            return;
        }

        // ----- ФОРМА ОТВЕТА -----
        const replyToggle = e.target.closest(".comment-reply-toggle");
        if (replyToggle) {
            const commentId = replyToggle.dataset.commentId;
            const form = document.querySelector(
                '.reply-form[data-parent-id="' + commentId + '"]'
            );
            if (form) {
                form.classList.toggle("hidden");
            }
            return;
        }

        // ----- ПОДПИСКА / ОТПИСКА -----
        const followBtn = e.target.closest(".follow-btn");
        if (followBtn) {
            e.preventDefault();

            const isFollowing = followBtn.dataset.following === "1";
            const url = isFollowing
                ? followBtn.dataset.unfollowUrl
                : followBtn.dataset.followUrl;

            if (!url) {
                console.error("follow-btn: нет URL", followBtn);
                return;
            }

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

                    // стили
                    if (following) {
                        followBtn.style.background = "#1f2937";
                        followBtn.style.color = "#e5e7eb";
                    } else {
                        followBtn.style.background = "";
                        followBtn.style.color = "";
                    }

                    // если пришёл новый followers_count — обновим в шапке профиля
                    if (typeof data.followers_count !== "undefined") {
                        const counterEl = document.querySelector(".profile-followers-count");
                        if (counterEl) {
                            counterEl.textContent = data.followers_count;
                        }
                    }
                })
                .catch(function (err) {
                    console.error("follow error:", err);
                });

            return;
        }

        // ----- КЛИК МИМО МЕНЮ — ЗАКРЫВАЕМ ВСЕ МЕНЮ -----
        if (!e.target.closest(".post-menu") && !e.target.closest(".post-menu-toggle")) {
            document.querySelectorAll(".post-menu").forEach(function (menu) {
                menu.classList.add("hidden");
            });
        }
    });
});
