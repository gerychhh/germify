from __future__ import annotations

from difflib import SequenceMatcher

from typing import Any, List, TypedDict

from django.http import HttpRequest

from django.contrib import messages
from django.contrib.auth import login, logout
from django.contrib.auth.forms import AuthenticationForm
from django.contrib.auth.decorators import login_required
from django.db.models import Q, Count, Case, When, Value, IntegerField, Max
from django.db import transaction
from django.shortcuts import render, redirect, get_object_or_404
from django.template.loader import render_to_string
from django.core.paginator import Paginator
from django.core.exceptions import PermissionDenied
from django.http import JsonResponse, HttpResponseForbidden, HttpResponse
from django.utils.text import slugify
from django.utils.http import url_has_allowed_host_and_scheme
from django.urls import reverse

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.test.client import RequestFactory
from django.views.decorators.http import require_GET
from core.consumers import user_group_name

from core.services.messages import (
    build_threads_for_user,
    get_or_create_dm_chat,
    get_other_user_for_dm,
    get_unread_total,
    mark_chat_read,
)



from .forms import RegisterForm, PostForm, PostEditForm, MessageForm, GroupChatCreateForm, ProfileForm, CommunityForm, CommunityPostForm
from .constants import MAX_ATTACHMENTS_PER_POST
from .models import (
    Post,
    User,
    Message,
    Chat,
    ChatMember,
    ChatMessage,
    ChatMessageAttachment,
    Follow,
    Like,
    Comment,
    CommentLike,
    PostAttachment,
    Community,
    CommunityMembership,
)


class UserState(TypedDict):
    liked_posts_ids: List[int]
    liked_comment_ids: List[int]
    following_ids: List[int]
    admin_community_ids: List[int]
    member_community_ids: List[int]


def _avatar_html(request, u: User, size: str = "sm") -> str:
    return render_to_string(
        "core/partials/avatar.html",
        {"user_obj": u, "size": size},
        request=request,
    )

@require_GET
def profile_followers_json(request, username: str):
    profile_user = get_object_or_404(User, username=username)
    q = (request.GET.get("q") or "").strip().lower()

    rel = Follow.objects.filter(following=profile_user).select_related("follower")
    users = [r.follower for r in rel]

    if q:
        users = [
            u for u in users
            if q in (u.username or "").lower()
            or q in (u.display_name or "").lower()
        ]

    items = []
    for u in users[:200]:
        items.append({
            "title": u.display_name or u.username,
            "subtitle": f"@{u.username}",
            "url": reverse("user_profile", kwargs={"username": u.username}),
            "avatar_html": _avatar_html(request, u, "sm"),
        })

    return JsonResponse({"success": True, "items": items, "total": len(users)})

@require_GET
def profile_following_json(request, username: str):
    profile_user = get_object_or_404(User, username=username)
    q = (request.GET.get("q") or "").strip().lower()

    rel = Follow.objects.filter(follower=profile_user).select_related("following")
    users = [r.following for r in rel]

    if q:
        users = [
            u for u in users
            if q in (u.username or "").lower()
            or q in (u.display_name or "").lower()
        ]

    items = []
    for u in users[:200]:
        items.append({
            "title": u.display_name or u.username,
            "subtitle": f"@{u.username}",
            "url": reverse("user_profile", kwargs={"username": u.username}),
            "avatar_html": _avatar_html(request, u, "sm"),
        })

    return JsonResponse({"success": True, "items": items, "total": len(users)})

@require_GET
def profile_communities_admin_json(request, username: str):
    profile_user = get_object_or_404(User, username=username)
    q = (request.GET.get("q") or "").strip().lower()

    mem_qs = (CommunityMembership.objects
              .filter(user=profile_user, is_admin=True)
              .select_related("community"))

    items = []
    for m in mem_qs[:200]:
        c = m.community
        if q and q not in (c.name or "").lower():
            continue

        icon_url = ""
        if getattr(c, "icon", None):
            try:
                icon_url = request.build_absolute_uri(c.icon.url)
            except Exception:
                icon_url = ""

        items.append({
            "title": c.name,
            "subtitle": f"@{c.slug}",
            "url": reverse("community_detail", kwargs={"slug": c.slug}),
            "avatar_url": icon_url,
            "fallback": (c.name or "•")[:1],
        })

    return JsonResponse({"success": True, "items": items, "total": mem_qs.count()})

@require_GET
def profile_communities_joined_json(request, username: str):
    profile_user = get_object_or_404(User, username=username)
    q = (request.GET.get("q") or "").strip().lower()

    # ВАЖНО: чтобы “не было 0”, считаем ВСЕ memberships, включая admin
    mem_qs = (CommunityMembership.objects
              .filter(user=profile_user)
              .select_related("community"))

    items = []
    for m in mem_qs[:200]:
        c = m.community
        if q and q not in (c.name or "").lower():
            continue

        icon_url = ""
        if getattr(c, "icon", None):
            try:
                icon_url = request.build_absolute_uri(c.icon.url)
            except Exception:
                icon_url = ""

        items.append({
            "title": c.name,
            "subtitle": f"@{c.slug}",
            "url": reverse("community_detail", kwargs={"slug": c.slug}),
            "avatar_url": icon_url,
            "fallback": (c.name or "•")[:1],
        })

    return JsonResponse({"success": True, "items": items, "total": mem_qs.count()})
def get_user_state(user: Any) -> UserState:
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


def render_post_html(post: Post, request: HttpRequest) -> str:
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


def render_comment_html(comment: Comment, request: HttpRequest, level: int) -> str:
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


def feed(request: HttpRequest) -> HttpResponse:
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

    paginator = Paginator(base_qs, 7)

    page_param = request.GET.get("page")
    try:
        page_number = int(page_param)
        if page_number < 1:
            page_number = 1
    except (TypeError, ValueError):
        page_number = 1

    page_obj = paginator.get_page(page_number)

    state = get_user_state(request.user)

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

    form = PostForm()

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
        "posts": page_obj.object_list,
        "form": form,
        "page_obj": page_obj,
        "has_next": page_obj.has_next(),
        "next_page": page_obj.next_page_number() if page_obj.has_next() else None,
        **state,
    }

    return render(request, "core/feed.html", context)


@login_required
def create_post(request):
    if request.method != "POST":
        return redirect("feed")

    is_ajax = bool(request.headers.get("x-requested-with"))

    # Сначала валидируем вложения, чтобы не создавать пост при ошибке
    files = request.FILES.getlist("attachments")

    if len(files) > MAX_ATTACHMENTS_PER_POST:
        msg = f"Максимум файлов в одном посте: {MAX_ATTACHMENTS_PER_POST}."
        if is_ajax:
            return JsonResponse({"success": False, "error": msg}, status=400)
        messages.error(request, msg)
        return redirect("feed")

    MAX_SIZE_MB = 500
    MAX_SIZE = MAX_SIZE_MB * 1024 * 1024

    for f in files:
        if f.size > MAX_SIZE:
            msg = f"Файл '{f.name}' превышает {MAX_SIZE_MB}MB."
            if is_ajax:
                return JsonResponse({"success": False, "error": msg}, status=400)
            messages.error(request, msg)
            return redirect("feed")

    form = PostForm(request.POST)

    if not form.is_valid():
        if is_ajax:
            return JsonResponse({"success": False, "errors": form.errors}, status=400)
        # для не-AJAX просто возвращаемся в ленту
        return redirect("feed")

    with transaction.atomic():
        post = form.save(commit=False)
        post.author = request.user
        post.save()

        for f in files:
            PostAttachment.objects.create(
                post=post,
                file=f,
                original_name=f.name,
            )

    if is_ajax:
        html = render_post_html(post, request)
        return JsonResponse({"success": True, "html": html})

    return redirect("feed")

@login_required
def delete_post(request, pk):
    post = get_object_or_404(Post, pk=pk)

    is_community_admin = False
    if post.community_id and post.as_community and request.user.is_authenticated:
        is_community_admin = CommunityMembership.objects.filter(
            community_id=post.community_id,
            user=request.user,
            is_admin=True,
        ).exists()

    if request.user != post.author and not request.user.is_superuser and not is_community_admin:
        if request.headers.get("x-requested-with") == "XMLHttpRequest":
            return HttpResponseForbidden("Нельзя удалить чужой пост")
        return HttpResponseForbidden("Нельзя удалить чужой пост")

    if request.method == "POST":
        post.delete()

        if request.headers.get("x-requested-with") == "XMLHttpRequest":
            return JsonResponse({"ok": True})

        return redirect("feed")

    return redirect(request.META.get("HTTP_REFERER", "feed"))



@login_required
def edit_post(request, pk):
    """Редактирование поста (текст + управление вложениями).

    Вложения:
    - существующие можно пометить на удаление (delete_attachment_ids)
    - новые можно добавить через attachments (multiple)
    """
    post = get_object_or_404(Post, pk=pk)

    # Права: автор, суперюзер, либо админ сообщества (только для постов "от лица сообщества")
    is_community_admin = False
    if post.community_id and post.as_community and request.user.is_authenticated:
        is_community_admin = CommunityMembership.objects.filter(
            community_id=post.community_id,
            user=request.user,
            is_admin=True,
        ).exists()

    if request.user != post.author and not request.user.is_superuser and not is_community_admin:
        if request.headers.get("x-requested-with") == "XMLHttpRequest":
            return HttpResponseForbidden("Нельзя редактировать чужой пост")
        return HttpResponseForbidden("Нельзя редактировать чужой пост")

    if request.method != "POST":
        return redirect(request.META.get("HTTP_REFERER", "feed"))

    is_ajax = bool(request.headers.get("x-requested-with"))

    # --- управление вложениями ---
    delete_ids_raw = request.POST.getlist("delete_attachment_ids")
    delete_ids = []
    for v in delete_ids_raw:
        try:
            delete_ids.append(int(v))
        except (TypeError, ValueError):
            continue

    new_files = request.FILES.getlist("attachments")

    # Сначала проверяем лимит по количеству
    remaining_count = post.attachments.exclude(id__in=delete_ids).count()
    if remaining_count + len(new_files) > MAX_ATTACHMENTS_PER_POST:
        msg = f"Максимум файлов в одном посте: {MAX_ATTACHMENTS_PER_POST}."
        if is_ajax:
            return JsonResponse({"success": False, "error": msg}, status=400)
        messages.error(request, msg)
        return redirect(request.META.get("HTTP_REFERER", "feed"))

    # Проверяем размер новых файлов (как при создании)
    MAX_SIZE_MB = 500
    MAX_SIZE = MAX_SIZE_MB * 1024 * 1024
    for f in new_files:
        if f.size > MAX_SIZE:
            msg = f"Файл '{f.name}' превышает {MAX_SIZE_MB}MB."
            if is_ajax:
                return JsonResponse({"success": False, "error": msg}, status=400)
            messages.error(request, msg)
            return redirect(request.META.get("HTTP_REFERER", "feed"))

    # --- валидируем текст ---
    form = PostEditForm(request.POST, instance=post)
    if not form.is_valid():
        if is_ajax:
            return JsonResponse({"success": False, "errors": form.errors}, status=400)
        messages.error(request, "Не удалось сохранить изменения поста.")
        return redirect(request.META.get("HTTP_REFERER", "feed"))

    with transaction.atomic():
        form.save()

        if delete_ids:
            PostAttachment.objects.filter(post=post, id__in=delete_ids).delete()

        for f in new_files:
            PostAttachment.objects.create(
                post=post,
                file=f,
                original_name=f.name,
            )

    # Перечитываем пост, чтобы шаблон получил актуальные вложения
    post = (
        Post.objects
        .select_related("author", "community")
        .prefetch_related("attachments")
        .get(pk=post.pk)
    )

    if is_ajax:
        html = render_post_html(post, request)
        return JsonResponse({"success": True, "html": html})

    return redirect(request.META.get("HTTP_REFERER", "feed"))

@login_required
def toggle_like(request, pk):
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


@login_required
def add_comment(request, post_id):
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
    communities_joined_count = CommunityMembership.objects.filter(
        user=profile_user, is_admin=False
    ).count()
    communities_admin_count = CommunityMembership.objects.filter(
        user=profile_user, is_admin=True
    ).count()
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
            "communities_admin_count": communities_admin_count,
            "communities_joined_count": communities_joined_count,
        },
    )


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


def post_detail(request, pk):
    post = get_object_or_404(
        Post.objects.select_related("author", "community")
        .prefetch_related("likes", "comments__author", "comments__likes"),
        pk=pk
    )

    state = get_user_state(request.user)

    return render(request, "core/post_detail.html", {
        "post": post,
        "posts": [post],
        **state
    })


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



# ---------------------------------------------------------------------------
# WS helpers for messages (group events: rename / members changes / kick)
# ---------------------------------------------------------------------------

_rf_messages = RequestFactory()


def _render_inbox_for_user(user: User) -> str:
    req = _rf_messages.get("/messages/_ws_render/")
    req.user = user
    threads = build_threads_for_user(user)
    return render_to_string("core/partials/messages_inbox_list.html", {"threads": threads}, request=req)


def _ws_send_to_user(user_id: int, payload: dict) -> None:
    channel_layer = get_channel_layer()
    if channel_layer is None:
        return
    async_to_sync(channel_layer.group_send)(
        user_group_name(int(user_id)),
        {"type": "notify", "payload": payload},
    )


def _ws_broadcast_to_chat(chat: Chat, payload_builder) -> None:
    """Send a WS payload to each active member of the chat.

    payload_builder(user) -> dict
    """
    memberships = (
        ChatMember.objects.filter(chat=chat, is_hidden=False)
        .select_related("user")
        .only("user__id", "user__username", "user__display_name")
    )
    for m in memberships:
        u = m.user
        payload = payload_builder(u)
        if payload:
            _ws_send_to_user(u.id, payload)


def _get_chat_or_404_for_user(request, chat_id: int):
    chat = get_object_or_404(Chat.objects.select_related("dm_user1", "dm_user2"), id=chat_id)
    member = ChatMember.objects.filter(chat=chat, user=request.user, is_hidden=False).first()
    if not member:
        raise PermissionDenied
    return chat


def _is_group_manager(chat: Chat, user: User) -> bool:
    """Owner/admin can manage group. Also allow chat.created_by as manager
    in case role is inconsistent in DB (defensive fix).
    """
    if chat.kind != Chat.KIND_GROUP:
        return False
    member = ChatMember.objects.filter(chat=chat, user=user, is_hidden=False).first()
    if member and member.role in (ChatMember.ROLE_OWNER, ChatMember.ROLE_ADMIN):
        return True
    return bool(chat.created_by_id and int(chat.created_by_id) == int(user.id))


def _redirect_next_or(request, fallback_viewname: str, **kwargs):
    """Redirect back to the page that opened an action form.

    We use it for inline management UI inside the chat header dropdown.
    """
    next_url = (request.POST.get("next") or request.GET.get("next") or "").strip()
    if next_url and url_has_allowed_host_and_scheme(
        next_url,
        allowed_hosts={request.get_host()},
        require_https=request.is_secure(),
    ):
        return redirect(next_url)
    return redirect(fallback_viewname, **kwargs)


def _render_chat_page(request, chat: Chat, other_user=None):
    if other_user is None:
        other_user = get_other_user_for_dm(chat, request.user)

    msgs_qs = (
        ChatMessage.objects.filter(chat=chat)
        .select_related("sender")
        .order_by("created_at")
    )
    msgs = list(msgs_qs)
    last_id = msgs[-1].id if msgs else 0

    # Mark read (server-side) when opening the chat.
    mark_chat_read(request.user, chat, last_id)

    form = MessageForm()
    threads = build_threads_for_user(request.user)

    members_count = ChatMember.objects.filter(chat=chat, is_hidden=False).count() if chat.kind == Chat.KIND_GROUP else 2

    chat_title = (
        (other_user.display_name or other_user.username) if other_user is not None else (chat.title or "Группа")
    )

    # Membership (only active membership matters for UI decisions)
    my_member = ChatMember.objects.filter(chat=chat, user=request.user, is_hidden=False).first()
    my_role = getattr(my_member, 'role', None)

    # Defensive: if creator's role drifted (e.g. due to manual DB edits/migrations),
    # restore it to OWNER so the UI + permissions remain usable.
    if (
        chat.kind == Chat.KIND_GROUP
        and chat.created_by_id
        and int(chat.created_by_id) == int(request.user.id)
        and my_member
        and my_member.role != ChatMember.ROLE_OWNER
    ):
        my_member.role = ChatMember.ROLE_OWNER
        my_member.save(update_fields=["role"])
        my_role = ChatMember.ROLE_OWNER

    is_manager = _is_group_manager(chat, request.user)
    can_delete = bool(chat.kind == Chat.KIND_GROUP and is_manager)
    can_manage = bool(chat.kind == Chat.KIND_GROUP and is_manager)

    # Preview members for the chat header (so user can see who is in the group).
    group_members_preview = []
    group_members = []
    dm_contacts_for_add = []
    if chat.kind == Chat.KIND_GROUP:
        memberships = (
            ChatMember.objects.filter(chat=chat, is_hidden=False)
            .select_related("user")
            .only("id", "role", "user__id", "user__username", "user__display_name", "user__avatar")
        )
        role_weight = {
            ChatMember.ROLE_OWNER: 0,
            ChatMember.ROLE_ADMIN: 1,
            ChatMember.ROLE_MEMBER: 2,
        }
        members_sorted = sorted(
            list(memberships),
            key=lambda m: (role_weight.get(m.role, 9), (m.user.username or "").lower()),
        )
        group_members_preview = [m.user for m in members_sorted[:6]]

        # Full members list for the dropdown under the title.
        # Include remove permissions (owner/admin only; admin cannot remove admins/owner).
        def can_remove_member(target: ChatMember) -> bool:
            if not can_manage:
                return False
            if int(target.user_id) == int(request.user.id):
                return False
            if target.role == ChatMember.ROLE_OWNER:
                return False
            if my_role == ChatMember.ROLE_OWNER:
                return True
            # admin can remove only regular members
            return target.role == ChatMember.ROLE_MEMBER

        group_members = [
            {
                "user": m.user,
                "role": m.role,
                "can_remove": can_remove_member(m),
            }
            for m in members_sorted
        ]

        # Eligible contacts to add: users from existing DM dialogs.
        # (As requested: simple “human” selector; global search can be added later.)
        dm_contacts = []
        seen_ids = set()
        for t in threads:
            if (t.get("kind") == Chat.KIND_DM) and t.get("other_user"):
                u = t["other_user"]
                if u.id and u.id != request.user.id and u.id not in seen_ids:
                    seen_ids.add(u.id)
                    dm_contacts.append(u)

        active_ids = {m["user"].id for m in group_members if m.get("user") and m["user"].id}
        dm_contacts_for_add = [u for u in dm_contacts if u.id not in active_ids] if can_manage else []

    context = {
        "chat": chat,
        "chat_title": chat_title,
        "other_user": other_user,
        "members_count": members_count,
        "group_members_preview": group_members_preview,
        "group_members": group_members,
        "dm_contacts": dm_contacts_for_add,
        "my_role": my_role,
        "can_delete": can_delete,
        "can_manage": can_manage,
        "messages": msgs,
        "form": form,
        "last_id": last_id,
        "threads": threads,
    }

    if request.headers.get("x-requested-with") == "XMLHttpRequest":
        html = render_to_string(
            "core/partials/messages_thread_chat.html",
            context,
            request=request,
        )
        return HttpResponse(html)

    return render(request, "core/messages_thread.html", context)


@login_required
def messages_thread(request, username):
    """Legacy DM URL: /messages/<username>/"""

    other = get_object_or_404(User, username=username)

    if other.id == request.user.id:
        return redirect("messages_inbox")

    chat = get_or_create_dm_chat(request.user, other)

    # Non-AJAX fallback (old behavior)
    if request.method == "POST" and request.headers.get("x-requested-with") != "XMLHttpRequest":
        form = MessageForm(request.POST)
        if form.is_valid():
            ChatMessage.objects.create(
                chat=chat,
                sender=request.user,
                text=form.cleaned_data["text"],
            )
            return redirect("messages_thread", username=other.username)

    return _render_chat_page(request, chat, other_user=other)


@login_required
def messages_chat(request, chat_id: int):
    """Group / DM chat by id: /messages/chat/<id>/"""

    try:
        chat = _get_chat_or_404_for_user(request, chat_id)
    except PermissionDenied:
        if request.headers.get("x-requested-with") == "XMLHttpRequest":
            return JsonResponse({"redirect": reverse("messages_inbox")}, status=403)
        return redirect("messages_inbox")


    # Non-AJAX fallback
    if request.method == "POST" and request.headers.get("x-requested-with") != "XMLHttpRequest":
        form = MessageForm(request.POST)
        if form.is_valid():
            ChatMessage.objects.create(
                chat=chat,
                sender=request.user,
                text=form.cleaned_data["text"],
            )
            return redirect("messages_chat", chat_id=chat.id)

    return _render_chat_page(request, chat)




@login_required
def messages_chat_header(request, chat_id: int):
    """Return only chat header HTML for realtime refresh (rename/members changes)."""
    try:
        chat = _get_chat_or_404_for_user(request, chat_id)
    except PermissionDenied:
        if request.headers.get("x-requested-with") == "XMLHttpRequest":
            return JsonResponse({"redirect": reverse("messages_inbox")}, status=403)
        return redirect("messages_inbox")

    other_user = get_other_user_for_dm(chat, request.user)

    # Build group-specific header context (members dropdown)
    members_count = 2
    group_members_preview = []
    group_members = []
    dm_contacts_for_add = []
    my_member = ChatMember.objects.filter(chat=chat, user=request.user, is_hidden=False).first()
    my_role = getattr(my_member, "role", None)

    if (
        chat.kind == Chat.KIND_GROUP
        and chat.created_by_id
        and int(chat.created_by_id) == int(request.user.id)
        and my_member
        and my_member.role != ChatMember.ROLE_OWNER
    ):
        my_member.role = ChatMember.ROLE_OWNER
        my_member.save(update_fields=["role"])
        my_role = ChatMember.ROLE_OWNER

    can_manage = _is_group_manager(chat, request.user)
    can_delete = bool(chat.kind == Chat.KIND_GROUP and can_manage)

    if chat.kind == Chat.KIND_GROUP:
        memberships = (
            ChatMember.objects.filter(chat=chat, is_hidden=False)
            .select_related("user")
            .only("id", "role", "user__id", "user__username", "user__display_name", "user__avatar")
        )
        role_weight = {
            ChatMember.ROLE_OWNER: 0,
            ChatMember.ROLE_ADMIN: 1,
            ChatMember.ROLE_MEMBER: 2,
        }
        members_sorted = sorted(
            list(memberships),
            key=lambda m: (role_weight.get(m.role, 9), (m.user.username or "").lower()),
        )
        members_count = len(members_sorted)
        group_members_preview = [m.user for m in members_sorted[:6]]

        def can_remove_member(target: ChatMember) -> bool:
            if not can_manage:
                return False
            if int(target.user_id) == int(request.user.id):
                return False
            if target.role == ChatMember.ROLE_OWNER:
                return False
            if my_role == ChatMember.ROLE_OWNER:
                return True
            return target.role == ChatMember.ROLE_MEMBER

        group_members = [
            {"user": m.user, "role": m.role, "can_remove": can_remove_member(m)}
            for m in members_sorted
        ]

        # Contacts to add = users from existing DM dialogs
        threads = build_threads_for_user(request.user)
        dm_contacts = []
        seen_ids = set()
        for t in threads:
            if (t.get("kind") == Chat.KIND_DM) and t.get("other_user"):
                u = t["other_user"]
                if u.id and u.id != request.user.id and u.id not in seen_ids:
                    seen_ids.add(u.id)
                    dm_contacts.append(u)

        active_ids = {m["user"].id for m in group_members if m.get("user") and m["user"].id}
        dm_contacts_for_add = [u for u in dm_contacts if u.id not in active_ids] if can_manage else []

    html = render_to_string(
        "core/partials/messages_thread_header.html",
        {
            "chat": chat,
            "other_user": other_user,
            "members_count": members_count,
            "group_members_preview": group_members_preview,
            "group_members": group_members,
            "dm_contacts": dm_contacts_for_add,
            "my_role": my_role,
            "can_delete": can_delete,
            "can_manage": can_manage,
        },
        request=request,
    )
    return HttpResponse(html)

@login_required
def messages_delete_thread(request, username):
    """Legacy DM delete endpoint."""

    other = get_object_or_404(User, username=username)

    if request.method != "POST":
        if request.headers.get("x-requested-with") == "XMLHttpRequest":
            return JsonResponse({"error": "Only POST allowed"}, status=400)
        return redirect("messages_inbox")

    # Delete DM chat + history (same behavior as before)
    try:
        u1, u2 = (request.user.id, other.id) if request.user.id < other.id else (other.id, request.user.id)
        chat = Chat.objects.filter(kind=Chat.KIND_DM, dm_user1_id=u1, dm_user2_id=u2).first()
        if chat:
            chat.delete()
        else:
            # fallback for very old DB (before migration)
            Message.objects.filter(
                Q(sender=request.user, recipient=other) |
                Q(sender=other, recipient=request.user)
            ).delete()
    except Exception:
        # never crash on delete
        pass

    if request.headers.get("x-requested-with") == "XMLHttpRequest":
        return JsonResponse({"ok": True})

    return redirect("messages_inbox")


@login_required
def messages_chat_leave(request, chat_id: int):
    if request.method != "POST":
        return JsonResponse({"error": "Only POST"}, status=400)

    chat = get_object_or_404(Chat, id=chat_id)
    # "Leave" = hide + stop notifications (keeps history if needed)
    ChatMember.objects.filter(chat=chat, user=request.user).update(is_hidden=True, unread_count=0)

    if request.headers.get("x-requested-with") == "XMLHttpRequest":
        return JsonResponse({"ok": True})
    return redirect("messages_inbox")


@login_required
def messages_chat_delete(request, chat_id: int):
    """Delete a group chat (owner/admin only).

    Defensive: creator can delete even if role is inconsistent in DB.
    """

    if request.method != "POST":
        return JsonResponse({"error": "Only POST"}, status=400)

    chat = get_object_or_404(Chat, id=chat_id)
    if not _is_group_manager(chat, request.user):
        return JsonResponse({"error": "Forbidden"}, status=403)

    chat.delete()

    if request.headers.get("x-requested-with") == "XMLHttpRequest":
        return JsonResponse({"ok": True})
    return redirect("messages_inbox")



@login_required
def messages_chat_manage(request, chat_id: int):
    """Manage a group chat (rename, add/remove members).

    Only owner/admin can manage. Defensive: creator can manage even if role is inconsistent.
    """

    try:
        chat = _get_chat_or_404_for_user(request, chat_id)
    except PermissionDenied:
        return redirect("messages_inbox")

    if chat.kind != Chat.KIND_GROUP:
        return redirect("messages_chat", chat_id=chat.id)

    my_member = ChatMember.objects.filter(chat=chat, user=request.user, is_hidden=False).first()

    # Any member can open the "members" page. Only managers can rename / add / remove.
    can_manage = _is_group_manager(chat, request.user)

    my_role = getattr(my_member, 'role', None)
    if chat.created_by_id and int(chat.created_by_id) == int(request.user.id):
        # Treat creator as owner for UI logic if needed
        my_role = ChatMember.ROLE_OWNER
        if my_member and my_member.role != ChatMember.ROLE_OWNER:
            my_member.role = ChatMember.ROLE_OWNER
            my_member.save(update_fields=["role"])

    threads = build_threads_for_user(request.user)

    # Contacts = users from existing DM dialogs (same approach as group create)
    dm_contacts = []
    seen_ids = set()
    for t in threads:
        if (t.get('kind') == Chat.KIND_DM) and t.get('other_user'):
            u = t['other_user']
            if u.id and u.id != request.user.id and u.id not in seen_ids:
                seen_ids.add(u.id)
                dm_contacts.append(u)

    memberships = (
        ChatMember.objects.filter(chat=chat, is_hidden=False)
        .select_related('user')
    )

    role_weight = {
        ChatMember.ROLE_OWNER: 0,
        ChatMember.ROLE_ADMIN: 1,
        ChatMember.ROLE_MEMBER: 2,
    }
    members = sorted(
        list(memberships),
        key=lambda m: (role_weight.get(m.role, 9), (m.user.username or '').lower()),
    )

    active_ids = {m.user_id for m in members}
    eligible_contacts = [u for u in dm_contacts if u.id not in active_ids and u.id != request.user.id] if can_manage else []

    def can_remove(target: ChatMember) -> bool:
        if not can_manage:
            return False
        if target.user_id == request.user.id:
            return False
        if target.role == ChatMember.ROLE_OWNER:
            return False
        if my_role == ChatMember.ROLE_OWNER:
            return True
        return target.role == ChatMember.ROLE_MEMBER

    members_view = [
        {'m': m, 'user': m.user, 'can_remove': can_remove(m)}
        for m in members
    ]

    return render(
        request,
        'core/messages_group_manage.html',
        {
            'chat': chat,
            'threads': threads,
            'members': members_view,
            'dm_contacts': eligible_contacts,
            'my_role': my_role,
            'can_manage': can_manage,
        },
    )


@login_required
def messages_chat_rename(request, chat_id: int):
    if request.method != "POST":
        return redirect("messages_chat_manage", chat_id=chat_id)

    chat = _get_chat_or_404_for_user(request, chat_id)
    if chat.kind != Chat.KIND_GROUP:
        return redirect("messages_chat", chat_id=chat.id)

    my_member = ChatMember.objects.filter(chat=chat, user=request.user, is_hidden=False).first()
    if not _is_group_manager(chat, request.user):
        raise PermissionDenied

    title = (request.POST.get("title") or "").strip()
    if not title:
        messages.error(request, "Название не может быть пустым")
        return _redirect_next_or(request, "messages_chat_manage", chat_id=chat.id)

    if len(title) > 255:
        title = title[:255]

    chat.title = title
    chat.save(update_fields=["title", "updated_at"])

    # Realtime: notify all group members about rename (update inbox + header)
    def _payload(u: User) -> dict:
        return {
            "type": "chat_renamed",
            "chat_id": chat.id,
            "title": chat.title,
            "inbox_html": _render_inbox_for_user(u),
            "unread_total": get_unread_total(u),
            "refresh_header": True,
        }
    _ws_broadcast_to_chat(chat, _payload)

    messages.success(request, "Название чата обновлено")
    return _redirect_next_or(request, "messages_chat_manage", chat_id=chat.id)


@login_required
def messages_chat_members_add(request, chat_id: int):
    if request.method != "POST":
        return redirect("messages_chat_manage", chat_id=chat_id)

    chat = _get_chat_or_404_for_user(request, chat_id)
    if chat.kind != Chat.KIND_GROUP:
        return redirect("messages_chat", chat_id=chat.id)

    my_member = ChatMember.objects.filter(chat=chat, user=request.user, is_hidden=False).first()
    if not _is_group_manager(chat, request.user):
        raise PermissionDenied

    # Allow adding only from existing DM contacts for now
    threads = build_threads_for_user(request.user)
    allowed_ids = set()
    for t in threads:
        if (t.get("kind") == Chat.KIND_DM) and t.get("other_user"):
            u = t["other_user"]
            if u.id and u.id != request.user.id:
                allowed_ids.add(int(u.id))

    members_ids = []
    for raw in request.POST.getlist("members_ids"):
        try:
            uid = int(raw)
        except (TypeError, ValueError):
            continue
        if uid in allowed_ids and uid != request.user.id:
            members_ids.append(uid)

    members_ids = list(dict.fromkeys(members_ids))

    if not members_ids:
        messages.error(request, "Выберите участников из списка")
        return _redirect_next_or(request, "messages_chat_manage", chat_id=chat.id)

    with transaction.atomic():
        for uid in members_ids:
            cm, created = ChatMember.objects.get_or_create(
                chat=chat,
                user_id=uid,
                defaults={"role": ChatMember.ROLE_MEMBER},
            )
            if not created and cm.is_hidden:
                cm.is_hidden = False
                cm.unread_count = 0
                cm.save(update_fields=["is_hidden", "unread_count"])


    # Realtime: notify members about added participants (inbox + header)
    added_ids = list(members_ids)
    def _payload(u: User) -> dict:
        return {
            "type": "chat_member_added",
            "chat_id": chat.id,
            "added_user_ids": added_ids,
            "inbox_html": _render_inbox_for_user(u),
            "unread_total": get_unread_total(u),
            "refresh_header": True,
        }
    _ws_broadcast_to_chat(chat, _payload)

    messages.success(request, "Участники добавлены")
    return _redirect_next_or(request, "messages_chat_manage", chat_id=chat.id)


@login_required
def messages_chat_members_remove(request, chat_id: int, user_id: int):
    if request.method != "POST":
        return redirect("messages_chat_manage", chat_id=chat_id)

    chat = _get_chat_or_404_for_user(request, chat_id)
    if chat.kind != Chat.KIND_GROUP:
        return redirect("messages_chat", chat_id=chat.id)

    my_member = ChatMember.objects.filter(chat=chat, user=request.user, is_hidden=False).first()
    if not _is_group_manager(chat, request.user):
        raise PermissionDenied


    effective_role = getattr(my_member, 'role', None)
    if (chat.created_by_id and int(chat.created_by_id) == int(request.user.id)):
        effective_role = ChatMember.ROLE_OWNER

    if int(user_id) == int(request.user.id):
        messages.error(request, "Чтобы выйти из чата, используйте кнопку «Выйти»")
        return _redirect_next_or(request, "messages_chat_manage", chat_id=chat.id)

    target = ChatMember.objects.filter(chat=chat, user_id=user_id, is_hidden=False).first()
    if not target:
        messages.error(request, "Участник не найден")
        return _redirect_next_or(request, "messages_chat_manage", chat_id=chat.id)

    if target.role == ChatMember.ROLE_OWNER:
        messages.error(request, "Нельзя удалить владельца чата")
        return _redirect_next_or(request, "messages_chat_manage", chat_id=chat.id)

    if effective_role == ChatMember.ROLE_ADMIN and target.role != ChatMember.ROLE_MEMBER:
        messages.error(request, "Админ может удалять только участников")
        return _redirect_next_or(request, "messages_chat_manage", chat_id=chat.id)

    target.is_hidden = True
    target.unread_count = 0
    target.save(update_fields=["is_hidden", "unread_count"])


    removed_user_id = int(user_id)

    # Realtime: notify removed user (kick) and remaining members (update header/inbox)
    try:
        removed_user = User.objects.only("id", "username", "display_name").get(id=removed_user_id)
    except User.DoesNotExist:
        removed_user = None

    if removed_user is not None:
        _ws_send_to_user(
            removed_user.id,
            {
                "type": "chat_access_revoked",
                "chat_id": chat.id,
                "redirect_url": reverse("messages_inbox"),
                "inbox_html": _render_inbox_for_user(removed_user),
                "unread_total": get_unread_total(removed_user),
                "reason": "removed",
            },
        )

    def _payload(u: User) -> dict:
        return {
            "type": "chat_member_removed",
            "chat_id": chat.id,
            "removed_user_id": removed_user_id,
            "inbox_html": _render_inbox_for_user(u),
            "unread_total": get_unread_total(u),
            "refresh_header": True,
        }
    _ws_broadcast_to_chat(chat, _payload)


    messages.success(request, "Участник удалён")
    return _redirect_next_or(request, "messages_chat_manage", chat_id=chat.id)


@login_required
def messages_chat_avatar_update(request, chat_id: int):
    """Update group chat avatar (upload or remove)."""
    if request.method != "POST":
        return _redirect_next_or(request, "messages_chat_manage", chat_id=chat_id)

    chat = _get_chat_or_404_for_user(request, chat_id)
    if chat.kind != Chat.KIND_GROUP:
        return redirect("messages_chat", chat_id=chat.id)

    if not _is_group_manager(chat, request.user):
        raise PermissionDenied

    remove = (request.POST.get("remove") or "").strip() == "1"
    uploaded = request.FILES.get("avatar")

    if remove:
        # Remove avatar
        if chat.avatar:
            try:
                chat.avatar.delete(save=False)
            except Exception:
                pass
        chat.avatar = None
        chat.save(update_fields=["avatar", "updated_at"])

    else:
        if not uploaded:
            messages.error(request, "Выберите изображение")
            return _redirect_next_or(request, "messages_chat_manage", chat_id=chat.id)

        # Basic validation
        ctype = getattr(uploaded, "content_type", "") or ""
        if not ctype.startswith("image/"):
            messages.error(request, "Файл должен быть изображением")
            return _redirect_next_or(request, "messages_chat_manage", chat_id=chat.id)

        if getattr(uploaded, "size", 0) and uploaded.size > 10 * 1024 * 1024:
            messages.error(request, "Файл слишком большой (макс 10MB)")
            return _redirect_next_or(request, "messages_chat_manage", chat_id=chat.id)

        chat.avatar = uploaded
        chat.save(update_fields=["avatar", "updated_at"])

    # Realtime: refresh header + inbox for all members
    def _payload(u: User) -> dict:
        return {
            "type": "chat_avatar_updated",
            "chat_id": chat.id,
            "inbox_html": _render_inbox_for_user(u),
            "unread_total": get_unread_total(u),
            "refresh_header": True,
        }
    _ws_broadcast_to_chat(chat, _payload)

    messages.success(request, "Аватар группы обновлён")
    return _redirect_next_or(request, "messages_chat_manage", chat_id=chat.id)


@login_required
def messages_send(request, username):
    """Legacy DM send endpoint: /messages/<username>/send/"""

    if request.method != "POST":
        return JsonResponse({"error": "Only POST"}, status=400)

    other = get_object_or_404(User, username=username)
    if other.id == request.user.id:
        return JsonResponse({"error": "self"}, status=400)

    text = (request.POST.get("text", "") or "").strip()
    files = request.FILES.getlist("attachments")

    # Разрешаем отправку без текста, если есть вложения/голосовое
    if not text and not files:
        return JsonResponse({"error": "empty"}, status=400)

    if len(files) > MAX_ATTACHMENTS_PER_POST:
        return JsonResponse(
            {"error": f"Максимум файлов в одном сообщении: {MAX_ATTACHMENTS_PER_POST}."},
            status=400,
        )

    chat = get_or_create_dm_chat(request.user, other)

    # Важно: создаём сообщение и вложения в одном atomic, чтобы WS-уведомление
    # (signals.py) улетало уже с готовыми вложениями.
    with transaction.atomic():
        msg = ChatMessage.objects.create(
            chat=chat,
            sender=request.user,
            text=text,
        )

        for f in files:
            ChatMessageAttachment.objects.create(
                message=msg,
                file=f,
                original_name=getattr(f, "name", "") or "",
            )

    html = render_to_string(
        "core/partials/message_item.html",
        {"message": msg},
        request=request,
    )

    return JsonResponse({"html": html, "id": msg.id, "chat_id": chat.id})


@login_required
def messages_chat_send(request, chat_id: int):
    if request.method != "POST":
        return JsonResponse({"error": "Only POST"}, status=400)

    try:
        chat = _get_chat_or_404_for_user(request, chat_id)
    except PermissionDenied:
        return JsonResponse({"redirect": reverse("messages_inbox")}, status=403)

    text = (request.POST.get("text", "") or "").strip()
    files = request.FILES.getlist("attachments")

    # Разрешаем отправку без текста, если есть вложения/голосовое
    if not text and not files:
        return JsonResponse({"error": "empty"}, status=400)

    if len(files) > MAX_ATTACHMENTS_PER_POST:
        return JsonResponse(
            {"error": f"Максимум файлов в одном сообщении: {MAX_ATTACHMENTS_PER_POST}."},
            status=400,
        )

    # Важно: создаём сообщение и вложения в одном atomic, чтобы WS-уведомление
    # (signals.py) улетало уже с готовыми вложениями.
    with transaction.atomic():
        msg = ChatMessage.objects.create(
            chat=chat,
            sender=request.user,
            text=text,
        )

        for f in files:
            ChatMessageAttachment.objects.create(
                message=msg,
                file=f,
                original_name=getattr(f, "name", "") or "",
            )

    html = render_to_string(
        "core/partials/message_item.html",
        {"message": msg},
        request=request,
    )

    return JsonResponse({"html": html, "id": msg.id, "chat_id": chat.id})


@login_required
def messages_unread_count(request):
    return JsonResponse({"count": get_unread_total(request.user)})


@login_required
def messages_poll(request, username):
    """Legacy DM poll endpoint."""

    other = get_object_or_404(User, username=username)
    chat = get_or_create_dm_chat(request.user, other)

    try:
        last_id = int(request.GET.get("after", 0))
    except (TypeError, ValueError):
        last_id = 0

    new_msgs_qs = (
        ChatMessage.objects.filter(chat=chat, id__gt=last_id)
        .select_related("sender")
        .prefetch_related("attachments")
        .order_by("created_at")
    )
    new_msgs = list(new_msgs_qs)

    if new_msgs:
        mark_chat_read(request.user, chat, new_msgs[-1].id)

    html = "".join(
        render_to_string(
            "core/partials/message_item.html",
            {"message": m},
            request=request,
        )
        for m in new_msgs
    )

    return JsonResponse({"html": html, "count": len(new_msgs)})


@login_required
def messages_chat_poll(request, chat_id: int):
    try:
        chat = _get_chat_or_404_for_user(request, chat_id)
    except PermissionDenied:
        return JsonResponse({"redirect": reverse("messages_inbox")}, status=403)


    try:
        last_id = int(request.GET.get("after", 0))
    except (TypeError, ValueError):
        last_id = 0

    new_msgs_qs = (
        ChatMessage.objects.filter(chat=chat, id__gt=last_id)
        .select_related("sender")
        .prefetch_related("attachments")
        .order_by("created_at")
    )
    new_msgs = list(new_msgs_qs)

    if new_msgs:
        mark_chat_read(request.user, chat, new_msgs[-1].id)

    html = "".join(
        render_to_string(
            "core/partials/message_item.html",
            {"message": m},
            request=request,
        )
        for m in new_msgs
    )

    return JsonResponse({"html": html, "count": len(new_msgs)})


@login_required
def messages_group_create(request):
    """Group creation page.

    UX requirement: user should not be forced to know usernames.
    For now we allow selecting participants from the list of existing DM dialogs.
    (Later it can be extended to a global search.)
    """

    threads = build_threads_for_user(request.user)

    # Contacts = unique users from existing DM chats (in inbox order)
    dm_contacts = []
    seen_ids = set()
    for t in threads:
        if (t.get("kind") == Chat.KIND_DM) and t.get("other_user"):
            u = t["other_user"]
            if u.id and u.id != request.user.id and u.id not in seen_ids:
                seen_ids.add(u.id)
                dm_contacts.append(u)

    if request.method == "POST":
        form = GroupChatCreateForm(request.POST)
        if form.is_valid():
            title = (form.cleaned_data.get("title") or "").strip()

            # Preferred: selection from existing DM contacts
            members_ids = []
            for raw in request.POST.getlist("members_ids"):
                try:
                    members_ids.append(int(raw))
                except (TypeError, ValueError):
                    continue

            allowed_ids = seen_ids
            members_ids = [uid for uid in dict.fromkeys(members_ids) if uid in allowed_ids and uid != request.user.id]

            # Backward-compatible fallback: usernames via comma separated input (hidden in UI)
            raw_members = (form.cleaned_data.get("members") or "").strip()
            usernames = [u.strip() for u in raw_members.split(",") if u.strip()]
            usernames = list(dict.fromkeys(usernames))

            if not members_ids and usernames:
                members_ids = list(
                    User.objects.filter(username__in=usernames)
                    .exclude(id=request.user.id)
                    .values_list("id", flat=True)
                )

            if not members_ids:
                form.add_error("members", "Выберите хотя бы одного участника")
            else:
                users = list(User.objects.filter(id__in=members_ids))

                with transaction.atomic():
                    chat = Chat.objects.create(kind=Chat.KIND_GROUP, title=title, created_by=request.user)
                    ChatMember.objects.create(chat=chat, user=request.user, role=ChatMember.ROLE_OWNER)

                    for u in users:
                        ChatMember.objects.get_or_create(chat=chat, user=u, defaults={"role": ChatMember.ROLE_MEMBER})

                return redirect("messages_chat", chat_id=chat.id)
    else:
        form = GroupChatCreateForm()

    return render(
        request,
        "core/messages_group_create.html",
        {"form": form, "threads": threads, "dm_contacts": dm_contacts},
    )


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


def communities_view(request):
    q = (request.GET.get("q") or "").strip()
    tokens = [t for t in q.split() if t]

    qs = (
        Community.objects.all()
        .annotate(members_total=Count("memberships"))
        .annotate(last_post_at=Max("posts__created_at"))
        .annotate(
            has_posts=Case(
                When(last_post_at__isnull=False, then=Value(0)),
                default=Value(1),
                output_field=IntegerField(),
            )
        )
    )

    def apply_smart_contains_search(base_qs):
        f = Q()
        name_all = Q()
        desc_all = Q()
        name_any = Q()
        desc_any = Q()

        for t in tokens:
            f &= (Q(name__icontains=t) | Q(description__icontains=t))
            name_all &= Q(name__icontains=t)
            desc_all &= Q(description__icontains=t)
            name_any |= Q(name__icontains=t)
            desc_any |= Q(description__icontains=t)

        return (
            base_qs.filter(f)
            .annotate(
                search_rank=Case(
                    When(name_all, then=Value(0)),
                    When(name_any, then=Value(1)),
                    When(desc_all, then=Value(2)),
                    When(desc_any, then=Value(3)),
                    default=Value(4),
                    output_field=IntegerField(),
                )
            )
        )

    if tokens:
        filtered = apply_smart_contains_search(qs)
        if filtered.exists():
            qs = filtered.order_by("search_rank", "has_posts", "-last_post_at", "-created_at")
        else:
            query_lower = q.lower()
            items = list(
                Community.objects.values("id", "name", "description").all()
            )

            scored = []
            for it in items:
                name = (it["name"] or "").lower()
                desc = (it["description"] or "").lower()

                name_score = SequenceMatcher(None, query_lower, name).ratio()
                desc_score = SequenceMatcher(None, query_lower, desc).ratio()

                score = max(name_score * 1.25, desc_score)

                if score >= 0.60:
                    scored.append((it["id"], score, name_score, desc_score))

            scored.sort(key=lambda x: (x[1], x[2], x[3]), reverse=True)
            ids = [x[0] for x in scored[:200]]

            if ids:
                order = Case(*[When(id=cid, then=Value(i)) for i, cid in enumerate(ids)], output_field=IntegerField())
                qs = (
                    Community.objects.filter(id__in=ids)
                    .annotate(members_total=Count("memberships"))
                    .annotate(last_post_at=Max("posts__created_at"))
                    .annotate(
                        has_posts=Case(
                            When(last_post_at__isnull=False, then=Value(0)),
                            default=Value(1),
                            output_field=IntegerField(),
                        )
                    )
                    .annotate(search_rank=order)
                    .order_by("search_rank", "has_posts", "-last_post_at", "-created_at")
                )
            else:
                qs = Community.objects.none()
    else:
        qs = qs.order_by("has_posts", "-last_post_at", "-created_at")

    paginator = Paginator(qs, 7)
    page_param = request.GET.get("page")
    try:
        page_number = int(page_param)
        if page_number < 1:
            page_number = 1
    except (TypeError, ValueError):
        page_number = 1

    page_obj = paginator.get_page(page_number)

    is_auth = request.user.is_authenticated
    member_ids = set()
    admin_ids = set()
    if is_auth:
        member_ids = set(
            CommunityMembership.objects.filter(user=request.user).values_list("community_id", flat=True)
        )
        admin_ids = set(
            CommunityMembership.objects.filter(user=request.user, is_admin=True).values_list("community_id", flat=True)
        )

    if request.headers.get("x-requested-with") == "XMLHttpRequest":
        html = "".join(
            render_to_string(
                "core/partials/community_card.html",
                {"c": c, "user": request.user, "member_community_ids": member_ids, "admin_community_ids": admin_ids},
                request=request,
            )
            for c in page_obj.object_list
        )
        return JsonResponse({
            "success": True,
            "html": html,
            "has_next": page_obj.has_next(),
            "next_page": page_obj.next_page_number() if page_obj.has_next() else None,
        })

    return render(request, "core/communities.html", {
        "communities": page_obj.object_list,
        "q": q,
        "member_community_ids": member_ids,
        "admin_community_ids": admin_ids,
        "page_obj": page_obj,
        "has_next": page_obj.has_next(),
        "next_page": page_obj.next_page_number() if page_obj.has_next() else None,
    })


@login_required
def community_create(request):
    if request.method == "POST":
        form = CommunityForm(request.POST, request.FILES)
        if form.is_valid():
            community = form.save(commit=False)
            community.created_by = request.user
            if not community.slug:
                community.slug = slugify(community.name)
            base = community.slug or "community"
            slug = base
            i = 1
            while Community.objects.filter(slug=slug).exists():
                i += 1
                slug = f"{base}-{i}"
            community.slug = slug
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

    members_qs = (
        CommunityMembership.objects
        .filter(community=community)
        .select_related("user")
        .order_by("-is_admin", "-joined_at", "user__username")
    )
    memberships = list(members_qs[:7])
    members_total = members_qs.count()
    members_has_more = members_total > 7

    posts_qs = (
        Post.objects.filter(community=community)
        .select_related("author", "community")
        .prefetch_related("likes", "comments", "attachments")
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
        "memberships": memberships,
        "members_total": members_total,
        "members_has_more": members_has_more,
        "posts": posts_qs,
        "post_form": post_form,
        **state,
    })



# --- helpers ---
def _redirect_back(request, fallback_view, **kwargs):
    """Redirect back to the previous page (communities list, profile, etc.) after POST actions."""
    next_url = request.POST.get("next") or request.GET.get("next") or request.META.get("HTTP_REFERER")
    if next_url and url_has_allowed_host_and_scheme(
        next_url,
        allowed_hosts={request.get_host()},
        require_https=request.is_secure(),
    ):
        return redirect(next_url)
    return redirect(fallback_view, **kwargs)

@login_required
def community_join(request, slug):
    community = get_object_or_404(Community, slug=slug)
    if request.method != "POST":
        return _redirect_back(request, "community_detail", slug=community.slug)
    CommunityMembership.objects.get_or_create(
        community=community,
        user=request.user,
        defaults={"is_admin": False},
    )
    return _redirect_back(request, "community_detail", slug=community.slug)


@login_required
def community_leave(request, slug):
    community = get_object_or_404(Community, slug=slug)
    if request.method != "POST":
        return _redirect_back(request, "community_detail", slug=community.slug)

    CommunityMembership.objects.filter(community=community, user=request.user).delete()
    return _redirect_back(request, "community_detail", slug=community.slug)


@login_required
def community_edit(request, slug):
    community = get_object_or_404(Community, slug=slug)
    m = CommunityMembership.objects.filter(community=community, user=request.user, is_admin=True).first()
    if not m:
        return HttpResponseForbidden("Forbidden")

    if request.method == "POST":
        form = CommunityForm(request.POST, request.FILES, instance=community)
        if form.is_valid():
            form.save()
            return redirect("community_detail", slug=community.slug)
    else:
        form = CommunityForm(instance=community)

    return render(request, "core/community_edit.html", {"community": community, "form": form})


@login_required
def community_create_post(request, slug):
    community = get_object_or_404(Community, slug=slug)

    member = CommunityMembership.objects.filter(community=community, user=request.user).first()
    if not member:
        return HttpResponseForbidden("Forbidden")

    if request.method != "POST":
        return redirect("community_detail", slug=community.slug)

    form = CommunityPostForm(request.POST)
    if not form.is_valid():
        return redirect("community_detail", slug=community.slug)

    post = Post.objects.create(
        author=request.user,
        community=community,
        text=form.cleaned_data["text"],
        as_community=bool(form.cleaned_data.get("post_as_community")) if member.is_admin else False,
    )
    return redirect("community_detail", slug=community.slug)


def community_members_chunk(request, slug):
    community = get_object_or_404(Community, slug=slug)

    try:
        offset = int(request.GET.get("offset", "0"))
    except ValueError:
        offset = 0

    limit = 7

    qs = (
        CommunityMembership.objects
        .filter(community=community)
        .select_related("user")
        .order_by("-is_admin", "-joined_at", "user__username")
    )

    total = qs.count()
    chunk = list(qs[offset:offset + limit])

    html = render_to_string(
        "core/partials/community_members_chunk.html",
        {"memberships": chunk},
        request=request
    )

    next_offset = offset + len(chunk)

    return JsonResponse({
        "html": html,
        "next_offset": next_offset,
        "has_more": next_offset < total,
        "total": total,
    })
def _user_item(u: User) -> dict:
    return {
        "type": "user",
        "title": (u.display_name or u.username or ""),
        "subtitle": "@" + (u.username or ""),
        "url": reverse("user_profile", kwargs={"username": u.username}),
        "avatar_url": (u.avatar.url if getattr(u, "avatar", None) else ""),
    }


def _community_item(c: Community, badge: str | None = None) -> dict:
    icon = getattr(c, "icon", None) or getattr(c, "avatar", None)
    return {
        "type": "community",
        "title": (c.name or ""),
        "subtitle": "#" + (c.slug or ""),
        "url": reverse("community_detail", kwargs={"slug": c.slug}),
        "avatar_url": (icon.url if icon else ""),
        "badge": (badge or ""),
    }


def profile_followers_json(request, username):
    profile_user = get_object_or_404(User, username=username)
    qs = (
        Follow.objects
        .filter(following=profile_user)
        .select_related("follower")
        .order_by("-id")
    )
    total = qs.count()
    items = [_user_item(x.follower) for x in qs[:200]]
    return JsonResponse({"total": total, "items": items})


def profile_following_json(request, username):
    profile_user = get_object_or_404(User, username=username)
    qs = (
        Follow.objects
        .filter(follower=profile_user)
        .select_related("following")
        .order_by("-id")
    )
    total = qs.count()
    items = [_user_item(x.following) for x in qs[:200]]
    return JsonResponse({"total": total, "items": items})


def profile_communities_admin_json(request, username):
    profile_user = get_object_or_404(User, username=username)
    qs = (
        CommunityMembership.objects
        .filter(user=profile_user, is_admin=True)
        .select_related("community")
        .order_by("-joined_at")
    )
    total = qs.count()
    items = [_community_item(x.community, badge="admin") for x in qs[:200]]
    return JsonResponse({"total": total, "items": items})


def profile_communities_joined_json(request, username):
    profile_user = get_object_or_404(User, username=username)
    qs = (
        CommunityMembership.objects
        .filter(user=profile_user, is_admin=False)  # см. комментарий выше, если хочешь ВСЕ
        .select_related("community")
        .order_by("-joined_at")
    )
    total = qs.count()
    items = [_community_item(x.community) for x in qs[:200]]
    return JsonResponse({"total": total, "items": items})
