from django.contrib import messages
from django.contrib.auth import login, logout
from django.contrib.auth.forms import AuthenticationForm
from django.contrib.auth.decorators import login_required
from django.db.models import Q, Count
from django.http import JsonResponse
from django.shortcuts import render, redirect, get_object_or_404
from django.template.loader import render_to_string


from .forms import RegisterForm, PostForm, MessageForm, ProfileForm
from .models import (
    Post,
    User,
    Message,
    Follow,
    Like,
    Comment,
    CommentLike,
)


# ============================
# ЛЕНТА / ПОСТЫ
# ============================


def feed(request):
    posts = (
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
                "comments", filter=Q(comments__parent__isnull=True)
            )
        )
        .order_by("-created_at")
    )

    form = PostForm()

    if request.user.is_authenticated:
        following_ids = list(
            Follow.objects.filter(follower=request.user)
            .values_list("following_id", flat=True)
        )
        liked_posts_ids = list(
            Like.objects.filter(user=request.user)
            .values_list("post_id", flat=True)
        )
        liked_comment_ids = list(
            CommentLike.objects.filter(user=request.user)
            .values_list("comment_id", flat=True)
        )
    else:
        following_ids = []
        liked_posts_ids = []
        liked_comment_ids = []

    # создание поста, если форма отправлена на /
    if request.method == "POST":
        if not request.user.is_authenticated:
            messages.error(request, "Чтобы писать посты, нужно войти.")
            return redirect("login")

        form = PostForm(request.POST)
        if form.is_valid():
            post = form.save(commit=False)
            post.author = request.user
            post.save()
            return redirect("feed")

    return render(
        request,
        "core/feed.html",
        {
            "posts": posts,
            "form": form,
            "following_ids": following_ids,
            "liked_posts_ids": liked_posts_ids,
            "liked_comment_ids": liked_comment_ids,
        },
    )


@login_required
def create_post(request):
    if request.method == "POST":
        form = PostForm(request.POST)
        if form.is_valid():
            post = form.save(commit=False)
            post.author = request.user
            post.save()
    return redirect("feed")


@login_required
def delete_post(request, pk):
    post = get_object_or_404(Post, pk=pk)

    if request.method == "POST":
        if request.user == post.author or request.user.is_superuser:
            post.delete()

    return redirect(request.META.get("HTTP_REFERER", "feed"))


@login_required
def toggle_like(request, pk):
    """Лайк/анлайк поста (AJAX)."""
    post = get_object_or_404(Post, pk=pk)

    if request.method == "POST":
        like, created = Like.objects.get_or_create(user=request.user, post=post)

        if not created:
            like.delete()
            liked = False
        else:
            liked = True

        likes_count = post.likes.count()

        if request.headers.get("x-requested-with") == "XMLHttpRequest":
            return JsonResponse(
                {
                    "liked": liked,
                    "likes_count": likes_count,
                }
            )

    return redirect("feed")


# ============================
# КОММЕНТАРИИ
# ============================


@login_required
def add_comment(request, post_id):
    post = get_object_or_404(Post, pk=post_id)

    if request.method == "POST":
        text = request.POST.get("text", "").strip()
        if text:
            Comment.objects.create(
                post=post,
                author=request.user,
                text=text,
            )

    return redirect(request.META.get("HTTP_REFERER", "feed"))


@login_required
def add_reply(request, comment_id):
    parent_comment = get_object_or_404(Comment, pk=comment_id)

    if request.method == "POST":
        text = request.POST.get("text", "").strip()
        if text:
            Comment.objects.create(
                post=parent_comment.post,
                author=request.user,
                parent=parent_comment,
                text=text,
            )

    return redirect(request.META.get("HTTP_REFERER", "feed"))


@login_required
def delete_comment(request, comment_id):
    comment = get_object_or_404(Comment, pk=comment_id)

    if request.method == "POST":
        if request.user == comment.author or request.user.is_superuser:
            comment.delete()

    return redirect(request.META.get("HTTP_REFERER", "feed"))


@login_required
def toggle_comment_like(request, comment_id):
    """Лайк/анлайк комментария (AJAX)."""
    comment = get_object_or_404(Comment, pk=comment_id)

    if request.method == "POST":
        like, created = CommentLike.objects.get_or_create(
            user=request.user,
            comment=comment,
        )
        if not created:
            like.delete()
            liked = False
        else:
            liked = True

        likes_count = comment.likes.count()

        if request.headers.get("x-requested-with") == "XMLHttpRequest":
            return JsonResponse(
                {
                    "liked": liked,
                    "likes_count": likes_count,
                }
            )

    return redirect("feed")


# ============================
# ПРОФИЛИ
# ============================


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

    # подписан ли текущий пользователь на profile_user
    is_following = False
    if request.user.is_authenticated and not is_owner:
        is_following = Follow.objects.filter(
            follower=request.user,
            following=profile_user,
        ).exists()

    liked_posts_ids = []
    liked_comment_ids = []
    if request.user.is_authenticated:
        liked_posts_ids = list(
            Like.objects.filter(user=request.user)
            .values_list("post_id", flat=True)
        )
        liked_comment_ids = list(
            CommentLike.objects.filter(user=request.user)
            .values_list("comment_id", flat=True)
        )

    form = None
    if is_owner:
        if request.method == "POST":
            form = ProfileForm(request.POST, instance=profile_user)
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
        },
    )


# ============================
# ПОДПИСКИ
# ============================


@login_required
def follow_user(request, username):
    target = get_object_or_404(User, username=username)
    if target != request.user:
        Follow.objects.get_or_create(follower=request.user, following=target)
    return redirect("user_profile", username=username)


@login_required
def unfollow_user(request, username):
    target = get_object_or_404(User, username=username)
    Follow.objects.filter(follower=request.user, following=target).delete()
    return redirect("user_profile", username=username)


# ============================
# РЕГИСТРАЦИЯ / ЛОГИН / ЛОГАУТ
# ============================


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
            user = form.get_user()
            login(request, user)
            return redirect("feed")
    else:
        form = AuthenticationForm(request)

    return render(request, "core/login.html", {"form": form})


def logout_view(request):
    logout(request)
    return redirect("feed")


# ============================
# ЛИЧНЫЕ СООБЩЕНИЯ
# ============================


@login_required
def messages_inbox(request):
    qs = (
        Message.objects.filter(
            Q(sender=request.user) | Q(recipient=request.user)
        )
        .select_related("sender", "recipient")
        .order_by("-created_at")
    )

    conversations = {}
    for msg in qs:
        other = msg.recipient if msg.sender == request.user else msg.sender
        if other not in conversations:
            conversations[other] = msg

    return render(
        request,
        "core/messages_inbox.html",
        {"conversations": conversations},
    )


@login_required
def messages_thread(request, username):
    other_user = get_object_or_404(User, username=username)

    messages_qs = (
        Message.objects.filter(
            Q(sender=request.user, recipient=other_user)
            | Q(sender=other_user, recipient=request.user)
        )
        .select_related("sender", "recipient")
        .order_by("created_at")
    )

    if request.method == "POST":
        form = MessageForm(request.POST)
        if form.is_valid():
            Message.objects.create(
                sender=request.user,
                recipient=other_user,
                text=form.cleaned_data["text"],
            )
            return redirect("messages_thread", username=other_user.username)
    else:
        form = MessageForm()

    return render(
        request,
        "core/messages_thread.html",
        {
            "other_user": other_user,
            "messages": messages_qs,
            "form": form,
        },
    )

@login_required
def add_comment(request, post_id):
    post = get_object_or_404(Post, pk=post_id)

    if request.method == "POST":
        text = request.POST.get("text", "").strip()
        if not text:
            # если AJAX — вернём ошибку, если обычный POST — просто редирект
            if request.headers.get("x-requested-with") == "XMLHttpRequest":
                return JsonResponse({"error": "empty"}, status=400)
            return redirect(request.META.get("HTTP_REFERER", "feed"))

        comment = Comment.objects.create(
            post=post,
            author=request.user,
            text=text,
        )

        # AJAX-ветка — возвращаем HTML одного комментария
        if request.headers.get("x-requested-with") == "XMLHttpRequest":
            html = render_to_string(
                "core/partials/comment.html",
                {
                    "c": comment,
                    "user": request.user,
                    "liked_comment_ids": [],
                    "level": 0,  # корневой комментарий
                },
                request=request,
            )
            return JsonResponse(
                {
                    "html": html,
                    "post_id": post.id,
                    "comment_id": comment.id,
                    "comments_count": post.comments.count(),
                }
            )

    # обычный POST — старая логика
    return redirect(request.META.get("HTTP_REFERER", "feed"))


@login_required
def add_reply(request, comment_id):
    parent_comment = get_object_or_404(Comment, pk=comment_id)

    if request.method == "POST":
        text = request.POST.get("text", "").strip()
        if not text:
            if request.headers.get("x-requested-with") == "XMLHttpRequest":
                return JsonResponse({"error": "empty"}, status=400)
            return redirect(request.META.get("HTTP_REFERER", "feed"))

        reply = Comment.objects.create(
            post=parent_comment.post,
            author=request.user,
            parent=parent_comment,
            text=text,
        )

        if request.headers.get("x-requested-with") == "XMLHttpRequest":
            html = render_to_string(
                "core/partials/comment.html",
                {
                    "c": reply,
                    "user": request.user,
                    "liked_comment_ids": [],
                    "level": 20,  # первый уровень вложенности
                },
                request=request,
            )
            return JsonResponse(
                {
                    "html": html,
                    "post_id": parent_comment.post.id,
                    "comment_id": reply.id,
                    "parent_id": parent_comment.id,
                    "comments_count": parent_comment.post.comments.count(),
                }
            )

    return redirect(request.META.get("HTTP_REFERER", "feed"))



def communities_view(request):
    return render(request, "core/communities.html")
