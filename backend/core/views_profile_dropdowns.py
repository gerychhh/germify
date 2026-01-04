from __future__ import annotations

from django.http import JsonResponse, HttpRequest
from django.shortcuts import get_object_or_404
from django.urls import reverse
from django.template.loader import render_to_string
from django.views.decorators.http import require_GET

from .models import User, Follow, CommunityMembership


def _avatar_html(request: HttpRequest, u: User, size: str = "sm") -> str:
    return render_to_string(
        "core/partials/avatar.html",
        {"user_obj": u, "size": size},
        request=request,
    )


def _paginate_list(request: HttpRequest, items: list[User], *, default_limit: int = 20) -> tuple[list[User], dict[str, int | bool | None]]:
    try:
        limit = int(request.GET.get("limit", default_limit))
    except (TypeError, ValueError):
        limit = default_limit

    try:
        offset = int(request.GET.get("offset", 0))
    except (TypeError, ValueError):
        offset = 0

    limit = max(1, min(limit, 50))
    offset = max(0, offset)

    total = len(items)
    paginated = items[offset : offset + limit]

    next_offset: int | None = None
    if offset + limit < total:
        next_offset = offset + limit

    meta: dict[str, int | bool | None] = {
        "total": total,
        "has_more": next_offset is not None,
        "next_offset": next_offset,
        "limit": limit,
        "offset": offset,
    }

    return paginated, meta


@require_GET
def profile_followers_json(request: HttpRequest, username: str) -> JsonResponse:
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

    users_slice, meta = _paginate_list(request, users)

    items = []
    for u in users_slice:
        avatar_url = ""
        if getattr(u, "avatar", None):
            try:
                avatar_url = request.build_absolute_uri(u.avatar.url)
            except Exception:
                avatar_url = ""

        items.append(
            {
                "title": u.display_name or u.username,
                "subtitle": f"@{u.username}",
                "url": reverse("user_profile", kwargs={"username": u.username}),
                "avatar_url": avatar_url,
                "avatar_html": _avatar_html(request, u, "sm"),
            }
        )

    return JsonResponse({"success": True, "items": items, **meta})


@require_GET
def profile_following_json(request: HttpRequest, username: str) -> JsonResponse:
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

    users_slice, meta = _paginate_list(request, users)

    items = []
    for u in users_slice:
        avatar_url = ""
        if getattr(u, "avatar", None):
            try:
                avatar_url = request.build_absolute_uri(u.avatar.url)
            except Exception:
                avatar_url = ""

        items.append(
            {
                "title": u.display_name or u.username,
                "subtitle": f"@{u.username}",
                "url": reverse("user_profile", kwargs={"username": u.username}),
                "avatar_url": avatar_url,
                "avatar_html": _avatar_html(request, u, "sm"),
            }
        )

    return JsonResponse({"success": True, "items": items, **meta})


@require_GET
def profile_communities_admin_json(request: HttpRequest, username: str) -> JsonResponse:
    profile_user = get_object_or_404(User, username=username)
    q = (request.GET.get("q") or "").strip().lower()

    mem_qs = (
        CommunityMembership.objects.filter(user=profile_user, is_admin=True)
        .select_related("community")
    )

    mem_list = [m for m in mem_qs if not q or q in (m.community.name or "").lower()]
    mem_slice, meta = _paginate_list(request, mem_list)

    items = []
    for m in mem_slice:
        c = m.community

        icon_url = ""
        if getattr(c, "icon", None):
            try:
                icon_url = request.build_absolute_uri(c.icon.url)
            except Exception:
                icon_url = ""

        items.append(
            {
                "title": c.name,
                "subtitle": f"@{c.slug}",
                "url": reverse("community_detail", kwargs={"slug": c.slug}),
                "avatar_url": icon_url,
                "fallback": (c.name or "•")[:1],
            }
        )

    return JsonResponse({"success": True, "items": items, **meta})


@require_GET
def profile_communities_joined_json(request: HttpRequest, username: str) -> JsonResponse:
    profile_user = get_object_or_404(User, username=username)
    q = (request.GET.get("q") or "").strip().lower()

    mem_qs = (
        CommunityMembership.objects.filter(user=profile_user)
        .select_related("community")
    )

    mem_list = [m for m in mem_qs if not q or q in (m.community.name or "").lower()]
    mem_slice, meta = _paginate_list(request, mem_list)

    items = []
    for m in mem_slice:
        c = m.community

        icon_url = ""
        if getattr(c, "icon", None):
            try:
                icon_url = request.build_absolute_uri(c.icon.url)
            except Exception:
                icon_url = ""

        items.append(
            {
                "title": c.name,
                "subtitle": f"@{c.slug}",
                "url": reverse("community_detail", kwargs={"slug": c.slug}),
                "avatar_url": icon_url,
                "fallback": (c.name or "•")[:1],
            }
        )

    return JsonResponse({"success": True, "items": items, **meta})
