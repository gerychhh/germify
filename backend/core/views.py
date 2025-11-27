from django.contrib import messages
from django.contrib.auth import login, logout
from django.contrib.auth.forms import AuthenticationForm
from django.contrib.auth.decorators import login_required
from django.db.models import Q
from django.shortcuts import render, redirect, get_object_or_404

from .forms import RegisterForm, PostForm, MessageForm
from .models import Post, User, Message


# ============================
# ЛЕНТА / ПОСТЫ
# ============================

def feed(request):
    posts = (
        Post.objects
        .select_related("author")
        .order_by("-created_at")
    )
    form = PostForm()

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

    # можно удалять только свои посты или будучи суперпользователем
    if request.user == post.author or request.user.is_superuser:
        if request.method == "POST":
            post.delete()

    return redirect("feed")


# ============================
# ПРОЧЕЕ (communities)
# ============================

def communities_view(request):
    return render(request, "core/communities.html")


# ============================
# ПРОФИЛИ
# ============================

@login_required
def profile_view(request):
    """
    /profile/ — всегда мой профиль.
    Просто переиспользуем общий обработчик по username.
    """
    return user_profile(request, username=request.user.username)


def user_profile(request, username):
    """
    /u/<username>/ — профиль любого пользователя (можно открыть по ссылке).
    """
    profile_user = get_object_or_404(User, username=username)
    posts = (
        Post.objects
        .filter(author=profile_user)
        .order_by("-created_at")
    )

    is_owner = request.user.is_authenticated and (request.user == profile_user)

    return render(
        request,
        "core/profile.html",   # один шаблон и для себя, и для чужих
        {
            "profile_user": profile_user,
            "posts": posts,
            "is_owner": is_owner,
        },
    )


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
    """
    Список диалогов: с кем переписывался текущий пользователь,
    + последнее сообщение в каждом диалоге.
    """
    qs = (
        Message.objects
        .filter(Q(sender=request.user) | Q(recipient=request.user))
        .select_related("sender", "recipient")
        .order_by("-created_at")
    )

    conversations = {}  # other_user -> last_message
    for msg in qs:
        other = msg.recipient if msg.sender == request.user else msg.sender
        if other not in conversations:
            conversations[other] = msg  # первое в qs – уже самое новое

    return render(
        request,
        "core/messages_inbox.html",
        {"conversations": conversations},
    )


@login_required
def messages_thread(request, username):
    """
    Конкретный диалог с пользователем username.
    """
    other_user = get_object_or_404(User, username=username)

    messages_qs = (
        Message.objects.filter(
            Q(sender=request.user, recipient=other_user) |
            Q(sender=other_user, recipient=request.user)
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
