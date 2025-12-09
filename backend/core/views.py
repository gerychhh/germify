from django.contrib import messages
from django.contrib.auth import login, logout
from django.contrib.auth.forms import AuthenticationForm
from django.contrib.auth.decorators import login_required
from django.db.models import Q, Count
from django.shortcuts import render, redirect, get_object_or_404
from django.template.loader import render_to_string
from django.core.paginator import Paginator
from django.http import JsonResponse, HttpResponseForbidden


from .forms import RegisterForm, PostForm, MessageForm, ProfileForm
from .models import (
    Post,
    User,
    Message,
    Follow,
    Like,
    Comment,
    CommentLike,
    PostAttachment,
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
        .select_related("author")
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

    # Разрешаем удалять только автору или суперюзеру
    if request.user != post.author and not request.user.is_superuser:
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
        Post.objects.select_related("author")
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

@login_required
def messages_inbox(request):
    qs = (
        Message.objects.filter(Q(sender=request.user) | Q(recipient=request.user))
        .select_related("sender", "recipient")
        .order_by("-created_at")
    )

    conversations = {}
    for msg in qs:
        other = msg.recipient if msg.sender == request.user else msg.sender
        if other not in conversations:
            conversations[other] = msg

    return render(request, "core/messages_inbox.html", {
        "conversations": conversations,
    })


@login_required
def messages_inbox_poll(request):
    """
    AJAX-обновление списка диалогов.
    Возвращает HTML того же списка, что и на обычной странице.
    """
    if request.headers.get("x-requested-with") != "XMLHttpRequest":
        return JsonResponse({"error": "Bad request"}, status=400)

    qs = (
        Message.objects.filter(Q(sender=request.user) | Q(recipient=request.user))
        .select_related("sender", "recipient")
        .order_by("-created_at")
    )

    conversations = {}
    for msg in qs:
        other = msg.recipient if msg.sender == request.user else msg.sender
        if other not in conversations:
            conversations[other] = msg

    html = render_to_string(
        "core/partials/messages_inbox_list.html",
        {"conversations": conversations},
        request=request,
    )
    return JsonResponse({"html": html})


@login_required
def messages_thread(request, username):
    """
    Страница одного диалога.
    GET — просто отрисовка.
    POST — запасной вариант без JS (редирект как раньше).
    """
    other = get_object_or_404(User, username=username)

    msgs = (
        Message.objects.filter(
            Q(sender=request.user, recipient=other) |
            Q(sender=other, recipient=request.user)
        )
        .order_by("created_at")
    )

    # last_id для realtime-пула
    last_id = msgs.last().id if msgs.exists() else 0

    if request.method == "POST" and not request.headers.get("x-requested-with"):
        # Фолбэк без JS
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

    return render(request, "core/messages_thread.html", {
        "other_user": other,
        "messages": msgs,
        "form": form,
        "last_id": last_id,
    })


@login_required
def messages_send(request, username):
    """
    AJAX-отправка одного сообщения из чата.
    Возвращает HTML одного сообщения.
    """
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
def messages_poll(request, username):
    """
    AJAX-пул новых сообщений в одном диалоге.
    ?after=<last_id> — возвращаем только новые.
    """
    other = get_object_or_404(User, username=username)

    try:
        last_id = int(request.GET.get("after", 0))
    except (TypeError, ValueError):
        last_id = 0

    new_msgs = (
        Message.objects.filter(
            Q(sender=request.user, recipient=other) |
            Q(sender=other, recipient=request.user)
        )
        .filter(id__gt=last_id)
        .order_by("created_at")
    )

    html = "".join(
        render_to_string(
            "core/partials/message_item.html",
            {"message": m},
            request=request,
        )
        for m in new_msgs
    )

    return JsonResponse({"html": html, "count": new_msgs.count()})


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
    return render(request, "core/communities.html")
