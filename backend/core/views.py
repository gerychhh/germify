from django.contrib import messages
from django.contrib.auth import login, logout
from django.contrib.auth.forms import AuthenticationForm
from django.contrib.auth.decorators import login_required
from django.db.models import Q, Count
from django.shortcuts import render, redirect, get_object_or_404
from django.template.loader import render_to_string
from django.core.paginator import Paginator
from django.http import JsonResponse, HttpResponseForbidden, HttpResponse


from .forms import RegisterForm, PostForm, MessageForm, ProfileForm, CommunityForm, CommunityPostForm
from .models import (
    Post,
    User,
    Message,
    Follow,
    Like,
    Comment,
    CommentLike,
    PostAttachment,
    Community,
    CommunityMembership,
)


# ======================================================
# УТИЛИТЫ
# ======================================================

def get_user_state(user):
    """Возвращает списки лайков, подписок — в одном месте, чтобы не дублировать."""
    if not user.is_authenticated:
        return {
            "liked_posts_ids": [],
            "liked_comment_ids": [],
            "following_ids": [],
            "admin_community_ids": [],
            "member_community_ids": [],
        }

    return {
        "liked_posts_ids": list(
            Like.objects.filter(user=user).values_list("post_id", flat=True)
        ),
        "liked_comment_ids": list(
            CommentLike.objects.filter(user=user).values_list("comment_id", flat=True)
        ),
        "following_ids": list(
            Follow.objects.filter(follower=user).values_list("following_id", flat=True)
        ),
        "admin_community_ids": list(
            CommunityMembership.objects.filter(user=user, is_admin=True).values_list("community_id", flat=True)
        ),
        "member_community_ids": list(
            CommunityMembership.objects.filter(user=user).values_list("community_id", flat=True)
        ),
    }


def render_post_html(post, request):
    """Рендер одного поста в HTML для AJAX."""
    state = get_user_state(request.user)

    return render_to_string(
        "core/partials/post.html",
        {
            "post": post,
            "user": request.user,
            **state
        },
        request=request,
    )


def render_comment_html(comment, request, level):
    """Рендер одного комментария в HTML (AJAX)."""
    state = get_user_state(request.user)
    return render_to_string(
        "core/partials/comment.html",
        {
            "c": comment,
            "user": request.user,
            "level": level,
            **state
        },
        request=request,
    )


# ======================================================
# ЛЕНТА
# ======================================================

def feed(request):
    """Лента постов с пагинацией (7 штук) и поддержкой бесконечной прокрутки через AJAX."""
    # Базовый queryset
    base_qs = (
        Post.objects
        .select_related("author", "community")
        .prefetch_related(
            "likes",
            "comments__author",
            "comments__likes",
            "comments__replies",
        )
        .annotate(
            top_comments_count=Count(
                "comments",
                filter=Q(comments__parent__isnull=True),
            )
        )
        .order_by("-created_at")
    )

    # Пагинация по 7 постов
    paginator = Paginator(base_qs, 7)

    # Номер страницы из ?page=...
    page_param = request.GET.get("page")
    try:
        page_number = int(page_param)
        if page_number < 1:
            page_number = 1
    except (TypeError, ValueError):
        page_number = 1

    page_obj = paginator.get_page(page_number)

    # лайки/подписки
    state = get_user_state(request.user)

    # ---------- AJAX: подгрузка постов ----------
    if request.headers.get("x-requested-with") == "XMLHttpRequest":
        posts_html = "".join(
            render_post_html(post, request) for post in page_obj.object_list
        )
        return JsonResponse(
            {
                "success": True,
                "html": posts_html,
                "has_next": page_obj.has_next(),
                "next_page": page_obj.next_page_number() if page_obj.has_next() else None,
            }
        )

    # ---------- Обычный GET + запасной POST ----------
    form = PostForm()

    # запасной вариант создания поста обычным POST (если когда-то понадобится)
    if request.method == "POST" and not request.headers.get("x-requested-with"):
        if not request.user.is_authenticated:
            messages.error(request, "Чтобы написать пост — войдите.")
            return redirect("login")

        form = PostForm(request.POST)
        if form.is_valid():
            p = form.save(commit=False)
            p.author = request.user
            p.save()
            return redirect("feed")

    context = {
        "posts": page_obj.object_list,          # только текущие 7 постов
        "form": form,
        "page_obj": page_obj,
        "has_next": page_obj.has_next(),
        "next_page": page_obj.next_page_number() if page_obj.has_next() else None,
        **state,
    }

    return render(request, "core/feed.html", context)



@login_required
def create_post(request):
    """Создание поста с поддержкой файлов и AJAX."""
    if request.method != "POST":
        return redirect("feed")

    # Форма без файловой обработки (только текст)
    form = PostForm(request.POST)

    if not form.is_valid():
        if request.headers.get("x-requested-with"):
            return JsonResponse({"success": False, "errors": form.errors}, status=400)
        return redirect("feed")

    # Создаём пост
    post = form.save(commit=False)
    post.author = request.user
    post.save()

    # === Обработка файлов ===
    files = request.FILES.getlist("attachments")

    MAX_SIZE_MB = 500
    MAX_SIZE = MAX_SIZE_MB * 1024 * 1024

    for f in files:
        if f.size > MAX_SIZE:
            return JsonResponse({
                "success": False,
                "error": f"Файл '{f.name}' превышает {MAX_SIZE_MB}MB."
            }, status=400)

        PostAttachment.objects.create(
            post=post,
            file=f,
            original_name=f.name
        )

    # === AJAX ответ ===
    if request.headers.get("x-requested-with"):
        html = render_post_html(post, request)
        return JsonResponse({"success": True, "html": html})

    # Обычный POST → редирект
    return redirect("feed")



@login_required
def delete_post(request, pk):
    post = get_object_or_404(Post, pk=pk)

    # Разрешаем удалять:
    # - автору
    # - суперюзеру
    # - администратору сообщества (только если пост опубликован от лица сообщества)
    is_community_admin = False
    if post.community_id and post.as_community and request.user.is_authenticated:
        is_community_admin = CommunityMembership.objects.filter(
            community_id=post.community_id,
            user=request.user,
            is_admin=True,
        ).exists()

    if request.user != post.author and not request.user.is_superuser and not is_community_admin:
        # AJAX-запрос
        if request.headers.get("x-requested-with") == "XMLHttpRequest":
            return HttpResponseForbidden("Нельзя удалить чужой пост")
        # обычный запрос
        return HttpResponseForbidden("Нельзя удалить чужой пост")

    # Разрешено, но только через POST
    if request.method == "POST":
        post.delete()

        if request.headers.get("x-requested-with") == "XMLHttpRequest":
            return JsonResponse({"ok": True})

        return redirect("feed")

    # Если не POST — просто редиректим назад/в ленту
    return redirect(request.META.get("HTTP_REFERER", "feed"))


@login_required
def toggle_like(request, pk):
    """Лайк поста (AJAX)."""
    post = get_object_or_404(Post, pk=pk)

    like, created = Like.objects.get_or_create(user=request.user, post=post)
    liked = created

    if not created:
        like.delete()

    if request.headers.get("x-requested-with"):
        return JsonResponse({
            "liked": liked,
            "likes_count": post.likes.count()
        })

    return redirect("feed")


# ======================================================
# КОММЕНТАРИИ
# ======================================================

@login_required
def add_comment(request, post_id):
    """Добавление корневого комментария (AJAX + обычный POST)."""
    post = get_object_or_404(Post, pk=post_id)

    if request.method != "POST":
        return redirect("feed")

    text = request.POST.get("text", "").strip()
    if not text:
        if request.headers.get("x-requested-with"):
            return JsonResponse({"error": "empty"}, status=400)
        return redirect("feed")

    c = Comment.objects.create(
        post=post,
        author=request.user,
        text=text,
    )

    if request.headers.get("x-requested-with"):
        html = render_comment_html(c, request, level=0)
        return JsonResponse({
            "html": html,
            "post_id": post.id,
            "comment_id": c.id,
            "comments_count": post.comments.count(),
        })

    return redirect("feed")


@login_required
def add_reply(request, comment_id):
    """Добавление ответа на комментарий."""
    parent = get_object_or_404(Comment, pk=comment_id)

    text = request.POST.get("text", "").strip()
    if not text:
        if request.headers.get("x-requested-with"):
            return JsonResponse({"error": "empty"}, status=400)
        return redirect("feed")

    reply = Comment.objects.create(
        post=parent.post,
        author=request.user,
        parent=parent,
        text=text,
    )

    if request.headers.get("x-requested-with"):
        html = render_comment_html(reply, request, level=20)
        return JsonResponse({
            "html": html,
            "post_id": parent.post.id,
            "parent_id": parent.id,
            "comment_id": reply.id,
            "comments_count": parent.post.comments.count(),
        })

    return redirect("feed")


@login_required
def delete_comment(request, comment_id):
    c = get_object_or_404(Comment, pk=comment_id)

    if request.method == "POST":
        if request.user == c.author or request.user.is_superuser:
            post_id = c.post.id
            c.delete()

            if request.headers.get("x-requested-with"):
                return JsonResponse({
                    "ok": True,
                    "post_id": post_id,
                })

    return redirect(request.META.get("HTTP_REFERER", "feed"))


@login_required
def toggle_comment_like(request, comment_id):
    c = get_object_or_404(Comment, pk=comment_id)
    like, created = CommentLike.objects.get_or_create(user=request.user, comment=c)

    liked = created
    if not created:
        like.delete()

    if request.headers.get("x-requested-with"):
        return JsonResponse({
            "liked": liked,
            "likes_count": c.likes.count()
        })

    return redirect("feed")


# ======================================================
# ПРОФИЛИ
# ======================================================

@login_required
def profile_view(request):
    return user_profile(request, username=request.user.username)


def user_profile(request, username):
    profile_user = get_object_or_404(User, username=username)

    posts = (
        Post.objects.filter(author=profile_user)
        .prefetch_related(
            "likes",
            "comments__author",
            "comments__likes",
            "comments__replies",
        )
        .annotate(
            top_comments_count=Count(
                "comments", filter=Q(comments__parent__isnull=True)
            )
        )
        .order_by("-created_at")
    )

    is_owner = request.user.is_authenticated and request.user == profile_user

    # большая кнопка "Подписаться / Вы подписаны" в шапке профиля
    is_following = False
    if request.user.is_authenticated and not is_owner:
        is_following = Follow.objects.filter(
            follower=request.user,
            following=profile_user,
        ).exists()

    liked_posts_ids = []
    liked_comment_ids = []
    following_ids = []

    if request.user.is_authenticated:
        liked_posts_ids = list(
            Like.objects.filter(user=request.user)
            .values_list("post_id", flat=True)
        )
        liked_comment_ids = list(
            CommentLike.objects.filter(user=request.user)
            .values_list("comment_id", flat=True)
        )
        following_ids = list(
            Follow.objects.filter(follower=request.user)
            .values_list("following_id", flat=True)
        )

    form = None
    if is_owner:
        if request.method == "POST":
            # ВАЖНО: передаём request.FILES
            form = ProfileForm(
                request.POST,
                request.FILES,
                instance=profile_user,
            )
            if form.is_valid():
                form.save()
                messages.success(request, "Профиль обновлён.")
                return redirect("profile")
        else:
            form = ProfileForm(instance=profile_user)

    return render(
        request,
        "core/profile.html",
        {
            "profile_user": profile_user,
            "posts": posts,
            "is_owner": is_owner,
            "is_following": is_following,
            "form": form,
            "liked_posts_ids": liked_posts_ids,
            "liked_comment_ids": liked_comment_ids,
            "following_ids": following_ids,
        },
    )

# ======================================================
# ПОДПИСКИ
# ======================================================

@login_required
def follow_user(request, username):
    target = get_object_or_404(User, username=username)

    if target != request.user:
        Follow.objects.get_or_create(follower=request.user, following=target)

    if request.headers.get("x-requested-with"):
        return JsonResponse({
            "ok": True,
            "following": True,
            "followers_count": Follow.objects.filter(following=target).count()
        })

    return redirect("user_profile", username=username)


@login_required
def unfollow_user(request, username):
    target = get_object_or_404(User, username=username)

    if target != request.user:
        Follow.objects.filter(follower=request.user, following=target).delete()

    if request.headers.get("x-requested-with"):
        return JsonResponse({
            "ok": True,
            "following": False,
            "followers_count": Follow.objects.filter(following=target).count()
        })

    return redirect("user_profile", username=username)


# ======================================================
# ПОСТ ДЕТАЙЛ (толко 1 пост на странице)
# ======================================================

def post_detail(request, pk):
    post = get_object_or_404(
        Post.objects.select_related("author", "community")
        .prefetch_related("likes", "comments__author", "comments__likes"),
        pk=pk
    )

    state = get_user_state(request.user)

    return render(request, "core/post_detail.html", {
        "post": post,
        "posts": [post],     # чтобы partial'ы не ломались
        **state
    })


# ======================================================
# МЕССЕНДЖЕР
# ======================================================

# ======================================================
# МЕССЕНДЖЕР
# ======================================================

@login_required
def messages_inbox(request):
    threads = build_threads_for_user(request.user)
    return render(request, "core/messages_inbox.html", {"threads": threads})


@login_required
def messages_inbox_poll(request):
    if request.headers.get("x-requested-with") != "XMLHttpRequest":
        return JsonResponse({"error": "Bad request"}, status=400)

    threads = build_threads_for_user(request.user)
    html = render_to_string(
        "core/partials/messages_inbox_list.html",
        {"threads": threads},
        request=request,
    )
    return JsonResponse({"html": html})



def build_threads_for_user(user):
    qs = (
        Message.objects
        .filter(Q(sender=user) | Q(recipient=user))
        .select_related("sender", "recipient")
        .order_by("-created_at")
    )

    threads = []
    seen_ids = set()

    for msg in qs:
        other = msg.recipient if msg.sender == user else msg.sender
        if other.id in seen_ids:
            continue

        unread_count = Message.objects.filter(
            sender=other,
            recipient=user,
            is_read=False,
        ).count()

        threads.append({
            "other_user": other,
            "last_message": msg,
            "unread_count": unread_count,
        })
        seen_ids.add(other.id)

    return threads

@login_required
def messages_thread(request, username):
    other = get_object_or_404(User, username=username)

    msgs_qs = Message.objects.filter(
        Q(sender=request.user, recipient=other) |
        Q(sender=other, recipient=request.user)
    ).order_by("created_at")

    msgs = list(msgs_qs)
    last_id = msgs[-1].id if msgs else 0

    # помечаем входящие как прочитанные
    Message.objects.filter(
        sender=other,
        recipient=request.user,
        is_read=False,
    ).update(is_read=True)

    if request.method == "POST" and not request.headers.get("x-requested-with"):
        form = MessageForm(request.POST)
        if form.is_valid():
            Message.objects.create(
                sender=request.user,
                recipient=other,
                text=form.cleaned_data["text"],
            )
            return redirect("messages_thread", username=other.username)
    else:
        form = MessageForm()

    threads = build_threads_for_user(request.user)

    context = {
        "other_user": other,
        "messages": msgs,
        "form": form,
        "last_id": last_id,
        "threads": threads,
    }

    # AJAX-запрос из SPA — отдаём только правую часть (.tg-chat)
    if request.headers.get("x-requested-with") == "XMLHttpRequest":
        html = render_to_string(
            "core/partials/messages_thread_chat.html",
            context,
            request=request,
        )
        return HttpResponse(html)

    # обычный рендер всей страницы
    return render(request, "core/messages_thread.html", context)

@login_required
def messages_delete_thread(request, username):
    other = get_object_or_404(User, username=username)

    if request.method != "POST":
        if request.headers.get("x-requested-with") == "XMLHttpRequest":
            return JsonResponse({"error": "Only POST allowed"}, status=400)
        return redirect("messages_inbox")

    # удалить все сообщения в обе стороны
    Message.objects.filter(
        Q(sender=request.user, recipient=other) |
        Q(sender=other, recipient=request.user)
    ).delete()

    if request.headers.get("x-requested-with") == "XMLHttpRequest":
        return JsonResponse({"ok": True})

    return redirect("messages_inbox")

@login_required
def messages_send(request, username):
    if request.method != "POST":
        return JsonResponse({"error": "Only POST"}, status=400)

    other = get_object_or_404(User, username=username)
    text = request.POST.get("text", "").strip()
    if not text:
        return JsonResponse({"error": "empty"}, status=400)

    msg = Message.objects.create(
        sender=request.user,
        recipient=other,
        text=text,
    )

    html = render_to_string(
        "core/partials/message_item.html",
        {"message": msg},
        request=request,
    )
    return JsonResponse({"html": html, "id": msg.id})

@login_required
def messages_unread_count(request):
    """Возвращает общее количество непрочитанных входящих сообщений."""
    total = Message.objects.filter(
        recipient=request.user,
        is_read=False,
    ).count()
    return JsonResponse({"count": total})

@login_required
def messages_poll(request, username):
    other = get_object_or_404(User, username=username)

    try:
        last_id = int(request.GET.get("after", 0))
    except (TypeError, ValueError):
        last_id = 0

    new_msgs_qs = Message.objects.filter(
        Q(sender=request.user, recipient=other) |
        Q(sender=other, recipient=request.user)
    ).filter(id__gt=last_id).order_by("created_at")

    new_msgs = list(new_msgs_qs)

    # помечаем новые входящие как прочитанные
    to_mark_ids = [m.id for m in new_msgs
                   if m.recipient_id == request.user.id and not m.is_read]
    if to_mark_ids:
        Message.objects.filter(id__in=to_mark_ids).update(is_read=True)

    html = "".join(
        render_to_string(
            "core/partials/message_item.html",
            {"message": m},
            request=request,
        )
        for m in new_msgs
    )

    return JsonResponse({"html": html, "count": len(new_msgs)})

# ======================================================
# РЕГИСТРАЦИЯ / ЛОГИН / ЛОГАУТ
# ======================================================

def register_view(request):
    if request.method == "POST":
        form = RegisterForm(request.POST)
        if form.is_valid():
            user = form.save()
            login(request, user)
            return redirect("feed")
    else:
        form = RegisterForm()

    return render(request, "core/register.html", {"form": form})


def login_view(request):
    if request.method == "POST":
        form = AuthenticationForm(request, data=request.POST)
        if form.is_valid():
            login(request, form.get_user())
            return redirect("feed")
    else:
        form = AuthenticationForm(request)

    return render(request, "core/login.html", {"form": form})


def logout_view(request):
    logout(request)
    return redirect("feed")


# ======================================================
# КОМЬЮНИТИ-БОЛЬШАЯ КНОПКА
# ======================================================

def communities_view(request):
    """Список сообществ."""
    communities = Community.objects.all().order_by("name")

    member_ids = set()
    admin_ids = set()
    if request.user.is_authenticated:
        qs = CommunityMembership.objects.filter(user=request.user)
        member_ids = set(qs.values_list("community_id", flat=True))
        admin_ids = set(qs.filter(is_admin=True).values_list("community_id", flat=True))

    return render(request, "core/communities.html", {
        "communities": communities,
        "member_ids": member_ids,
        "admin_ids": admin_ids,
    })


@login_required
def community_create(request):
    if request.method == "POST":
        form = CommunityForm(request.POST, request.FILES)
        if form.is_valid():
            community = form.save(commit=False)
            community.created_by = request.user
            community.save()

            CommunityMembership.objects.get_or_create(
                community=community,
                user=request.user,
                defaults={"is_admin": True},
            )
            return redirect("community_detail", slug=community.slug)
    else:
        form = CommunityForm()

    return render(request, "core/community_create.html", {"form": form})


def community_detail(request, slug):
    community = get_object_or_404(Community, slug=slug)

    is_member = False
    is_admin = False
    if request.user.is_authenticated:
        m = CommunityMembership.objects.filter(community=community, user=request.user).first()
        is_member = bool(m)
        is_admin = bool(m and m.is_admin)

    posts_qs = (
        Post.objects.filter(community=community)
        .select_related("author", "community")
        .prefetch_related(
            "likes",
            "comments__author",
            "comments__likes",
            "comments__replies",
        )
        .annotate(
            top_comments_count=Count(
                "comments",
                filter=Q(comments__parent__isnull=True),
            )
        )
        .order_by("-created_at")
    )

    state = get_user_state(request.user)

    post_form = None
    if request.user.is_authenticated and is_member:
        post_form = CommunityPostForm()

    return render(request, "core/community_detail.html", {
        "community": community,
        "is_member": is_member,
        "is_admin": is_admin,
        "posts": posts_qs,
        "post_form": post_form,
        **state,
    })


@login_required
def community_join(request, slug):
    community = get_object_or_404(Community, slug=slug)
    if request.method != "POST":
        return redirect("community_detail", slug=slug)

    CommunityMembership.objects.get_or_create(
        community=community,
        user=request.user,
        defaults={"is_admin": False},
    )
    return redirect("community_detail", slug=slug)


@login_required
def community_leave(request, slug):
    community = get_object_or_404(Community, slug=slug)
    if request.method != "POST":
        return redirect("community_detail", slug=slug)

    membership = CommunityMembership.objects.filter(community=community, user=request.user).first()
    if not membership:
        return redirect("community_detail", slug=slug)

    # Создатель сообщества не может выйти (минимальная защита от "сироты")
    if community.created_by_id == request.user.id:
        messages.error(request, "Создатель сообщества не может выйти. Передайте управление другому администратору (позже добавим).")
        return redirect("community_detail", slug=slug)

    # Если пользователь админ и он последний админ — не даём выйти
    if membership.is_admin:
        admins_count = CommunityMembership.objects.filter(community=community, is_admin=True).count()
        if admins_count <= 1:
            messages.error(request, "Нельзя выйти: вы последний администратор сообщества.")
            return redirect("community_detail", slug=slug)

    membership.delete()
    return redirect("communities")


@login_required
def community_edit(request, slug):
    community = get_object_or_404(Community, slug=slug)
    if not community.is_admin(request.user) and not request.user.is_superuser:
        return HttpResponseForbidden("Нет доступа")

    if request.method == "POST":
        form = CommunityForm(request.POST, request.FILES, instance=community)
        if form.is_valid():
            form.save()
            messages.success(request, "Сообщество обновлено.")
            return redirect("community_detail", slug=community.slug)
    else:
        form = CommunityForm(instance=community)

    return render(request, "core/community_edit.html", {"community": community, "form": form})


@login_required
def community_create_post(request, slug):
    community = get_object_or_404(Community, slug=slug)
    if request.method != "POST":
        return redirect("community_detail", slug=slug)

    membership = CommunityMembership.objects.filter(community=community, user=request.user).first()
    if not membership:
        messages.error(request, "Чтобы писать в сообществе — сначала вступите.")
        return redirect("community_detail", slug=slug)

    form = CommunityPostForm(request.POST)
    if not form.is_valid():
        messages.error(request, "Пост не может быть пустым.")
        return redirect("community_detail", slug=slug)

    post = form.save(commit=False)
    post.author = request.user
    post.community = community

    want_as = bool(request.POST.get("post_as_community"))
    post.as_community = bool(want_as and membership.is_admin)
    post.save()

    return redirect("community_detail", slug=slug)
